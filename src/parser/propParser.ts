import { arrayBuffer } from "stream/consumers";

// src/parser/propParser.ts
export interface PropDefinition {
    prototypeName: string;
    /**
     * Path segments of the property, e.g. ['foo','bar','baz']
     */
    propPath: string[];
    /**
     * Zero-based start offset in document
     */
    start: number;
    /**
     * Zero-based end offset in document
     */
    end: number;
    /**
     * Source kind for priority handling
     */
    source: 'styleguide' | 'default';
}

export interface StyleguideWarning {
    message: string;
    line: number;
    column: number;
}

export interface ParsedPropResult {
    props: PropDefinition[];
    warnings: StyleguideWarning[];
}

interface PrototypeBlock {
    name: string;
    bodyStart: number;
    bodyEnd: number;
}

interface Position {
    line: number;
    column: number;
}

interface StyleguideNode {
    position: Position;
    children?: Record<string, StyleguideNode>;
}

interface StyleguidePropsTree {
    props: StyleguideNode;
    warnings: StyleguideWarning[];
}

function parseStyleguidePropsTree(source: string): StyleguidePropsTree {
    const lines = source.split('\n');

    let inStyleguide = false;
    let inProps = false;

    const root: StyleguidePropsTree = {
        props: {
            position: { line: 0, column: 0 },
            children: {}
        },
        warnings: []
    };

    const stack: StyleguideNode[] = [];
    let current: StyleguideNode | null = null;
    let eelDepth = 0;

    const openBlockRegex =
        /^(\s*)([^\s={]+)\s*(?:=\s*[^{]+)?\s*\{/;
    const closeBlockRegex = /^\s*\}/;

    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        // Track EEL (${...}) depth to avoid misinterpreting braces inside expressions
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '$' && line[i + 1] === '{') {
                eelDepth++;
                i++;
                continue;
            }
            if (line[i] === '}' && eelDepth > 0) {
                eelDepth--;
            }
        }

        if (!inStyleguide && line.includes('@styleguide')) {
            inStyleguide = true;
            return;
        }

        if (inStyleguide && !inProps) {
            const match = line.match(/^(\s*)props\s*\{/);
            if (match) {
                inProps = true;

                root.props.position = {
                    line: lineNumber,
                    column: match[1].length + 1
                };

                current = root.props;
                stack.push(current);
            }
            return;
        }

        if (!inProps || !current) return;

        // Ignore metadata / directives (@process, @glue, etc.) for NODE CREATION only
        const isDirectiveLine = /^\s*@/.test(line);

        if (eelDepth === 0 && closeBlockRegex.test(line)) {
            stack.pop();
            current = stack[stack.length - 1] ?? null;
            return;
        }

        const openMatch = !isDirectiveLine ? line.match(openBlockRegex) : null;
        if (openMatch) {
            const [, indent, key] = openMatch;

            const keyStart = line.indexOf(key);
            const node: StyleguideNode = {
                position: {
                    line: lineNumber,
                    column: keyStart >= 0 ? keyStart + 1 : indent.length + 1
                },
                children: {}
            };

            current.children ??= {};

            if (current.children[key]) {
                root.warnings.push({
                    message: `Duplicate prop "${key}" defined at the same level`,
                    line: lineNumber,
                    column: node.position.column
                });
                return;
            }

            current.children[key] = node;

            stack.push(node);
            current = node;
            return;
        }

        const leafMatch = !isDirectiveLine
            ? line.match(/^(\s*)([^\s={]+)\s*=\s*(?!.*\{)/)
            : null;
        if (leafMatch) {
            const [, , key] = leafMatch;
            const keyStart = line.indexOf(key);

            const node: StyleguideNode = {
                position: {
                    line: lineNumber,
                    column: keyStart >= 0 ? keyStart + 1 : 1
                }
            };

            current.children ??= {};

            if (current.children[key]) {
                root.warnings.push({
                    message: `Duplicate prop "${key}" defined at the same level`,
                    line: lineNumber,
                    column: node.position.column
                });
                return;
            }

            current.children[key] = node;
            return;
        }
    });

    return root;
}

function flattenStyleguideTree(
    tree: StyleguidePropsTree,
    prototypeName: string,
    document: string,
    bodyOffset: number
): PropDefinition[] {
    const results: PropDefinition[] = [];

    const lines = document.split(/\r?\n/);
    const lineOffsets: number[] = [];
    let acc = 0;
    for (const l of lines) {
        lineOffsets.push(acc);
        acc += l.length + 1;
    }

    function walk(node: StyleguideNode, path: string[]) {
        if (path.length > 0) {
            const offset =
                bodyOffset +
                lineOffsets[node.position.line - 1] +
                node.position.column - 1;

            results.push({
                prototypeName,
                propPath: path,
                start: offset,
                end: offset + path[path.length - 1].length,
                source: 'styleguide'
            });
        }

        if (node.children) {
            for (const [key, child] of Object.entries(node.children)) {
                walk(child, [...path, key]);
            }
        }
    }

    walk(tree.props, []);
    return results;
}

// ============================================================================
// Content Neutralization
// Replace strings, comments, and EEL expressions with spaces to prevent
// false pattern matches while preserving character offsets.
// ============================================================================

/**
 * Neutralize all content that should be ignored during parsing.
 * Replaces with spaces to preserve character offsets.
 */
function neutralizeContent(source: string): string {
    let result = source;
    result = neutralizeMultiLineComments(result);
    result = neutralizeSingleLineComments(result);
    result = neutralizeStrings(result);
    result = neutralizeEel(result);
    return result;
}

/**
 * Replace multi-line comments with spaces.
 */
function neutralizeMultiLineComments(source: string): string {
    const result: string[] = [];
    let i = 0;
    while (i < source.length) {
        if (source[i] === '/' && source[i + 1] === '*') {
            result.push(' ', ' ');
            i += 2;
            while (i < source.length) {
                if (source[i] === '*' && source[i + 1] === '/') {
                    result.push(' ', ' ');
                    i += 2;
                    break;
                }
                result.push(source[i] === '\n' ? '\n' : ' ');
                i++;
            }
        } else {
            result.push(source[i]);
            i++;
        }
    }
    return result.join('');
}

/**
 * Replace single-line comments with spaces.
 */
function neutralizeSingleLineComments(source: string): string {
    const result: string[] = [];
    let i = 0;
    while (i < source.length) {
        if (source[i] === '/' && source[i + 1] === '/') {
            result.push(' ', ' ');
            i += 2;
            while (i < source.length && source[i] !== '\n') {
                result.push(' ');
                i++;
            }
        } else {
            result.push(source[i]);
            i++;
        }
    }
    return result.join('');
}

/**
 * Replace string contents with spaces (preserves quotes for structure).
 * Handles both single and double quotes with escape sequences.
 */
function neutralizeStrings(source: string): string {
    const result: string[] = [];
    let i = 0;
    while (i < source.length) {
        const ch = source[i];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            result.push(quote);
            i++;
            while (i < source.length) {
                if (source[i] === '\\' && i + 1 < source.length) {
                    result.push(' ', ' ');
                    i += 2;
                } else if (source[i] === quote) {
                    result.push(quote);
                    i++;
                    break;
                } else if (source[i] === '\n') {
                    result.push('\n');
                    i++;
                } else {
                    result.push(' ');
                    i++;
                }
            }
        } else {
            result.push(ch);
            i++;
        }
    }
    return result.join('');
}

