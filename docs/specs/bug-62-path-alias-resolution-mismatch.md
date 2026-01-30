# Bug Plan: Path Alias Resolution Absolute vs Relative Mismatch

## Bug Summary

- **Observed behaviour**: All 760 path alias imports (`@db/*`, `@api/*`, `@indexer/*`, etc.) have `target_file_path = NULL` in `indexed_references` table. The `search_dependencies` MCP tool cannot track files imported via path aliases.
- **Expected behaviour**: Path alias imports should resolve to their target files, populating `target_file_path` for accurate dependency graph traversal.
- **Suspected scope**: `app/src/indexer/path-resolver.ts` - the `resolvePathAlias()` function constructs absolute paths but compares against a Set of relative paths.

## Root Cause Hypothesis

- **Leading theory**: Path format mismatch between the `files` Set (contains relative paths like `src/db/sqlite/index.ts`) and resolved paths from `resolvePathAlias()` (constructs absolute paths like `/Users/.../app/src/db/sqlite/index.ts`).

- **Supporting evidence**:
  1. In `path-resolver.ts` lines 261-263:
     ```typescript
     const basePath = join(projectRoot, mappings.baseUrl, substituted);
     const resolved = normalize(basePath);  // ABSOLUTE path
     ```
  2. In `queries.ts`, `allFiles` is passed to `resolveImport()` containing objects with relative `path` properties
  3. In `import-resolver.ts` line 106:
     ```typescript
     const filePaths = new Set(files.map((f) => f.path));  // RELATIVE paths
     ```
  4. `tryExtensions()` and `tryIndexFiles()` use `files.has(absolutePath)` which always returns `false`
  
- **Why unit tests passed**: Tests in `path-resolver.test.ts` (lines 246-373) create `files` Sets with **absolute** paths (using `join(simpleDir, "src", "api", "routes.ts")`), matching the function's output. Production uses relative paths.

## Fix Strategy

### Code Changes

1. **Primary fix in `path-resolver.ts`**: Normalize resolved path to relative before lookup
   - After constructing the absolute path, strip `projectRoot` prefix to create relative path
   - Use relative path for `files.has()` lookups in `tryExtensions()` and `tryIndexFiles()`
   - Return the relative path (consistent with database storage format)

2. **Update function signature/contract**:
   - Document that `files` Set should contain relative paths (matching DB format)
   - Document that return value is relative path (matching DB storage)

### Testing Updates

3. **Add unit tests with relative paths** in `path-resolver.test.ts`:
   - Test `resolvePathAlias()` when `files` Set contains relative paths
   - Verify function returns relative path matching `files` Set format

4. **Add integration test for path alias dependency tracking** in `search-dependencies.integration.test.ts`:
   - Seed database with files using path alias imports
   - Verify `target_file_path` is populated after indexing
   - Verify `search_dependencies` finds dependents via path aliases

### Guardrails

- Add assertion/validation in `resolvePathAlias()` to detect path format mismatches early
- Add debug logging showing path format being used for lookup

## Relevant Files

- `app/src/indexer/path-resolver.ts` — Bug location: `resolvePathAlias()`, `tryExtensions()`, `tryIndexFiles()`
- `app/src/indexer/import-resolver.ts` — Calls `resolvePathAlias()` with files Set (line 107)
- `app/src/api/queries.ts` — Calls `resolveImport()` and passes `allFiles` array (lines 206-210)
- `app/tests/indexer/path-resolver.test.ts` — Needs relative path test cases
- `app/tests/mcp/search-dependencies.integration.test.ts` — Needs path alias test cases

### New Files

- None required

## Task Breakdown

### Verification

1. **Reproduce current failure**:
   ```bash
   # Index KotaDB repository
   cd app && bun run src/cli.ts --stdio
   # Use MCP tool: index_repository with localPath=/path/to/kotadb
   
   # Query database to confirm bug
   sqlite3 .kotadb/kota.db "SELECT COUNT(*) FROM indexed_references WHERE json_extract(metadata, '\$.importSource') LIKE '@%' AND target_file_path IS NOT NULL;"
   # Expected: 0 (bug confirmed)
   ```

2. **Logs to capture**:
   - Enable debug logging for `indexer-path-resolver` module
   - Observe "Could not resolve path alias" messages for all `@*` imports

### Implementation

