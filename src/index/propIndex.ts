// src/index/propIndex.ts

import * as vscode from 'vscode';
import { PropDefinition } from '../parser/propParser';

/**
 * Indexed representation of a prop definition.
 */
export interface IndexedProp {
    prototypeName: string;
    propPath: string[];
    start: number;
    end: number;
    source: 'styleguide' | 'default';
    uri: vscode.Uri;
}

/**
 * PropIndex stores prop definitions scoped per prototype.
 *
 * Lookup rules:
 * - Scope is always a single prototype
 * - Lookup is performed by deepest-suffix match
 *   e.g. usage ['foo','bar','baz'] matches definition ['baz']
 *        or ['bar','baz'] or ['foo','bar','baz']
 *   with preference for the longest matching path
 */
export class PropIndex {
    private byPrototype = new Map<string, IndexedProp[]>();

    /**
     * Clear all indexed props.
     */
    clear(): void {
        this.byPrototype.clear();
    }

    /**
     * Index prop definitions for a single prototype.
     * New definitions are merged with existing ones.
     */
    indexPrototype(
        prototypeName: string,
        definitions: PropDefinition[],
        uri: vscode.Uri
    ): void {
        const newProps: IndexedProp[] = definitions
            .filter(d => d.prototypeName === prototypeName)
            .map(d => ({
                prototypeName: d.prototypeName,
                propPath: d.propPath,
                start: d.start,
                end: d.end,
                source: d.source,
                uri: uri
            }));

        const existing = this.byPrototype.get(prototypeName) || [];
        this.byPrototype.set(prototypeName, [...existing, ...newProps]);
    }

    /**
     * Remove all prop definitions originating from a specific file.
     */
    removeByUri(uri: vscode.Uri): void {
        const uriKey = uri.toString();

        for (const [prototypeName, props] of this.byPrototype.entries()) {
            const filtered = props.filter(p => p.uri.toString() !== uriKey);

            if (filtered.length === 0) {
                this.byPrototype.delete(prototypeName);
            } else if (filtered.length !== props.length) {
                this.byPrototype.set(prototypeName, filtered);
            }
        }
    }

    /**
     * Resolve a prop usage to its definition.
     * First tries exact match, then falls back to deepest-suffix match.
     *
     * @param prototypeName enclosing prototype name
     * @param usagePath path segments from usage, e.g. ['foo','bar','baz']
     */
    resolve(
        prototypeName: string,
        usagePath: string[]
    ): IndexedProp | undefined {
        const props = this.byPrototype.get(prototypeName);
        if (!props || props.length === 0) {
            return undefined;
        }

        // First try exact match
        for (const prop of props) {
            if (pathsEqual(usagePath, prop.propPath)) {
                return prop;
            }
        }

        // Fall back to deepest-suffix match
        let bestMatch: IndexedProp | undefined;
        let bestLength = 0;

        for (const prop of props) {
            if (isSuffix(usagePath, prop.propPath)) {
                if (prop.propPath.length > bestLength) {
                    bestMatch = prop;
                    bestLength = prop.propPath.length;
                }
            }
        }

        return bestMatch;
    }

    /**
     * Get child property names for a given usage path.
     *
     * Example:
     *  definitions: ['foo','bar'], ['foo','baz'], ['foo','baz','qux']
     *
     *  getChildren(proto, ['foo'])       -> ['bar','baz']
     *  getChildren(proto, ['foo','baz']) -> ['qux']
     */
    getChildren(
        prototypeName: string,
        usagePath: string[]
    ): string[] {
        const props = this.byPrototype.get(prototypeName);
        if (!props || props.length === 0) {
            return [];
        }

        const result = new Set<string>();

        for (const prop of props) {
            // propPath must start with usagePath
            if (prop.propPath.length <= usagePath.length) {
                continue;
            }

            let matches = true;
            for (let i = 0; i < usagePath.length; i++) {
                if (prop.propPath[i] !== usagePath[i]) {
                    matches = false;
                    break;
                }
            }

            if (!matches) {
                continue;
            }

            result.add(prop.propPath[usagePath.length]);
        }

        return Array.from(result);
    }
}

/**
 * Check whether `candidate` is a suffix of `full`.
 */
function isSuffix(full: string[], candidate: string[]): boolean {
    if (candidate.length > full.length) {
        return false;
    }

    for (let i = 1; i <= candidate.length; i++) {
        if (full[full.length - i] !== candidate[candidate.length - i]) {
            return false;
        }
    }

    return true;
}

/**
 * Check if two paths are exactly equal.
 */
function pathsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }

    return true;
}