/**
 * Replace EEL expression contents with spaces.
 * EEL expressions: ${...} - can contain nested braces.
 */
function neutralizeEel(source: string): string {
    const result: string[] = [];
    let i = 0;
    while (i < source.length) {
        if (source[i] === '$' && source[i + 1] === '{') {
            result.push(' ', ' ');
            i += 2;
            let depth = 1;
            while (i < source.length && depth > 0) {
                if (source[i] === '{') {
                    depth++;
                    result.push(' ');
                } else if (source[i] === '}') {
                    depth--;
                    result.push(' ');
                } else if (source[i] === '\n') {
                    result.push('\n');
                } else {
                    result.push(' ');
                }
                i++;
            }
        } else {
            result.push(source[i]);
            i++;
        }
    }
    return result.join('');
}

/**
 * Parse all prop definitions from Fusion source.
 *
 * Rules:
 * - Props are scoped per prototype
 * - Primary source: @styleguide { props { ... } }
 * - Fallback: default assignments (e.g. foo = null)
 * - No VS Code API usage
 */
export function parsePropDefinitions(source: string): ParsedPropResult {
    const results: PropDefinition[] = [];
    const warnings: StyleguideWarning[] = [];
    const prototypes = parsePrototypeBlocks(source);

    for (const proto of prototypes) {
        const body = source.slice(proto.bodyStart, proto.bodyEnd);

        // 1) Primary: @styleguide.props
        const styleguideTree = parseStyleguidePropsTree(body);
        warnings.push(...styleguideTree.warnings);
        const styleguideProps = flattenStyleguideTree(
            styleguideTree,
            proto.name,
            body,
            proto.bodyStart
        );

        // Index styleguide props first (higher priority)
        const seen = new Set(styleguideProps.map(p => p.propPath.join('.')));
        results.push(...styleguideProps);

        // 2) Fallback: defaults (only if not defined in styleguide)
        const defaults = parseDefaultProps(
            body,
            proto.name,
            proto.bodyStart
        ).filter(p => !seen.has(p.propPath.join('.')));

        results.push(...defaults);
    }

    console.log('[DEBUG_props]:', results);
    return { props: results, warnings };
}