1. Modify `resolvePathAlias()` in `path-resolver.ts`:
   - After `const resolved = normalize(basePath);` (line 263)
   - Add path normalization to relative format before lookup
   - Pass relative path to `tryExtensions()` and `tryIndexFiles()`

2. Update `tryExtensions()` and `tryIndexFiles()`:
   - Optionally accept `projectRoot` parameter for path normalization
   - Or normalize paths at call site (cleaner)

3. Update return value to be relative path (matching DB format)

### Validation

1. **Unit tests** (`path-resolver.test.ts`):
   - Add test: "resolves path alias with relative file paths in Set"
   - Add test: "returns relative path matching files Set format"

2. **Integration tests** (`search-dependencies.integration.test.ts`):
   - Add test: "should resolve path alias imports to target_file_path"
   - Seed with files using `@api/*`, `@db/*` imports
   - Verify `target_file_path` populated after indexing simulation

3. **Manual verification**:
   - Re-index KotaDB repository
   - Query: `SELECT COUNT(*) FROM indexed_references WHERE json_extract(metadata, '$.importSource') LIKE '@%' AND target_file_path IS NOT NULL;`
   - Expected: > 700 (most path alias imports resolved)

## Step by Step Tasks

### 1. Reproduce and Confirm Bug
- [ ] Run existing tests to confirm they pass (false positive)
- [ ] Index KotaDB locally and query `indexed_references` to confirm 0 resolved path aliases
- [ ] Add debug logging to `resolvePathAlias()` to trace path format mismatch

### 2. Implement Fix in path-resolver.ts
- [ ] Add helper function `toRelativePath(absolutePath: string, projectRoot: string): string`
- [ ] Modify `resolvePathAlias()` to normalize resolved path to relative before lookup
- [ ] Update `tryExtensions()` call to use relative path
- [ ] Update `tryIndexFiles()` call to use relative path
- [ ] Ensure return value is relative path (strip projectRoot prefix)

### 3. Add Unit Tests for Relative Paths
- [ ] Add test case: `resolvePathAlias()` with files Set containing relative paths
- [ ] Add test case: verify return value is relative path format
- [ ] Add test case: edge case with baseUrl other than "."

### 4. Add Integration Test for Path Alias Dependencies
- [ ] Add test in `search-dependencies.integration.test.ts` for path alias imports
- [ ] Seed test database with files using `@api/*` style imports  
- [ ] Seed `indexed_references` with simulated indexing including path alias resolution
- [ ] Verify `search_dependencies` finds dependents via path aliases

### 5. Run Validation Suite
- [ ] `cd app && bun run lint`
- [ ] `cd app && bunx tsc --noEmit`
- [ ] `cd app && bun test --filter path-resolver`
- [ ] `cd app && bun test --filter search-dependencies`
- [ ] `cd app && bun test`

### 6. Manual End-to-End Verification
- [ ] Delete existing `.kotadb/kota.db`
- [ ] Re-index KotaDB repository via MCP tool
- [ ] Query: confirm path alias imports have `target_file_path` populated
- [ ] Test `search_dependencies` on file with path alias dependents

### 7. Commit and Push
- [ ] Stage changes: `git add app/src/indexer/path-resolver.ts app/tests/indexer/path-resolver.test.ts app/tests/mcp/search-dependencies.integration.test.ts`
- [ ] Commit: `git commit -m "fix(indexer): resolve path alias absolute vs relative path mismatch (#62)"`
- [ ] Push: `git push -u origin bug/62-path-alias-resolution-mismatch`

## Regression Risks

- **Adjacent features to watch**:
  - `resolveImport()` for relative imports (should be unaffected)
  - FTS5 search (unaffected - uses different code path)
  - Symbol extraction (unaffected)
  
- **Follow-up work if risk materialises**:
  - If existing tests break, check if they incorrectly relied on absolute paths
  - May need to update `import-resolver.ts` if path format assumptions change

## Validation Commands

```bash
# Lint
cd app && bun run lint

# Type check
cd app && bunx tsc --noEmit

# Unit tests for path-resolver
cd app && bun test --filter path-resolver

# Integration tests for search-dependencies
cd app && bun test --filter search-dependencies.integration

# All tests
cd app && bun test

# Build verification
cd app && bun run build
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `fix(indexer): <subject>`
- Use direct statements: `fix(indexer): resolve path alias absolute vs relative path mismatch`
- Reference issue: `(#62)` at end of subject line
