# Feature Plan: TypeScript ESLint Parser Migration for AST Extraction

**Issue:** #73 - feat: migrate to @typescript-eslint/parser for AST extraction
**Parent Epic:** #70 - AST-based code parsing
**Priority:** Critical
**Effort:** Medium (2-3 days)
**Status:** Needs Investigation
**Depends on:** #72 (Test infrastructure)

## Overview

### Problem
Current indexing in `app/src/indexer/parsers.ts` uses basic file discovery and regex-based dependency extraction via `app/src/indexer/extractors.ts`. This approach cannot provide:
- Symbol-level code intelligence (function/class/interface definitions)
- Reference tracking (where symbols are used)
- Precise location information for code navigation
- Type information for semantic search

The regex-based `IMPORT_PATTERN`, `DYNAMIC_IMPORT_PATTERN`, and `REQUIRE_PATTERN` in extractors.ts:1-3 only capture import statements, missing the full semantic structure needed for Epic #70.

### Desired Outcome
Replace regex parsing with proper AST (Abstract Syntax Tree) parsing using `@typescript-eslint/parser`:
1. Parse TypeScript and JavaScript files to full AST representation
2. Preserve source locations (line, column) for all nodes
3. Handle syntax errors gracefully (log and continue, don't crash indexing)
4. Enable downstream symbol extraction (next issue in Epic #70)
5. Maintain backward compatibility with existing indexing workflow

This establishes the foundation for symbol extraction, reference tracking, and dependency graph construction in subsequent issues.

### Non-Goals
- Implementing symbol extraction logic (deferred to next issue)
- Modifying database schema (symbols/references tables already exist from migration 007)
- Changing indexing API endpoints or response formats
- Persisting full AST to database (AST is ephemeral, only extracted symbols are stored)

## Technical Approach

### Architecture Notes
AST parsing integrates into the existing indexing pipeline:

**Current Flow:**
```
POST /index → indexRepository() → ensureRepository() → discoverSources() → parseSourceFile() → extractDependencies() → save to indexed_files
```

**New Flow:**
```
POST /index → indexRepository() → ensureRepository() → discoverSources() → parseSourceFile() → parseFileToAST() → extractDependencies() → save to indexed_files
                                                                                        ↓
                                                                       (future) extractSymbols() → save to symbols
                                                                                        ↓
                                                                      (future) extractReferences() → save to references
```

**Key Design Decisions:**
1. **Parser wrapper module** - Create `app/src/indexer/ast-parser.ts` as single entry point for all AST operations
2. **Graceful error handling** - Parse errors return `null` (logged but not thrown) so one bad file doesn't block repository indexing
3. **In-memory AST** - AST is not persisted to database, only used transiently during indexing
4. **Location preservation** - Configure parser with `loc: true, range: true` for downstream symbol extraction
5. **Comment preservation** - Configure parser with `comment: true, tokens: true` for future JSDoc extraction
6. **Backward compatibility** - Existing `parseSourceFile()` continues to work, AST parsing is additive

### Key Modules to Touch
**New modules:**
- `app/src/indexer/ast-parser.ts` - AST parsing wrapper (main deliverable)
- `app/src/indexer/ast-types.ts` - Type definitions for AST operations
- `app/tests/indexer/ast-parser.test.ts` - Parser unit tests

**Modified modules:**
- `app/src/indexer/parsers.ts` - Integrate AST parser into existing `parseSourceFile()` function (optional, can defer to next issue)
- `app/package.json` - Add parser dependencies

**Referenced modules (no changes):**
- `app/src/indexer/extractors.ts` - Continues to work for dependency extraction (will be replaced in future issues)
- `app/src/indexer/repos.ts` - Repository cloning/checkout logic unchanged
- `app/src/api/queries.ts` - Indexing workflow unchanged
- `app/tests/fixtures/parsing/` - Test fixtures from issue #72

### Data/API Impacts
**No database changes** - This issue only adds parsing capability, no schema modifications.

**No API changes** - Endpoints remain unchanged:
- `POST /index` - Still accepts same parameters, response format unchanged
- `GET /search` - Still returns same results (no symbol search yet)
- `GET /files/recent` - Still returns file metadata unchanged

**Future impact** - AST structure will enable:
- Symbol extraction (next issue) → `symbols` table population
- Reference extraction → `references` table population
- Dependency graph → `dependencies` table population

## Relevant Files

### Existing Files to Reference
- `app/src/indexer/parsers.ts` - Current parsing logic (lines 73-100 show `parseSourceFile()` structure to mirror)
- `app/src/indexer/extractors.ts` - Regex-based extraction (lines 1-24 show current approach to replace)
- `app/tests/fixtures/parsing/simple/calculator.ts` - Test fixture with class/methods/JSDoc (from #72)
- `app/tests/fixtures/parsing/complex/src/api/handlers.ts` - Test fixture with interfaces, circular deps, arrow functions
- `app/tests/helpers/parsing.ts` - Test utilities from #72
- `app/tests/helpers/db.ts` - Test helper pattern to follow for new utilities

### New Files
- `app/src/indexer/ast-parser.ts` - AST parsing wrapper with:
  - `parseFile(filePath: string, content: string): TSESTree.Program | null` - Main parsing function
  - `isSupportedForAST(filePath: string): boolean` - Check if file should be parsed (exclude JSON)
  - Error handling and logging
- `app/src/indexer/ast-types.ts` - Type definitions:
  - `ParseResult` - Wrapper for successful/failed parse
  - `ParseError` - Structured parse error metadata
  - Re-export commonly used `TSESTree` types for convenience
- `app/tests/indexer/ast-parser.test.ts` - Parser tests:
  - Parse valid TypeScript file (class with methods)
  - Parse valid JavaScript file (ES modules, CommonJS)
  - Handle syntax errors gracefully (invalid code returns null)
  - Validate location information (line, column, range)
  - Preserve comments for JSDoc extraction
  - Test with all fixture files from #72

## Task Breakdown

### Phase 1: Dependencies and Core Parser
- Install `@typescript-eslint/parser` and `@typescript-eslint/types` dependencies
- Create `app/src/indexer/ast-types.ts` with type definitions
- Implement `app/src/indexer/ast-parser.ts` with `parseFile()` function
- Configure parser options (ecmaVersion, sourceType, loc, range, comment, tokens)
- Implement graceful error handling (log and return null on parse errors)

### Phase 2: Validation and Testing
- Write unit tests in `app/tests/indexer/ast-parser.test.ts`
- Test with simple fixture (calculator.ts with class/methods)
- Test with complex fixture (handlers.ts with interfaces/arrow functions)
- Test syntax error handling (malformed code)
- Test location information presence and accuracy
- Validate comment and token preservation

### Phase 3: Integration and Documentation
- Integrate AST parser into existing workflow (optional, can defer)
- Run full test suite to ensure no regressions
- Update CLAUDE.md if new patterns are established
- Run validation commands (typecheck, lint, test, build)
- Push branch and create PR

## Step by Step Tasks

### 1. Install Parser Dependencies
- Add `@typescript-eslint/parser` to dependencies in `app/package.json`
- Add `@typescript-eslint/types` to dependencies in `app/package.json`
- Run `cd app && bun install` to install new dependencies
- Verify installation: `bunx tsc --version` and check for parser in node_modules

### 2. Create Type Definitions Module
- Write `app/src/indexer/ast-types.ts` with:
  - Import `TSESTree` from `@typescript-eslint/types`
  - Define `ParseResult` type: `{ success: true, ast: TSESTree.Program } | { success: false, error: ParseError }`
  - Define `ParseError` type: `{ message: string, line?: number, column?: number, filePath: string }`
  - Re-export commonly used types: `export type { TSESTree }`
  - Add JSDoc comments explaining usage

### 3. Implement Core Parser Function
- Write `app/src/indexer/ast-parser.ts` with:
  - Import `parse` from `@typescript-eslint/parser`
  - Import `TSESTree` from `@typescript-eslint/types`
  - Implement `parseFile(filePath: string, content: string): TSESTree.Program | null`
  - Configure parser options:
    - `ecmaVersion: 'latest'` - Support modern JavaScript syntax
    - `sourceType: 'module'` - Treat files as ES modules
    - `loc: true` - Include line/column locations
    - `range: true` - Include character offsets
    - `comment: true` - Preserve comments
    - `tokens: true` - Preserve tokens
    - `filePath` - Pass for error messages
  - Wrap in try/catch block
  - On error: log to console.error with file path and error message, return null
  - On success: return AST

### 4. Add File Type Filtering
- Add `isSupportedForAST(filePath: string): boolean` function in `ast-parser.ts`
- Support: `.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`
- Exclude: `.json` (not parseable as JavaScript)
- Use `extname()` from `node:path` for extension checking
- Mirror `SUPPORTED_EXTENSIONS` pattern from parsers.ts:6-14

### 5. Add Error Logging and Metadata
- Implement structured error logging in parser catch block
- Log format: `Failed to parse ${filePath}: ${error.message}`
- Extract line/column from parser error if available
- Create `ParseError` object with all metadata
- Return null to caller (don't throw, allow indexing to continue)

### 6. Write Unit Tests - Valid Files
- Create `app/tests/indexer/ast-parser.test.ts`
- Test parsing valid TypeScript file:
  - Use `app/tests/fixtures/parsing/simple/calculator.ts`
  - Assert AST is not null
  - Assert AST has `type: 'Program'`
  - Assert AST has `body` array with nodes
  - Assert AST has `loc` property with start/end positions
  - Assert AST has `range` property with character offsets
- Test parsing valid JavaScript file:
  - Use `app/tests/fixtures/parsing/simple/utils.ts` (rename to utils.js or create JS version)
  - Assert similar AST structure
  - Verify ES module syntax is supported

### 7. Write Unit Tests - Error Handling
- Test syntax error handling:
  - Create test case with invalid syntax: `const x = ;`
  - Call `parseFile()` with invalid content
  - Assert result is null (not thrown error)
  - Capture console.error output (use spy or mock)
  - Verify error message includes file path
- Test empty file handling:
  - Call `parseFile()` with empty string
  - Assert returns valid AST (empty program is valid)

### 8. Write Unit Tests - Location Information
- Test location information presence:
  - Parse fixture with known structure
  - Extract first function declaration from AST
  - Assert `node.loc.start.line` is a number
  - Assert `node.loc.start.column` is a number
  - Assert `node.loc.end.line` is a number
  - Assert `node.loc.end.column` is a number
  - Assert `node.range[0]` and `node.range[1]` are numbers
- Test location accuracy:
  - Parse simple known file: `function foo() {}`
  - Verify function declaration starts at line 1, column 0

### 9. Write Unit Tests - Comment Preservation
- Test comment preservation:
  - Parse `calculator.ts` with JSDoc comments (lines 1-3, 7-12, 19-24)
  - Assert AST includes comments array
  - Verify JSDoc comments are captured
  - Verify comment text matches source
- Test token preservation:
  - Parse simple file
  - Assert AST includes tokens array
  - Verify tokens include keywords, identifiers, punctuation

### 10. Integration Testing with All Fixtures
- Test parsing all simple fixture files:
  - Iterate over `app/tests/fixtures/parsing/simple/*.ts`
  - Parse each file
  - Assert all succeed (no null results)
- Test parsing all complex fixture files:
  - Iterate over `app/tests/fixtures/parsing/complex/**/*.ts`
  - Parse each file
  - Assert all succeed (including circular dependency files)
- Use test helper from `app/tests/helpers/parsing.ts` if applicable

### 11. Run Validation Commands
- Run typecheck: `cd app && bunx tsc --noEmit`
- Run lint: `cd app && bun run lint`
- Run full test suite: `cd app && bun test`
- Verify all existing tests pass (133+ tests)
- Verify new ast-parser tests pass
- Run build: `cd app && bun run build`

### 12. Final Validation and PR Creation
- Verify no regressions in existing indexing workflow
- Run migration sync check: `cd app && bun run test:validate-migrations`
- Run env validation: `cd app && bun run test:validate-env`
- Push branch: `git push -u origin feature-73-8c32fa3d`
- Create PR using: `/pull_request feature-73-8c32fa3d {"number":73,"title":"feat: migrate to @typescript-eslint/parser for AST extraction","labels":["component:backend","priority:critical","effort:medium","status:needs-investigation"]} docs/specs/feature-73-typescript-eslint-parser-migration.md <adw_id>`

## Risks & Mitigations

### Risk: Parser fails on valid TypeScript syntax
**Mitigation:**
- `@typescript-eslint/parser` is battle-tested (used by ESLint for all TypeScript projects)
- Configure with `ecmaVersion: 'latest'` to support modern syntax
- Test with complex fixture covering edge cases (generics, decorators, etc.)
- Graceful error handling ensures one bad file doesn't block repository indexing

### Risk: Parse errors are too frequent, degrading indexing quality
**Mitigation:**
- Test with real-world fixtures from #72 (mirrors KotaDB's own codebase structure)
- Log all parse errors to console for observability
- Future issue can add parse error metrics to indexing job status
- Syntax errors in source repos are rare (they wouldn't compile)

### Risk: Performance degradation from full AST parsing
**Mitigation:**
- AST parsing is fast (ESLint parses millions of files in production)
- Parser runs in-memory, no database round-trips
- Parsing is asynchronous, doesn't block other operations
- Future optimization: cache parsed AST during indexing job (don't re-parse for symbol extraction)

### Risk: Breaking changes in @typescript-eslint/parser API
**Mitigation:**
- Pin to specific version range in package.json (^9.0.0)
- Parser is stable (v9.x is mature, breaking changes are rare)
- Test suite will catch API breakage before deployment
- Type definitions from @typescript-eslint/types provide compile-time safety

### Risk: Integration with existing parsers.ts creates confusion
**Mitigation:**
- Keep AST parser as separate module (ast-parser.ts)
- Don't modify parsers.ts in this issue (defer integration to next issue)
- Clear module naming: "ast-parser" vs "parsers" vs "extractors"
- Document purpose of each module in CLAUDE.md

## Validation Strategy

### Automated Tests
Following `/anti-mock` principles, all tests use real `@typescript-eslint/parser`:
- **Parser unit tests** - Real parser on fixture files (no mocked parse functions)
- **Syntax error tests** - Real parser with invalid code (no simulated errors)
- **Location validation** - Real AST node locations compared to source
- **Comment preservation** - Real parser output inspected for comments array
- **Integration tests** - Parse all 25+ fixture files from #72 (real TypeScript compiler validation)

### Manual Checks
- **Fixture compilation** - All fixtures must compile with `tsc --noEmit` before parsing
- **Error log inspection** - Manually inspect console.error output for parse failures
- **AST structure review** - Inspect AST output in debugger to verify expected structure

### Release Guardrails
- **No runtime impact** - This issue only adds parsing capability, existing indexing unchanged
- **Backward compatibility** - Existing `parseSourceFile()` and `extractDependencies()` continue to work
- **Rollback** - Can disable AST parsing by not calling `parseFile()` (no breaking changes)
- **Monitoring** - Parse errors logged to console (searchable in production logs)

### Real-Service Evidence
Per `/anti-mock`:
- Real `@typescript-eslint/parser` used in all tests (no stubs)
- Real TypeScript compiler used for fixture validation (`tsc --noEmit`)
- Real file system used for fixture loading (`readFile()`)
- No mocked AST structures or simulated parser behavior

## Validation Commands

Run these commands from the `app/` directory to validate implementation:

```bash
# Type-check application code
bunx tsc --noEmit

# Run full test suite (includes new ast-parser tests)
bun test

# Run only AST parser tests
bun test --filter ast-parser

# Run lint
bun run lint

# Run build (typecheck wrapper)
bun run build

# Validate migration sync
bun run test:validate-migrations

# Validate no hardcoded env vars in tests
bun run test:validate-env

# Integration check: compile all fixtures
cd tests/fixtures/parsing/simple && bunx tsc --noEmit && cd -
cd tests/fixtures/parsing/complex && bunx tsc --noEmit && cd -
```

**Success Criteria:**
- All existing tests pass (133+ tests)
- New ast-parser tests pass (8+ tests covering valid TS/JS, errors, locations, comments)
- No type errors from `tsc --noEmit`
- All fixture files parse successfully
- Parser returns null on syntax errors (doesn't throw)
- AST includes location information (loc, range)
- AST includes comments and tokens

## Report

- Created implementation plan for migrating to @typescript-eslint/parser for AST extraction
- Plan defines 3-phase approach: dependencies and core parser, validation and testing, integration and documentation
- Core deliverable is app/src/indexer/ast-parser.ts with parseFile() function that handles graceful error recovery
- Key decision: AST parsing is additive (doesn't modify existing parsers.ts), enabling safe rollout
- Risk mitigation covers parser stability, performance, and backward compatibility with existing indexing workflow
- Validation strategy follows /anti-mock principles with real parser and fixture files from #72
- 12-step task breakdown covers dependency installation, implementation, comprehensive testing, and PR creation
