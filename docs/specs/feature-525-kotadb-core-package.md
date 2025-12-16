# feat: Extract @kotadb/core package with AST analysis

**Issue**: #525
**Type**: feature
**Created**: 2025-12-16

## BLUF (Bottom Line Up Front)

Extract ~2,500 LOC of AST parsing and code analysis functionality into a standalone `@kotadb/core` package (v0.1.0). This creates a reusable TypeScript code intelligence library with zero KotaDB dependencies, enabling:

1. Independent versioning and distribution
2. Use in other projects (CLI tools, editor extensions, etc.)
3. Cleaner separation of concerns in main app
4. Simplified testing with in-memory storage

**Key Deliverables**:
- Standalone npm package at `packages/core/`
- 6 analysis modules + storage abstraction
- 5 migrated test suites with fixtures
- Zero Sentry/logging dependencies
- Both memory and SQLite storage adapters

---

## Overview

### What This Feature Does

Creates a new `@kotadb/core` package containing the AST parsing and analysis engine that powers KotaDB's code intelligence features. The package provides:

- **AST Parsing**: TypeScript/JavaScript parsing via @typescript-eslint/parser
- **Symbol Extraction**: Extract functions, classes, interfaces, types with JSDoc
- **Reference Extraction**: Track imports, calls, property access, type references
- **Dependency Analysis**: Build file→file and symbol→symbol dependency graphs
- **Import Resolution**: Resolve relative imports with extension/index handling
- **Circular Detection**: DFS-based cycle detection in dependency graphs

### Why This Matters

**Current Pain Points**:
1. AST modules tightly coupled to KotaDB's Sentry/logging infrastructure
2. No way to reuse code analysis logic in other tools
3. Testing requires full KotaDB environment setup
4. Cannot independently version code intelligence features

**After Extraction**:
1. Clean, dependency-free library with simple API
2. Reusable in CLI tools, VS Code extensions, other projects
3. In-memory testing without database/Supabase
4. Independent release cycle for core functionality

---

## Implementation Steps

### Step 1: Create Package Structure

**Files**: `packages/core/` directory tree

**Actions**:
1. Create directory structure:
   ```
   packages/core/
   ├── package.json
   ├── tsconfig.json
   ├── README.md
   ├── src/
   │   ├── types/
   │   ├── parsers/
   │   ├── analysis/
   │   ├── storage/
   │   └── index.ts
   └── tests/
       ├── fixtures/
       └── [test files]
   ```

2. Create `package.json` with:
   - Name: `@kotadb/core`
   - Version: `0.1.0`
   - Type: `module`
   - Main: `dist/index.js`
   - Types: `dist/index.d.ts`
   - Exports map for subpath imports
   - Dependencies: `@typescript-eslint/parser@^8.0.0`, `@typescript-eslint/types@^8.0.0`
   - DevDependencies: `bun-types`, `typescript`, `@types/node`
   - Scripts: `build`, `test`, `typecheck`

3. Create `tsconfig.json` with:
   - `target`: `ES2022`
   - `module`: `ESNext`
   - `moduleResolution`: `bundler`
   - `declaration`: `true`
   - `outDir`: `dist`
   - `rootDir`: `src`
   - Strict mode enabled
   - No path aliases (standard npm structure)

4. Create build configuration:
   - Use `bun build` for bundling
   - Generate `.d.ts` files with `tsc`
   - Support both ESM and CJS exports

**Validation**:
```bash
ls -la packages/core/
cat packages/core/package.json
cat packages/core/tsconfig.json
```

---

### Step 2: Extract and Refactor Type Definitions

**Files**:
- `packages/core/src/types/ast.ts`
- `packages/core/src/types/symbol.ts`
- `packages/core/src/types/dependency.ts`
- `packages/core/src/types/reference.ts`
- `packages/core/src/types/storage.ts`
- `packages/core/src/types/index.ts`

**Actions**:

1. **Create `src/types/ast.ts`**:
   - Copy AST-related types from `app/src/indexer/ast-types.ts`
   - Re-export `TSESTree` from `@typescript-eslint/types`
   - Add `ParseError` interface
   - Add `ParseResult` discriminated union
   - Remove any KotaDB-specific imports

2. **Create `src/types/symbol.ts`**:
   - Extract `Symbol` interface from `app/src/indexer/symbol-extractor.ts` (lines 36-59)
   - Extract `SymbolKind` type (lines 67-77)
   - Add JSDoc comments for each field
   - Ensure standalone with no external dependencies

