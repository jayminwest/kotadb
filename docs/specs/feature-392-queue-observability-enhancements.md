# Feature Plan: Queue Observability and Management Enhancements

**Issue**: #392
**Title**: feat: add queue observability and management enhancements (5% remaining from Epic 4)
**Labels**: component:backend, component:api, component:observability, priority:medium, effort:small, status:needs-investigation

## Overview

**Problem**:
The pg-boss job queue implementation is ~95% complete and fully operational, with async job processing, retry logic, and comprehensive integration tests. However, operational visibility is limited - there's no way to monitor queue depth, view retry counts, manage failed jobs, or inspect queue metrics without direct database access. This makes troubleshooting production issues and monitoring queue health difficult for operators.

**Desired Outcome**:
Enhance queue observability and management capabilities by:
1. Exposing queue metrics in `/health` endpoint (depth, workers, failed jobs, oldest pending age)
2. Adding retry count tracking to job status API (current attempt, max retries)
3. Providing admin endpoints for failed job management (list failed jobs, retry specific jobs)
4. Optimizing webhook → queue flow to use direct `queue.send()` calls (reduce latency)

These improvements are non-blocking polish items that enhance monitoring and troubleshooting capabilities without changing core functionality.

**Non-Goals**:
- Web dashboard implementation (tracked separately in #339)
- Advanced queue analytics or visualizations
- Real-time queue monitoring (WebSocket/SSE)
- Multi-queue support (only index-repo queue exists)
- Queue pausing/resuming functionality
- Bulk job retry operations (single job retry only)

## Technical Approach

**Architecture Notes**:
pg-boss provides built-in methods for queue introspection (`getQueueSize()`, `fetch()`, `retry()`). We'll expose these through existing API routes:
- `/health` endpoint: Add queue metrics object with pg-boss stats
- `/jobs/:jobId` endpoint: Add retry_count field to response
- `/admin/jobs/*` endpoints: New admin-only routes for failed job management

Admin authentication will use service role key validation (similar to MCP server auth). Direct webhook → queue integration bypasses intermediate `createIndexJob()` call to reduce latency from ~200ms to <50ms.

**Key Modules to Touch**:
- `app/src/api/routes.ts` - Add queue metrics to /health, create /admin/jobs/* endpoints
- `app/src/queue/job-tracker.ts` - Add retry count tracking logic
- `app/src/auth/middleware.ts` - Add admin authentication helper (requireAdmin)
- `app/src/github/webhook-processor.ts` - Direct queue.send() integration
- `app/src/db/migrations/` - Add retry_count column to index_jobs table

**Data/API Impacts**:
- Database schema: Add `retry_count` column to `index_jobs` table (integer, default 0)
- API response changes:
  - GET /health: Add `queue` object with metrics
  - GET /jobs/:jobId: Add `retry_count` and `max_retries` fields
  - New endpoints: GET /admin/jobs/failed, POST /admin/jobs/:jobId/retry
- Performance: Webhook latency improves by ~150ms (direct queue.send())

## Relevant Files

### Existing Files to Modify
- `app/src/api/routes.ts` - Add queue metrics to /health, create admin endpoints (line 56 for /health)
- `app/src/queue/job-tracker.ts` - Add retry count increment logic in updateJobStatus()
- `app/src/github/webhook-processor.ts` - Replace createIndexJob() with direct queue.send() call
- `app/src/auth/middleware.ts` - Add requireAdmin() middleware function

### New Files
- `app/src/db/migrations/012_add_retry_count_to_index_jobs.sql` - Add retry_count column
- `app/tests/api/admin-jobs.test.ts` - Integration tests for admin endpoints
- `app/tests/api/health.test.ts` - Integration tests for queue metrics in /health
- `app/tests/queue/retry-tracking.test.ts` - Integration tests for retry count tracking

## Task Breakdown

### Phase 1: Schema Changes and Retry Count Tracking
- Create migration to add retry_count column to index_jobs table
- Sync migration to supabase/migrations/ directory
- Update job-tracker updateJobStatus() to increment retry_count on retries
- Add retry_count and max_retries fields to job status API response
- Write integration tests for retry count tracking

### Phase 2: Queue Metrics in Health Endpoint
- Add pg-boss queue metrics to /health endpoint response
- Query queue depth (pending jobs), worker count, failed job count
- Calculate oldest pending job age from pg-boss archive
- Write integration tests for /health endpoint queue metrics
- Document expected response format in OpenAPI spec

### Phase 3: Admin Endpoints for Failed Job Management
- Create requireAdmin() middleware for service role authentication
- Implement GET /admin/jobs/failed endpoint (query pg-boss archive)
- Implement POST /admin/jobs/:jobId/retry endpoint (pg-boss retry)
- Add error handling for invalid job IDs and unauthorized access
- Write integration tests for admin endpoints with auth validation

### Phase 4: Direct Webhook → Queue Integration
- Update webhook-processor to call queue.send() directly
- Remove intermediate createIndexJob() call (defer to worker)
- Add integration test for webhook → queue flow timing
- Verify job record is created by worker (not webhook handler)
- Document latency improvement in PR description

## Step by Step Tasks

### Database Schema Migration
- Generate migration timestamp: `date -u +%Y%m%d%H%M%S` → `20251107214500`
- Create `app/src/db/migrations/012_add_retry_count_to_index_jobs.sql` with:
  ```sql
  -- Add retry_count column to index_jobs table for observability
  ALTER TABLE index_jobs ADD COLUMN retry_count integer DEFAULT 0 NOT NULL;

  -- Add comment for documentation
  COMMENT ON COLUMN index_jobs.retry_count IS 'Number of retry attempts for this job (incremented by pg-boss on retry)';
  ```
- Copy migration to `app/supabase/migrations/012_add_retry_count_to_index_jobs.sql`
- Run migration sync validation: `cd app && bun run test:validate-migrations`
- Apply migration to test database: verify column exists via psql

### Retry Count Tracking in Job Tracker
- Open `app/src/queue/job-tracker.ts` and locate `updateJobStatus()` function (line 65)
- Add retry count increment logic when status transitions to "processing" after "failed":
  ```typescript
  // Increment retry count when reprocessing a failed job
  const { data: currentJob } = await client
    .from("index_jobs")
    .select("status, retry_count")
    .eq("id", jobId)
    .single();

  if (currentJob?.status === "failed" && status === "processing") {
    updates.retry_count = (currentJob.retry_count || 0) + 1;
  }
  ```
- Update `getJobStatus()` return type to include retry_count and max_retries fields
- Add `max_retries: RETRY_LIMIT` to response object (line 187)

### Queue Metrics in Health Endpoint
- Open `app/src/api/routes.ts` and locate /health endpoint (line 56)
- Import queue functions: `import { getQueue } from "@queue/client"; import { QUEUE_NAMES, RETRY_LIMIT } from "@queue/config";`
- Update /health handler to query pg-boss metrics:
  ```typescript
  app.get("/health", async (req: Request, res: Response) => {
    const queue = getQueue();

    // Query pg-boss for queue metrics
    const [pendingCount, failedJobs] = await Promise.all([
      queue.getQueueSize(QUEUE_NAMES.INDEX_REPO, { state: 'created' }),
      queue.fetch(QUEUE_NAMES.INDEX_REPO, 100, { includeArchive: true })
    ]);

    // Calculate failed jobs in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentFailed = failedJobs.filter(j =>
      j.state === 'failed' && new Date(j.completedon) > twentyFourHoursAgo
    ).length;

    // Calculate oldest pending job age
    const oldestPending = await queue.fetch(QUEUE_NAMES.INDEX_REPO, 1, {
      state: 'created'
    });
    const oldestAge = oldestPending[0]
      ? Math.floor((Date.now() - new Date(oldestPending[0].createdon).getTime()) / 1000)
      : 0;

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      queue: {
        depth: pendingCount,
        workers: 3, // WORKER_TEAM_SIZE from config
        failed_24h: recentFailed,
        oldest_pending_age_seconds: oldestAge
      }
    });
  });
  ```
- Add error handling for queue not started (return queue: null)

### Admin Authentication Middleware
- Open `app/src/auth/middleware.ts` and add `requireAdmin()` function:
  ```typescript
  /**
   * Require service role key for admin operations
   * Validates Authorization header against SUPABASE_SERVICE_ROLE_KEY
   */
  export async function requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.get("authorization");
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!authHeader || !expectedKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const token = authHeader.replace(/^Bearer /, "");
    if (token !== expectedKey) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  }
  ```

### Admin Endpoint: List Failed Jobs
- Open `app/src/api/routes.ts` and add admin endpoint after /health:
  ```typescript
  app.get("/admin/jobs/failed", requireAdmin, async (req: Request, res: Response) => {
    const queue = getQueue();
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Fetch failed jobs from pg-boss archive
    const jobs = await queue.fetch(QUEUE_NAMES.INDEX_REPO, limit + offset, {
      includeArchive: true
    });

    // Filter to failed jobs only and apply offset
    const failedJobs = jobs
      .filter(j => j.state === 'failed')
      .slice(offset, offset + limit)
      .map(j => ({
        id: j.id,
        repository_id: j.data.repositoryId,
        commit_sha: j.data.commitSha,
        ref: j.data.ref,
        error: j.output?.error || "Unknown error",
        failed_at: j.completedon,
        retry_count: j.retrycount || 0
      }));

    res.json({
      jobs: failedJobs,
      limit,
      offset,
      total: jobs.filter(j => j.state === 'failed').length
    });
  });
  ```

### Admin Endpoint: Retry Failed Job
- Add retry endpoint after list failed jobs:
  ```typescript
  app.post("/admin/jobs/:jobId/retry", requireAdmin, async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const queue = getQueue();

    try {
      // Retry job via pg-boss (moves from archive back to active queue)
      await queue.retry(jobId);

      res.json({
        message: "Job requeued for retry",
        job_id: jobId
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("not found")) {
        res.status(404).json({ error: "Job not found or not eligible for retry" });
      } else {
        res.status(500).json({ error: `Retry failed: ${errorMessage}` });
      }
    }
  });
  ```

### Direct Webhook → Queue Integration (DEFERRED)
- **DECISION**: Defer this optimization to avoid disrupting working webhook flow
- Current flow (webhook → createIndexJob → worker polls) works reliably
- Direct queue.send() requires refactoring worker to create job records
- Latency improvement (~150ms) not critical for webhook response times
- Keep this as follow-up work after observability features are validated
- Remove acceptance criteria #4 from issue scope (comment on issue)

### Integration Tests: Health Endpoint Queue Metrics
- Create `app/tests/api/health.test.ts`:
  ```typescript
  describe("Health Endpoint Queue Metrics", () => {
    test("returns queue metrics when queue is running", async () => {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();

      expect(data.queue).toBeDefined();
      expect(data.queue.depth).toBeGreaterThanOrEqual(0);
      expect(data.queue.workers).toBe(3);
      expect(data.queue.failed_24h).toBeGreaterThanOrEqual(0);
      expect(data.queue.oldest_pending_age_seconds).toBeGreaterThanOrEqual(0);
    });

    test("calculates oldest pending job age correctly", async () => {
      // Create test job
      const job = await createTestJob({ status: "pending" });
      await sleep(2000); // Wait 2 seconds

      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();

      expect(data.queue.oldest_pending_age_seconds).toBeGreaterThanOrEqual(2);
    });
  });
  ```

### Integration Tests: Retry Count Tracking
- Create `app/tests/queue/retry-tracking.test.ts`:
  ```typescript
  describe("Retry Count Tracking", () => {
    test("retry_count increments on job retry", async () => {
      const job = await createTestJob({ status: "pending" });

      // Transition to failed
      await updateJobStatus(job.id, "failed", { error: "Test error" });

      // Retry job (transitions back to processing)
      await updateJobStatus(job.id, "processing", undefined);

      const updatedJob = await getJobStatus(job.id);
      expect(updatedJob.retry_count).toBe(1);
    });

    test("job status API includes retry_count and max_retries", async () => {
      const job = await createTestJob({ status: "pending", retry_count: 2 });

      const response = await fetch(`${API_URL}/jobs/${job.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      const data = await response.json();

      expect(data.retry_count).toBe(2);
      expect(data.max_retries).toBe(3);
    });
  });
  ```

### Integration Tests: Admin Endpoints
- Create `app/tests/api/admin-jobs.test.ts`:
  ```typescript
  describe("Admin Jobs Endpoints", () => {
    test("GET /admin/jobs/failed requires service role key", async () => {
      const response = await fetch(`${API_URL}/admin/jobs/failed`);
      expect(response.status).toBe(401);

      const authedResponse = await fetch(`${API_URL}/admin/jobs/failed`, {
        headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
      });
      expect(authedResponse.status).toBe(200);
    });

    test("GET /admin/jobs/failed returns failed jobs", async () => {
      // Create failed job
      const job = await createTestJob({ status: "failed" });

      const response = await fetch(`${API_URL}/admin/jobs/failed`, {
        headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
      });
      const data = await response.json();

      expect(data.jobs).toBeInstanceOf(Array);
      expect(data.jobs.some(j => j.id === job.id)).toBe(true);
    });

    test("POST /admin/jobs/:jobId/retry requeues failed job", async () => {
      const job = await createTestJob({ status: "failed" });

      const response = await fetch(`${API_URL}/admin/jobs/${job.id}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
      });
      expect(response.status).toBe(200);

      // Verify job moved back to queue
      const queue = getQueue();
      const activeJobs = await queue.fetch(QUEUE_NAMES.INDEX_REPO, 100);
      expect(activeJobs.some(j => j.id === job.id)).toBe(true);
    });

    test("POST /admin/jobs/:jobId/retry returns 404 for non-existent job", async () => {
      const response = await fetch(`${API_URL}/admin/jobs/invalid-id/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
      });
      expect(response.status).toBe(404);
    });
  });
  ```

### Validation and Git Operations
- Run type-check: `cd app && bunx tsc --noEmit`
- Run linter: `cd app && bun run lint`
- Run integration tests: `cd app && bun test --filter queue`
- Run full test suite: `cd app && bun test`
- Run migration sync validation: `cd app && bun run test:validate-migrations`
- Verify all tests pass with no errors
- Stage all changes: `git add app/src/ app/tests/ app/supabase/ docs/specs/`
- Commit: `git commit -m "feat: add queue observability and management enhancements (#392)"`
- Push branch: `git push -u origin feat/392-queue-observability-enhancements`

## Risks & Mitigations

**Risk: pg-boss fetch() performance with large archives**
- Impact: Querying failed jobs could be slow if archive contains 10,000+ jobs
- Mitigation: Add limit parameter to admin endpoints (default 50, max 100)
- Mitigation: Consider pg-boss archival configuration (auto-delete jobs older than 7 days)
- Mitigation: Monitor query performance in production, add pagination if needed

**Risk: Service role key exposure in admin endpoints**
- Impact: Service role key grants full database access, must be protected
- Mitigation: Require explicit Authorization header (no cookie-based auth)
- Mitigation: Document key rotation procedures in deployment guide
- Mitigation: Consider adding IP allowlist for admin endpoints in production

**Risk: Retry count drift between pg-boss and index_jobs table**
- Impact: pg-boss tracks retries internally, our retry_count may not match
- Mitigation: Increment retry_count in updateJobStatus() during worker processing
- Mitigation: Document that retry_count tracks application-level retries (not pg-boss internal)
- Mitigation: Add integration test to verify retry_count accuracy across failure cycles

**Risk: Health endpoint performance with queue metrics queries**
- Impact: Multiple pg-boss queries could slow /health endpoint to >500ms
- Mitigation: Run pg-boss queries in parallel using Promise.all()
- Mitigation: Add timeout to queue queries (fallback to queue: null on timeout)
- Mitigation: Cache queue metrics for 10 seconds to reduce query frequency

**Risk: Direct webhook → queue optimization breaks job tracking**
- Impact: Removing createIndexJob() call means worker must create job records
- Mitigation: DEFER this optimization to separate issue (not in this PR scope)
- Mitigation: Current flow works reliably, no need to refactor for ~150ms gain
- Mitigation: Comment on issue #392 to update acceptance criteria

## Validation Strategy

**Automated Tests (Integration/E2E hitting Supabase per /anti-mock)**:
- Health endpoint returns queue metrics object with depth, workers, failed_24h, oldest_pending_age_seconds
- Job status API includes retry_count and max_retries fields
- Retry count increments correctly when job transitions from failed → processing
- Admin endpoints require service role key authentication (401 without auth)
- GET /admin/jobs/failed returns failed jobs from pg-boss archive
- POST /admin/jobs/:jobId/retry requeues failed job successfully
- Pagination works correctly for admin endpoints (limit, offset parameters)
- All tests use real Supabase Local and pg-boss instances (no mocks)

**Manual Checks (Document Data Seeded and Failure Scenarios)**:
- Start development server: `cd app && ./scripts/dev-start.sh`
- Query /health endpoint: `curl http://localhost:3000/health | jq .queue`
- Verify queue metrics present: depth, workers, failed_24h, oldest_pending_age_seconds
- Create test job via API: `POST /index` with valid repository
- Query job status: `GET /jobs/:jobId` - verify retry_count and max_retries fields
- Simulate job failure: manually update job status to "failed" in database
- Query failed jobs: `curl -H "Authorization: Bearer $SERVICE_ROLE_KEY" http://localhost:3000/admin/jobs/failed`
- Retry failed job: `curl -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" http://localhost:3000/admin/jobs/:jobId/retry`
- Verify job requeued: check pg-boss.job table for active job
- Test unauthorized access: `curl http://localhost:3000/admin/jobs/failed` - expect 401

**Failure Scenario Testing**:
- Queue not started: /health returns queue: null (no crash)
- Invalid service role key: admin endpoints return 403 Forbidden
- Non-existent job ID: retry endpoint returns 404 Not Found
- pg-boss archive empty: GET /admin/jobs/failed returns empty array
- Database connection lost: health endpoint returns 500 with error log

**Release Guardrails (Monitoring, Alerting, Rollback)**:
- Monitor /health response time (alert if >1s p99)
- Monitor admin endpoint usage frequency (unexpected spikes indicate issue)
- Monitor retry_count distribution (alert if >50% jobs require 2+ retries)
- Monitor queue depth growth rate (alert if depth increases >100/hour)
- Rollback: Revert API changes only (no database schema rollback needed)

## Validation Commands

The following commands must pass before merging:

```bash
# Lint check (code style)
cd app && bun run lint

# Type check (TypeScript compilation)
cd app && bunx tsc --noEmit

# Integration tests (real Supabase Local)
cd app && bun test --filter integration

# Full test suite (all integration tests)
cd app && bun test

# Migration sync validation
cd app && bun run test:validate-migrations

# Build validation (ensure no compilation errors)
cd app && bun run build
```

**Domain-Specific Checks**:
```bash
# Verify migration sync
cd app && bun run test:validate-migrations

# Verify retry_count column exists
psql $SUPABASE_DB_URL -c "\d index_jobs" | grep retry_count

# Test health endpoint queue metrics
curl http://localhost:3000/health | jq .queue

# Test admin endpoints (requires running server)
curl -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  http://localhost:3000/admin/jobs/failed | jq .

# Verify pg-boss archive structure
psql $SUPABASE_DB_URL -c "SELECT COUNT(*) FROM pgboss.archive WHERE state='failed';"
```

## Issue Relationships

**Child Of**:
- #234 - Epic 4: Job Queue & Background Processing (~95% complete, this is final 5%)

**Depends On (All Closed)**:
- #235 - pg-boss queue infrastructure (provides queue client and config)
- #236 - Job status tracking API (provides GET /jobs/:jobId endpoint to extend)
- #237 - Worker implementation (provides retry mechanism to track)

**Related To**:
- #339 - Web dashboard for queue monitoring (would consume these API metrics)
- #355 - MVP launch checklist (these are post-MVP polish items)
- #261 - Webhook integration (direct queue.send() optimization applies here)

**Blocks**:
- None (these are observability enhancements, not blocking features)

**Follow-Up**:
- Direct webhook → queue optimization (deferred from this issue scope)
- Queue monitoring dashboard (#339)
- Alerting configuration for queue depth and failure rates
- Admin UI for bulk job retry and dead letter queue management
