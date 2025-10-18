# Bug Plan: Application CI Reliability - 46% Failure Rate

## Bug Summary

**Observed Behaviour:**
- Application CI workflow experiencing 46% failure rate (23 failures in last 50 runs)
- Concentrated spike of 17 failures on 2025-10-14 between 00:00-16:30 UTC
- Test step fails with error: `Failed to create test user: undefined`
- Failures occur in `tests/integration/indexing-references.test.ts` during test setup

**Expected Behaviour:**
- CI success rate should exceed 90% (industry standard for stable test infrastructure)
- Test database setup should reliably create test users when needed
- Error messages should provide clear diagnostic information

**Suspected Scope:**
- Test helper function `createTestUser()` in `app/tests/helpers/db.ts:110-128`
- Supabase client permissions for `auth.users` schema writes
- Error handling and logging in test setup code

## Root Cause Hypothesis

**Leading Theory:**
The test helper `createTestUser()` attempts to insert directly into `auth.users` table using the Supabase JS client, which is restricted from writing to the protected `auth` schema managed by GoTrue (Supabase Auth service). This causes silent failures with malformed error objects (missing `message` property).

**Supporting Evidence:**

1. **Error Pattern**: Failed run logs show `Failed to create test user: undefined` (error object exists but `message` property is undefined)

2. **Code Analysis**:
   ```typescript
   // app/tests/helpers/db.ts:118
   const { error } = await client.from("auth.users").insert({
       id: userId,
       email,
   });

   if (error) {
       throw new Error(`Failed to create test user: ${error.message}`);
       //                                              ^^^^^^^^^^^^^ undefined
   }
   ```

3. **Architecture Mismatch**: The seed script (`app/supabase/seed.sql:9-14`) correctly inserts into `auth.users` using raw SQL via `psql`, not the Supabase client:
   ```sql
   INSERT INTO auth.users (id, email, created_at, updated_at)
   VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'test-free@example.com', now(), now())
   ```

4. **Schema Protection**: The `auth` schema is managed by GoTrue and protected from direct client writes. The Supabase JS client enforces this restriction.

5. **Intermittent Failures**: The `createTestUser()` helper is rarely used (only 1 file references it), causing sporadic failures when tests actually call it.

## Fix Strategy

**Code Changes:**

1. **Remove broken test helper** (`app/tests/helpers/db.ts:110-128`):
   - Delete `createTestUser()` function (cannot work with Supabase client restrictions)
   - Update tests to use pre-seeded test users from `seed.sql`

2. **Improve error handling** (`app/tests/helpers/db.ts:134-157`):
   - Fix error message extraction to handle malformed error objects
   - Add JSON serialization fallback: `error.message || JSON.stringify(error)`
   - Apply same fix to `createTestOrganization()` and `createTestRepository()`

3. **Expand seed data** (`app/supabase/seed.sql`):
   - Add more test users if tests need user creation flexibility
   - Document which user IDs are available for different test scenarios

**Data/Config Updates:**
- No database schema changes required
- Seed data may need expansion if tests require additional users

**Guardrails:**

1. **Validation Script**: Add test to verify `auth.users` is never accessed directly via Supabase client
2. **CI Monitoring**: Track success rate after fix to confirm >90% stability
3. **Documentation**: Update test helper docs to clarify auth schema restrictions

## Relevant Files

### Modified Files
- `app/tests/helpers/db.ts` — Remove `createTestUser()`, improve error handling in `createTestOrganization()` and `createTestRepository()`
- `app/supabase/seed.sql` — (Optional) Add more test users if needed
- `app/tests/integration/indexing-references.test.ts` — Update to use pre-seeded users instead of `createTestUser()`

### New Files
- `app/tests/validate-auth-schema-access.test.ts` — Validation test to prevent direct auth schema writes via Supabase client

## Task Breakdown

### Verification
1. **Reproduce failure locally**:
   - Run `cd app && bun test tests/integration/indexing-references.test.ts` multiple times
   - Confirm error: `Failed to create test user: undefined`

2. **Analyze Supabase client behavior**:
   - Verify that `client.from("auth.users").insert()` returns error without `message` property
   - Capture full error object structure for documentation

3. **Review test coverage**:
   - Search codebase for all usages of `createTestUser()`, `createTestOrganization()`, `createTestRepository()`
   - Identify which tests need pre-seeded users vs dynamic creation

### Implementation

1. **Fix error handling in test helpers** (`app/tests/helpers/db.ts`):
   - Update `createTestOrganization()` error message: `error.message || JSON.stringify(error)` (line 154)
   - Update `createTestRepository()` error message: `error.message || JSON.stringify(error)` (line 188)
   - Add JSDoc comments explaining Supabase error object structure

2. **Remove broken `createTestUser()` function**:
   - Delete lines 110-128 in `app/tests/helpers/db.ts`
   - Remove from exports if present

3. **Update failing test** (`app/tests/integration/indexing-references.test.ts`):
   - Replace `createTestUser()` calls with pre-seeded `TEST_USER_IDS.free`
   - Update test setup to use existing seed data

4. **Expand seed data if needed** (`app/supabase/seed.sql`):
   - Add 2-3 additional test users for flexibility (IDs `...000004`, `...000005`, `...000006`)
   - Document user purposes in comments (e.g., "Extra user for multi-user tests")

5. **Add validation test** (`app/tests/validate-auth-schema-access.test.ts`):
   - Test that verifies no test files call `client.from("auth.users")`
   - Fail fast if tests attempt direct auth schema writes
   - Run as part of test suite via `bun test`

### Validation

1. **Unit test validation**:
   - Run `cd app && bun test tests/helpers/db.test.ts` (if exists)
   - Verify error handling improvements work correctly

