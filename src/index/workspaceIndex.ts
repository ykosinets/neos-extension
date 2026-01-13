// src/index/workspaceIndex.ts

import * as vscode from 'vscode';
import { PrototypeIndex } from './prototypeIndex';
import { PropIndex } from './propIndex';
import { parsePropDefinitions } from '../parser/propParser';

/**
 * WorkspaceIndex is responsible for scanning the workspace,
 * reading Fusion files, and feeding them into lower-level indexes.
 */
export class WorkspaceIndex {
    private fusionFiles: vscode.Uri[] = [];
    private prototypeIndex = new PrototypeIndex();
    private propIndex = new PropIndex();

    private filePrototypeMap = new Map<string, string[]>(); // uri -> prototype names
    private filePropMap = new Map<string, any[]>(); // uri -> PropDefinition[]
    private diagnostics = new Map<string, vscode.Diagnostic[]>();

    /**
     * Initialize indexing for the current workspace.
     * Safe to call multiple times.
     */
    async initialize(): Promise<void> {
        this.clear();

        if (!vscode.workspace.workspaceFolders) {
            console.warn('[FusionIndex] No workspace folders found.');
            return;
        }

        const pattern = new vscode.RelativePattern(
            vscode.workspace.workspaceFolders[0],
            '**/*.fusion'
        );

        const files = await vscode.workspace.findFiles(pattern);
        this.fusionFiles.push(...files);

        for (const file of this.fusionFiles) {
            await this.indexFusionFile(file);
        }
    }

    /**
     * Clear all indexed data.
     */
    clear(): void {
        this.fusionFiles = [];
        this.prototypeIndex.clear();
        this.propIndex.clear();
        this.diagnostics.clear();
    }

    /**
     * Index a single Fusion file.
     */
    private async indexFusionFile(
        uri: vscode.Uri,
        sourceOverride?: string,
        options?: { live?: boolean }
    ): Promise<boolean> {
        const uriKey = uri.toString();

        // Remove previously indexed data for this file
        if (this.filePrototypeMap.has(uriKey)) {
            this.prototypeIndex.removeByUri(uri);
            this.filePrototypeMap.delete(uriKey);
        }

        try {
            const source =
                sourceOverride ??
                (await vscode.workspace.openTextDocument(uri)).getText();

            // Index prototypes
            this.prototypeIndex.indexDocument(uri, source);

            const prototypes = this.prototypeIndex.getPrototypesFromDocument(uri);
            this.filePrototypeMap.set(uriKey, prototypes);

            // Index props (file-local)
            const parsed = parsePropDefinitions(source);
            const propDefinitions = parsed.props;

            if (options?.live && propDefinitions.length === 0) {
                // Do not destroy existing index on transient invalid edits
                return false;
            }

            if (this.filePropMap.has(uriKey)) {
                this.propIndex.removeByUri(uri);
                this.filePropMap.delete(uriKey);
                this.diagnostics.delete(uriKey);
            }

            const document =
                sourceOverride
                    ? await vscode.workspace.openTextDocument(uri)
                    : await vscode.workspace.openTextDocument(uri);

            this.diagnostics.set(
                uriKey,
                parsed.warnings.map(w => {
                    const keyMatch = w.message.match(/"([^"]+)"/);
                    const warnedKey = keyMatch ? keyMatch[1] : null;

                    let matchingDef;

                    if (warnedKey) {
                        const matches = propDefinitions
                            .filter(def => def.propPath[def.propPath.length - 1] === warnedKey)
                            .sort((a, b) => a.start - b.start);

                        // Always underline the duplicate (last definition)
                        if (matches.length > 1) {
                            matchingDef = matches[matches.length - 1];
                        } else {
                            matchingDef = matches[0];
                        }
                    }

                    const range = matchingDef
                        ? new vscode.Range(
                              document.positionAt(matchingDef.start),
                              document.positionAt(matchingDef.end)
                          )
                        : new vscode.Range(
                              new vscode.Position(w.line - 1, w.column - 1),
                              new vscode.Position(w.line - 1, w.column)
                          );

                    return new vscode.Diagnostic(
                        range,
                        w.message,
                        vscode.DiagnosticSeverity.Warning
                    );
                })
            );

            // Debug: show each indexed prop with its line number
            for (const def of propDefinitions) {
                const line = source.substring(0, def.start).split(/\r?\n/).length;
            }

            const byPrototype = new Map<string, typeof propDefinitions>();

            for (const def of propDefinitions) {
                const list = byPrototype.get(def.prototypeName) ?? [];
                list.push(def);
                byPrototype.set(def.prototypeName, list);
            }

            const allProps: any[] = [];

            for (const [prototypeName, defs] of byPrototype) {
                this.propIndex.indexPrototype(prototypeName, defs, uri);
                allProps.push(...defs);
            }

            this.filePropMap.set(uriKey, allProps);

            return true;
        } catch (error) {
            console.error(
                `[FusionIndex] Failed to index file ${uri.fsPath}`,
                error
            );
            return false;
        }
    }

    /**
     * Expose discovered Fusion files (read-only).
     */
    getFusionFiles(): readonly vscode.Uri[] {
        return this.fusionFiles;
    }

    /**
     * Expose prototype index for consumers (providers).
     */
    getPrototypeIndex(): PrototypeIndex {
        return this.prototypeIndex;
    }

    /**
     * Expose prop index for consumers (providers).
     */
    getPropIndex(): PropIndex {
        return this.propIndex;
    }

    getDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
        return this.diagnostics.get(uri.toString()) ?? [];
    }

    async reindexDocument(
        uri: vscode.Uri,
        source: string,
        options?: { live?: boolean }
    ): Promise<boolean> {
        return this.indexFusionFile(uri, source, options);
    }
}