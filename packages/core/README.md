# @kotadb/core

Standalone TypeScript code intelligence library for AST parsing, symbol extraction, reference tracking, and dependency analysis.

## Overview

`@kotadb/core` provides a clean, dependency-free API for analyzing TypeScript and JavaScript code. It extracts symbols, references, and dependencies from source files, enabling code intelligence features like:

- Symbol extraction (functions, classes, interfaces, types, etc.)
- Reference tracking (imports, function calls, property access, type references)
- Dependency graph construction (file→file and symbol→symbol)
- Circular dependency detection
- Import path resolution

## Installation

```bash
bun add @kotadb/core
```

## Quick Start

```typescript
import { parseFile, extractSymbols, extractReferences } from '@kotadb/core';

const content = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;

// Parse the file to an AST
const ast = parseFile('example.ts', content);

if (ast) {
  // Extract symbols
  const symbols = extractSymbols(ast, 'example.ts');
  process.stdout.write(JSON.stringify(symbols , null, 2) + "\n"); // [{ name: 'greet', kind: 'function', ... }]

  // Extract references
  const references = extractReferences(ast, 'example.ts');
  process.stdout.write(JSON.stringify(references , null, 2) + "\n"); // Array of imports, calls, etc.
}
```

## API Documentation

### Parsers

#### `parseFile(filePath: string, content: string): TSESTree.Program | null`

Parse a TypeScript or JavaScript file to an Abstract Syntax Tree (AST).

- **filePath**: File path (for error messages)
- **content**: File content to parse
- **Returns**: Parsed AST program, or `null` if parsing failed

```typescript
const ast = parseFile('example.ts', 'export const x = 1;');
```

#### `isSupportedForAST(filePath: string): boolean`

Check if a file extension is supported for AST parsing.

Supported extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`

```typescript
isSupportedForAST('utils.ts');     // true
isSupportedForAST('config.json');  // false
```

### Symbol Extraction

#### `extractSymbols(ast: TSESTree.Program, filePath: string): Symbol[]`

Extract all symbols from a parsed AST.

Returns an array of symbols with:
- `name`: Symbol name
- `kind`: Symbol type (function, class, interface, type, variable, constant, method, property, enum)
- `lineStart`, `lineEnd`: Line range (1-indexed)
- `columnStart`, `columnEnd`: Column range (0-indexed)
- `signature`: Function signature (if applicable)
- `documentation`: JSDoc comment text (if present)
- `isExported`: Whether symbol is exported
- `isAsync`: Whether function is async (functions only)
- `accessModifier`: Access modifier (class members only)

```typescript
const symbols = extractSymbols(ast, 'example.ts');
process.stdout.write(JSON.stringify(symbols[0]);
// {
//   name: 'greet',
//   kind: 'function',
//   lineStart: 1,
//   lineEnd: 3,
//   columnStart: 0,
//   columnEnd: 1,
//   signature: '(name) => <return-type>',
//   documentation: 'Greets a person by name',
//   isExported: true,
//   isAsync: false
// }
```

### Reference Extraction

#### `extractReferences(ast: TSESTree.Program, filePath: string): Reference[]`

Extract all references from a parsed AST.

Returns an array of references with:
- `targetName`: Symbol name being referenced
- `referenceType`: Reference type (import, call, property_access, type_reference)
- `lineNumber`: Line number (1-indexed)
- `columnNumber`: Column number (0-indexed)
- `metadata`: Additional context (import source, alias info, etc.)

```typescript
const references = extractReferences(ast, 'example.ts');
process.stdout.write(JSON.stringify(references[0]);
// {
//   targetName: 'React',
//   referenceType: 'import',
//   lineNumber: 1,
//   columnNumber: 7,
//   metadata: {
//     importSource: 'react',
//     isDefaultImport: true
//   }
// }
```

### Dependency Analysis

#### `extractDependencies(files, symbols, references): DependencyEdge[]`

Extract file→file and symbol→symbol dependencies.

```typescript
import { extractDependencies } from '@kotadb/core';

const files = [{ id: 'file1', path: '/repo/src/a.ts' }];
const symbols = [{ id: 'sym1', fileId: 'file1', name: 'foo', ... }];
const references = [{ fileId: 'file1', targetName: 'bar', ... }];

const deps = extractDependencies(files, symbols, references);
```

#### `resolveImport(importSource, fromFilePath, files): string | null`

Resolve an import path to an absolute file path.

Handles:
- Relative imports (`./foo`, `../bar`)
- Extension variants (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`)
- Index file resolution (`./dir` → `./dir/index.ts`)

```typescript
import { resolveImport } from '@kotadb/core';

const files = [
  { id: '1', path: '/repo/src/utils.ts' },
  { id: '2', path: '/repo/src/api/routes.ts' }
];

resolveImport('../utils', '/repo/src/api/routes.ts', files);
// => '/repo/src/utils.ts'
```

### Circular Dependency Detection

#### `detectCircularDependencies(dependencies, filePathById, symbolNameById): CircularChain[]`

Detect circular dependencies in file→file and symbol→symbol graphs.

Returns array of detected cycles with:
- `type`: Dependency type (file_import, symbol_usage)
- `chain`: Ordered sequence of node IDs forming the cycle
- `description`: Human-readable description

```typescript
import { detectCircularDependencies } from '@kotadb/core';

const deps = [
  { fromFileId: 'a', toFileId: 'b', dependencyType: 'file_import', ... },
  { fromFileId: 'b', toFileId: 'a', dependencyType: 'file_import', ... }
];

const filePaths = new Map([['a', '/repo/a.ts'], ['b', '/repo/b.ts']]);
const cycles = detectCircularDependencies(deps, filePaths, new Map());
// [{ type: 'file_import', chain: ['a', 'b', 'a'], description: '/repo/a.ts → /repo/b.ts' }]
```

### Storage Adapters

#### `MemoryStorageAdapter`

In-memory storage adapter for testing and standalone use.

```typescript
import { MemoryStorageAdapter } from '@kotadb/core';

const storage = new MemoryStorageAdapter();

const symbolId = await storage.storeSymbol('file-1', {
  name: 'foo',
  kind: 'function',
  // ... other symbol properties
});

const symbols = await storage.getSymbolsByFile('file-1');
```

#### `SqliteStorageAdapter`

SQLite storage adapter for persistent code intelligence data.

```typescript
import { SqliteStorageAdapter } from '@kotadb/core';

// Use in-memory database
const storage = new SqliteStorageAdapter();

// Or use file-based database
const storage = new SqliteStorageAdapter('./code-intel.db');

await storage.storeSymbol('file-1', symbol);
await storage.storeReference('file-1', reference);
await storage.storeDependency(dependency);

// Don't forget to close when done
storage.close();
```

## Architecture

The package is organized into four main modules:

- **parsers**: AST parsing wrapper for @typescript-eslint/parser
- **analysis**: Symbol extraction, reference tracking, dependency analysis
- **storage**: Storage abstraction with in-memory and SQLite adapters
- **types**: TypeScript type definitions for all data structures

## Design Principles

- **Zero Dependencies**: No external runtime dependencies (except TypeScript parser)
- **Extensible Storage**: Pluggable storage adapters (memory, SQLite, etc.)
- **Type Safe**: Full TypeScript type coverage
- **No Side Effects**: Pure functions with no logging or telemetry

## Testing

```bash
bun test                    # Run tests
bun run typecheck           # Type checking
```

## Contributing

This package is maintained as part of [KotaDB](https://github.com/kotadb/kota-db-ts). See the main repository for contribution guidelines.

## License

MIT