3. **Create `src/types/reference.ts`**:
   - Extract `Reference` interface from `app/src/indexer/reference-extractor.ts` (lines 42-53)
   - Extract `ReferenceType` type (lines 61-65)
   - Extract `ReferenceMetadata` interface (lines 72-91)
   - Add comprehensive JSDoc

4. **Create `src/types/dependency.ts`**:
   - Extract `DependencyEdge` interface from `app/src/indexer/dependency-extractor.ts` (lines 42-57)
   - Extract `CircularChain` interface from `app/src/indexer/circular-detector.ts` (lines 40-47)
   - Remove `repositoryId` field (package is repo-agnostic)
   - Make IDs generic `string` instead of UUIDs

5. **Create `src/types/storage.ts`**:
   - Define `StorageAdapter` interface with methods:
     - `storeSymbol(fileId: string, symbol: Symbol): Promise<string>`
     - `storeReference(fileId: string, reference: Reference): Promise<string>`
     - `storeDependency(dependency: DependencyEdge): Promise<string>`
     - `getSymbolsByFile(fileId: string): Promise<Symbol[]>`
     - `getReferencesByFile(fileId: string): Promise<Reference[]>`
     - `getDependenciesByFile(fileId: string): Promise<DependencyEdge[]>`
     - `clear(): Promise<void>`
   - Add JSDoc for each method

6. **Create `src/types/index.ts`** (barrel export):
   ```typescript
   export * from './ast.js';
   export * from './symbol.js';
   export * from './reference.js';
   export * from './dependency.js';
   export * from './storage.js';
   ```

**Validation**:
```bash
ls packages/core/src/types/
bunx tsc --noEmit --project packages/core/tsconfig.json
```

---

### Step 3: Create Storage Abstraction Layer

**Files**:
- `packages/core/src/storage/memory-adapter.ts`
- `packages/core/src/storage/sqlite-adapter.ts`
- `packages/core/src/storage/index.ts`

**Actions**:

1. **Create `src/storage/memory-adapter.ts`**:
   - Implement `StorageAdapter` interface
   - Use `Map<string, T[]>` for in-memory storage
   - Generate UUIDs with `crypto.randomUUID()`
   - Provide default export: `new MemoryStorageAdapter()`
   - Add class JSDoc: "In-memory storage adapter for testing and standalone use"

2. **Create `src/storage/sqlite-adapter.ts`**:
   - Implement `StorageAdapter` interface
   - Use `bun:sqlite` for database operations
   - Create tables on initialization:
     - `symbols`: `id TEXT PRIMARY KEY, file_id TEXT, name TEXT, kind TEXT, line_start INTEGER, line_end INTEGER, column_start INTEGER, column_end INTEGER, signature TEXT, documentation TEXT, is_exported INTEGER, is_async INTEGER, access_modifier TEXT`
     - `references`: `id TEXT PRIMARY KEY, file_id TEXT, target_name TEXT, reference_type TEXT, line_number INTEGER, column_number INTEGER, metadata TEXT`
     - `dependencies`: `id TEXT PRIMARY KEY, from_file_id TEXT, to_file_id TEXT, from_symbol_id TEXT, to_symbol_id TEXT, dependency_type TEXT, metadata TEXT`
   - Serialize JSON fields (metadata)
   - Accept database path in constructor (default: `:memory:`)
   - Add class JSDoc: "SQLite storage adapter for persistent code intelligence data"

3. **Create `src/storage/index.ts`** (barrel export):
   ```typescript
   export { MemoryStorageAdapter } from './memory-adapter.js';
   export { SqliteStorageAdapter } from './sqlite-adapter.js';
   export type { StorageAdapter } from '../types/storage.js';
   ```

**Validation**:
```bash
cd packages/core && bun test src/storage/*.test.ts
```

---

### Step 4: Extract AST Parser Module

**Files**:
- `packages/core/src/parsers/ast-parser.ts`
- `packages/core/src/parsers/index.ts`

**Actions**:

