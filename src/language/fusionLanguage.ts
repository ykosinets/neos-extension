import * as vscode from 'vscode';

import { PrototypeDefinitionProvider } from '../providers/prototypeDefinitionProvider';
import { PrototypeCompletionProvider } from '../providers/prototypeCompletionProvider';
import { PropDefinitionProvider } from '../providers/propDefinitionProvider';
import { PropCompletionProvider } from '../providers/propCompletionProvider';

export function registerFusionProviders(context: vscode.ExtensionContext) {
    const selector: vscode.DocumentSelector = { language: 'fusion', scheme: 'file' };

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, new PrototypeDefinitionProvider()),
        vscode.languages.registerCompletionItemProvider(selector, new PrototypeCompletionProvider(), ':', '<'),
        vscode.languages.registerDefinitionProvider(selector, new PropDefinitionProvider()),
        vscode.languages.registerCompletionItemProvider(selector, new PropCompletionProvider(), '.', '{')
    );
}
