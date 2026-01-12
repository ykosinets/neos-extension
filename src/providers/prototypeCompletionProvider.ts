import * as vscode from 'vscode';
import { getWorkspaceIndex } from '../extension';

export class PrototypeCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        const workspaceIndex = getWorkspaceIndex();
        if (!workspaceIndex) {
            return [];
        }

        const prototypeIndex = workspaceIndex.getPrototypeIndex();
        const prototypeNames = prototypeIndex.getAllNames();

        const line = document.lineAt(position.line).text;
        const prefixMatch = line.slice(0, position.character).match(/<([\w.:]*)$/);

        const replaceRange = prefixMatch
            ? new vscode.Range(
                  position.line,
                  position.character - prefixMatch[1].length,
                  position.line,
                  position.character
              )
            : undefined;

        return prototypeNames.map(name => {
            const item = new vscode.CompletionItem(
                name,
                vscode.CompletionItemKind.Class
            );
            item.detail = 'Fusion prototype';

            if (replaceRange) {
                item.range = replaceRange;
            }

            return item;
        });
    }
}