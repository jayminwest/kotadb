# Bug Plan: pg-boss Queue Initialization Error on Fly.io

## Bug Summary
- **Observed behavior**: Fly.io staging environment experiences infinite restart loops with error "Queue index-repo does not exist" immediately after worker registration
- **Expected behavior**: Application starts successfully with workers registered and ready to process jobs
- **Suspected scope**: Worker registration logic in `app/src/queue/workers/index-repo.ts:42-63` and queue lifecycle in `app/src/index.ts:84-93`

## Root Cause Hypothesis
The pg-boss library (v11) requires queues to exist before workers can be registered via `queue.work()`. The queue is auto-created when the first job is sent via `queue.send()`, but workers are being registered during bootstrap BEFORE any jobs exist.

**Evidence supporting this hypothesis:**
1. Test files (`app/tests/queue/lifecycle.test.ts:28`, `app/tests/queue/workers/index-repo.test.ts:80`) explicitly call `queue.createQueue(QUEUE_NAMES.INDEX_REPO)` before sending jobs
2. Production startup sequence (app/src/index.ts:84-87) registers workers immediately after queue initialization with no explicit queue creation
3. GitHub webhook integration (`app/src/github/webhook-processor.ts:97`) uses `createIndexJob()` which only creates database records, NOT pg-boss jobs
4. Error occurs in production where no jobs have been sent yet (fresh Supabase database)
5. Local development works because tests pre-create queues or send test jobs during dev workflow

**Why it fails in Fly.io but not locally:**
- Local development via `dev-start.sh` may send test jobs or interact with queue differently
- Tests explicitly call `createQueue()` before worker registration (lines cited above)
- Fly.io deployment starts fresh with no pre-existing queue state or jobs

## Fix Strategy

**Primary approach: Explicit queue creation during bootstrap**
Add explicit queue creation step BEFORE worker registration in `app/src/index.ts`:

1. After `startQueue()` completes (line 76), call `queue.createQueue(QUEUE_NAMES.INDEX_REPO)`
2. Ensure queue creation happens before `startIndexWorker()` is called (line 87)
3. Add error handling for queue creation failures with descriptive logging

**Code change location:** `app/src/index.ts:84-93`

**Guardrails:**
- Validate queue creation via `queue.getQueue(QUEUE_NAMES.INDEX_REPO)` before worker registration
- Add startup logs to confirm queue creation success
- Ensure queue creation is idempotent (pg-boss handles duplicate createQueue calls gracefully)

## Relevant Files
- `app/src/index.ts` — Bootstrap logic where queue and workers are started (PRIMARY FIX LOCATION)
- `app/src/queue/workers/index-repo.ts` — Worker registration logic that fails when queue doesn't exist
- `app/src/queue/client.ts` — Queue lifecycle management (startQueue, stopQueue, getQueue)
- `app/src/queue/config.ts` — Queue name constants (QUEUE_NAMES.INDEX_REPO)

### New Files
None required (fix modifies existing bootstrap logic)

## Task Breakdown

