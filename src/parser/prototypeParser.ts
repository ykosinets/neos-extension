// src/parser/prototypeParser.ts

export interface PrototypeDeclaration {
    /**
     * Fully qualified prototype name, e.g. CodeQ.Site:Presentation.Molecule.Test
     */
    name: string;

    /**
     * Zero-based index in the document where the prototype declaration starts
     */
    start: number;

    /**
     * Zero-based index in the document where the prototype declaration ends
     */
    end: number;
}

/**
 * Extracts prototype(...) declarations from Fusion source code.
 *
 * This parser is intentionally simple:
 * - Regex-based
 * - No AST
 * - No dependency on VS Code APIs
 */
export function parsePrototypes(source: string): PrototypeDeclaration[] {
    const results: PrototypeDeclaration[] = [];

    /**
     * Matches:
     *   prototype(Foo:Bar.Baz)
     *   prototype(Foo:Bar.Baz) < prototype(...)
     */
    const prototypeRegex =
        /prototype\s*\(\s*([A-Za-z0-9_.:-]+)\s*\)/g;

    let match: RegExpExecArray | null;

    while ((match = prototypeRegex.exec(source)) !== null) {
        const fullMatch = match[0];
        const name = match[1];

        results.push({
            name,
            start: match.index,
            end: match.index + fullMatch.length
        });
    }

    return results;
}
