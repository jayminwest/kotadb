# Feature Plan: AST Parsing Test Infrastructure

**Issue:** #72 - feat: set up test infrastructure for AST parsing validation
**Parent Epic:** #70 - AST-based code parsing
**Priority:** Critical
**Effort:** Medium (2-3 days)
**Status:** Needs Investigation

## Overview

### Problem
The upcoming AST parsing pipeline (Epic #70) requires robust test infrastructure to validate symbol extraction, reference tracking, and dependency graphs. Current test setup (133 tests) focuses on API/auth flows but lacks fixtures and utilities for parsing validation.

Without dedicated test infrastructure:
- AST parser implementation will be difficult to validate incrementally
- Edge cases (circular deps, re-exports, arrow functions) won't have known-good fixtures
- Symbol extraction tests will duplicate setup code across test files
- No baseline for comparing actual vs. expected parsing output

### Desired Outcome
Establish TDD-ready infrastructure with:
1. **Fixture repositories** - Known TypeScript structures with documented symbol/dependency counts
2. **Test utilities** - Reusable helpers for AST comparison and assertion
3. **Documentation** - Clear guidance on fixture maintenance and extension

This enables the AST parser implementation (next issue in Epic #70) to proceed test-first with high confidence.

### Non-Goals
- Implementing actual AST parsing logic (deferred to next issue)
- Refactoring existing test helpers (db.ts, server.ts, mcp.ts)
- Adding new database tables (symbols, references, dependencies tables already exist from migration 007)

## Technical Approach

### Architecture Notes
This builds on the existing antimocking test architecture:
- Uses real Supabase test database (no mocked parsers)
- Follows Docker Compose + Supabase Local pattern
- Integrates with existing helpers in `app/tests/helpers/`

**Key Design Decisions:**
1. **Fixtures as real TypeScript** - Must compile with `tsc --noEmit` to ensure validity
2. **Known ground truth** - Each fixture documents expected symbol count, dependency graph, circular deps
3. **Stateless utilities** - Test helpers don't maintain state, only validate/transform data
4. **Separation of concerns** - Parsing utilities separate from existing db/server/mcp helpers

### Key Modules to Touch
**New modules:**
- `app/tests/helpers/parsing.ts` - AST validation utilities
- `app/tests/fixtures/parsing/README.md` - Fixture documentation
- `app/tests/fixtures/parsing/simple/` - 5-8 file fixture
- `app/tests/fixtures/parsing/complex/` - 15-20 file fixture with edge cases

**No changes to existing modules** (API/auth/MCP helpers remain untouched)

### Data/API Impacts
**Database tables** (already exist from migration 007):
- `symbols` - Function/class/interface definitions
- `references` - Import statements and symbol usages
- `dependencies` - File-level dependency graph

**No API changes** - This issue only adds test infrastructure, no runtime behavior changes.

## Relevant Files

### Existing Files to Reference
- `app/tests/helpers/db.ts` - Database test helpers (reuse pattern for new parsing helpers)
- `app/tests/helpers/mcp.ts` - Content extraction pattern (model for AST extraction)
- `app/src/indexer/parsers.ts` - Current file discovery/parsing (will extend for AST)
- `app/src/db/migrations/007_add_symbols_references_dependencies.sql` - Target schema
- `docs/testing-setup.md` - Existing test infrastructure documentation

### New Files
- `app/tests/fixtures/parsing/README.md` - Fixture documentation with:
  - How to add new fixtures
  - Fixture naming conventions
  - Ground truth for each fixture (symbol counts, dependency patterns)
- `app/tests/fixtures/parsing/simple/index.ts` - Entry point importing utils
- `app/tests/fixtures/parsing/simple/utils.ts` - Helper functions with JSDoc
- `app/tests/fixtures/parsing/simple/types.ts` - Type definitions
- `app/tests/fixtures/parsing/simple/calculator.ts` - Class with methods
- `app/tests/fixtures/parsing/simple/package.json` - Minimal package metadata
- `app/tests/fixtures/parsing/complex/src/api/routes.ts` - Circular dep with handlers
- `app/tests/fixtures/parsing/complex/src/api/handlers.ts` - Circular dep with routes
- `app/tests/fixtures/parsing/complex/src/api/middleware.ts` - Imported by routes
- `app/tests/fixtures/parsing/complex/src/db/schema.ts` - Type definitions
- `app/tests/fixtures/parsing/complex/src/db/queries.ts` - Uses schema types
- `app/tests/fixtures/parsing/complex/src/db/client.ts` - Re-exports from queries
- `app/tests/fixtures/parsing/complex/src/utils/logger.ts` - Utility with JSDoc
- `app/tests/fixtures/parsing/complex/src/utils/config.ts` - Type references
- `app/tests/fixtures/parsing/complex/package.json` - Package metadata
- `app/tests/fixtures/parsing/complex/tsconfig.json` - TypeScript config
- `app/tests/helpers/parsing.ts` - Test utilities:
  - `assertSymbolEquals(actual, expected)` - Compare symbol metadata
  - `assertReferencesInclude(refs, expected)` - Validate reference presence
  - `buildDependencyMap(files)` - Generate expected dependency graph
  - `findCircularDeps(graph)` - Detect cycles for validation

## Task Breakdown

### Phase 1: Simple Fixture Foundation
- Create `app/tests/fixtures/parsing/` directory structure
- Write simple fixture TypeScript files (5-8 files):
  - `index.ts` - Entry point with imports
  - `utils.ts` - Helper functions with JSDoc
  - `types.ts` - Interface/type definitions
  - `calculator.ts` - Class with methods
  - `package.json` - Minimal package config
- Validate fixture compiles with `tsc --noEmit`
- Document ground truth in README (expected symbols, imports, exports)

### Phase 2: Complex Fixture with Edge Cases
- Create complex fixture structure (15-20 files)
- Implement circular dependency pattern (routes ↔ handlers)
- Add edge cases:
  - Arrow functions and anonymous functions
  - Default exports and namespace exports
  - Re-exports (`export * from`)
  - Mixed TypeScript and JavaScript files
  - Type references without imports
- Validate fixture compiles
- Document known circular dependencies and edge cases in README

### Phase 3: Test Utilities and Integration
- Write `app/tests/helpers/parsing.ts` utilities
- Add unit tests for test utilities (self-validation)
- Document utility usage in fixture README
- Run full test suite to ensure no regressions

## Step by Step Tasks

### 1. Create Fixture Directory Structure
- Create `app/tests/fixtures/parsing/` directory
- Create `app/tests/fixtures/parsing/simple/` subdirectory
- Create `app/tests/fixtures/parsing/complex/src/api/` subdirectory
- Create `app/tests/fixtures/parsing/complex/src/db/` subdirectory
- Create `app/tests/fixtures/parsing/complex/src/utils/` subdirectory

### 2. Build Simple Fixture
- Write `app/tests/fixtures/parsing/simple/types.ts` with interface and type definitions
- Write `app/tests/fixtures/parsing/simple/utils.ts` with helper functions and JSDoc
- Write `app/tests/fixtures/parsing/simple/calculator.ts` with class and methods
- Write `app/tests/fixtures/parsing/simple/index.ts` importing utils and calculator
- Write `app/tests/fixtures/parsing/simple/package.json` with minimal config
- Validate fixture compiles: `cd app/tests/fixtures/parsing/simple && bunx tsc --noEmit`

### 3. Document Simple Fixture Ground Truth
- Write `app/tests/fixtures/parsing/README.md` with:
  - Overview of fixture purpose
  - Simple fixture section documenting:
    - Expected symbol count (functions, classes, interfaces, types)
    - Import/export graph (which files import from where)
    - Known JSDoc comment locations
  - Guidelines for adding new fixtures

### 4. Build Complex Fixture - API Layer
- Write `app/tests/fixtures/parsing/complex/src/api/routes.ts` importing handlers
- Write `app/tests/fixtures/parsing/complex/src/api/handlers.ts` importing routes (circular)
- Write `app/tests/fixtures/parsing/complex/src/api/middleware.ts` with utility functions
- Add arrow functions and anonymous callbacks to routes

### 5. Build Complex Fixture - DB Layer
- Write `app/tests/fixtures/parsing/complex/src/db/schema.ts` with type definitions
- Write `app/tests/fixtures/parsing/complex/src/db/queries.ts` using schema types
- Write `app/tests/fixtures/parsing/complex/src/db/client.ts` with re-exports (`export * from`)

### 6. Build Complex Fixture - Utilities
- Write `app/tests/fixtures/parsing/complex/src/utils/logger.ts` with JSDoc comments
- Write `app/tests/fixtures/parsing/complex/src/utils/config.ts` with type references
- Write `app/tests/fixtures/parsing/complex/package.json`
- Write `app/tests/fixtures/parsing/complex/tsconfig.json` with strict settings

### 7. Validate Complex Fixture
- Validate fixture compiles: `cd app/tests/fixtures/parsing/complex && bunx tsc --noEmit`
- Verify circular dependency is intentional (routes ↔ handlers)
- Verify edge cases are present (arrow functions, re-exports, anonymous functions)

### 8. Document Complex Fixture Ground Truth
- Update `app/tests/fixtures/parsing/README.md` with complex fixture section:
  - Expected symbol count by file
  - Known circular dependencies (routes ↔ handlers)
  - Edge cases and their locations
  - Dependency graph ASCII diagram

### 9. Write Test Utilities
- Write `app/tests/helpers/parsing.ts` with:
  - `assertSymbolEquals(actual, expected)` - Deep comparison of symbol metadata
  - `assertReferencesInclude(refs, expected)` - Array inclusion check for references
  - `buildDependencyMap(files)` - Generate Map<string, string[]> of dependencies
  - `findCircularDeps(graph)` - Detect cycles using depth-first search
  - Type definitions for Symbol, Reference, DependencyGraph

### 10. Add Unit Tests for Utilities
- Write `app/tests/helpers/parsing.test.ts` with:
  - Test `assertSymbolEquals` with matching and mismatched symbols
  - Test `assertReferencesInclude` with various reference patterns
  - Test `buildDependencyMap` with simple linear dependencies
  - Test `findCircularDeps` with circular and acyclic graphs

### 11. Integration Validation
- Run full test suite: `cd app && bun test`
- Verify 133 existing tests still pass (no regressions)
- Run type-check: `cd app && bunx tsc --noEmit`
- Run lint: `cd app && bun run lint` (if configured)

### 12. Final Validation and PR Creation
- Run validation commands (see Validation Commands section)
- Push branch: `git push -u origin feat/72-test-infra-ast-parsing`
- Create PR using: `/pull_request feat/72-test-infra-ast-parsing {"number":72,"title":"feat: set up test infrastructure for AST parsing validation","labels":["component:backend","component:testing","priority:critical","effort:medium","status:needs-investigation"]} docs/specs/feature-72-test-infra-ast-parsing.md <adw_id>`

## Risks & Mitigations

### Risk: Fixtures become stale as AST parser evolves
**Mitigation:**
- Document expected outputs in README for easy verification
- Add validation task in future issues: "Verify fixtures still compile"
- Consider adding CI check that compiles fixtures

### Risk: Test utilities duplicate future AST parser logic
**Mitigation:**
- Keep utilities simple (comparison/assertion only, no parsing)
- When real parser exists, utilities should call parser rather than reimplementing
- Phase 3 includes refactoring utilities if duplication emerges

### Risk: Complex fixture is too complex to maintain
**Mitigation:**
- Limit to 15-20 files max (issue requirement)
- Document each edge case explicitly in README
- Use realistic patterns from actual codebase (api/db/utils structure mirrors app/src/)

### Risk: Circular dependencies break TypeScript compilation
**Mitigation:**
- Use TypeScript 5.x with proper module resolution
- Document circular dep pattern in tsconfig.json comments
- Test compilation in Phase 2 before proceeding to Phase 3

## Validation Strategy

### Automated Tests
- **Fixture compilation**: `tsc --noEmit` on both simple and complex fixtures
- **Test utilities**: Unit tests in `app/tests/helpers/parsing.test.ts`
- **Regression check**: Full test suite (`bun test`) confirms 133 existing tests pass
- **Type safety**: `bunx tsc --noEmit` in app/ directory

### Manual Checks
- **Fixture review**: Manually inspect fixtures to confirm edge cases are present
- **README accuracy**: Verify documented symbol counts match actual fixture content
- **Circular dependency**: Confirm routes.ts ↔ handlers.ts circular import pattern exists

### Release Guardrails
- **No runtime changes**: This issue only adds test infrastructure, no production impact
- **CI integration**: Existing CI runs full test suite, will catch any regressions
- **Rollback**: If test infrastructure causes issues, can delete fixtures/utilities without impacting production

### Real-Service Evidence
Following antimocking principles:
- Fixtures compile with real TypeScript compiler (no mocked tsc)
- Test utilities will be validated against real parser output in next issue
- No failure injection needed (fixtures are static, deterministic)

## Validation Commands

Run these commands from the `app/` directory to validate implementation:

```bash
# Type-check application code
bunx tsc --noEmit

# Type-check simple fixture
cd tests/fixtures/parsing/simple && bunx tsc --noEmit && cd -

# Type-check complex fixture
cd tests/fixtures/parsing/complex && bunx tsc --noEmit && cd -

# Run full test suite (133 existing + new utility tests)
bun test

# Run only parsing utility tests
bun test --filter parsing

# Lint (if configured)
bun run lint || echo "Lint not configured, skipping"

# Build (smoke test)
bun run build || echo "Build script not configured, skipping"
```

**Success Criteria:**
- All fixture compilations succeed
- Test suite passes with at least 133 tests (existing) + new utility tests
- No type errors
- README documents all expected symbols/dependencies
