# Feature Plan: Reference Extraction from AST

**Issue**: #75
**Title**: feat: implement reference extraction from AST (imports, calls, type refs)
**Labels**: component:backend, component:database, priority:high, effort:medium, status:needs-investigation

## Overview

### Problem
KotaDB can extract symbols (functions, classes, types) from code files but cannot yet track where those symbols are used. Without reference tracking, we cannot answer "what will break if I change X?" queries, which is core to KotaDB's value proposition for AI developer workflows.

### Desired Outcome
- Extract all reference types (imports, function calls, method calls, property access, type references) from AST with precise location information
- Store references in the `references` table with caller location (file, line, column) and reference type
- Enable "find usages" queries by linking references to symbols via name resolution
- Support import alias handling (e.g., `import { foo as bar }`)
- Maintain visitor pattern consistency with symbol extractor for code clarity

### Non-Goals
- Symbol resolution across files (deferred to next issue - will require import path resolution)
- Cross-file type inference (TypeScript language server features)
- Call graph construction (depends on symbol resolution)
- Reference deduplication (handled by database unique constraints)

## Technical Approach

### Architecture Notes
Reference extraction follows the same visitor pattern used in `symbol-extractor.ts` (#74) for consistency and maintainability. The extractor traverses the AST and identifies nodes representing symbol usage (imports, calls, property access, type references).

**Key Design Decisions**:
1. **Visitor Pattern**: Reuse pattern from symbol extraction for consistency
2. **Name-Based Resolution**: Store symbol names initially; resolve to `symbol_id` in post-processing step (next issue)
3. **Import Source Tracking**: Store import source paths for later resolution to target symbols
4. **Batch Insertion**: Group references by file for efficient database writes
5. **Upsert Strategy**: Use `(source_file_id, line_number, reference_type)` as conflict key for re-indexing

### Key Modules to Touch
- `app/src/indexer/reference-extractor.ts` (new): Core extraction logic using visitor pattern
- `app/src/api/queries.ts`: Add `storeReferences()` helper similar to `storeSymbols()`
- `app/src/indexer/ast-parser.ts`: No changes needed (already provides AST with comments)

### Data/API Impacts
**Database Schema**: The `references` table exists with columns matching our needs:
- `source_file_id` (uuid): File where reference occurs
- `target_symbol_id` (uuid, nullable): Symbol being referenced (null until resolution)
- `target_file_path` (text, nullable): Fallback if symbol not extracted
- `line_number` (integer): Reference location
- `reference_type` (text): Type of reference (import/call/property_access/type_reference)
- `metadata` (jsonb): Additional data (column number, import source, alias info)

**API Changes**: None. Reference extraction integrates into existing indexing workflow.

## Issue Relationships

- **Depends On**: #74 (Symbol extraction) - Provides AST infrastructure and visitor pattern
- **Depends On**: #73 (AST parser) - Provides TypeScript ESLint parser integration
- **Depends On**: #72 (Test fixtures) - Provides test infrastructure and fixture files
- **Related To**: #70 (AST parsing epic) - Part of Phase 2: Symbol and reference extraction
- **Blocks**: #116 (Dependency search) - Requires reference data for "find usages" queries
- **Blocks**: Symbol resolution (next issue) - Needs reference extraction complete first

## Relevant Files

**Existing Infrastructure**:
- `app/src/indexer/symbol-extractor.ts` - Reference pattern for visitor implementation
- `app/src/indexer/ast-parser.ts` - AST parsing (already provides parsed trees)
- `app/src/api/queries.ts` - Database query helpers (`storeSymbols` pattern to follow)
- `docs/schema.md` - References table schema documentation (lines 267-290)
- `app/tests/fixtures/parsing/simple/index.ts` - Test fixture with diverse reference types

**Test Infrastructure**:
- `app/tests/indexer/symbol-extractor.test.ts` - Test pattern reference
- `app/tests/helpers/db.ts` - Database helpers for test setup/teardown

### New Files
- `app/src/indexer/reference-extractor.ts` - Reference extraction visitor and types
- `app/tests/indexer/reference-extractor.test.ts` - Unit tests for extraction logic
- `app/tests/integration/reference-storage.test.ts` - Integration test for database storage

## Task Breakdown

### Phase 1: Core Extraction Infrastructure (Day 1)
- Create `reference-extractor.ts` with visitor scaffold
- Define `Reference` interface matching database schema
- Implement import extraction (named, default, namespace, aliased)
- Add JSDoc documentation for all public functions
- Write unit tests for import extraction (10+ test cases)

### Phase 2: Call and Property References (Day 2)
- Implement function call extraction (identifier calls)
- Implement method call extraction (member expression calls)
- Implement property access extraction
- Handle edge cases: optional chaining (`foo?.bar`), computed properties (`obj[key]`)
- Write unit tests for call/property extraction (15+ test cases)

### Phase 3: Type References and Integration (Day 3)
- Implement TypeScript type reference extraction (`TSTypeReference` nodes)
- Add `storeReferences()` helper to `queries.ts` with upsert logic
- Write integration test: index fixture, verify references in database
- Test alias handling (import aliases, re-exports)
- Validate reference counts match expected fixtures
- Run full test suite and type-check

## Step by Step Tasks

### Setup and Scaffolding
1. Create `app/src/indexer/reference-extractor.ts` with file header and imports
2. Define `Reference` interface with all required fields (match schema)
3. Define `ReferenceType` type (`'import' | 'call' | 'property_access' | 'type_reference'`)
4. Define `VisitorContext` interface (similar to symbol extractor)
5. Create `extractReferences(ast, filePath)` entry point function

### Import Extraction
6. Implement `visitNode()` dispatcher with switch statement for node types
7. Implement `extractImportDeclaration()` for `ImportDeclaration` nodes
8. Handle named imports (`import { foo, bar } from './module'`)
9. Handle default imports (`import foo from './module'`)
10. Handle namespace imports (`import * as foo from './module'`)
11. Handle side-effect imports (`import './module'`)
12. Handle aliased imports (`import { foo as bar } from './module'`)
13. Store import source path in `metadata.importSource` for resolution

### Call and Property Extraction
14. Implement `extractCallExpression()` for `CallExpression` nodes
15. Handle identifier calls (`foo()`) - extract callee name
16. Handle member expression calls (`obj.method()`) - extract property name
17. Implement `extractMemberExpression()` for `MemberExpression` nodes (property access)
18. Handle optional chaining (`foo?.bar?.baz`)
19. Skip computed properties (`obj[key]`) - cannot resolve statically

### Type Reference Extraction
20. Implement `extractTypeReference()` for `TSTypeReference` nodes
21. Extract type name from `typeName` identifier
22. Handle generic type references (`Foo<T>`)
23. Handle qualified type names (`namespace.Type`)
24. Handle `typeof` type queries (`typeof foo`)

### Database Integration
25. Add `storeReferences()` function to `app/src/api/queries.ts`
26. Map `Reference` interface to database columns (snake_case conversion)
27. Implement upsert with conflict key `(source_file_id, line_number, reference_type)`
28. Add error handling with descriptive messages
29. Return count of stored references

### Unit Tests
30. Create `app/tests/indexer/reference-extractor.test.ts`
31. Test named imports extraction (verify count and metadata)
32. Test default imports extraction
33. Test namespace imports extraction
34. Test aliased imports (verify alias stored in metadata)
35. Test side-effect imports (no specifiers)
36. Test function call extraction (identifier and member expressions)
37. Test method chaining (`obj.foo().bar()`)
38. Test optional chaining (`obj?.prop?.method()`)
39. Test property access extraction
40. Test TypeScript type references (`Foo<T>`, `typeof Bar`)
41. Test anonymous functions (should extract but with `<anonymous>` name)
42. Test edge cases: empty file, file with no references

### Integration Tests
43. Create `app/tests/integration/reference-storage.test.ts`
44. Set up test database with authenticated user and repository
45. Create test file with known references (use fixture)
46. Parse file and extract references
47. Store references via `storeReferences()` helper
48. Query database and verify reference count matches expected
49. Verify reference types are correct (import vs call vs type_reference)
50. Verify caller locations (line/column) match source
51. Test re-indexing (upsert should update existing references)
52. Clean up test data in teardown

### Validation and Documentation
53. Run `bun test` - all tests must pass
54. Run `bun run lint` - fix any linting errors
55. Run `bunx tsc --noEmit` - fix any type errors
56. Validate reference extraction on test fixtures (simple and complex)
57. Verify extraction matches manual count for `app/tests/fixtures/parsing/simple/index.ts`
58. Document extraction patterns in `reference-extractor.ts` JSDoc
59. Update `docs/schema.md` with reference type enum if needed
60. Push branch with `git push -u origin feat/75-reference-extraction`

## Risks & Mitigations

**Risk**: Complex expressions (computed properties, spread syntax) cannot be resolved statically
**Mitigation**: Skip unresolvable references; focus on 95% case (identifier-based references). Document limitations in JSDoc.

**Risk**: Import path resolution requires module resolution logic (complex)
**Mitigation**: Defer to next issue. Store import source paths in metadata for now; resolve in post-processing step.

**Risk**: Re-exports create indirect references that are hard to track
**Mitigation**: Track direct references only. Re-export analysis deferred to symbol resolution phase.

**Risk**: Database performance with large reference counts (100k+ references per repo)
**Mitigation**: Use batch inserts with upsert. Add database index on `source_file_id` (already exists per schema).

**Risk**: TypeScript-specific features may not work for JavaScript files
**Mitigation**: Parser already handles JS + TS. Type references will naturally be absent in JS files (expected behavior).

## Validation Strategy

### Automated Tests
- **Unit tests** (target: 95%+ coverage for `reference-extractor.ts`):
  - Extract all import forms (named, default, namespace, aliased, side-effect)
  - Extract function calls (identifier calls, method calls, chained calls)
  - Extract property access (member expressions, optional chaining)
  - Extract type references (TypeScript only)
  - Handle edge cases (empty files, no references, anonymous functions)
- **Integration tests** (real Supabase database per anti-mock philosophy):
  - Store references via `storeReferences()` helper
  - Verify reference count matches expected for test fixtures
  - Verify reference types are correctly classified
  - Verify caller locations (line/column) match source code
  - Test re-indexing behavior (upsert updates existing references)

### Manual Checks
- Extract references from `app/tests/fixtures/parsing/simple/index.ts` and manually verify:
  - 5 named imports from `./calculator` (line 6)
  - 4 type imports from `./types` (line 7)
  - 5 named imports from `./utils` (line 8)
  - Function calls: `createCalculator()`, `calc.add()`, `doubleNumber()`, `formatUserName()`, `isValidEmail()`
  - Property access: `user.id`, `user.name`, `user.email`
  - Type references: `User`, `Result<string>`
- Compare extracted counts with manual counts (must match exactly)

### Release Guardrails
- All existing tests must continue to pass (no regressions)
- Reference extraction integrated into indexing workflow without breaking existing functionality
- Database migration not needed (schema already supports references)
- Performance: indexing time should increase by <20% (reference extraction is lightweight)

## Validation Commands

```bash
# Linting and type-checking
bun run lint
bunx tsc --noEmit

# Unit tests
bun test --filter reference-extractor

# Integration tests
bun test --filter reference-storage

# Full test suite
bun test

# Build verification
bun run build
```

**Prerequisites**: All test commands require Supabase Local running. Use `cd app && bun test:setup` to start containers before running tests (see `.claude/commands/docs/test-lifecycle.md` for details).

---

## Summary

Implements AST-based reference extraction to enable "find usages" queries for KotaDB. Extracts imports, function calls, property access, and type references with precise location tracking. Uses visitor pattern consistent with symbol extraction. Stores references in database with name-based resolution (symbol_id resolution deferred to next issue). Achieves 95%+ reference coverage for identifier-based patterns. Integration tested against real Supabase database per anti-mock philosophy.
