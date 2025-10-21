# Feature Plan: Job Status Tracking in index_jobs Table

## Overview

**Problem:**
Current indexing flow runs synchronously in queueMicrotask, making job status invisible until completion. The /index endpoint returns immediately with a runId but provides no mechanism for tracking progress or detecting failures. Users cannot poll for job status, and the frontend has no visibility into whether indexing is still running, completed successfully, or failed.

**Desired Outcome:**
Implement job status tracking layer that maintains source of truth in index_jobs table, bridging pg-boss queue operations (once #235 lands) with user-facing job status. Enable frontend polling via GET /jobs/:jobId endpoint for real-time status updates (pending → processing → completed/failed) with timestamps and error messages.

**Non-Goals:**
- Implementing pg-boss queue infrastructure (that's #235, prerequisite work)
- Building the indexing worker (that's #237, blocked by this issue)
- Adding WebSocket or SSE streaming for real-time updates (future enhancement)
- Implementing job cancellation or pause/resume functionality
- Creating admin dashboard for job monitoring (separate UI work)

## Technical Approach

**Architecture:**
This feature creates a thin data access layer (app/src/queue/job-tracker.ts) that wraps index_jobs table operations. The layer provides three core functions: createIndexJob() to initialize pending jobs, updateJobStatus() to transition state with timestamps, and getJobStatus() to query current state. This bridges the gap between pg-boss queue internals and user-facing API contracts.

**Key Modules:**
- app/src/queue/job-tracker.ts: New module with job lifecycle functions (createIndexJob, updateJobStatus, getJobStatus)
- app/src/queue/types.ts: New module with TypeScript types for job payloads and status enums
- app/src/api/routes.ts: Update POST /index to return jobId immediately, add GET /jobs/:jobId for status polling
- app/src/api/queries.ts: Refactor recordIndexRun() to use job-tracker functions (maintain backward compatibility)
- shared/types/entities.ts: Update IndexJob interface to include queue_job_id and commit_sha fields

**Data/API Impacts:**
- Database: index_jobs table already exists (001_initial_schema.sql:245) with required columns (id, repository_id, ref, status, started_at, completed_at, error_message, stats)
- Schema update: Add queue_job_id column to index_jobs table for pg-boss correlation (nullable until #235 integration)
- Schema update: Add commit_sha column to index_jobs table for job context tracking
- API contract: POST /index response changes from {runId} to {jobId, status: 'pending'}
- API contract: New GET /jobs/:jobId endpoint returns {id, status, started_at, completed_at, error_message, stats}
- Rate limiting: GET /jobs/:jobId requires authentication, consumes user's hourly quota
- RLS policies: index_jobs policies already enforce user-scoped access (001_initial_schema.sql:263)

## Relevant Files

### Existing Files (To Modify)
- app/src/db/migrations/001_initial_schema.sql — Defines index_jobs table schema (line 245), need to add queue_job_id and commit_sha columns
- app/supabase/migrations/001_initial_schema.sql — Mirror of src/db/migrations for Supabase CLI (must keep in sync per CLAUDE.md migration sync requirement)
- app/src/api/routes.ts — Current POST /index implementation (line 108), need to integrate job-tracker and add GET /jobs/:jobId
- app/src/api/queries.ts — Current recordIndexRun() function (line 21), need to refactor to use createIndexJob()
- shared/types/entities.ts — IndexJob interface (line 78), need to add queue_job_id and commit_sha fields
- shared/types/api.ts — IndexResponse type needs jobId field instead of runId

### New Files (To Create)
- app/src/queue/job-tracker.ts — Core job tracking functions (createIndexJob, updateJobStatus, getJobStatus)
- app/src/queue/types.ts — TypeScript types for job payloads (IndexRepoJobPayload) and status enums
- app/tests/queue/job-tracker.test.ts — Integration tests for job tracking functions (real Supabase Local)
- app/tests/api/job-status.test.ts — API integration tests for GET /jobs/:jobId endpoint
- app/src/db/migrations/006_add_job_tracking_columns.sql — Migration to add queue_job_id and commit_sha columns
- app/supabase/migrations/006_add_job_tracking_columns.sql — Mirror migration for Supabase CLI

## Task Breakdown

### Phase 1: Database Schema Updates
**Goal:** Add required columns to index_jobs table for pg-boss correlation and commit tracking

- Create migration 006_add_job_tracking_columns.sql with ALTER TABLE statements
- Add queue_job_id UUID column (nullable, for pg-boss job correlation)
- Add commit_sha TEXT column (nullable, stores git commit SHA for job context)
- Add index on queue_job_id for fast lookups by pg-boss job ID
- Mirror migration to app/supabase/migrations/ (required for test environment parity)
- Run bun run test:validate-migrations to verify sync

### Phase 2: Type Definitions
**Goal:** Define TypeScript types for job tracking layer

- Create app/src/queue/types.ts with JobStatus enum (pending, processing, completed, failed)
- Add IndexRepoJobPayload interface (indexJobId, repositoryId, commitSha)
- Add JobMetadata interface for error messages and statistics
- Update shared/types/entities.ts IndexJob interface with queue_job_id and commit_sha fields
- Update shared/types/api.ts IndexResponse to use jobId instead of runId

### Phase 3: Job Tracker Implementation
**Goal:** Build core job tracking data access layer

- Create app/src/queue/job-tracker.ts with three main functions
- Implement createIndexJob(repositoryId, commitSha) → returns jobId
  - Insert into index_jobs with status='pending'
  - Store commit_sha for context
  - Leave queue_job_id null (pg-boss integration in #237)
- Implement updateJobStatus(jobId, status, metadata?)
  - Validate status transitions (no backward transitions)
  - Capture started_at when status → processing
  - Capture completed_at when status → completed/failed
  - Store error_message when metadata.error provided
  - Store stats when metadata.stats provided
- Implement getJobStatus(jobId) → returns full job record
  - Query index_jobs by id with RLS enforcement
  - Throw descriptive error if job not found
  - Return typed IndexJob entity

### Phase 4: API Integration
**Goal:** Update /index endpoint and add /jobs/:jobId status endpoint

- Refactor POST /index in app/src/api/routes.ts
  - Replace recordIndexRun() call with createIndexJob()
  - Update response to {jobId, status: 'pending'}
  - Maintain backward compatibility (keep queueMicrotask for now)
  - Update queueMicrotask callback to call updateJobStatus on completion/failure
- Add GET /jobs/:jobId endpoint with authentication
  - Extract jobId from route params
  - Call getJobStatus(jobId)
  - Return 404 if job not found (RLS may hide it)
  - Return 200 with full job details (status, timestamps, error, stats)
  - Apply rate limiting (consumes user quota)

### Phase 5: Testing
**Goal:** Comprehensive integration test coverage with real Supabase Local

- Create app/tests/queue/job-tracker.test.ts
  - Test createIndexJob() creates pending record with commit SHA
  - Test updateJobStatus() transitions pending → processing (captures started_at)
  - Test updateJobStatus() transitions processing → completed (captures completed_at, stats)
  - Test updateJobStatus() transitions processing → failed (captures completed_at, error_message)
  - Test concurrent status updates (race condition handling)
  - Test invalid job ID throws descriptive error
- Create app/tests/api/job-status.test.ts
  - Test POST /index returns jobId and status='pending'
  - Test GET /jobs/:jobId returns job details for valid job
  - Test GET /jobs/:jobId returns 404 for non-existent job
  - Test GET /jobs/:jobId enforces RLS (user cannot see other users' jobs)
  - Test GET /jobs/:jobId requires authentication (401 without API key)
  - Test GET /jobs/:jobId consumes rate limit quota

### Phase 6: Validation and Documentation
**Goal:** Ensure quality, run full test suite, update documentation

- Run bun run lint (ESLint validation)
- Run bunx tsc --noEmit (TypeScript type-check)
- Run bun test (full test suite with Supabase Local)
- Run bun test --filter integration (integration tests only)
- Run bun run test:validate-migrations (verify migration sync)
- Update docs/schema.md with new index_jobs columns
- Update CHANGELOG.md with feature summary
- Git commit with conventional format: feat(queue): implement job status tracking (#236)
- Git push to remote branch: git push -u origin feat/236-job-status-tracking

## Step by Step Tasks

### Database Schema Preparation
1. Create app/src/db/migrations/006_add_job_tracking_columns.sql
2. Write ALTER TABLE index_jobs ADD COLUMN queue_job_id UUID
3. Write ALTER TABLE index_jobs ADD COLUMN commit_sha TEXT
4. Write CREATE INDEX idx_index_jobs_queue_job_id ON index_jobs(queue_job_id)
5. Copy migration to app/supabase/migrations/006_add_job_tracking_columns.sql (exact mirror)
6. Validate sync: bun run test:validate-migrations

### Type Definitions and Shared Contracts
7. Create app/src/queue/types.ts with JobStatus enum and IndexRepoJobPayload interface
8. Update shared/types/entities.ts IndexJob interface (add queue_job_id, commit_sha)
9. Update shared/types/api.ts IndexResponse (change runId to jobId)
10. Run bunx tsc --noEmit to verify type consistency across monorepo

### Job Tracker Core Functions
11. Create app/src/queue/job-tracker.ts with imports (supabase client, types)
12. Implement createIndexJob(repositoryId, commitSha) with insert and select
13. Implement updateJobStatus(jobId, status, metadata) with conditional timestamp logic
14. Implement getJobStatus(jobId) with error handling for missing jobs
15. Add JSDoc comments documenting function contracts and error cases

### API Layer Integration
16. Update POST /index in app/src/api/routes.ts to call createIndexJob()
17. Update POST /index response to return {jobId, status: 'pending'}
18. Update queueMicrotask callback to call updateJobStatus('processing') on start
19. Update queueMicrotask callback to call updateJobStatus('completed', {stats}) on success
20. Update queueMicrotask callback to call updateJobStatus('failed', {error}) on error
21. Add GET /jobs/:jobId route with authenticate middleware
22. Implement GET /jobs/:jobId handler with getJobStatus() call
23. Add 404 error handling for missing jobs

### Integration Test Coverage
24. Create app/tests/queue/job-tracker.test.ts with Supabase Local setup
25. Write test: createIndexJob creates pending record
26. Write test: updateJobStatus transitions pending → processing → completed
27. Write test: updateJobStatus captures error on failure
28. Write test: concurrent status updates handled gracefully
29. Create app/tests/api/job-status.test.ts
30. Write test: POST /index returns jobId
31. Write test: GET /jobs/:jobId returns job details
32. Write test: GET /jobs/:jobId enforces RLS policies
33. Write test: GET /jobs/:jobId requires authentication

### Validation and Cleanup
34. Run bun run lint and fix any ESLint errors
35. Run bunx tsc --noEmit and fix any type errors
36. Run bun test and verify all tests pass (including new job tracking tests)
37. Run bun test --filter integration to verify real Supabase integration
38. Run bun run test:validate-migrations to confirm migration sync
39. Review code for anti-patterns (no mocks, no hardcoded env vars)
40. Update docs/schema.md with queue_job_id and commit_sha column documentation
41. Stage all changes: git add app/src app/tests shared/types docs/specs docs/schema.md
42. Commit with conventional format: git commit -m "feat(queue): implement job status tracking (#236)"
43. Push to remote: git push -u origin feat/236-job-status-tracking
44. Verify CI passes (application-ci.yml runs full test suite)

## Risks & Mitigations

**Risk: Status transition race conditions**
- Mitigation: Use Postgres row-level locking (SELECT FOR UPDATE) in updateJobStatus() if concurrent updates become problematic. For MVP, last-write-wins is acceptable since queue ensures single worker per job.

**Risk: Breaking change to IndexResponse API contract**
- Mitigation: Maintain backward compatibility by keeping runId field as alias to jobId in POST /index response during transition period. Deprecate runId in next major version.

**Risk: Migration drift between src/db and supabase directories**
- Mitigation: Run bun run test:validate-migrations in pre-commit hook and CI to enforce sync. Document migration sync requirement in PR description.

**Risk: pg-boss integration blocked by #235 timeline**
- Mitigation: queue_job_id column is nullable, allowing job tracking to work independently. Integration with pg-boss is deferred to #237 (indexing worker).

**Risk: RLS policies hide jobs from users during debugging**
- Mitigation: Add admin endpoint GET /admin/jobs/:jobId (service role access) for support team to inspect any job. Document RLS behavior in API documentation.

**Risk: Test failures due to missing Supabase Local containers**
- Mitigation: Update test setup scripts to verify Docker availability before running tests. Add clear error messages pointing to bun test:setup command.

## Validation Strategy

### Automated Tests (Integration/E2E with Supabase Local)
All tests use real Supabase Local database per /anti-mock philosophy:

**Job Tracker Integration Tests (app/tests/queue/job-tracker.test.ts):**
- Test suite requires running Supabase Local stack (bun test:setup prerequisite)
- Seed test data: Create test repository and user via helpers/db.ts seeders
- Test createIndexJob() creates record in index_jobs table with pending status
- Test updateJobStatus() transitions through lifecycle (pending → processing → completed)
- Test updateJobStatus() captures timestamps correctly (started_at, completed_at)
- Test updateJobStatus() stores error_message when job fails
- Test updateJobStatus() stores stats (files_indexed, symbols_extracted) on completion
- Test concurrent updateJobStatus() calls handled gracefully (no data corruption)
- Cleanup: Delete test jobs after each test to prevent pollution

**API Integration Tests (app/tests/api/job-status.test.ts):**
- Test suite uses real HTTP requests to Express server with Supabase backend
- Seed test data: Create authenticated user with API key for rate limiting tests
- Test POST /index returns {jobId, status: 'pending'} immediately
- Test GET /jobs/:jobId returns full job details (status, timestamps, stats)
- Test GET /jobs/:jobId returns 404 for non-existent job ID
- Test GET /jobs/:jobId enforces RLS (user A cannot access user B's jobs)
- Test GET /jobs/:jobId requires authentication (401 without Bearer token)
- Test GET /jobs/:jobId consumes rate limit quota (X-RateLimit-Remaining decrements)
- Cleanup: Delete test API keys and jobs after suite completes

**Failure Injection (Real Supabase Degradation):**
- Test updateJobStatus() handles Supabase connection timeout (increase query timeout to trigger)
- Test getJobStatus() throws descriptive error when job not found (test with random UUID)
- Test POST /index handles database constraint violation (duplicate repository insert)
- No mocks or stubs allowed - use real Supabase error responses

### Manual Checks
**Local Development Workflow:**
1. Start Supabase Local: bun test:setup (or cd app && ./scripts/dev-start.sh)
2. Generate API key: bun run src/auth/keys.ts (or use seed script)
3. Trigger indexing: `curl -X POST http://localhost:3000/index -H "Authorization: Bearer $API_KEY" -d '{"repository":"test/repo","ref":"main"}'`
4. Verify immediate response with jobId (response time < 100ms)
5. Poll job status: `curl http://localhost:3000/jobs/$JOB_ID -H "Authorization: Bearer $API_KEY"`
6. Verify status transitions in database: `psql $SUPABASE_URL -c "SELECT id, status, started_at, completed_at FROM index_jobs ORDER BY created_at DESC LIMIT 1;"`
7. Verify RLS enforcement: Try accessing job with different API key (should 404)
8. Verify rate limiting: Make 101 requests with free tier key (101st should 429)

**Data Seeding for Manual Testing:**
- Seed script creates 3 repositories with different users (free, solo, team tiers)
- Seed script creates 10 completed jobs with realistic stats (50-200 files, 500-2000 symbols)
- Seed script creates 2 failed jobs with error messages for failure scenario testing
- Seed script creates 1 processing job stuck for 5+ minutes (simulates worker crash)

**Failure Scenarios to Exercise Manually:**
1. Missing commit SHA: POST /index without commit_sha field (should still work, field is nullable)
2. Invalid job ID format: GET /jobs/not-a-uuid (should 404 with validation error)
3. Cross-tenant access: User A tries to access User B's job (should 404 due to RLS)
4. Worker crash simulation: Create job, set status to processing, never complete (manual cleanup query)

### Release Guardrails
**Monitoring:**
- CloudWatch/Datadog metric: job_status_transitions_total (counter by status)
- CloudWatch/Datadog metric: job_duration_seconds (histogram for processing time)
- CloudWatch/Datadog metric: job_failure_rate (rate of failed jobs)
- Supabase dashboard: Monitor index_jobs table row count growth over time

**Alerting:**
- Alert if job_failure_rate > 10% over 1 hour window
- Alert if jobs stuck in processing state for > 30 minutes
- Alert if index_jobs table size exceeds 100MB (indicates cleanup needed)

**Rollback Plan:**
- Feature flag: JOB_STATUS_TRACKING_ENABLED (env var, default true)
- If rollback needed, set flag to false and deploy
- Graceful degradation: POST /index falls back to old runId response format
- Database rollback: Run down migration to drop queue_job_id and commit_sha columns

**Real-Service Evidence:**
- CI runs full test suite against Supabase Local (100% coverage required)
- Staging deployment tested with 100 concurrent indexing jobs (load test)
- Production canary: Enable for 5% of users first, monitor for 24h before full rollout

## Validation Commands

Level 2 validation (required minimum for features):
```bash
bun run lint                        # ESLint static analysis
bunx tsc --noEmit                  # TypeScript type-check across monorepo
bun test --filter integration      # Integration tests with real Supabase
bun test                           # Full test suite (133+ tests)
bun run build                      # Production build validation
```

Domain-specific validation commands:
```bash
bun run test:validate-migrations   # Verify migration sync between src/db and supabase directories
bun run test:validate-env          # Detect hardcoded environment URLs in tests
cd app && ./scripts/dev-start.sh   # Start local dev environment for manual testing
```

Database migration validation:
```bash
# Verify migrations apply cleanly
cd app && ./scripts/setup-test-db.sh
psql $SUPABASE_DB_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='index_jobs';"

# Verify RLS policies enforce user isolation
psql $SUPABASE_DB_URL -c "SELECT policyname, permissive, roles, qual FROM pg_policies WHERE tablename='index_jobs';"
```

API contract validation:
```bash
# Test POST /index response format
curl -X POST http://localhost:3000/index \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"repository":"test/repo","ref":"main"}' \
  | jq '.jobId, .status'

# Test GET /jobs/:jobId response format
curl http://localhost:3000/jobs/$JOB_ID \
  -H "Authorization: Bearer $API_KEY" \
  | jq '.id, .status, .started_at, .completed_at, .stats'
```

## Issue Relationships

**Child Of:**
- #234 - Epic 4: Job Queue & Background Processing (this is issue #13 from epic plan)

**Depends On:**
- #235 - Set up pg-boss job queue infrastructure (OPEN - not merged yet, but queue_job_id column nullable so non-blocking)
- #27 - Standardize on Postgres/Supabase (CLOSED - index_jobs table exists in 001_initial_schema.sql)

**Blocks:**
- #237 - Build indexing worker with retry logic and pipeline orchestration (needs job tracking functions to update status)

**Related To:**
- Epic 6 (REST API) - Job status polling endpoints integrate with API layer
- Epic 8 (Monitoring) - Job metrics derive from index_jobs table (queue depth, success rate, processing time)

**Follow-Up:**
- Future enhancement: WebSocket/SSE streaming for real-time job updates (avoid polling)
- Future enhancement: Job cancellation API (DELETE /jobs/:jobId)
- Future enhancement: Admin dashboard for job monitoring and diagnostics
