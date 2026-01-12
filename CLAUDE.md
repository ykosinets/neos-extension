# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code extension that provides advanced language support for Neos Fusion files (.fusion). The extension offers:
- Prototype go-to-definition
- Prototype autocomplete
- Property (prop) go-to-definition
- Property autocomplete
- Auto-close tag functionality

## Build and Development Commands

```bash
# Compile TypeScript to JavaScript
npm run compile

# Watch mode for development (compiles on file changes)
npm run watch
```

To debug the extension:
1. Run `npm run watch` to start compilation in watch mode
2. Press F5 or use "Run Extension" launch configuration
3. This opens a new VS Code window with the extension loaded

## Architecture

### Core Components

**WorkspaceIndex** (`src/index/workspaceIndex.ts`)
- Entry point for all indexing operations
- Scans workspace for `.fusion` files on initialization
- Delegates to specialized indexes (PrototypeIndex, PropIndex)
- Accessed globally via `getWorkspaceIndex()` from `src/extension.ts`

**PrototypeIndex** (`src/index/prototypeIndex.ts`)
- Maintains global map of prototype names → source locations
- Stores fully qualified prototype names (e.g., `CodeQ.Site:Presentation.Molecule.Test`)
- Provides lookup by name and completions

**PropIndex** (`src/index/propIndex.ts`)
- Stores property definitions scoped per prototype
- Uses deepest-suffix matching algorithm for resolution
  - Usage path `['foo','bar','baz']` matches definition `['baz']`, `['bar','baz']`, or `['foo','bar','baz']`
  - Prefers longest matching path
- Prioritizes `@styleguide.props` definitions over defaults

### Parsers

All parsers are regex-based, intentionally simple, and independent of VS Code APIs:

**prototypeParser** (`src/parser/prototypeParser.ts`)
- Extracts `prototype(Name)` declarations
- Returns name and offset range

**propParser** (`src/parser/propParser.ts`)
- Parses property definitions from two sources:
  1. `@styleguide { props { ... } }` blocks (higher priority)
  2. Default assignments like `foo = null` (fallback)
- Uses brace-tracking to identify prototype bodies
- Returns property paths as arrays (e.g., `['foo', 'bar', 'baz']`)

### Providers

**PrototypeDefinitionProvider** (`src/providers/prototypeDefinitionProvider.ts`)
- Implements VS Code's DefinitionProvider interface
- Looks up prototype locations in PrototypeIndex

**PrototypeCompletionProvider** (`src/providers/prototypeCompletionProvider.ts`)
- Triggered by `:` and `<` characters
- Provides autocomplete for prototype names

**PropDefinitionProvider** (`src/providers/propDefinitionProvider.ts`)
- Implements DefinitionProvider for property navigation
- Uses PropIndex.resolve() with deepest-suffix matching

**PropCompletionProvider** (`src/providers/propCompletionProvider.ts`)
- Triggered by `.` and `{` characters
- Uses PropIndex.getChildren() for context-aware suggestions

### Extension Lifecycle

1. **Activation** (`src/extension.ts:activate`)
   - Creates WorkspaceIndex singleton
   - Calls `workspaceIndex.initialize()` to scan all .fusion files
   - Registers language providers and features

2. **Deactivation** (`src/extension.ts:deactivate`)
   - Clears WorkspaceIndex
   - Nullifies singleton reference

## Key Design Patterns

- **Parser-Index-Provider separation**: Parsers are pure functions, indexes manage data structures, providers handle VS Code integration
- **Single-pass indexing**: Each file is read once during initialization
- **Suffix matching for props**: Enables flexible property resolution without requiring full path specification
- **Priority-based prop sources**: Styleguide definitions override defaults
