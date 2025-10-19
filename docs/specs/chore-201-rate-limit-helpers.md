# Chore Plan: Centralized Rate Limit Reset Helpers for Test Isolation

## Context
Rate limit tests currently use scattered cleanup logic across test files (`rate-limit.test.ts:25-28`), leading to test isolation issues and flaky tests when concurrent tests exhaust rate limits. The `concurrent.test.ts:103` test demonstrates rate limit counter accumulation causing 429 errors in subsequent tests.

This chore consolidates rate limit cleanup into reusable helpers in `app/tests/helpers/db.ts` to improve test reliability and developer experience.

## Relevant Files
- `app/tests/helpers/db.ts` — Target location for new centralized helpers
- `app/tests/auth/rate-limit.test.ts` — Will remove local `cleanupRateLimitCounter()` helper
- `app/tests/mcp/concurrent.test.ts` — Can benefit from rate limit status inspection
- `app/src/db/migrations/001_initial_schema.sql:157-176` — Rate limit counters table schema reference
- `app/src/auth/rate-limit.ts` — Rate limit enforcement implementation (reference only)

### New Files
None — extending existing test helper module

## Work Items

### Preparation
- Verify current `app/tests/helpers/db.ts` structure and export patterns
- Identify all test files using ad-hoc rate limit cleanup (grep for `rate_limit_counters`)
- Ensure test database connection works with dynamic ports from `.env.test`

### Execution
1. Add `resetRateLimitCounters()` helper to `app/tests/helpers/db.ts`
   - Accept optional `keyId` parameter (reset specific key or all if omitted)
   - Use `getSupabaseTestClient()` for service role access
   - Return count of deleted records for test assertions
   - Add JSDoc with usage examples

2. Add `getRateLimitStatus()` helper to `app/tests/helpers/db.ts`
   - Accept required `keyId` parameter
   - Return current counter state: `request_count`, `window_start`, `created_at`
   - Return `null` if no counter exists
   - Add JSDoc with debugging use case examples

3. Update `app/tests/auth/rate-limit.test.ts`
   - Remove local `cleanupRateLimitCounter()` function (lines 25-28)
   - Import `resetRateLimitCounters` from `../helpers/db`
   - Replace all calls to local cleanup with centralized helper

4. Add usage documentation
   - Document `afterEach` hook pattern in JSDoc
   - Include examples for both global and key-specific cleanup
   - Note compatibility with CI environment (dynamic ports)

### Follow-up
- Run full test suite to verify no regressions
- Monitor for rate limit 429 errors in CI runs
- Consider adding `resetRateLimitCounters()` to global test teardown if needed

## Step by Step Tasks

### Implementation Tasks
1. Add `resetRateLimitCounters()` function to `app/tests/helpers/db.ts`
   - Function signature: `async function resetRateLimitCounters(keyId?: string): Promise<number>`
   - Query logic: `delete().eq("key_id", keyId)` if keyId provided, else delete all
   - Error handling: throw descriptive error with Supabase error message
   - Return: count of deleted records or 0 if none

2. Add `getRateLimitStatus()` function to `app/tests/helpers/db.ts`
   - Function signature: `async function getRateLimitStatus(keyId: string): Promise<{request_count: number; window_start: string; created_at: string} | null>`
   - Query logic: `select().eq("key_id", keyId).maybeSingle()`
   - Error handling: throw descriptive error with Supabase error message
   - Return: counter object or null if no counter exists

3. Update `app/tests/auth/rate-limit.test.ts`
   - Remove lines 25-28 (`cleanupRateLimitCounter` function definition)
   - Add import: `import { resetRateLimitCounters } from "../helpers/db";`
   - Replace all `cleanupRateLimitCounter(keyId)` calls with `resetRateLimitCounters(keyId)`
   - Verify all cleanup calls occur in test cleanup blocks

4. Run validation suite
   - Execute `cd app && bun test tests/auth/rate-limit.test.ts`
   - Execute `cd app && bun test tests/mcp/concurrent.test.ts`
   - Execute full suite: `cd app && bun test`
   - Verify type checking: `cd app && bunx tsc --noEmit`

5. Push changes to branch
   - Stage all modified files: `git add app/tests/helpers/db.ts app/tests/auth/rate-limit.test.ts`
   - Commit with validation-compliant message: `chore(tests): add centralized rate limit reset helpers for test isolation`
   - Push to remote: `git push -u origin chore/201-rate-limit-helpers`

## Risks

| Risk | Mitigation |
|------|-----------|
| Breaking existing rate limit tests | Run `rate-limit.test.ts` after each change to catch regressions immediately |
| CI environment port conflicts | Helpers use `getSupabaseTestClient()` which respects `.env.test` dynamic ports |
| Tests still fail with 429 errors | Add global `afterEach` hook in test setup if per-test cleanup insufficient |
| Missing cleanup in other test files | Grep for `rate_limit_counters` to find all ad-hoc cleanup logic |

## Validation Commands

### Core Validation
```bash
cd app && bunx tsc --noEmit                     # Type checking
cd app && bun test tests/auth/rate-limit.test.ts  # Rate limit test suite
cd app && bun test tests/mcp/concurrent.test.ts   # Concurrency tests
cd app && bun test                               # Full test suite (133 tests)
```

### Supplemental Checks
```bash
cd app && bun run test:validate-env              # Detect hardcoded environment URLs
grep -r "rate_limit_counters" app/tests/        # Find ad-hoc cleanup patterns
```

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(tests): add centralized rate limit reset helpers` not `Based on the plan, the commit should add helpers`

Examples:
- ✅ `chore(tests): add resetRateLimitCounters helper to db test utilities`
- ✅ `refactor(tests): migrate rate-limit.test.ts to use centralized cleanup`
- ❌ `chore: based on the plan, the commit should add rate limit helpers`
- ❌ `test: here is the implementation of the centralized cleanup function`

## Deliverables
- Code changes:
  - New `resetRateLimitCounters()` helper in `app/tests/helpers/db.ts`
  - New `getRateLimitStatus()` helper in `app/tests/helpers/db.ts`
  - Refactored `app/tests/auth/rate-limit.test.ts` using centralized helpers
- Documentation:
  - JSDoc comments with usage examples and `afterEach` hook patterns
  - Notes on CI environment compatibility
