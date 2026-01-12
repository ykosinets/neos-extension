import * as vscode from 'vscode';
import { getWorkspaceIndex } from '../extension';

export class PrototypeDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.ProviderResult<vscode.Definition> {
        const wordRange = document.getWordRangeAtPosition(
            position,
            /[A-Za-z0-9_.:-]+/
        );

        if (!wordRange) {
            return null;
        }

        const prototypeName = document.getText(wordRange);
        const workspaceIndex = getWorkspaceIndex();

        if (!workspaceIndex) {
            return null;
        }

        const prototypeIndex = workspaceIndex.getPrototypeIndex();
        const prototype = prototypeIndex.get(prototypeName);

        if (!prototype) {
            return null;
        }

        return new vscode.Location(prototype.uri, prototype.range);
    }
}