1. **Copy and refactor `ast-parser.ts`**:
   - Copy from `app/src/indexer/ast-parser.ts` to `packages/core/src/parsers/ast-parser.ts`
   - Remove imports:
     - `import { Sentry } from "../instrument.js";` (lines 19)
     - `import { createLogger } from "@logging/logger.js";` (line 20)
     - `const logger = createLogger({ module: "indexer-ast-parser" });` (line 22)
   - Replace logger calls with `process.stderr.write()`:
     - Line 120: Replace `logger.error(...)` with:
       ```typescript
       process.stderr.write(
         `Failed to parse ${filePath}${location}: ${message}\n`
       );
       ```
   - Remove Sentry capture block (lines 128-142)
   - Update imports to use package-local types:
     - Change `@typescript-eslint/types` imports (keep as-is)
     - Add `import type { TSESTree } from '../types/ast.js';`
   - Keep all existing functionality:
     - `SUPPORTED_EXTENSIONS` constant
     - `isSupportedForAST()` function
     - `parseFile()` function
   - Preserve all JSDoc comments

2. **Create `src/parsers/index.ts`** (barrel export):
   ```typescript
   export { parseFile, isSupportedForAST } from './ast-parser.js';
   ```

**Validation**:
```bash
bunx tsc --noEmit --project packages/core/tsconfig.json
cd packages/core && bun test src/parsers/ast-parser.test.ts
```

---

### Step 5: Extract Analysis Modules

**Files**:
- `packages/core/src/analysis/symbol-extractor.ts`
- `packages/core/src/analysis/reference-extractor.ts`
- `packages/core/src/analysis/dependency-extractor.ts`
- `packages/core/src/analysis/import-resolver.ts`
- `packages/core/src/analysis/circular-detector.ts`
- `packages/core/src/analysis/index.ts`

**Actions**:

**For each module** (`symbol-extractor.ts`, `reference-extractor.ts`, `dependency-extractor.ts`, `import-resolver.ts`, `circular-detector.ts`):

1. Copy from `app/src/indexer/[module].ts` to `packages/core/src/analysis/[module].ts`

2. Remove all Sentry/logging imports:
   - Remove `import { Sentry } from "../instrument.js";`
   - Remove `import { createLogger } from "@logging/logger.js";`
   - Remove `const logger = createLogger({ ... });`

3. Replace logging calls:
   - `logger.error(...)` → `process.stderr.write(...)\n`
   - `logger.warn(...)` → `process.stderr.write(...)\n`
   - `logger.debug(...)` → `process.stderr.write(...)\n` (or remove if non-critical)

4. Remove Sentry capture blocks (e.g., `Sentry.captureException(...)`)

5. Update imports to use package-local types:
   - Change `@indexer/*` imports to relative imports (`./symbol-extractor.js`, etc.)
   - Change `@shared/types/entities` to use simplified types from `../types/`
   - Remove `repositoryId` parameters from functions (not needed in standalone package)

6. Update type references:
   - `Symbol` → import from `../types/symbol.js`
   - `Reference` → import from `../types/reference.js`
   - `DependencyEdge` → import from `../types/dependency.js`
   - `CircularChain` → import from `../types/dependency.js`

7. Simplify `dependency-extractor.ts`:
   - Remove `repositoryId` from `DependencyEdge` interface usage
   - Change `IndexedFile` type to simplified interface:
     ```typescript
     interface IndexedFile {
       id: string;
       path: string;
     }
     ```
   - Keep all core logic intact

8. Preserve all functionality:
   - Keep all visitor patterns
   - Keep all extraction logic
   - Keep all helper functions
   - Keep all JSDoc comments

**Create `src/analysis/index.ts`** (barrel export):
```typescript
export { extractSymbols } from './symbol-extractor.js';
export type { Symbol, SymbolKind } from '../types/symbol.js';

export { extractReferences } from './reference-extractor.js';
export type { Reference, ReferenceType, ReferenceMetadata } from '../types/reference.js';

export { extractDependencies, buildFileDependencies, buildSymbolDependencies } from './dependency-extractor.js';
export type { DependencyEdge } from '../types/dependency.js';

export { resolveImport, resolveExtensions, handleIndexFiles } from './import-resolver.js';

export { detectCircularDependencies, buildAdjacencyList, findCycles } from './circular-detector.js';
export type { CircularChain } from '../types/dependency.js';
```

**Validation**:
```bash
bunx tsc --noEmit --project packages/core/tsconfig.json
grep -r "Sentry\|createLogger" packages/core/src/analysis/ # Should return nothing
```

---

### Step 6: Create Public API

**Files**: `packages/core/src/index.ts`

**Actions**:

