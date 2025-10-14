# Feature Plan: AST-Based Symbol Extraction

**Issue:** #74
**Title:** feat: implement symbol extraction from AST (functions, classes, types)
**Epic:** #70 (AST-based code parsing)
**Depends on:** #73 (AST parser), #72 (Test fixtures)
**Blocks:** Reference extraction, MCP `find_references` tool, REST API symbol endpoints

## Overview

### Problem
The AST parser (#73) is implemented and test fixtures (#72) are available, but extracted symbols (functions, classes, interfaces, types) are not being populated in the database. This prevents downstream features like "find references" and "get dependencies" from functioning.

### Desired Outcome
- Extract all symbol types from parsed AST (functions, classes, interfaces, types, variables, exports)
- Store symbols in Supabase `symbols` table with precise position information
- Capture JSDoc/TSDoc comments as docstrings
- Mark symbols as exported/internal
- Achieve 95%+ extraction accuracy on test fixtures
- Enable downstream reference tracking and code intelligence features

### Non-goals
- Reference extraction (separate issue after this)
- Symbol search API endpoints (separate issue)
- Symbol rename/refactoring operations
- Cross-repository symbol resolution
- Semantic analysis beyond basic AST traversal

## Technical Approach

### Architecture
The implementation follows a visitor pattern for AST traversal, extracting symbols from each node type and storing them in the database with RLS enforcement. The extractor integrates into the existing indexing workflow (`runIndexingWorkflow` in `queries.ts`).

**Key Design Decisions:**
1. **Visitor Pattern**: Use a clean visitor pattern with dedicated handlers for each AST node type (FunctionDeclaration, ClassDeclaration, etc.)
2. **Comment Extraction**: Leverage `ast.comments` array to map JSDoc blocks to symbols based on position
3. **Export Detection**: Track export context via AST parent node analysis
4. **Position Tracking**: Use `loc.start` and `loc.end` for line/column precision
5. **Batch Insert**: Collect all symbols during traversal, then bulk insert for performance

### Key Modules to Touch
- **app/src/indexer/symbol-extractor.ts** (new): Core extraction logic
- **app/src/api/queries.ts** (modify): Add `storeSymbols()` helper
- **app/src/indexer/extractors.ts** (modify): Integrate symbol extraction into indexing workflow
- **app/tests/indexer/symbol-extractor.test.ts** (new): Unit tests for symbol extraction
- **app/tests/integration/indexing-symbols.test.ts** (new): Integration tests with real Supabase

### Data/API Impacts
**Database Schema (already exists):**
- Table: `symbols`
- Columns: `id`, `file_id`, `name`, `kind`, `line_start`, `line_end`, `signature`, `documentation`, `metadata`, `created_at`
- `kind` values: `function`, `class`, `interface`, `type`, `variable`, `constant`, `method`, `property`
- No migration needed (schema already exists in `001_initial_schema.sql`)

**Metadata JSONB fields:**
- `column_start`: start column offset
- `column_end`: end column offset
- `is_exported`: boolean flag for exported symbols
- `is_async`: boolean flag for async functions
- `access_modifier`: string for TypeScript access (public/private/protected)

**Integration Points:**
- `runIndexingWorkflow()` will call `extractSymbols()` after parsing each file
- `storeSymbols()` will batch insert symbols with file_id foreign key
- RLS policies enforce user/org isolation (already configured)

## Relevant Files

### Existing Files
- **app/src/indexer/ast-parser.ts** — AST parsing wrapper, provides `parseFile()` function
- **app/src/indexer/ast-types.ts** — Type definitions for AST operations
- **app/src/indexer/extractors.ts** — Dependency extraction (will add symbol extraction integration)
- **app/src/api/queries.ts** — Database query functions (will add `storeSymbols()`)
- **app/src/db/migrations/001_initial_schema.sql** — Database schema with `symbols` table (lines 109-158)
- **app/tests/fixtures/parsing/simple/calculator.ts** — Test fixture with class and methods
- **app/tests/fixtures/parsing/simple/types.ts** — Test fixture with interfaces and types
- **app/tests/fixtures/parsing/simple/utils.ts** — Test fixture with functions
- **app/tests/fixtures/parsing/complex/src/** — Complex test fixtures for integration testing
- **app/tests/helpers/db.ts** — Database test helpers

### New Files
- **app/src/indexer/symbol-extractor.ts** — Core symbol extraction logic
- **app/tests/indexer/symbol-extractor.test.ts** — Unit tests for symbol extraction
- **app/tests/integration/indexing-symbols.test.ts** — Integration tests with Supabase

## Task Breakdown

### Phase 1: Core Symbol Extraction Infrastructure
1. Create `app/src/indexer/symbol-extractor.ts` with type definitions
2. Implement AST visitor utility (`visitNode()` function with node type dispatch)
3. Implement comment extraction helper (`extractLeadingComment()`)
4. Implement export detection helper (`isExportedNode()`)
5. Implement signature builder helper (`buildFunctionSignature()`)

### Phase 2: Symbol Type Extractors
6. Implement function declaration extractor (regular functions)
7. Implement function expression extractor (arrow functions, function expressions)
8. Implement class declaration extractor (class + methods as separate symbols)
9. Implement interface declaration extractor (TypeScript)
10. Implement type alias extractor (TypeScript)
11. Implement variable declaration extractor (const, let, var)
12. Implement enum declaration extractor (TypeScript)

### Phase 3: Database Integration and Testing
13. Add `storeSymbols()` function to `app/src/api/queries.ts`
14. Integrate symbol extraction into `runIndexingWorkflow()` in `queries.ts`
15. Write unit tests for each symbol type extractor
16. Write integration tests with real Supabase (fixture indexing)
17. Validate extraction accuracy on test fixtures (95%+ target)

## Step by Step Tasks

### Core Infrastructure Setup
1. Create `app/src/indexer/symbol-extractor.ts` with initial structure and type definitions
2. Implement `Symbol` interface and `SymbolKind` type
3. Implement `visitNode()` function for recursive AST traversal with type-based dispatch
4. Implement `extractLeadingComment()` to find JSDoc/TSDoc comments preceding nodes
5. Implement `isExportedNode()` to detect export statements and re-exports
6. Implement `buildFunctionSignature()` to extract parameter names and return types
7. Implement main `extractSymbols()` function that coordinates extraction

### Function and Class Extraction
8. Add `extractFunctionDeclaration()` handler for regular function declarations
9. Add `extractFunctionExpression()` handler for arrow functions and function expressions assigned to variables
10. Add `extractClassDeclaration()` handler for classes (class itself + each method as separate symbol)
11. Add `extractMethodDefinition()` handler for class methods with access modifiers
12. Add `extractPropertyDefinition()` handler for class properties

### TypeScript-Specific Extraction
13. Add `extractInterfaceDeclaration()` handler for TypeScript interfaces
14. Add `extractTypeAliasDeclaration()` handler for type aliases
15. Add `extractEnumDeclaration()` handler for TypeScript enums
16. Add `extractVariableDeclaration()` handler for const/let/var (filter for top-level and exported only)

### Edge Case Handling
17. Handle anonymous functions (use `<anonymous>` as name)
18. Handle default exports (extract name from `export default`)
19. Handle re-exports (`export { foo } from './bar'` - mark as exported but don't duplicate symbol)
20. Handle async functions (add `is_async` to metadata)
21. Handle generator functions (add `is_generator` to metadata)

### Database Integration
22. Create `storeSymbols()` function in `app/src/api/queries.ts`:
    - Accept array of symbols and file_id
    - Map symbols to database schema format
    - Use batch insert (upsert with conflict resolution on file_id + name + line_start)
    - Return count of stored symbols
23. Modify `runIndexingWorkflow()` in `app/src/api/queries.ts`:
    - After parsing each file with AST, call `extractSymbols()`
    - Pass extracted symbols to `storeSymbols()` with file_id
    - Update index job stats with symbol count
24. Update `updateIndexRunStatus()` to track symbol counts in stats JSONB field

### Unit Testing
25. Create `app/tests/indexer/symbol-extractor.test.ts` with fixture imports
26. Test suite: extract functions with JSDoc
    - Parse calculator.ts fixture
    - Verify function symbols extracted (add, subtract, multiply, divide)
    - Verify JSDoc comments captured in documentation field
    - Verify signatures include parameter names and return types
27. Test suite: extract classes with methods
    - Parse calculator.ts fixture
    - Verify class symbol extracted (Calculator)
    - Verify method symbols extracted as separate symbols (kind: "method")
    - Verify access modifiers captured (private history field)
28. Test suite: extract interfaces and types
    - Parse types.ts fixture
    - Verify interface declarations extracted
    - Verify type alias declarations extracted
    - Verify exported vs internal symbols marked correctly
29. Test suite: extract variables and constants
    - Parse utils.ts fixture
    - Verify exported const declarations extracted
    - Verify internal variables not extracted (only top-level exported)
30. Test suite: handle edge cases
    - Anonymous functions (arrow functions without assignment)
    - Default exports
    - Re-exports (should mark as exported but not duplicate)
    - Async functions (verify is_async in metadata)

### Integration Testing
31. Create `app/tests/integration/indexing-symbols.test.ts` with Supabase client
32. Test suite: index fixture and verify symbols in database
    - Create test user and API key
    - Index calculator.ts fixture via `runIndexingWorkflow()`
    - Query symbols table for file_id
    - Verify symbol count matches expected (9 symbols: 1 class + 6 methods + 1 function + 1 property)
    - Verify symbol names, kinds, positions
    - Verify JSDoc comments stored in documentation field
33. Test suite: verify RLS isolation
    - Create two test users
    - Index same fixture for both users
    - Verify each user can only see their own symbols
34. Test suite: verify symbol upsert behavior
    - Index same file twice
    - Verify symbols are updated (not duplicated)
    - Verify upsert resolves on (file_id, name, line_start)

### Validation and Finalization
35. Run full test suite: `cd app && bun test`
36. Run integration tests: `cd app && bun test --filter integration`
37. Run type-checking: `cd app && bunx tsc --noEmit`
38. Run linter: `cd app && bun run lint`
39. Validate extraction accuracy on all test fixtures (target: 95%+ symbol extraction)
40. Verify database constraints respected (no duplicate symbols per file)
41. Stage all changes: `git add -A`
42. Commit with conventional format: `git commit -m "feat: implement symbol extraction from AST"`
43. Push branch to remote: `git push -u origin feature-74-11c3e104`
44. Create pull request using slash command: `/pull_request feature-74-11c3e104 {"number": 74, "title": "feat: implement symbol extraction from AST (functions, classes, types)", "summary": "Extract symbols from AST and populate symbols table"} docs/specs/feature-74-symbol-extraction-ast.md feature-74-11c3e104`

## Risks & Mitigations

### Risk: Comment-to-Symbol Association Ambiguity
**Description:** JSDoc comments may not always be immediately preceding the symbol (blank lines, other comments)
**Mitigation:**
- Use position-based heuristic: find the last block comment before the symbol within 5 lines
- Handle both `/** */` (JSDoc) and `/* */` (regular block comments)
- Test with real-world fixtures that have varied comment styles

### Risk: Export Detection Edge Cases
**Description:** Complex export patterns (re-exports, export * from) may be missed
**Mitigation:**
- Focus on direct exports first (`export function`, `export class`, `export const`)
- Handle named exports (`export { foo }`)
- Handle default exports (`export default`)
- Document known limitations (re-exports from external modules)
- Add follow-up issue for advanced export resolution if needed

### Risk: Performance with Large Files
**Description:** Full AST traversal may be slow for files with thousands of symbols
**Mitigation:**
- Batch insert symbols (single transaction per file)
- Profile with large fixtures (e.g., 1000+ symbol file)
- Consider streaming insert if batch size exceeds 500 symbols
- Add timeout handling in integration tests

### Risk: Symbol Uniqueness Constraint Violations
**Description:** Multiple symbols with same name and line_start (overloaded functions, method overloads)
**Mitigation:**
- Use `(file_id, name, line_start)` as uniqueness key (handles overloads on different lines)
- For TypeScript overloads (same line), merge signatures into single symbol
- Add `overload_index` to metadata if needed for disambiguation
- Test with overloaded function fixtures

## Validation Strategy

### Automated Tests
**Unit Tests (app/tests/indexer/symbol-extractor.test.ts):**
- Extract functions with JSDoc comments (verify docstring field)
- Extract classes with methods (verify separate method symbols)
- Extract interfaces and type aliases (TypeScript)
- Extract exported vs internal symbols (verify is_exported metadata)
- Handle edge cases (anonymous functions, default exports, async functions)
- Verify position accuracy (line_start, line_end, column_start, column_end)

**Integration Tests (app/tests/integration/indexing-symbols.test.ts):**
- Index test fixture and verify symbols in Supabase
- Verify RLS isolation between users
- Verify upsert behavior (no duplicate symbols)
- Verify foreign key relationships (file_id references indexed_files)
- Test with all fixture types (simple and complex)

### Manual Validation
**Fixture Symbol Count Verification:**
- `simple/calculator.ts`: 9 symbols (1 class + 6 methods + 1 property + 1 function)
- `simple/utils.ts`: 3-5 symbols (exported functions only)
- `simple/types.ts`: 4-6 symbols (interfaces and types)
- `simple/index.ts`: 0 symbols (only re-exports)
- `complex/src/api/handlers.ts`: 10+ symbols (functions and interfaces)

**Database Query Validation:**
```sql
-- Verify symbol counts per file
SELECT f.path, COUNT(s.id) as symbol_count
FROM indexed_files f
LEFT JOIN symbols s ON s.file_id = f.id
GROUP BY f.path;

-- Verify symbol kind distribution
SELECT kind, COUNT(*) FROM symbols GROUP BY kind;

-- Verify exported symbols
SELECT name, kind, metadata->>'is_exported'
FROM symbols
WHERE metadata->>'is_exported' = 'true';
```

### Release Guardrails
**Pre-merge Checklist:**
- All unit tests passing (95%+ extraction accuracy)
- All integration tests passing with real Supabase
- Type-checking clean (`bunx tsc --noEmit`)
- Linting clean (`bun run lint`)
- Migration sync validated (`bun run test:validate-migrations`)
- Hardcoded env vars validated (`bun run test:validate-env`)

**Post-merge Monitoring:**
- Track symbol extraction success rate in index jobs (stats.symbols_extracted field)
- Monitor indexing job failure rate (should remain stable)
- Monitor database query performance on symbols table (no slow queries)
- Track RLS policy performance (no user data leaks)

## Validation Commands

Execute in order after implementation:

```bash
# Type-checking
cd app && bunx tsc --noEmit

# Linting
cd app && bun run lint

# Unit tests (symbol extraction logic)
cd app && bun test indexer/symbol-extractor.test.ts

# Integration tests (database + RLS)
cd app && bun test --filter integration

# Full test suite
cd app && bun test

# Migration sync validation
cd app && bun run test:validate-migrations

# Environment variable validation
cd app && bun run test:validate-env

# Build verification
cd app && bun run build
```

## Implementation Notes

### Symbol Extractor Structure
```typescript
// app/src/indexer/symbol-extractor.ts

export interface Symbol {
  name: string;
  kind: SymbolKind;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
  signature: string | null;
  documentation: string | null;
  isExported: boolean;
  isAsync?: boolean;
  accessModifier?: "public" | "private" | "protected";
}

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "constant"
  | "method"
  | "property";

// Main extraction function
export function extractSymbols(
  ast: TSESTree.Program,
  filePath: string
): Symbol[]

// Helper functions
function visitNode(node: TSESTree.Node, symbols: Symbol[], context: VisitorContext): void
function extractLeadingComment(node: TSESTree.Node, comments: TSESTree.Comment[]): string | null
function isExportedNode(node: TSESTree.Node, parent: TSESTree.Node | null): boolean
function buildFunctionSignature(node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression): string
```

### Database Query Structure
```typescript
// app/src/api/queries.ts

export async function storeSymbols(
  client: SupabaseClient,
  symbols: Symbol[],
  fileId: string
): Promise<number> {
  if (symbols.length === 0) return 0;

  const records = symbols.map(symbol => ({
    file_id: fileId,
    name: symbol.name,
    kind: symbol.kind,
    line_start: symbol.lineStart,
    line_end: symbol.lineEnd,
    signature: symbol.signature,
    documentation: symbol.documentation,
    metadata: {
      column_start: symbol.columnStart,
      column_end: symbol.columnEnd,
      is_exported: symbol.isExported,
      is_async: symbol.isAsync,
      access_modifier: symbol.accessModifier,
    },
  }));

  const { error, count } = await client
    .from("symbols")
    .upsert(records, {
      onConflict: "file_id,name,line_start",
    });

  if (error) throw new Error(`Failed to store symbols: ${error.message}`);
  return count ?? symbols.length;
}
```

### Integration into Indexing Workflow
```typescript
// Modify runIndexingWorkflow() in app/src/api/queries.ts

import { parseFile, isSupportedForAST } from "@indexer/ast-parser";
import { extractSymbols } from "@indexer/symbol-extractor";

// After saveIndexedFiles()
const symbolStats = await Promise.all(
  records.map(async (file) => {
    if (!isSupportedForAST(file.path)) return 0;

    const ast = parseFile(file.path, file.content);
    if (!ast) return 0;

    const symbols = extractSymbols(ast, file.path);
    const fileRecord = await client
      .from("indexed_files")
      .select("id")
      .eq("repository_id", repositoryId)
      .eq("path", file.path)
      .single();

    if (fileRecord.data) {
      return await storeSymbols(client, symbols, fileRecord.data.id);
    }
    return 0;
  })
);

const totalSymbols = symbolStats.reduce((sum, count) => sum + count, 0);

await updateIndexRunStatus(client, runId, "completed", undefined, {
  files_indexed: records.length,
  symbols_extracted: totalSymbols,
});
```

## Success Metrics

**Quantitative:**
- 95%+ symbol extraction accuracy on test fixtures
- All 133+ tests passing (existing + new symbol tests)
- Zero RLS policy violations in integration tests
- Symbol extraction adds <500ms per file to indexing time
- Zero database constraint violations during batch insert

**Qualitative:**
- Extracted symbols match manual inspection of fixtures
- JSDoc comments correctly associated with symbols
- Export flags accurately reflect source code
- Position information aligns with editor line numbers
- Code is maintainable and well-documented for future extensions