### Verification
1. Review pg-boss v11 documentation for queue creation requirements and best practices
2. Confirm queue creation is idempotent (safe to call on already-existing queues)
3. Examine Fly.io logs to identify exact timing of error (confirm it's during worker registration, not job processing)
4. Validate that tests work because they explicitly create queues before sending jobs

### Implementation
1. Import QUEUE_NAMES constant in `app/src/index.ts` (if not already imported)
2. Add queue creation call after `startQueue()` and before `startIndexWorker()`
3. Add descriptive logging: `console.log(\`[timestamp] Created queue: ${QUEUE_NAMES.INDEX_REPO}\`)`
4. Add error handling for queue creation with context-specific error messages
5. Ensure queue creation happens within existing try-catch block (lines 75-82)

### Validation
1. **Local fresh database test**:
   - Stop Supabase Local and delete `pgboss` schema
   - Run `cd app && ./scripts/dev-start.sh`
   - Verify application starts without errors
   - Check logs for queue creation message
   - Send test job via `/index` endpoint or webhook
   - Verify worker processes job successfully

2. **Integration test updates**:
   - Review existing tests in `app/tests/queue/lifecycle.test.ts` and `app/tests/queue/workers/index-repo.test.ts`
   - Consider removing explicit `createQueue()` calls from tests (should be handled by bootstrap now)
   - Add test case: "should auto-create queue during bootstrap before worker registration"
   - Add test case: "should handle queue creation gracefully if queue already exists (idempotency)"

3. **Staging deployment validation**:
   - Deploy fix to Fly.io staging environment (`kotadb-staging`)
   - Monitor logs via `fly logs -a kotadb-staging` for 5 minutes
   - Confirm no restart loops occur
   - Verify logs show: "Job queue started successfully" → "Created queue: index-repo" → "Index-repo workers registered successfully"
   - Trigger test webhook or manual index job to confirm workers are processing

## Step by Step Tasks

### Phase 1: Investigate and Plan
- Review pg-boss v11 API documentation for `createQueue()` behavior and idempotency guarantees
- Examine Fly.io staging logs to confirm error timing and stack trace
- Verify local reproduction by starting fresh Supabase instance without pre-seeded jobs

### Phase 2: Implement Fix
- Add queue creation call in `app/src/index.ts` between `startQueue()` and `startIndexWorker()`
- Add logging to capture queue creation success
- Ensure error handling is consistent with existing bootstrap error patterns
- Update inline comments to document why explicit queue creation is needed

### Phase 3: Test Locally
- Start fresh Supabase Local instance (reset `pgboss` schema)
- Run `cd app && ./scripts/dev-start.sh` and verify clean startup
- Check logs for expected sequence: queue start → queue create → worker registration
- Send test indexing job and verify worker processes it

### Phase 4: Update Tests
- Review test files that call `createQueue()` explicitly
- Add integration test for queue bootstrap behavior
- Run full test suite: `cd app && bun test`
- Verify all queue tests pass with new bootstrap logic

### Phase 5: Deploy and Validate
- Commit changes with descriptive message (see Commit Message Validation section)
- Push branch: `git push -u origin bug/284-pg-boss-queue-initialization`
- Deploy to Fly.io staging via CI/CD pipeline
- Monitor Fly.io logs for 5 minutes to confirm stability
- Trigger test webhook to verify end-to-end flow (webhook → job creation → worker processing)

### Phase 6: Cleanup and Documentation
- Update `docs/testing-setup.md` if queue creation behavior affects test setup
- Add note in `app/src/queue/client.ts` documenting queue creation requirements
- Close issue with reference to PR and deployment verification results

## Regression Risks
- **pg-boss schema persistence**: If Supabase RLS or permissions block `pgboss` schema creation, queue creation may fail silently
  - Mitigation: Add explicit error logging for `createQueue()` failures
  - Follow-up: Add health check validation for queue existence in `/health` endpoint

- **Multiple queue names**: If additional queues are added in future (e.g., email processing), each must be explicitly created during bootstrap
  - Mitigation: Document queue creation requirement in `app/src/queue/config.ts` QUEUE_NAMES constant
  - Follow-up: Consider loop-based queue creation for all QUEUE_NAMES entries (if more than one queue is needed)

- **Worker registration ordering**: If queue creation fails but worker registration proceeds, same error will recur
  - Mitigation: Make queue creation a hard requirement (throw error if it fails)
  - Follow-up: Add startup validation that queries queue existence before proceeding

- **Test behavior changes**: Tests that explicitly call `createQueue()` may now have duplicate calls (bootstrap + test setup)
  - Mitigation: pg-boss `createQueue()` is idempotent, duplicate calls are safe
  - Follow-up: Remove redundant `createQueue()` calls from test files for clarity (optional cleanup)

## Validation Commands
- `cd app && bun run lint`
- `cd app && bunx tsc --noEmit`
- `cd app && bun test --filter queue`
- `cd app && bun test`
- `cd app && bun run build` (if build script exists)
- **Fly.io staging logs**: `fly logs -a kotadb-staging` (monitor for 5 minutes after deployment)
- **Health check**: `curl https://kotadb-staging.fly.dev/health` (verify 200 OK response)

## Commit Message Validation
All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(queue): create queue before worker registration` not `Looking at the changes, this commit fixes the queue initialization bug`

**Example valid commit messages:**
- `fix(queue): create index-repo queue before worker registration`
- `test(queue): add bootstrap queue creation integration test`
- `docs(queue): document queue creation requirements`

**Example invalid commit messages:**
- `fix: this commit adds queue creation to fix the Fly.io restart loop` (meta-commentary: "this commit")
- `fix: based on the error logs, I can see the queue needs to be created first` (meta-commentary: "based on", "I can see")
