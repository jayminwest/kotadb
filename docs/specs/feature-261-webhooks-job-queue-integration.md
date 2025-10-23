# Feature Plan: Integrate GitHub Webhooks with Job Queue for Auto-Indexing

## Metadata
- **Issue**: #261
- **Title**: feat: integrate webhooks with job queue for auto-indexing
- **Component**: Backend (API, Webhook Handler, Queue System)
- **Priority**: High (blocks auto-indexing workflow)
- **Effort**: Medium (1-3 days)
- **Status**: Blocked (dependencies resolved in #260, #12, #13)

## Overview

### Problem
The GitHub webhook receiver (#260) validates and parses push events but does not process them. The job queue system (#12) is ready to enqueue indexing jobs but has no trigger mechanism. Users must manually trigger indexing via API, preventing real-time code intelligence updates.

### Desired Outcome
Connect webhook receiver to job queue to enable automatic repository indexing on push events. When a user pushes to a tracked repository:
1. Webhook payload is validated via HMAC signature verification
2. Repository is looked up in database to verify tracking
3. Indexing job is queued via pg-boss with commit SHA and ref
4. Repository metadata is updated with last push timestamp
5. Duplicate jobs are prevented via deduplication logic

### Non-Goals
- Worker implementation (handled in #14, consumes queued jobs)
- Branch filtering beyond default branch (future enhancement)
- Installation event handling (repository tracking setup, future work)
- Webhook retry logic (GitHub handles retries automatically)
- Private repository authentication (workers use installation tokens from #259)

## Technical Approach

### Architecture Notes
This feature bridges two existing systems:
- **Webhook Handler** (`app/src/github/webhook-handler.ts`): Provides verified push event payloads via `parseWebhookPayload()`
- **Job Queue** (`app/src/queue/job-tracker.ts`): Provides `createIndexJob()` function for job creation

Integration point is the webhook route handler in `app/src/api/routes.ts` (line 101), which currently returns early with `{ received: true }`. We'll replace this stub with actual processing logic.

### Key Modules to Touch
- `app/src/api/routes.ts` - Webhook route handler (replace stub with processor call)
- `app/src/github/webhook-processor.ts` (NEW) - Push event to job queue bridge
- `app/src/github/types.ts` - Already has `GitHubPushEvent` type from #260
- `app/src/queue/job-tracker.ts` - `createIndexJob()` function (existing, no changes needed)
- `app/tests/api/webhooks.test.ts` - Extend with job queueing validation
- `app/src/db/migrations/010_add_installation_id_to_repositories.sql` - Verify `last_push_at` column exists

### Data/API Impacts

**Database Schema Requirements**:
- `repositories` table must have:
  - `full_name` column (TEXT) - for repository lookup (EXISTING, confirmed in migration 001)
  - `default_branch` column (TEXT) - for branch filtering (EXISTING, confirmed in migration 001)
  - `last_push_at` column (TIMESTAMPTZ) - for tracking webhook events (ADD if missing)
- `index_jobs` table must have:
  - `repository_id` column (UUID) - foreign key to repositories (EXISTING, migration 001)
  - `commit_sha` column (TEXT) - for deduplication (EXISTING, migration 006)
  - `status` column (TEXT) - for filtering pending jobs (EXISTING, migration 001)

**API Behavior**:
- POST /webhooks/github response unchanged (always 200 OK, even if job not queued)
- Response time target: <500ms (prevents GitHub retry timeouts)
- Logging: All push events logged with job queueing outcome

**Job Queue Impact**:
- New jobs enqueued with `queue_job_id` populated by pg-boss
- Job payload: `{ repositoryId: uuid, commitSha: string, ref: string }`
- Retry policy inherited from queue config (3 attempts, exponential backoff)

## Relevant Files

### Files to Read (Context)
- `app/src/api/routes.ts` - Webhook route handler with stub implementation
- `app/src/github/webhook-handler.ts` - Signature verification and payload parsing logic
- `app/src/github/types.ts` - `GitHubPushEvent` type definition
- `app/src/queue/job-tracker.ts` - `createIndexJob()` function signature and RLS handling
- `app/src/queue/client.ts` - pg-boss queue client and send options
- `app/src/db/migrations/001_initial_schema.sql` - Repositories and index_jobs table schema
- `app/src/db/migrations/006_add_job_tracking_columns.sql` - commit_sha and queue_job_id columns
- `app/tests/api/webhooks.test.ts` - Existing webhook integration tests

### Files to Modify
- `app/src/api/routes.ts` - Replace stub with `processPushEvent()` call
- `app/tests/api/webhooks.test.ts` - Add tests for job queueing, deduplication, branch filtering

### New Files
- `app/src/github/webhook-processor.ts` - Push event to job queue bridge logic
- `app/tests/github/webhook-processor.test.ts` - Unit tests for processor logic
- `app/src/db/migrations/011_add_last_push_at_to_repositories.sql` - Add `last_push_at` column (if migration needed)

## Task Breakdown

### Phase 1: Database Schema Verification
- Verify `repositories` table has `last_push_at` column (check migration 010)
- If missing, create migration 011 to add `last_push_at TIMESTAMPTZ` column
- Apply migration to test database and verify column exists
- Create composite index on `(repository_id, commit_sha, status)` for deduplication queries

### Phase 2: Webhook Processor Implementation
- Create `app/src/github/webhook-processor.ts` with `processPushEvent()` function
- Implement repository lookup by `full_name` using service client
- Implement branch filtering (only process default branch)
- Implement deduplication query (check for pending jobs with same commit SHA)
- Implement job creation via `createIndexJob()` with user context
- Implement repository metadata update (`last_push_at` timestamp)
- Add structured logging for all outcomes (queued, ignored, duplicate)
- Handle edge cases: untracked repos, non-default branches, duplicate pushes

### Phase 3: Integration with Webhook Handler
- Update `app/src/api/routes.ts` webhook handler (line 101)
- Replace stub response with `processPushEvent(payload)` call
- Ensure all processing happens asynchronously (don't block webhook response)
- Maintain 200 OK response for all valid webhooks (even if no job queued)
- Add error handling with fallback to 200 OK (prevents GitHub retries on transient errors)

### Phase 4: Testing
- Write unit tests for `webhook-processor.ts` (repository lookup, branch filtering, deduplication)
- Extend integration tests in `webhooks.test.ts` (end-to-end webhook → queue flow)
- Test deduplication logic (duplicate push events to same commit)
- Test branch filtering (push to non-default branch ignored)
- Test untracked repository handling (push to untracked repo ignored)
- Test repository metadata update (`last_push_at` timestamp)
- Test error scenarios (database failures, invalid payloads)
- Verify pg-boss job table contains correct payload structure

## Step by Step Tasks

### 1. Schema Verification and Migration
- Check if `repositories.last_push_at` column exists via psql or migration inspection
- If missing, create migration `011_add_last_push_at_to_repositories.sql`
- Add column: `ALTER TABLE repositories ADD COLUMN last_push_at TIMESTAMPTZ;`
- Copy migration to `app/supabase/migrations/` for sync compliance
- Run migration sync validation: `cd app && bun run test:validate-migrations`
- Apply migration to test database: verify via psql query
- Create composite index for deduplication: `CREATE INDEX idx_index_jobs_dedup ON index_jobs(repository_id, commit_sha, status) WHERE status = 'pending';`

### 2. Implement Webhook Processor Core Logic
- Create `app/src/github/webhook-processor.ts` file
- Import dependencies: `getServiceClient`, `createIndexJob`, `GitHubPushEvent`
- Implement `processPushEvent(payload: GitHubPushEvent): Promise<void>` function
- Extract repository metadata: `full_name`, `default_branch`, `ref`, `after` (commit SHA)
- Strip `refs/heads/` prefix from ref to get branch name
- Query repositories table by `full_name`: `supabase.from('repositories').select('*').eq('full_name', fullName).single()`
- Return early with log if repository not found (untracked repository)
- Return early with log if branch !== default_branch (branch filtering)
- Query index_jobs for existing pending job: `eq('repository_id', repo.id).eq('commit_sha', commitSha).eq('status', 'pending').single()`
- Return early with log if existing job found (deduplication)
- Determine userId from repository ownership (`repo.user_id` or first user in org)
- Call `createIndexJob(repo.id, ref, commitSha, userId)` to queue job
- Update repository: `supabase.from('repositories').update({ last_push_at: new Date().toISOString() }).eq('id', repo.id)`
- Log successful job queueing with repository and commit information
- Wrap all logic in try/catch to prevent webhook failures from blocking response

### 3. Integrate Processor with Webhook Handler
- Open `app/src/api/routes.ts` and locate webhook handler (line 50-108)
- Import `processPushEvent` from `@github/webhook-processor`
- Replace stub response (line 101-102) with processor call:
  ```typescript
  // Process push event asynchronously (don't block webhook response)
  if (payload) {
    processPushEvent(payload).catch((error) => {
      console.error("[Webhook] Processing error:", error);
    });
  }
  ```
- Keep 200 OK response for all webhooks (line 102) to prevent GitHub retries
- Ensure error handling doesn't change HTTP status (always return 200 for valid signatures)

### 4. User Context Resolution for Job Creation
- Webhook payloads don't include KotaDB user context (only GitHub sender)
- Repository ownership determines user context for RLS enforcement
- For user-owned repos: use `repository.user_id` directly
- For org-owned repos: query `user_organizations` table for first member
- If no user found, log warning and skip job creation (repository orphaned)
- Add helper function `resolveUserIdForRepository(repo: Repository): Promise<string | null>` to processor

### 5. Write Unit Tests for Webhook Processor
- Create `app/tests/github/webhook-processor.test.ts`
- Set up test fixtures: create test user, organization, repositories
- Test case: push to tracked repository queues job
- Test case: push to untracked repository is ignored (no job created)
- Test case: push to non-default branch is ignored
- Test case: duplicate push events create single job (deduplication)
- Test case: repository `last_push_at` updated after job queueing
- Test case: user context resolved correctly for user-owned repos
- Test case: user context resolved correctly for org-owned repos
- Test case: processing errors don't throw (graceful error handling)
- Use real Supabase Local database (antimocking compliance)

### 6. Extend Integration Tests for Webhook Endpoint
- Open `app/tests/api/webhooks.test.ts`
- Add test case: valid push event creates job in index_jobs table
- Add test case: push to untracked repo returns 200 but creates no job
- Add test case: push to non-default branch creates no job
- Add test case: duplicate push events create single job
- Add test case: verify pg-boss job payload structure
- Add test case: verify repository `last_push_at` timestamp updated
- Query pg-boss tables directly via psql to verify job creation
- Use `sendWebhookRequest()` helper from existing tests for consistency

### 7. Validate and Test End-to-End Flow
- Start Supabase Local: `cd app && ./scripts/setup-test-db.sh`
- Start job queue: ensure pg-boss schema created
- Seed test data: user, repository, API key
- Send webhook request via curl with valid signature
- Verify job created in `index_jobs` table via psql
- Verify job created in `pgboss.job` table via psql
- Verify repository `last_push_at` updated
- Verify logs show job queueing outcome
- Test deduplication: send duplicate webhook, verify single job
- Test branch filtering: send push to feature branch, verify no job

### 8. Run Full Validation Suite
- Run type-check: `cd app && bunx tsc --noEmit`
- Run linter: `cd app && bun run lint`
- Run all tests: `cd app && bun test`
- Run migration sync validation: `cd app && bun run test:validate-migrations`
- Fix any type errors, lint violations, or test failures
- Verify test coverage includes new processor logic

### 9. Push Branch and Create PR
- Stage all changes: `git add app/src/github/webhook-processor.ts app/src/api/routes.ts app/tests/`
- Commit with conventional format: `git commit -m "feat: integrate webhooks with job queue for auto-indexing (#261)"`
- Push branch: `git push -u origin interactive-261-integrate-webhooks-job-queue`
- Create PR via gh CLI: `gh pr create --title "feat: integrate webhooks with job queue for auto-indexing (#261)" --body "Closes #261"`
- Verify CI passes (type-check, lint, tests)
- Request review and merge after approval

## Risks & Mitigations

### Risk: User Context Resolution for Org Repos
**Impact**: Org-owned repositories require user context for RLS, but webhook doesn't provide KotaDB user identity
**Mitigation**: Query `user_organizations` table to find first member with access, fallback to org owner if needed. Log warning if no user found and skip job creation (prevents RLS violations).

### Risk: Race Conditions in Deduplication
**Impact**: Concurrent pushes to same commit could create duplicate jobs if queries interleave
**Mitigation**: Use `UNIQUE (repository_id, commit_sha, status)` constraint on `index_jobs` table (requires migration). Catch unique constraint violations and treat as successful deduplication.

### Risk: Webhook Timeout from Slow Queries
**Impact**: Repository lookup and deduplication queries could exceed 500ms, triggering GitHub retries
**Mitigation**: Add composite index on `(repository_id, commit_sha, status)` for fast deduplication. Consider moving all processing to background task if response time exceeds 500ms in production.

### Risk: Missing `last_push_at` Column
**Impact**: Migration 010 may not include `last_push_at` column, requiring schema change
**Mitigation**: Verify schema during Phase 1, create migration 011 if needed. Ensure migration sync validation passes before implementation.

### Risk: pg-boss Job Payload Mismatch
**Impact**: Worker implementation (#14) may expect different job payload structure
**Mitigation**: Review worker spec before finalizing payload format. Ensure payload matches `IndexRepoJobPayload` type from `@queue/types`. Add integration test to verify pg-boss job structure.

### Risk: Orphaned Repositories (No User Context)
**Impact**: Repositories created during installation event may not have user associations yet
**Mitigation**: Skip job creation for orphaned repositories with warning log. Installation event handler (#262, future work) will backfill user associations and trigger initial index.

## Validation Strategy

### Automated Tests
**Unit Tests** (`app/tests/github/webhook-processor.test.ts`):
- Repository lookup by `full_name` (tracked vs untracked)
- Branch filtering logic (default vs non-default)
- Deduplication query (pending jobs with same commit SHA)
- User context resolution (user-owned vs org-owned repos)
- Repository metadata update (`last_push_at` timestamp)
- Error handling (database failures, missing data)

**Integration Tests** (`app/tests/api/webhooks.test.ts`):
- End-to-end webhook → queue flow (POST /webhooks/github → job created)
- Deduplication across multiple webhook deliveries
- Branch filtering (feature branch push ignored)
- Untracked repository handling (200 OK, no job)
- pg-boss job payload structure validation
- Repository `last_push_at` timestamp verification

**Database Tests**:
- Query `index_jobs` table after webhook delivery (verify job created)
- Query `pgboss.job` table after webhook delivery (verify pg-boss job)
- Verify composite index performance (deduplication query <10ms)
- Verify RLS policies allow job creation with correct user context

### Manual Checks
**Test Data Setup**:
1. Create test user via Supabase Auth
2. Create test repository in `repositories` table (`full_name = "testuser/testrepo"`)
3. Generate API key for user (for future authenticated testing)
4. Configure `GITHUB_WEBHOOK_SECRET` environment variable

**Webhook Delivery Simulation**:
1. Generate valid HMAC signature for test payload
2. Send POST to /webhooks/github with push event payload
3. Verify 200 OK response (regardless of job queueing outcome)
4. Query `index_jobs` table: expect 1 job with `status='pending'`, `commit_sha='<sha>'`
5. Query `pgboss.job` table: expect 1 job with `name='index-repo'`, payload matching `IndexRepoJobPayload`
6. Query `repositories` table: expect `last_push_at` updated to recent timestamp
7. Send duplicate webhook: verify no new job created (deduplication)
8. Send webhook for feature branch: verify no job created (branch filtering)
9. Send webhook for untracked repo: verify 200 OK response, no job created

**Failure Scenarios**:
1. Database unavailable: verify 200 OK response with error log (prevents GitHub retries)
2. Invalid payload structure: verify 200 OK response with error log
3. Missing user context: verify 200 OK response with warning log, no job created
4. pg-boss queue down: verify error logged but webhook returns 200 OK

### Release Guardrails
**Monitoring**:
- Track webhook processing time via logs (alert if >500ms p99)
- Track job queue depth (alert if >1000 pending jobs)
- Track deduplication rate (expect 0-5% for normal workflows)
- Track repository lookup failures (alert if >1% failure rate)

**Alerting**:
- Create Sentry alert for webhook processing errors (threshold: 10 errors/hour)
- Create database alert for slow deduplication queries (>100ms)
- Create pg-boss alert for queue depth growth (>10% per hour)

**Rollback Plan**:
- Revert to stub webhook handler if job creation rate exceeds queue capacity
- Disable webhook processing via feature flag if database errors spike
- Pause GitHub webhook delivery if response time exceeds 5 seconds (GitHub timeout)

**Staged Rollout**:
1. Deploy to staging environment, send test webhooks
2. Verify job queueing in staging pg-boss instance
3. Monitor error rates and response times for 24 hours
4. Deploy to production with webhook processing disabled (feature flag)
5. Enable webhook processing for 10% of repositories (canary release)
6. Monitor job queue depth and error rates for 24 hours
7. Gradually increase to 100% over 3 days

## Validation Commands

**Level 2 (Feature Minimum)**:
```bash
bun run lint                      # ESLint validation
bunx tsc --noEmit                # TypeScript type-checking
bun test --filter integration    # Integration tests only
bun test                          # Full test suite
bun run test:validate-migrations # Migration sync check
```

**Domain-Specific Validation**:
```bash
# Verify pg-boss schema creation
psql $SUPABASE_DB_URL -c "SELECT tablename FROM pg_tables WHERE schemaname = 'pgboss';"

# Verify index_jobs table structure
psql $SUPABASE_DB_URL -c "\d index_jobs"

# Verify composite index exists
psql $SUPABASE_DB_URL -c "\di index_jobs*"

# Test webhook delivery (requires running server)
curl -X POST http://localhost:3000/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-GitHub-Delivery: test-123" \
  -H "X-Hub-Signature-256: sha256=<signature>" \
  -d @tests/fixtures/github/push-event.json

# Verify job created in database
psql $SUPABASE_DB_URL -c "SELECT * FROM index_jobs ORDER BY created_at DESC LIMIT 1;"

# Verify pg-boss job created
psql $SUPABASE_DB_URL -c "SELECT * FROM pgboss.job ORDER BY createdon DESC LIMIT 1;"
```

## Issue Relationships

### Child Of
- Issue #257: Epic 5 - GitHub App Integration (MVP Blocker)

### Depends On (All Closed)
- Issue #260: Webhook receiver with verification ✓ (provides verified webhook payloads)
- Issue #12: Implement job queue client with pg-boss ✓ (provides queue infrastructure)
- Issue #13: Database schema for tracking index jobs ✓ (provides job tracking tables)

### Enables
- Automatic indexing on push events (core KotaDB workflow)
- Real-time code intelligence updates for tracked repositories
- GitHub App installation value proposition (set-and-forget indexing)

### Related To
- Issue #259: GitHub App token generation (workers use tokens to clone private repos)
- Issue #14: Worker implementation (workers consume queued jobs from this integration)
- Issue #262: Installation event handler (future work, tracks repositories on installation)

### Follow-Up
- Issue #262: Handle installation events for repository tracking (enables tracking new repos)
- Issue #14: Implement worker to consume queued jobs (completes auto-indexing workflow)
- Multi-branch tracking configuration (allow indexing non-default branches)
- Webhook event filtering (ignore force pushes, deleted branches based on user preferences)