2. **Integration test validation**:
   - Run `cd app && bun test tests/integration/` 10 times consecutively
   - Expect 100% success rate (no `createTestUser()` failures)

3. **Full test suite**:
   - Run `cd app && bun test` 5 times
   - Track pass/fail rate, expect >95% success

4. **CI validation**:
   - Push branch and trigger 10 consecutive CI runs via GitHub Actions
   - Monitor success rate in `.github/workflows/app-ci.yml`
   - Target: >90% success rate (industry standard)

5. **Type checking**:
   - Run `cd app && bunx tsc --noEmit`
   - Ensure no type errors introduced

## Step by Step Tasks

### Investigation & Diagnosis
1. Document full Supabase error object structure from failed test run
2. List all tests currently using `createTestUser()` helper
3. Verify seed data provides sufficient test users for all test scenarios

### Fix Error Handling
1. Update `createTestOrganization()` error extraction (line 154)
2. Update `createTestRepository()` error extraction (line 188)
3. Add JSDoc comments explaining error object structure
4. Run `cd app && bunx tsc --noEmit` to verify type safety

### Remove Broken Helper
1. Delete `createTestUser()` function (lines 110-128 in `app/tests/helpers/db.ts`)
2. Update `indexing-references.test.ts` to use `TEST_USER_IDS.free` instead
3. Run affected integration tests to verify functionality

### Expand Seed Data (Optional)
1. Add 3 additional test users to `seed.sql` (IDs ending in `...000004`, `...000005`, `...000006`)
2. Add comments documenting each user's purpose
3. Re-run seed script locally to verify syntax

### Add Validation Test
1. Create `app/tests/validate-auth-schema-access.test.ts`
2. Implement check for `client.from("auth.users")` in test files
3. Run validation test to confirm it catches violations

### Comprehensive Validation
1. Run full test suite locally 5 times: `cd app && bun test`
2. Run integration tests 10 times: `cd app && bun test tests/integration/`
3. Verify migration sync: `cd app && bun run test:validate-migrations`
4. Type check: `cd app && bunx tsc --noEmit`
5. Lint: `cd app && bun run lint`

### CI Validation
1. Push branch: `git push -u origin bug/162-app-ci-reliability`
2. Monitor 10 consecutive CI runs via GitHub Actions
3. Calculate success rate (target: >90%)
4. Review CI logs for any new failure patterns

## Regression Risks

**Adjacent Features to Watch:**

1. **Other test helpers**: `createTestOrganization()` and `createTestRepository()` have same error handling pattern
   - Risk: May also have malformed error objects
   - Mitigation: Apply same error handling fix to all helpers

2. **Auth-dependent integration tests**: Tests that rely on user creation may break
   - Risk: Tests fail if pre-seeded users don't match test assumptions
   - Mitigation: Expand seed data to cover common test scenarios

3. **Seed data synchronization**: Changes to `seed.sql` must be applied to all test environments
   - Risk: Local tests pass but CI fails due to stale seed data
   - Mitigation: CI setup script re-seeds on every run (already implemented)

4. **GoTrue schema changes**: Supabase Auth updates may alter `auth.users` structure
   - Risk: Seed script fails if schema changes
   - Mitigation: Use GoTrue health checks in setup script (already implemented)

**Follow-Up Work if Risks Materialize:**

1. If other tests fail due to missing users:
   - Add more test users to `seed.sql`
   - Document user allocation strategy in test helpers

2. If error handling still shows `undefined`:
   - Investigate Supabase client error serialization
   - Consider custom error wrapper for all database operations

3. If CI success rate doesn't improve to >90%:
   - Analyze new failure patterns in logs
   - Consider increasing Docker health check timeouts
   - Add retry logic to test database connections

## Validation Commands

```bash
# Type checking
cd app && bunx tsc --noEmit

# Linting
cd app && bun run lint

# Migration sync validation
cd app && bun run test:validate-migrations

# Environment variable validation
cd app && bun run test:validate-env

# Integration tests (run 10 times)
cd app && for i in {1..10}; do echo "Run $i" && bun test tests/integration/ || exit 1; done

# Full test suite (run 5 times)
cd app && for i in {1..5}; do echo "Run $i" && bun test || exit 1; done

# CI validation (trigger 10 runs and monitor)
gh run list --workflow=app-ci.yml --limit 10 --json conclusion | jq -r '.[].conclusion' | sort | uniq -c
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: `fix` (primary for this bug), `test`, `refactor`, `docs`, `chore`
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements:
  - ✅ `fix(tests): remove auth.users direct write in createTestUser helper`
  - ✅ `fix(tests): improve error handling for malformed Supabase errors`
  - ✅ `test(helpers): add validation for auth schema access restrictions`
  - ❌ `fix: looking at the changes, this commit fixes the test helper bug`
  - ❌ `fix: based on the investigation, here is the error handling improvement`

**Example commit sequence:**
```
fix(tests): improve error handling for malformed Supabase client errors

Handle cases where Supabase error objects lack message property by falling
back to JSON serialization. Prevents undefined error messages in test failures.

Affects createTestOrganization and createTestRepository helpers.

Related-To: #162
```

```
fix(tests): remove createTestUser helper with auth schema violations

Delete createTestUser function that attempts direct writes to auth.users via
Supabase client. Protected auth schema managed by GoTrue rejects these writes.

Tests now use pre-seeded users from seed.sql instead.

Fixes: #162
```

```
test(helpers): add validation test for auth schema access restrictions

Prevent regression by failing fast if tests attempt direct auth.users writes
via Supabase client. Auth schema is protected and must be seeded via SQL.

Related-To: #162
```
