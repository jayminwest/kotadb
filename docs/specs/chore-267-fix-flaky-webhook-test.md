# Chore Plan: Fix Flaky Webhook Integration Test in CI

## Context
Intermittent test failure in CI for webhook integration test `POST /webhooks/github - Job Queue Integration > creates index job for push to tracked repository` discovered in PR #266. Test passes consistently in local development but fails intermittently in CI (1 out of 2 parallel jobs failed). This indicates a timing-related race condition where async job queue operations may not be visible to queries immediately in CI's slower I/O environment.

**Why this matters now:**
- Blocks reliable CI validation for webhook-related changes
- Undermines confidence in test suite (false negatives)
- May indicate hidden race conditions in production webhook processing

**Constraints:**
- Must maintain test execution speed (< 500ms per test)
- Fix must not introduce false positives (tests passing when they shouldn't)
- Solution should be reusable for other async job queue tests

## Relevant Files
- `app/tests/api/webhooks.test.ts` — Contains the failing test at line 57
- `app/src/github/webhook-processor.ts` — Async webhook processing with `queueMicrotask()`
- `app/src/queue/client.ts` — pg-boss queue client with job persistence
- `app/tests/helpers/db.ts` — Test database utilities (may need async assertion helpers)
- `.github/workflows/app-ci.yml` — CI workflow configuration for debugging

### New Files
- `app/tests/helpers/async-assertions.ts` — Reusable async wait/retry helpers for job queue tests

## Work Items

### Preparation
1. Review CI failure logs from https://github.com/kotadb/kotadb/actions/runs/18757694778/job/53513971704
2. Set up local environment to reproduce flaky behavior (run tests with artificial delays)
3. Create branch `chore/267-fix-flaky-webhook-test` from `develop`
4. Back up current test file state

### Execution
1. **Analyze root cause:**
   - Add verbose logging to webhook test to capture timing details
   - Measure time between webhook POST and job query in CI vs local
   - Check if `queueMicrotask()` + pg-boss async write creates visibility delay

2. **Implement async assertion helper:**
   - Create `waitForCondition()` helper in `app/tests/helpers/async-assertions.ts`
   - Support configurable timeout (default 3000ms) and polling interval (default 50ms)
   - Return early on success to avoid unnecessary delays

3. **Update webhook test:**
   - Replace immediate query with `waitForCondition()` wrapper
   - Wait for `index_jobs` row to become visible in database
   - Add test comments explaining CI timing considerations

4. **Validate fix locally:**
   - Run test 20 times consecutively with `for i in {1..20}; do bun test app/tests/api/webhooks.test.ts; done`
   - Add artificial 200ms delay to simulate CI environment
   - Verify test still completes within 500ms timeout

5. **Trigger CI validation:**
   - Push branch to trigger CI workflow
   - Monitor 10+ CI runs for consistent passes
   - Compare execution time before/after fix

### Follow-up
1. Document async testing patterns in `docs/testing-setup.md`
2. Apply same pattern to other job queue tests if needed
3. Monitor CI metrics for regression in test reliability

## Step by Step Tasks

### Investigation
1. Clone PR #266 failure logs and compare successful vs failed CI job outputs
2. Run `bun test app/tests/api/webhooks.test.ts --bail 0` locally 20 times to establish baseline
3. Add temporary `console.log` statements to track webhook processing → job creation → query timing

### Implementation
1. Create `app/tests/helpers/async-assertions.ts` with `waitForCondition()` helper
2. Update `app/tests/api/webhooks.test.ts` to use `waitForCondition()` for job query
3. Add JSDoc comments explaining why async waiting is required for CI stability
4. Remove temporary debug logging

### Validation
1. Run `bun test app/tests/api/webhooks.test.ts` locally 20 times consecutively
2. Run `bun test` (full suite) to ensure no regressions in other tests
3. Run `bun run lint` to validate code style
4. Run `bunx tsc --noEmit` to validate TypeScript types
5. Push branch with `git push -u origin chore/267-fix-flaky-webhook-test`
6. Monitor CI workflow for 10 consecutive successful runs
7. Re-run failed jobs manually if needed to validate determinism

## Risks

**Risk: Fix introduces false positives**
- **Mitigation:** Use short polling intervals (50ms) and strict timeout (3s) to fail fast on real errors

**Risk: Performance regression from polling**
- **Mitigation:** Return early on first success, measure test execution time before/after

**Risk: Fix masks real race condition in production**
- **Mitigation:** Add logging to track webhook processing duration in production, alert if > 1s

**Risk: Other job queue tests have same flakiness**
- **Mitigation:** Audit all tests using `index_jobs` table, apply same pattern proactively

## Validation Commands

- `bun run lint` — Validate code style for new helper and updated test
- `bunx tsc --noEmit` — Ensure TypeScript types are correct
- `bun test app/tests/api/webhooks.test.ts` — Run isolated webhook tests
- `bun test` — Run full suite to check for regressions
- `for i in {1..20}; do bun test app/tests/api/webhooks.test.ts || exit 1; done` — Validate determinism locally
- Monitor CI workflow runs for 10 consecutive passes after push

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `test: add async assertion helper for job queue tests` not `Based on the plan, this commit adds an async assertion helper`

**Example valid commits:**
- `test: add waitForCondition helper for async assertions`
- `test: fix flaky webhook test with database polling`
- `docs: document async testing patterns for CI stability`

## Deliverables

**Code changes:**
- `app/tests/helpers/async-assertions.ts` — New reusable async assertion utilities
- `app/tests/api/webhooks.test.ts` — Updated test with `waitForCondition()` for job queries

**Documentation updates:**
- JSDoc comments in webhook test explaining CI timing considerations
- Optional: Section in `docs/testing-setup.md` on async job queue testing patterns

**Validation artifacts:**
- 20 consecutive local test passes
- 10 consecutive CI workflow passes
- Performance benchmark (test execution time < 500ms)