1. Create main entry point with clean public API:
   ```typescript
   /**
    * @kotadb/core - Standalone TypeScript code intelligence library
    *
    * Provides AST parsing, symbol extraction, reference tracking,
    * dependency analysis, and circular dependency detection.
    *
    * @example
    * ```typescript
    * import { parseFile, extractSymbols, MemoryStorageAdapter } from '@kotadb/core';
    *
    * const content = await Bun.file('example.ts').text();
    * const ast = parseFile('example.ts', content);
    *
    * if (ast) {
    *   const symbols = extractSymbols(ast, 'example.ts');
    *   process.stdout.write(`Found ${symbols.length} symbols\n`);
    * }
    * ```
    */

   // Re-export all public APIs
   export * from './parsers/index.js';
   export * from './analysis/index.js';
   export * from './storage/index.js';
   export * from './types/index.js';
   ```

2. Add package-level JSDoc describing:
   - Purpose: "TypeScript code intelligence library"
   - Features: AST parsing, symbol extraction, dependency analysis
   - Usage examples for common scenarios
   - Link to README

**Validation**:
```bash
cat packages/core/src/index.ts
bunx tsc --noEmit --project packages/core/tsconfig.json
```

---

### Step 7: Migrate Tests and Fixtures

**Files**:
- `packages/core/tests/*.test.ts` (5 test files)
- `packages/core/tests/fixtures/` (all parsing fixtures)
- `packages/core/tests/setup.ts`

**Actions**:

1. **Copy test files**:
   - Copy all `app/tests/indexer/*.test.ts` to `packages/core/tests/`
   - Files to copy:
     - `ast-parser.test.ts`
     - `symbol-extractor.test.ts`
     - `reference-extractor.test.ts`
     - `import-resolver.test.ts`
     - `circular-detector.test.ts`

2. **Copy test fixtures**:
   - Copy entire `app/tests/fixtures/parsing/` directory to `packages/core/tests/fixtures/`
   - Includes both `simple/` and `complex/` fixture sets

3. **Update test imports**:
   - Change path alias imports (`@indexer/*`) to package imports:
     - `import { parseFile } from '@indexer/ast-parser'` → `import { parseFile } from '../src/parsers/ast-parser.js'`
     - `import { extractSymbols } from '@indexer/symbol-extractor'` → `import { extractSymbols } from '../src/analysis/symbol-extractor.js'`
   - Update fixture paths:
     - Change `join(import.meta.dir, "../fixtures/parsing/simple")` to match new location

4. **Create test setup**:
   - Create `packages/core/tests/setup.ts` (if needed for bun:test configuration)
   - Minimal setup, no Supabase or external dependencies

5. **Update `package.json` test script**:
   ```json
   "test": "bun test tests/*.test.ts"
   ```

6. **Run all tests** to verify migration:
   - All existing test assertions should pass
   - No database or Supabase dependencies
   - Tests use in-memory data structures

**Validation**:
```bash
ls packages/core/tests/
ls packages/core/tests/fixtures/
cd packages/core && bun test
```

---

### Step 8: Create Documentation

**Files**:
- `packages/core/README.md`
- `packages/core/CHANGELOG.md`

**Actions**:

