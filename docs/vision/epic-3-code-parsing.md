# Epic 3: Enhanced Code Parsing

> **Reference Document**: This epic was from original planning. See [ROADMAP.md](./ROADMAP.md) for current priorities and [CURRENT_STATE.md](./CURRENT_STATE.md) for gap analysis.

**Status**: 🟢 70% Complete (**NO LONGER BLOCKING MVP**)
**Priority**: High (Core functionality)
**Estimated Duration for Remaining Work**: 1 week
**Actual Progress**: AST parsing complete, symbol extraction complete, reference extraction complete (#75), dependency graph complete (#76). Symbol resolution for `find_references` tool remains.

## Overview

Migrate from regex-based parsing to proper AST parsing using `@typescript-eslint/parser`. Extract symbols, references, and dependencies with precise position information.

## Current Status

**Completion**: 70% (updated 2025-10-20)
**Blockers**: None (no longer blocking MVP)

### Completed (as of 2025-10-20)
- ✅ AST parsing with `@typescript-eslint/parser` (#117) - Merged in PR #117
- ✅ Symbol extraction (#74) - Merged in PR #126
- ✅ **Reference extraction** (#75) - Merged in PR #225
  - Extracts imports, function calls, property accesses, type references
  - Stores caller location (file, line, column)
  - Handles aliased imports
- ✅ **Dependency graph extraction** (#76) - Merged in PR #226
  - File→file dependencies via imports
  - Circular dependency detection during traversal
  - Stored in `dependency_graph` table
- ✅ **`search_dependencies` MCP tool** (#116) - Merged in PR #229
  - Three search directions: dependents, dependencies, both
  - Recursive traversal with configurable depth (1-5)
  - Optional test file filtering

### In Progress
- None

### Remaining Work
- Symbol resolution for `find_references` MCP tool (~1 week)
- Type relationship extraction (interfaces, generics) - nice-to-have
- Docstring/comment extraction (JSDoc, TSDoc) - nice-to-have

## Issues

### Issue #7: Set up test infrastructure

**Priority**: P0 (Critical)
**Depends on**: #1 (needs schema), #2 (needs Supabase client)
**Blocks**: All parsing work

#### Description
Create test infrastructure with fixture repositories, database seeding, and test utilities. This enables TDD for parsing logic.

#### Acceptance Criteria
- [ ] Test database setup/teardown scripts
- [ ] Fixture repositories with known structure
  - Simple repo: 5 files, linear dependencies
  - Complex repo: 20 files, circular dependencies, multiple languages
- [ ] Mock GitHub webhook payloads
- [ ] Test utilities for assertion helpers
- [ ] Documentation for adding new fixtures

#### Technical Notes
- Use in-memory SQLite for fast unit tests
- Use Supabase test project for integration tests
- Fixtures should cover: imports, exports, function calls, type references
- Store fixtures in `tests/fixtures/`

#### Files to Create
- `tests/setup.ts` - Test database setup
- `tests/fixtures/simple-repo/` - Simple test repository
- `tests/fixtures/complex-repo/` - Complex test repository
- `tests/utils.ts` - Test helper functions
- `tests/README.md` - Testing documentation

#### Example Fixture Structure
```
tests/fixtures/simple-repo/
  src/
    index.ts        # Exports main(), imports utils
    utils.ts        # Exports helper functions
    types.ts        # Type definitions
  package.json
  tsconfig.json

tests/fixtures/complex-repo/
  src/
    api/
      routes.ts     # Imports handlers
      handlers.ts   # Circular dep with routes
    db/
      schema.ts     # Type definitions
      queries.ts    # Uses schema types
  ...
```

---

### Issue #8: Migrate to @typescript-eslint/parser

**Priority**: P0 (Critical)
**Depends on**: #7
**Blocks**: #9, #10, #11

#### Description
Replace regex-based parsing with proper TypeScript/JavaScript AST parsing. Extract basic AST structure and handle all supported file types.

#### Acceptance Criteria
- [ ] Parse `.ts`, `.tsx`, `.js`, `.jsx` files
- [ ] Extract full AST (Abstract Syntax Tree)
- [ ] Handle syntax errors gracefully (log and skip)
- [ ] Preserve source locations (line, column) for all nodes
- [ ] Support both TypeScript and JavaScript syntax
- [ ] Unit tests with fixture files

#### Technical Notes
- Use `@typescript-eslint/parser` (supports both TS and JS)
- Parse options: `{ ecmaVersion: 'latest', sourceType: 'module' }`
- Don't fail on parse errors—log and continue
- Store AST in memory (don't persist entire AST to DB)

#### Files to Create
- `src/indexer/ast-parser.ts` - AST parsing wrapper
- `src/indexer/ast-types.ts` - Type definitions for AST nodes
- `tests/indexer/ast-parser.test.ts` - Parser tests

#### Example Implementation
```typescript
import { parse } from '@typescript-eslint/parser'
import type { TSESTree } from '@typescript-eslint/types'

export function parseFile(filePath: string, content: string): TSESTree.Program | null {
  try {
    const ast = parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      loc: true,
      range: true,
      comment: true,
      tokens: true,
      filePath,
    })
    return ast
  } catch (error) {
    console.error(`Failed to parse ${filePath}:`, error)
    return null
  }
}
```

---

### Issue #9: Implement symbol extraction

**Priority**: P0 (Critical)
**Depends on**: #8
**Blocks**: #10, #11

#### Description
Extract function, class, interface, type, and export declarations from AST. Store with precise location information.

#### Acceptance Criteria
- [ ] Extract all function declarations and expressions
- [ ] Extract class declarations
- [ ] Extract interface and type alias declarations
- [ ] Extract variable declarations (const, let, var)
- [ ] Extract export statements (named and default)
- [ ] Store line/column positions (start and end)
- [ ] Extract function signatures (parameters, return type)
- [ ] Extract JSDoc/TSDoc comments as docstrings
- [ ] Mark symbols as exported or internal
- [ ] Unit tests for each symbol type

#### Technical Notes
- Traverse AST using visitor pattern
- Handle edge cases: anonymous functions, arrow functions, default exports
- Store in `symbols` table with foreign key to `indexed_files`

#### Files to Create
- `src/indexer/symbol-extractor.ts` - Symbol extraction logic
- `tests/indexer/symbol-extractor.test.ts` - Symbol extraction tests

#### Example Implementation
```typescript
export function extractSymbols(ast: TSESTree.Program, fileId: string): Symbol[] {
  const symbols: Symbol[] = []

  visit(ast, {
    FunctionDeclaration(node) {
      symbols.push({
        fileId,
        name: node.id?.name || '<anonymous>',
        kind: 'function',
        lineStart: node.loc.start.line,
        lineEnd: node.loc.end.line,
        columnStart: node.loc.start.column,
        columnEnd: node.loc.end.column,
        signature: buildSignature(node),
        docstring: extractDocstring(node),
        isExported: isExported(node),
      })
    },

    ClassDeclaration(node) {
      // Similar extraction for classes
    },

    TSInterfaceDeclaration(node) {
      // Extract interfaces
    },

    TSTypeAliasDeclaration(node) {
      // Extract type aliases
    },
  })

  return symbols
}
```

---

### Issue #10: Implement reference extraction

**Priority**: P1 (High)
**Depends on**: #9
**Blocks**: #11

#### Description
Extract all references to symbols: imports, function calls, property accesses, and type references.

#### Acceptance Criteria
- [ ] Extract import statements (all forms: named, default, namespace)
- [ ] Extract function calls (including method calls)
- [ ] Extract property accesses (for finding usage of exports)
- [ ] Extract type references (TypeScript `Type` syntax)
- [ ] Store caller location (file, line, column)
- [ ] Link references to symbols (by name, resolve later)
- [ ] Handle aliased imports (`import { foo as bar }`)
- [ ] Unit tests for each reference type

#### Technical Notes
- Store in `references` table
- Link to `symbol_id` after symbol resolution (post-processing step)
- Handle both relative and absolute imports

#### Files to Create
- `src/indexer/reference-extractor.ts` - Reference extraction logic
- `tests/indexer/reference-extractor.test.ts` - Reference extraction tests

#### Example Implementation
```typescript
export function extractReferences(ast: TSESTree.Program, fileId: string): Reference[] {
  const references: Reference[] = []

  visit(ast, {
    ImportDeclaration(node) {
      node.specifiers.forEach((spec) => {
        references.push({
          fileId,
          symbolName: spec.local.name,
          line: node.loc.start.line,
          column: node.loc.start.column,
          referenceType: 'import',
          importSource: node.source.value,
        })
      })
    },

    CallExpression(node) {
      if (node.callee.type === 'Identifier') {
        references.push({
          fileId,
          symbolName: node.callee.name,
          line: node.loc.start.line,
          column: node.loc.start.column,
          referenceType: 'call',
        })
      }
    },

    MemberExpression(node) {
      // Extract property accesses
    },

    TSTypeReference(node) {
      // Extract type references
    },
  })

  return references
}
```

---

### Issue #11: Build dependency graph extraction

**Priority**: P1 (High)
**Depends on**: #10
**Blocks**: MCP `get_dependencies` tool (#27)

#### Description
Build file-to-file and symbol-to-symbol dependency graphs. Detect circular dependencies.

#### Acceptance Criteria
- [ ] Extract file → file dependencies (via imports)
- [ ] Extract symbol → symbol dependencies (via usage)
- [ ] Resolve relative imports to absolute file paths
- [ ] Handle circular dependencies (detect and warn)
- [ ] Store in `dependencies` table
- [ ] Build recursive dependency tree
- [ ] Unit tests with circular and non-circular examples

#### Technical Notes
- Use import paths to resolve file dependencies
- Use symbol references to resolve symbol dependencies
- Store both directions: forward deps (A imports B) and reverse deps (B imported by A)

#### Files to Create
- `src/indexer/dependency-extractor.ts` - Dependency extraction
- `src/indexer/circular-detector.ts` - Circular dependency detection
- `tests/indexer/dependency-extractor.test.ts` - Dependency tests

#### Example Implementation
```typescript
export function extractDependencies(
  files: IndexedFile[],
  symbols: Symbol[],
  references: Reference[]
): Dependency[] {
  const dependencies: Dependency[] = []

  // Build file → file dependencies
  references.forEach((ref) => {
    if (ref.referenceType === 'import' && ref.importSource) {
      const resolvedPath = resolveImport(ref.importSource, ref.fileId)
      const targetFile = files.find((f) => f.path === resolvedPath)

      if (targetFile) {
        dependencies.push({
          fromFileId: ref.fileId,
          toFileId: targetFile.id,
          dependencyType: 'file_import',
        })
      }
    }
  })

  // Build symbol → symbol dependencies
  references.forEach((ref) => {
    if (ref.referenceType === 'call') {
      const targetSymbol = symbols.find((s) => s.name === ref.symbolName)
      const callerSymbol = findCallerSymbol(symbols, ref)

      if (targetSymbol && callerSymbol) {
        dependencies.push({
          fromSymbolId: callerSymbol.id,
          toSymbolId: targetSymbol.id,
          dependencyType: 'symbol_usage',
        })
      }
    }
  })

  return dependencies
}

export function detectCircularDependencies(dependencies: Dependency[]): string[][] {
  // Implement cycle detection (DFS or Tarjan's algorithm)
}
```

---

## Success Criteria

- [ ] AST parser handles all TS/JS syntax correctly
- [ ] Symbols extracted with accurate position information
- [ ] References capture all imports, calls, and type usage
- [ ] Dependency graph is complete and accurate
- [ ] Circular dependencies are detected
- [ ] 70%+ test coverage for all parsing modules

## Dependencies for Other Epics

This epic enables:
- Epic 4 (indexing worker needs extraction pipeline)
- Epic 7 (MCP tools query extracted data)
- Epic 6 (REST API exposes extracted data)
