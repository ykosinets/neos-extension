import * as vscode from 'vscode';
import { getWorkspaceIndex } from '../extension';

/**
 * Autocomplete provider for Fusion props.
 *
 * Supports:
 * - props.
 * - props.foo.
 * - props.foo.bar
 *
 * Rules:
 * - Scope: nearest enclosing prototype(...)
 * - File-local only
 * - Suggestions are based on known prop definitions
 */
export class PropCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        console.log('[PropCompletion] Provider triggered at', position.line, position.character);
        const range = document.getWordRangeAtPosition(
            position,
            /[A-Za-z0-9_.$\[\]]+/
        );

        if (!range) {
            console.log('[PropCompletion] No word range found');
            return [];
        }

        const text = document.getText(range);
        console.log('[PropCompletion] Word at position:', text);

        const propsIndex = text.indexOf('props.');
        if (propsIndex === -1) {
            return [];
        }

        // Extract everything after "props."
        const rawPath = text.slice(propsIndex + 'props.'.length);

        // Split into segments, keep only static identifiers
        const segments = rawPath
            .split('.')
            .map(s => s.replace(/[^A-Za-z0-9_]/g, ''))
            .filter(Boolean);

        const workspaceIndex = getWorkspaceIndex();
        if (!workspaceIndex) {
            return [];
        }

        const prototypeName = findEnclosingPrototype(document, position);
        if (!prototypeName) {
            return [];
        }

        const propIndex = workspaceIndex.getPropIndex();

        // Determine prefix path for child lookup
        // If user typed trailing ".", we want children of full path
        // Otherwise children of parent path
        const endsWithDot = rawPath.endsWith('.');
        const prefixPath = endsWithDot
            ? segments
            : segments.slice(0, -1);

        const children = propIndex.getChildren(prototypeName, prefixPath);
        if (children.length === 0) {
            return [];
        }

        return children.map(child => {
            const item = new vscode.CompletionItem(
                child,
                vscode.CompletionItemKind.Property
            );
            item.detail = 'prop';
            return item;
        });
    }
}

/**
 * Find the nearest enclosing prototype(...) above the cursor.
 */
function findEnclosingPrototype(
    document: vscode.TextDocument,
    position: vscode.Position
): string | undefined {
    let depth = 0;

    for (let line = position.line; line >= 0; line--) {
        const text = document.lineAt(line).text;

        // On the first line (cursor's line), only process up to cursor position
        const endIndex = line === position.line ? position.character : text.length;

        for (let i = endIndex - 1; i >= 0; i--) {
            const ch = text[i];
            if (ch === '}') depth++;
            else if (ch === '{') depth--;
        }

        if (depth < 0) {
            const match = text.match(
                /prototype\s*\(\s*([A-Za-z0-9_.:-]+)\s*\)/
            );
            if (match) {
                return match[1];
            }
        }
    }

    return undefined;
}