1. **Create comprehensive README.md** with sections:

   **Header**:
   - Title: "@kotadb/core"
   - Badge: Version, License, Build Status (placeholder)
   - One-line description: "Standalone TypeScript code intelligence library"

   **Overview**:
   - What the package does
   - Key features (AST parsing, symbol extraction, etc.)
   - When to use it (CLI tools, editor extensions, analysis scripts)

   **Installation**:
   ```bash
   bun add @kotadb/core
   ```

   **Quick Start**:
   ```typescript
   import { parseFile, extractSymbols } from '@kotadb/core';

   const content = `
     export function hello(name: string): string {
       return \`Hello, \${name}!\`;
     }
   `;

   const ast = parseFile('example.ts', content);
   if (ast) {
     const symbols = extractSymbols(ast, 'example.ts');
     console.log(symbols); // [{ name: 'hello', kind: 'function', ... }]
   }
   ```

   **API Documentation**:
   - **Parsers**:
     - `parseFile(filePath, content): TSESTree.Program | null`
     - `isSupportedForAST(filePath): boolean`
   - **Symbol Extraction**:
     - `extractSymbols(ast, filePath): Symbol[]`
     - Symbol interface fields
   - **Reference Extraction**:
     - `extractReferences(ast, filePath): Reference[]`
     - Reference types and metadata
   - **Dependency Analysis**:
     - `extractDependencies(files, symbols, references): DependencyEdge[]`
     - `resolveImport(importSource, fromFilePath, files): string | null`
   - **Circular Detection**:
     - `detectCircularDependencies(dependencies, ...): CircularChain[]`
   - **Storage Adapters**:
     - `MemoryStorageAdapter` - In-memory storage for testing
     - `SqliteStorageAdapter` - Persistent SQLite storage

   **Usage Examples**:
   - Parsing a file
   - Extracting symbols with JSDoc
   - Tracking function calls
   - Building dependency graphs
   - Detecting circular dependencies
   - Using storage adapters

   **Architecture**:
   - Module organization (parsers, analysis, storage, types)
   - Design principles (zero dependencies, extensible storage)
   - Extension points (custom storage adapters)

   **Testing**:
   ```bash
   bun test
   bun run typecheck
   ```

   **Contributing**:
   - Link to main KotaDB CONTRIBUTING.md
   - Note: "This package is maintained as part of KotaDB"

   **License**: MIT

2. **Create initial CHANGELOG.md**:
   ```markdown
   # Changelog

   All notable changes to @kotadb/core will be documented in this file.

   The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
   and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

   ## [0.1.0] - 2025-12-16

   ### Added
   - Initial release of @kotadb/core
   - AST parsing with @typescript-eslint/parser
   - Symbol extraction (functions, classes, interfaces, types, etc.)
   - Reference extraction (imports, calls, property access, type references)
   - Dependency graph construction (file→file, symbol→symbol)
   - Import path resolution with extension/index handling
   - Circular dependency detection using DFS
   - Storage abstraction with MemoryStorageAdapter and SqliteStorageAdapter
   - Comprehensive test suite with fixtures
   - Full TypeScript type definitions
   ```

**Validation**:
```bash
cat packages/core/README.md
cat packages/core/CHANGELOG.md
```

---

### Step 9: Configure Build System

**Files**:
- `packages/core/package.json` (update scripts)
- `packages/core/.gitignore`

**Actions**:

1. **Update `package.json` scripts**:
   ```json
   {
     "scripts": {
       "build": "bun run build:tsc && bun run build:bundle",
       "build:tsc": "bunx tsc --project tsconfig.json",
       "build:bundle": "bun build src/index.ts --outdir dist --target node --format esm --minify",
       "test": "bun test tests/*.test.ts",
       "typecheck": "bunx tsc --noEmit",
       "clean": "rm -rf dist",
       "prepublishOnly": "bun run clean && bun run build && bun run test"
     }
   }
   ```

2. **Add `files` field** to `package.json`:
   ```json
   "files": [
     "dist",
     "src",
     "README.md",
     "CHANGELOG.md",
     "LICENSE"
   ]
   ```

3. **Create `.gitignore`**:
   ```
   node_modules/
   dist/
   *.log
   .DS_Store
   ```

4. **Add exports map** to `package.json`:
   ```json
   "exports": {
     ".": {
       "import": "./dist/index.js",
       "types": "./dist/index.d.ts"
     },
     "./parsers": {
       "import": "./dist/parsers/index.js",
       "types": "./dist/parsers/index.d.ts"
     },
     "./analysis": {
       "import": "./dist/analysis/index.js",
       "types": "./dist/analysis/index.d.ts"
     },
     "./storage": {
       "import": "./dist/storage/index.js",
       "types": "./dist/storage/index.d.ts"
     }
   }
   ```

**Validation**:
```bash
cd packages/core && bun install
cd packages/core && bun run build
ls packages/core/dist/
cd packages/core && bun run typecheck
```

---

### Step 10: Update Main App to Use Package (Optional Post-Extraction)

**Note**: This step can be done in a follow-up PR after package is published.

**Files** (in `app/`):
- `app/package.json`
- `app/src/indexer/*.ts` (update imports)

**Actions**:

1. **Add dependency** to `app/package.json`:
   ```json
   "dependencies": {
     "@kotadb/core": "workspace:*"
   }
   ```

2. **Update imports** in indexer modules:
   - Change local imports to package imports
   - Example: `import { parseFile } from './ast-parser'` → `import { parseFile } from '@kotadb/core/parsers'`

3. **Keep KotaDB-specific wrappers**:
   - Sentry instrumentation
   - Structured logging
   - Database integration
   - API endpoints

4. **Run tests** to verify integration:
   ```bash
   cd app && bun test
   ```

**Validation**:
```bash
cd app && bun install
cd app && bun test tests/indexer/*.test.ts
cd app && bun run typecheck
```

---

## File Manifest

### New Files (packages/core/)

**Configuration**:
- `package.json` - Package metadata, dependencies, scripts
- `tsconfig.json` - TypeScript compiler configuration
- `README.md` - Comprehensive documentation
- `CHANGELOG.md` - Version history
- `.gitignore` - Git ignore rules

**Source Code** (src/):
- `src/index.ts` - Main entry point (barrel export)
- `src/types/ast.ts` - AST type definitions
- `src/types/symbol.ts` - Symbol interfaces
- `src/types/reference.ts` - Reference interfaces
- `src/types/dependency.ts` - Dependency graph types
- `src/types/storage.ts` - Storage adapter interface
- `src/types/index.ts` - Types barrel export
- `src/parsers/ast-parser.ts` - AST parsing wrapper (146 lines)
- `src/parsers/index.ts` - Parsers barrel export
- `src/analysis/symbol-extractor.ts` - Symbol extraction (660 lines)
- `src/analysis/reference-extractor.ts` - Reference extraction (488 lines)
- `src/analysis/dependency-extractor.ts` - Dependency analysis (352 lines)
- `src/analysis/import-resolver.ts` - Import path resolution (167 lines)
- `src/analysis/circular-detector.ts` - Cycle detection (262 lines)
- `src/analysis/index.ts` - Analysis barrel export
- `src/storage/memory-adapter.ts` - In-memory storage implementation
- `src/storage/sqlite-adapter.ts` - SQLite storage implementation
- `src/storage/index.ts` - Storage barrel export

**Tests** (tests/):
- `tests/ast-parser.test.ts` - Parser tests
- `tests/symbol-extractor.test.ts` - Symbol extraction tests
- `tests/reference-extractor.test.ts` - Reference extraction tests
- `tests/import-resolver.test.ts` - Import resolution tests
- `tests/circular-detector.test.ts` - Cycle detection tests
- `tests/setup.ts` - Test configuration (if needed)
- `tests/fixtures/parsing/simple/` - Simple test fixtures (5 files)
- `tests/fixtures/parsing/complex/` - Complex test fixtures (10 files)
- `tests/fixtures/parsing/README.md` - Fixtures documentation

**Build Output** (dist/, generated):
- `dist/index.js` - Bundled JavaScript
- `dist/index.d.ts` - Type declarations
- `dist/**/*.js` - Module outputs
- `dist/**/*.d.ts` - Module type declarations

---

## Validation Checklist

### Build & Type Checking
- [ ] `cd packages/core && bun install` - Install dependencies successfully
- [ ] `cd packages/core && bun run typecheck` - No TypeScript errors
- [ ] `cd packages/core && bun run build` - Build completes successfully
- [ ] `ls packages/core/dist/` - Output directory contains all files
- [ ] `bunx tsc --noEmit --project packages/core/tsconfig.json` - Type declarations valid

### Code Quality
- [ ] `grep -r "Sentry" packages/core/src/` - Returns nothing (no Sentry imports)
- [ ] `grep -r "createLogger" packages/core/src/` - Returns nothing (no logger imports)
- [ ] `grep -r "console\\.log" packages/core/src/` - Returns nothing (use process.stdout.write)
- [ ] `grep -r "@indexer" packages/core/src/` - Returns nothing (no KotaDB path aliases)
- [ ] `grep -r "@shared" packages/core/src/` - Returns nothing (no KotaDB dependencies)

### Testing
- [ ] `cd packages/core && bun test` - All tests pass (5 test suites)
- [ ] `cd packages/core && bun test tests/ast-parser.test.ts` - Parser tests pass
- [ ] `cd packages/core && bun test tests/symbol-extractor.test.ts` - Symbol tests pass
- [ ] `cd packages/core && bun test tests/reference-extractor.test.ts` - Reference tests pass
- [ ] `cd packages/core && bun test tests/import-resolver.test.ts` - Resolver tests pass
- [ ] `cd packages/core && bun test tests/circular-detector.test.ts` - Detector tests pass

### Functionality Verification
- [ ] Create simple test script to verify parsing works:
  ```typescript
  // test-package.ts
  import { parseFile, extractSymbols } from './packages/core/src/index.js';
  
  const content = 'export function hello() { return "world"; }';
  const ast = parseFile('test.ts', content);
  
  if (!ast) {
    process.stderr.write('Parse failed\n');
    process.exit(1);
  }
  
  const symbols = extractSymbols(ast, 'test.ts');
  process.stdout.write(`Found ${symbols.length} symbols\n`);
  
  if (symbols.length !== 1 || symbols[0].name !== 'hello') {
    process.stderr.write('Symbol extraction failed\n');
    process.exit(1);
  }
  
  process.stdout.write('Package works correctly!\n');
  ```
- [ ] `bun test-package.ts` - Outputs "Package works correctly!"

### Documentation
- [ ] `cat packages/core/README.md` - Complete with all sections
- [ ] README includes installation instructions
- [ ] README includes API documentation
- [ ] README includes usage examples
- [ ] `cat packages/core/CHANGELOG.md` - Contains v0.1.0 entry

### Integration (Post-Extraction, Optional)
- [ ] `cd app && bun install` - Main app installs with workspace package
- [ ] `cd app && bun test tests/indexer/*.test.ts` - Existing tests still pass
- [ ] `cd app && bun run typecheck` - No type errors in main app

---

## KotaDB Conventions

### ✅ Followed in This Spec

1. **Logging Standards**:
   - Package uses `process.stdout.write()` / `process.stderr.write()` (NO `console.*`)
   - Main app keeps structured logging via `createLogger()`
   - Removed all `logger.error()`, `logger.warn()`, etc. from extracted code

2. **Anti-Mocking**:
   - Tests use real AST parsing (no mocks)
   - Storage adapters provide real in-memory/SQLite implementations
   - Fixtures use actual TypeScript files

3. **TypeScript Standards**:
   - Strict mode enabled
   - Full type coverage
   - `.d.ts` generation for consumers
   - ESM modules with `.js` extensions in imports

4. **Path Structure**:
   - NO path aliases in package (standard npm structure)
   - Main app continues using `@api/*`, `@db/*`, etc.
   - Package uses relative imports (`./`, `../`)

5. **Testing**:
   - Real Bun test runner
   - No Supabase dependencies in package tests
   - Comprehensive test coverage (5 test suites)

### ⚠️ Deferred to Follow-Up

1. **Migration Sync**: N/A (no database migrations in package)
2. **Branching Flow**: Standard PR workflow applies
3. **Main App Integration**: Optional Step 10 can be separate PR after package stabilizes

---

## Success Criteria

### Package is Successfully Extracted When:

1. **Independence**: Package builds and tests without any KotaDB dependencies
2. **Zero Coupling**: No Sentry, no logger, no `@indexer/*` imports
3. **Complete Functionality**: All 6 modules work identically to originals
4. **Test Coverage**: All 5 test suites pass with same assertions
5. **Documentation**: README provides clear usage examples
6. **Type Safety**: Full TypeScript type definitions generated
7. **Build System**: `bun run build` produces valid output

### Additional Goals:

- Clean public API via barrel exports
- Storage abstraction enables flexible backends
- Package can be imported and used in external projects
- Foundation for future standalone CLI tools

---

## Risks & Mitigations

### Risk 1: Breaking Changes to Main App

**Mitigation**: Keep Step 10 (main app integration) as optional follow-up PR. Package extraction is isolated and doesn't affect existing app functionality.

### Risk 2: Test Failures After Migration

**Mitigation**: Copy tests verbatim with only import path updates. Run tests incrementally after each module extraction.

### Risk 3: Missing Dependencies

**Mitigation**: Explicitly list all dependencies in package.json. Only @typescript-eslint packages should be needed.

### Risk 4: Type Definition Issues

**Mitigation**: Run `bunx tsc --noEmit` after each module extraction. Fix type errors incrementally.

### Risk 5: Storage Abstraction Incomplete

**Mitigation**: Start with simple MemoryStorageAdapter. SqliteStorageAdapter can be enhanced in follow-up if needed.

---

## Related Issues

- #525 - Parent issue for @kotadb/core extraction
- Future: #XXX - Integrate main app with @kotadb/core package
- Future: #XXX - Create CLI tool using @kotadb/core
- Future: #XXX - Publish @kotadb/core to npm registry

---

## Notes

- Package version starts at 0.1.0 (pre-release)
- Not published to npm initially (workspace:* in main app)
- Future: Can publish when stable and document as standalone library
- Consider adding more storage adapters (Postgres, etc.) in future releases
