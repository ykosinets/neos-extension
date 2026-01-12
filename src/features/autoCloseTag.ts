import * as vscode from 'vscode';

/**
 * Registers auto-close behavior for Fusion AFX tags.
 *
 * Rules:
 * - Trigger only on single-character insertion of ">"
 * - Skip self-closing tags (<Tag />)
 * - Skip default HTML tags (delegate to VS Code HTML behavior)
 * - Skip if inside string, braces, or comment (best-effort, strict)
 * - Insert closing tag on the same line
 * - Place caret between open and close tags
 */
export function registerAutoCloseTag(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.contentChanges.length !== 1) {
                return;
            }

            const change = event.contentChanges[0];
            if (change.text !== '>') {
                return;
            }

            const document = event.document;
            const position = change.range.end.translate(0, 0);
            const line = document.lineAt(position.line).text;

            // Extract text before caret on this line
            const before = line.slice(0, position.character);

            // Match opening AFX-style tag
            // Example: <Neos.Fusion:Fragment
            const match = before.match(/<([A-Z][A-Za-z0-9_.:-]*)[^<>]*$/);
            if (!match) {
                return;
            }

            const tagName = match[1];

            // Skip self-closing tags
            if (before.trimEnd().endsWith('/')) {
                return;
            }

            // Skip default HTML tags (lowercase)
            if (tagName.toLowerCase() === tagName) {
                return;
            }

            // Best-effort strict checks: skip if inside quotes or braces
            if (isInsideStringOrBraces(before)) {
                return;
            }

            const closingTag = `</${tagName}>`;

            const edit = new vscode.WorkspaceEdit();
            const insertPosition = change.range.end.translate(0,1);
            
            // Insert closing tag *after* the already-typed ">"
            edit.insert(document.uri, insertPosition, closingTag);

            vscode.workspace.applyEdit(edit).then(() => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    return;
                }

                // Place caret immediately after the ">" of the opening tag
                const caretPosition = insertPosition;
                editor.selections = [
                    new vscode.Selection(caretPosition, caretPosition)
                ];
            });
        })
    );
}

function isInsideStringOrBraces(text: string): boolean {
    let doubleQuotes = 0;
    let singleQuotes = 0;
    let braces = 0;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"' && text[i - 1] !== '\\') {
            doubleQuotes++;
        }
        if (char === "'" && text[i - 1] !== '\\') {
            singleQuotes++;
        }
        if (char === '{') {
            braces++;
        }
        if (char === '}') {
            braces = Math.max(0, braces - 1);
        }
    }

    return doubleQuotes % 2 !== 0 || singleQuotes % 2 !== 0 || braces > 0;
}