/**
 * Extract prototype blocks with brace tracking.
 * Handles inheritance syntax: prototype(Name) < prototype(Parent) {
 */
function parsePrototypeBlocks(source: string): PrototypeBlock[] {
    const blocks: PrototypeBlock[] = [];
    // Match prototype declarations that may have inheritance
    // prototype(Name) ... { or prototype(Name) < prototype(Parent) {
    const protoRegex = /prototype\s*\(\s*([A-Za-z0-9_.:-]+)\s*\)(?:\s*<[^{]*?)?\s*\{/g;

    let match: RegExpExecArray | null;
    while ((match = protoRegex.exec(source)) !== null) {
        const name = match[1];
        const bodyStart = match.index + match[0].length;
        const bodyEnd = findMatchingBrace(source, bodyStart - 1);
        if (bodyEnd === -1) {
            continue;
        }
        blocks.push({ name, bodyStart, bodyEnd });
    }

    return blocks;
}

/**
 * Parse default prop assignments in prototype body.
 * Example:
 *   foo = null
 *   bar.baz = []
 * Only parses top-level properties (at depth 0), ignoring nested ones.
 */
function parseDefaultProps(
    body: string,
    prototypeName: string,
    bodyOffset: number
): PropDefinition[] {
    const results: PropDefinition[] = [];
    const lines = body.split(/\r?\n/);
    let depth = 0;
    let currentOffset = 0;

    for (const line of lines) {
        const lineLength = line.length + 1; // +1 for newline

        // Check if this line has a property assignment at the root level (depth 0)
        // Supports both letter-based props and numeric indices
        const match = line.match(/^[ \t]*([A-Za-z_][A-Za-z0-9_.]*|[0-9]+)\s*=/);
        if (match && depth === 0) {
            const path = match[1].split('.');
            const start = bodyOffset + currentOffset + line.indexOf(match[1]);
            const end = start + match[0].length;

            results.push({
                prototypeName,
                propPath: path,
                start,
                end,
                source: 'default'
            });
        }

        // Update depth based on braces in this line
        for (const char of line) {
            if (char === '{') depth++;
            else if (char === '}') depth--;
        }

        currentOffset += lineLength;
    }

    return results;
}

/**
 * Find the matching closing brace for a block starting at `openBraceIndex`.
 */
function findMatchingBrace(source: string, openBraceIndex: number): number {
    let depth = 0;
    for (let i = openBraceIndex; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}
