import * as vscode from 'vscode';
import { getWorkspaceIndex } from '../extension';

/**
 * Go-to-definition provider for Fusion props.
 *
 * Supports:
 * - props.foo
 * - props.foo.bar.baz
 * - {props.foo}
 * - mixed dynamic paths (static suffix resolution)
 *
 * Resolution rules:
 * - Scope: nearest enclosing prototype(...) block
 * - File-local only
 * - Deepest-suffix match
 */
export class PropDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.ProviderResult<vscode.Definition> {
        console.log('[PropDefinition] Provider triggered at', position.line, position.character);

        // Get the full expression containing props
        const range = document.getWordRangeAtPosition(
            position,
            /[A-Za-z0-9_.$\[\]]+/
        );

        if (!range) {
            console.log('[PropDefinition] No word range found');
            return null;
        }

        const fullText = document.getText(range);
        console.log('[PropDefinition] Full text:', fullText);

        // Must contain props
        if (!fullText.includes('props')) {
            console.log('[PropDefinition] Text does not contain "props"');
            return null;
        }

        // Find the specific word under cursor (letter-based or numeric index)
        const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*|[0-9]+/);
        if (!wordRange) {
            return null;
        }

        const wordUnderCursor = document.getText(wordRange);
        console.log('[PropDefinition] Word under cursor:', wordUnderCursor);

        // If cursor is on "props", navigate to props block definition
        if (wordUnderCursor === 'props') {
            console.log('[PropDefinition] Navigating to props block');
            // TODO: Implement navigation to @styleguide { props { } } block
            return null;
        }

        // Build the path up to and including the word under cursor
        const propsIndex = fullText.indexOf('props.');
        if (propsIndex === -1) {
            return null;
        }

        const afterProps = fullText.slice(propsIndex + 'props.'.length);
        const allSegments = afterProps
            .split('.')
            .map(s => s.replace(/[^A-Za-z0-9_]/g, '')) // Keep letters, numbers, and underscores
            .filter(Boolean);

        console.log('[PropDefinition] All segments:', allSegments);

        // Find which segment index the cursor is on
        let segmentIndex = allSegments.indexOf(wordUnderCursor);
        if (segmentIndex === -1) {
            console.log('[PropDefinition] Cursor word not in segments');
            return null;
        }

        // Build path up to and including cursor position
        const targetPath = allSegments.slice(0, segmentIndex + 1);
        console.log('[PropDefinition] Target path:', targetPath);

        const workspaceIndex = getWorkspaceIndex();
        if (!workspaceIndex) {
            console.log('[PropDefinition] No workspace index');
            return null;
        }

        const prototypeName = findEnclosingPrototype(document, position);
        console.log('[PropDefinition] Enclosing prototype:', prototypeName);
        if (!prototypeName) {
            console.log('[PropDefinition] No enclosing prototype found');
            return null;
        }

        const propIndex = workspaceIndex.getPropIndex();

        // Look for exact match of the target path
        const match = propIndex.resolve(prototypeName, targetPath);
        console.log('[PropDefinition] Match result:', match);

        if (!match) {
            console.log('[PropDefinition] No match found for', prototypeName, targetPath);
            return null;
        }

        // Read the target document to convert offsets to positions
        return vscode.workspace.openTextDocument(match.uri).then(targetDoc => {
            const startPos = targetDoc.positionAt(match.start);
            const endPos = targetDoc.positionAt(match.end);

            return new vscode.Location(
                match.uri,
                new vscode.Range(startPos, endPos)
            );
        });
    }
}

/**
 * Find the nearest enclosing prototype(...) above the cursor.
 * Uses a backward scan with brace depth tracking.
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

        // Walk line backwards to track braces correctly
        for (let i = endIndex - 1; i >= 0; i--) {
            const ch = text[i];
            if (ch === '}') depth++;
            else if (ch === '{') depth--;
        }

        if (depth < 0) {
            // Potential prototype line
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