# Chore Plan: RLS Enforcement Test for Job Status Endpoint

## Context
PR #240 implemented job status tracking with the `index_jobs` table, but the RLS enforcement test was skipped due to missing multi-user test infrastructure. Without this test, users could potentially query other users' job statuses, violating multi-tenancy isolation and data privacy guarantees.

This chore unblocks security validation by:
- Creating reusable multi-user test helpers
- Verifying RLS enforcement in `getJobStatus()`
- Un-skipping and implementing the skipped test in `app/tests/api/job-status.test.ts:171-173`

**Constraints:**
- Must maintain backward compatibility with existing tests
- Must not leak job existence through error codes (404, not 403)
- Must complete before security audit

## Relevant Files
- `app/tests/api/job-status.test.ts` — Contains skipped RLS test to un-skip and implement
- `app/tests/helpers/db.ts` — May need multi-user test utilities (or create new `multi-user.ts`)
- `app/src/queue/job-tracker.ts` — `getJobStatus()` function to verify RLS enforcement
- `app/src/db/migrations/001_initial_schema.sql` — RLS policies for `index_jobs` table
- `docs/testing-setup.md` — Document multi-user testing patterns

### New Files
- `app/tests/helpers/multi-user.ts` — Multi-user test utilities (if needed separate from db.ts)

## Work Items
### Preparation
- Review existing RLS policy for `index_jobs` table in migration file
- Analyze `getJobStatus()` implementation to verify `setUserContext()` behavior
- Identify gaps in current test helper infrastructure for multi-user scenarios

### Execution
- Create multi-user test helper functions (generate API keys for User A/B, switch auth context)
- Verify RLS enforcement via direct SQL test with `setUserContext()`
- Un-skip RLS test in `app/tests/api/job-status.test.ts`
- Implement test: create job as User A, query as User B, expect 404
- Implement test: create job as User A, query as User A, expect 200
- Implement test: create jobs for both users, verify isolation
- Ensure error messages don't leak job existence (404, not 403)
- Update JSDoc in `job-tracker.ts` to document RLS behavior
- Run full test suite to verify no regressions

### Follow-up
- Document multi-user testing patterns in `docs/testing-setup.md`
- Update CLAUDE.md if new test helpers warrant architecture notes
- Verify all 7 tests in `job-status.test.ts` pass (no skipped tests)

## Step by Step Tasks
### Test Infrastructure Setup
- Add `TEST_USERS` constant in `app/tests/helpers/db.ts` with User A (alice) and User B (bob) UUIDs
- Extend `getTestApiKey()` helper to accept optional `userId` parameter for multi-user scenarios
- Create `createJobAsUser()` helper to simplify job creation with specific user credentials
- Document helper usage with code examples in `docs/testing-setup.md`

### RLS Verification
- Query `pg_policies` table to verify `index_jobs` RLS policy exists with correct `user_id` filter
- Run manual SQL test with `SET app.current_user_id` to confirm RLS filters rows correctly
- Trace `setUserContext()` implementation to verify session variable is set properly
- Document findings in plan or implementation notes

### Test Implementation
- Un-skip test at `app/tests/api/job-status.test.ts:171-173` by removing `it.skip()`
- Implement scenario: User A creates job, User B queries via GET /jobs/:jobId, expects 404
- Implement scenario: User A creates job, User A queries, expects 200 with job details
- Implement scenario: Both users create jobs, each queries both job IDs, verify isolation
- Assert error messages don't contain user IDs or existence hints
- Run `cd app && bun test tests/api/job-status.test.ts` to verify all tests pass

### Code Review and Cleanup
- Review `getJobStatus()` in `app/src/queue/job-tracker.ts` for RLS correctness
- If RLS not working with service client + setUserContext, refactor to use anon client or explicit `user_id` filter
- Update JSDoc comment to remove "NOTE: Currently uses service client which bypasses RLS"
- Add JSDoc note about RLS enforcement and 404 behavior for unauthorized access
- Verify no hardcoded test user IDs remain in implementation code

### Validation and Push
- Run `cd app && bun test` to verify full test suite passes
- Run `cd app && bunx tsc --noEmit` to verify type-check passes
- Run `cd app && bun run lint` to verify lint passes
- Run `cd app && bun run test:validate-migrations` to verify migration sync
- Stage all changes: `git add -A`
- Commit with conventional message: `test: implement RLS enforcement test for job status endpoint (#242)`
- Push branch: `git push -u origin chore/242-rls-enforcement-test-job-status`

## Risks
- **RLS may not work with service client + setUserContext** → Mitigation: Test with direct SQL first; fallback to anon client or explicit user_id filter if needed
- **Multi-user test helpers may conflict with existing test patterns** → Mitigation: Review existing helpers in db.ts; extend rather than replace
- **Error code change (403→404) may affect existing API consumers** → Mitigation: Verify endpoint is internal-only; check for hardcoded 403 assertions in other tests
- **Test may be flaky if users share database state** → Mitigation: Use unique job identifiers per test; clean up test data in afterAll hooks

## Validation Commands
- `cd app && bun test tests/api/job-status.test.ts` — Verify all 7 tests pass (no skipped)
- `cd app && bun test` — Verify no regressions in full test suite
- `cd app && bunx tsc --noEmit` — Verify type-check passes
- `cd app && bun run lint` — Verify lint passes
- `cd app && bun run test:validate-migrations` — Verify migration sync
- `psql -h localhost -p 5434 -U postgres -d postgres -c "SELECT * FROM pg_policies WHERE tablename='index_jobs';"` — Verify RLS policy

**Manual API Validation (optional):**
```bash
# Start dev server
cd app && ./scripts/dev-start.sh

# Create job as User A
JOB_ID=$(curl -X POST http://localhost:3000/index \
  -H "Authorization: Bearer $USER_A_API_KEY" \
  -d '{"repository":"test/repo"}' | jq -r '.jobId')

# Attempt to query as User B (should fail)
curl -v http://localhost:3000/jobs/$JOB_ID \
  -H "Authorization: Bearer $USER_B_API_KEY"
# Expected: 404 Not Found

# Query as User A (should succeed)
curl http://localhost:3000/jobs/$JOB_ID \
  -H "Authorization: Bearer $USER_A_API_KEY"
# Expected: 200 OK with job details
```

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `test: implement RLS enforcement test for job status endpoint` not `Based on the plan, this commit implements RLS tests`

**Example commit message:**
```
test: implement RLS enforcement test for job status endpoint (#242)

- Add multi-user test helpers (TEST_USERS, createJobAsUser)
- Un-skip RLS enforcement test in job-status.test.ts
- Verify user isolation: User A cannot query User B's jobs
- Return 404 (not 403) to avoid leaking job existence
- Document multi-user testing patterns in testing-setup.md
```

## Deliverables
- Multi-user test helper functions in `app/tests/helpers/db.ts` or `multi-user.ts`
- Un-skipped and fully implemented RLS test in `app/tests/api/job-status.test.ts`
- Updated JSDoc in `app/src/queue/job-tracker.ts` documenting RLS behavior
- Documentation update in `docs/testing-setup.md` with multi-user testing patterns
- All 7 tests passing in `job-status.test.ts` with no skipped tests
- Verified RLS enforcement preventing cross-user job queries
