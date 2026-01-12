import * as vscode from 'vscode';
import { registerFusionProviders } from './language/fusionLanguage';
import { WorkspaceIndex } from './index/workspaceIndex';
import { registerAutoCloseTag } from './features/autoCloseTag';

let workspaceIndex: WorkspaceIndex | undefined;
let diagnosticCollection: vscode.DiagnosticCollection;
let reindexTimer: NodeJS.Timeout | undefined;

/**
 * Read-only accessor for the active WorkspaceIndex.
 * Providers must handle the undefined case.
 */
export function getWorkspaceIndex(): WorkspaceIndex | undefined {
    return workspaceIndex;
}

export async function activate(context: vscode.ExtensionContext) {
    workspaceIndex = new WorkspaceIndex();
    diagnosticCollection =
        vscode.languages.createDiagnosticCollection('fusion-props');
    context.subscriptions.push(diagnosticCollection);

    try {
        await workspaceIndex.initialize();
    } catch (error) {
        console.error('[FusionIndex] Failed to initialize workspace index', error);
    }

    if (workspaceIndex) {
        for (const uri of workspaceIndex.getFusionFiles()) {
            const normalizedUri = vscode.Uri.file(uri.fsPath);
            diagnosticCollection.set(
                normalizedUri,
                workspaceIndex.getDiagnostics(normalizedUri)
            );
        }
    }

    registerFusionProviders(context);
    registerAutoCloseTag(context);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            console.log('[CHANGE EVENT]', {
                uri: event.document.uri.toString(),
                version: event.document.version,
                languageId: event.document.languageId,
            });
            if (!workspaceIndex) return;

            const doc = event.document;
            if (!doc.fileName.endsWith('.fusion')) {
                return;
            }

            if (reindexTimer) {
                clearTimeout(reindexTimer);
            }

            console.log('[REINDEX SCHEDULED]', {
                uri: doc.uri.toString(),
                fsPath: doc.uri.fsPath,
            });

            reindexTimer = setTimeout(async () => {
                try {
                    await workspaceIndex!.reindexDocument(doc.uri, doc.getText());
                    const normalizedUri = vscode.Uri.file(doc.uri.fsPath);
                    const diags = workspaceIndex!.getDiagnostics(normalizedUri);

                    console.log('[DIAG SET]', {
                        normalizedUri: normalizedUri.toString(),
                        count: diags.length,
                        messages: diags.map(d => d.message),
                    });

                    diagnosticCollection.set(normalizedUri, diags);

                    console.log(
                        '[DIAG COLLECTION STATE]',
                        vscode.languages.getDiagnostics(normalizedUri)
                    );
                } catch (err: unknown) {
                    console.error('[FusionIndex] Reindex failed', err);
                }
            }, 200);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (!workspaceIndex) return;
            if (!doc.fileName.endsWith('.fusion')) {
                return;
            }

            (async () => {
                try {
                    await workspaceIndex!.reindexDocument(doc.uri, doc.getText());
                    const normalizedUri = vscode.Uri.file(doc.uri.fsPath);

                    diagnosticCollection.set(
                        normalizedUri,
                        workspaceIndex!.getDiagnostics(normalizedUri)
                    );
                } catch (err: unknown) {
                    console.error('[FusionIndex] Reindex failed on save', err);
                }
            })();
        })
    );
}

export function deactivate() {
    if (workspaceIndex) {
        workspaceIndex.clear();
        workspaceIndex = undefined;
    }

    if (diagnosticCollection) {
        diagnosticCollection.clear();
    }
}
