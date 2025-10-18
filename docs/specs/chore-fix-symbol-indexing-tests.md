# Chore Plan: Fix Symbol Indexing Test Failures

## Context
Feature #74 (Symbol Extraction from AST) was merged but introduced 5 failing integration tests. The root cause is a missing unique constraint on the `symbols` table that prevents the upsert operation from working correctly. The code in `app/src/api/queries.ts:172` attempts to upsert symbols with `onConflict: "file_id,name,line_start"`, but this constraint doesn't exist in the database schema.

**Why this chore matters now:**
- Breaking the test suite (5 failures out of 260 tests) blocks further development and CI/CD confidence
- The feature is already merged to the main branch, making this a critical hotfix
- Symbol indexing is a core feature that needs to be reliable for AI developer workflows

**Constraints / deadlines:**
- Must maintain migration sync between `app/src/db/migrations/` and `app/supabase/migrations/` (critical project requirement)
- Must preserve RLS (Row Level Security) policies for multi-tenant data isolation
- No breaking changes to existing API contracts or data structures

## Relevant Files

### Source Files
- `app/src/db/migrations/001_initial_schema.sql` — Contains the `symbols` table definition, needs unique constraint added
- `app/supabase/migrations/20241001000001_initial_schema.sql` — Mirror of source migrations for Supabase CLI
- `app/src/api/queries.ts:171-173` — `storeSymbols()` function using upsert with missing constraint
- `app/tests/integration/indexing-symbols.test.ts` — Integration tests validating symbol extraction and storage

### Configuration Files
- `app/package.json` — Contains test:validate-migrations script to verify sync
- `CLAUDE.md` — Project documentation explaining migration sync requirement

### New Files
- `app/src/db/migrations/003_symbols_unique_constraint.sql` — New migration adding the unique constraint
- `app/supabase/migrations/20241014000000_symbols_unique_constraint.sql` — Mirror for Supabase CLI

## Work Items

### Preparation
1. Verify current database schema state by running tests to confirm failure mode
2. Review existing RLS policies on `symbols` table to ensure constraint doesn't conflict
3. Backup test data (none needed - tests are idempotent with cleanup)

### Execution
1. Create new migration file `003_symbols_unique_constraint.sql` in `app/src/db/migrations/`
2. Add unique constraint: `ALTER TABLE symbols ADD CONSTRAINT symbols_file_name_line_unique UNIQUE (file_id, name, line_start);`
3. Copy migration to `app/supabase/migrations/` with Supabase timestamp format
4. Run `bun run test:validate-migrations` to verify sync
5. Run full test suite (`bun test`) to confirm all 5 failing tests now pass
6. Verify no new test failures or regressions

### Follow-up
1. Document the constraint in migration comments for future reference
2. Verify CI pipeline passes with updated migrations
3. Update feature-74 specification if needed to reflect schema changes

## Step by Step Tasks

### 1. Create Migration Files
- Create `app/src/db/migrations/003_symbols_unique_constraint.sql` with unique constraint DDL
- Include descriptive comment explaining why constraint is needed (upsert support)
- Create mirror file `app/supabase/migrations/20241014000000_symbols_unique_constraint.sql` with identical content

### 2. Validate Migration Sync
- Run `cd app && bun run test:validate-migrations` to ensure both directories are synchronized
- Fix any drift detected by validation script

### 3. Run Test Suite
- Execute `cd app && bun test` to run full test suite (260 tests)
- Verify all 5 previously failing tests now pass:
  - Integration: Symbol Indexing > indexes file and extracts symbols to database
  - Integration: Symbol Indexing > verifies expected symbol count for calculator.ts
  - Integration: Symbol Indexing > upsert updates existing symbols on re-index
  - Integration: RLS Isolation > users can only see their own symbols
  - Integration: TypeScript Types > indexes interfaces and type aliases

### 4. Verify No Regressions
- Confirm test count remains at 260 tests (255 pass + 5 previously failing)
- Check that no new failures were introduced by the constraint

### 5. Final Validation and Push
- Run `cd app && bunx tsc --noEmit` to verify TypeScript compilation
- Run `cd app && bun run test:validate-env` to check for hardcoded environment variables
- Commit changes with descriptive message following Conventional Commits format
- Push branch to remote: `git push -u origin feat/74-symbol-extraction`
- Create pull request using `/pull_request feat/74-symbol-extraction {} docs/specs/chore-fix-symbol-indexing-tests.md adw_chore_fix_tests`

## Risks

### Risk: Constraint conflicts with existing data
**Mitigation:** The `symbols` table is new (feature #74 just merged), so production should have no data yet. Tests clean up after themselves, so no stale test data exists.

### Risk: Migration numbering collision
**Mitigation:** Check existing migrations before creating `003_*`. If collision exists, use next available number (004, etc.).

### Risk: Migration sync drift
**Mitigation:** Use `test:validate-migrations` script before committing. This is enforced in CI and catches any mismatches between source and Supabase directories.

### Risk: RLS policy incompatibility
**Mitigation:** Unique constraint is table-level, not user-scoped, so it won't interfere with RLS SELECT/INSERT policies. Existing policies filter by user through `indexed_files.repository_id.user_id` join.

## Validation Commands

- `cd app && bun run test:validate-migrations` — Verify migration sync (critical)
- `cd app && bunx tsc --noEmit` — Type-check without emitting files
- `cd app && bun test` — Run full test suite (must show 260 pass, 0 fail)
- `cd app && bun run test:validate-env` — Detect hardcoded environment URLs
- `cd app && bun test tests/integration/indexing-symbols.test.ts` — Run specific failing tests

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(db): add unique constraint for symbol upserts` not `Based on the plan, the commit should add a unique constraint`

Example good commit message:
```
fix(db): add unique constraint for symbol upserts

Adds UNIQUE constraint on (file_id, name, line_start) to symbols table.
Enables upsert operations in storeSymbols() to handle re-indexing without
duplicate symbol entries.

Resolves 5 failing integration tests in indexing-symbols.test.ts.
```

## Deliverables

1. **Migration files** (2 new files):
   - `app/src/db/migrations/003_symbols_unique_constraint.sql`
   - `app/supabase/migrations/20241014000000_symbols_unique_constraint.sql`

2. **Test results**:
   - All 260 tests passing (0 failures)
   - Specific confirmation of 5 previously failing tests now passing

3. **Validation evidence**:
   - Migration sync validation passing
   - TypeScript compilation passing
   - No hardcoded environment variables detected
