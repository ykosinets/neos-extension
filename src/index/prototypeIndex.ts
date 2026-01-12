// src/index/prototypeIndex.ts

import * as vscode from 'vscode';
import { parsePrototypes, PrototypeDeclaration } from '../parser/prototypeParser';

export interface IndexedPrototype {
    name: string;
    uri: vscode.Uri;
    range: vscode.Range;
}

/**
 * PrototypeIndex maintains a global map of prototype names
 * to their source locations.
 *
 * Responsibilities:
 * - Build index from Fusion documents
 * - Provide lookup by prototype name
 * - Stay free of editor UI concerns
 */
export class PrototypeIndex {
    private prototypes = new Map<string, IndexedPrototype>();
    private filePrototypes = new Map<string, string[]>(); // uri -> prototype names

    /**
     * Clear all indexed prototypes.
     */
    clear(): void {
        this.prototypes.clear();
    }

    /**
     * Index a single Fusion document by URI and source text.
     */
    indexDocument(uri: vscode.Uri, source: string): void {
        const uriKey = uri.toString();
        const declarations: PrototypeDeclaration[] = parsePrototypes(source);

        const names: string[] = [];

        for (const decl of declarations) {
            const startPos = this.offsetToPosition(source, decl.start);
            const endPos = this.offsetToPosition(source, decl.end);

            this.prototypes.set(decl.name, {
                name: decl.name,
                uri,
                range: new vscode.Range(startPos, endPos)
            });

            names.push(decl.name);
        }

        this.filePrototypes.set(uriKey, names);
    }

    removeByUri(uri: vscode.Uri): void {
        const uriKey = uri.toString();
        const names = this.filePrototypes.get(uriKey);
        if (!names) {
            return;
        }

        for (const name of names) {
            this.prototypes.delete(name);
        }

        this.filePrototypes.delete(uriKey);
    }

    getPrototypesFromDocument(uri: vscode.Uri): string[] {
        return this.filePrototypes.get(uri.toString()) ?? [];
    }

    /**
     * Retrieve a prototype by its fully qualified name.
     */
    get(name: string): IndexedPrototype | undefined {
        return this.prototypes.get(name);
    }

    /**
     * Return all indexed prototype names.
     */
    getAllNames(): string[] {
        return Array.from(this.prototypes.keys());
    }

    /**
     * Convert a string offset to a VS Code Position.
     * Kept local to avoid coupling with utils prematurely.
     */
    private offsetToPosition(source: string, offset: number): vscode.Position {
        const before = source.slice(0, offset);
        const lines = before.split(/\r?\n/);
        const line = lines.length - 1;
        const character = lines[lines.length - 1].length;
        return new vscode.Position(line, character);
    }
}
