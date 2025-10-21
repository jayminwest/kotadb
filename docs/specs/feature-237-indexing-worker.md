# Feature Plan: Indexing Worker with Retry Logic and Pipeline Orchestration

## Overview

### Problem
The `/index` API endpoint currently blocks while processing repositories, causing poor user experience for large codebases and limiting throughput. Users must wait for indexing to complete before receiving a response, and concurrent requests cannot be processed efficiently.

### Desired Outcome
Build a background worker that consumes `index-repo` jobs from the pg-boss queue and orchestrates the full indexing pipeline: clone → parse → extract → store. The worker will enable non-blocking API responses, concurrent repository processing (3 workers), automatic retry for transient failures, and fault-tolerant indexing with graceful error handling.

### Non-Goals
- Webhook-triggered auto-indexing (deferred to Epic 5)
- Advanced scheduling or priority queues
- Distributed worker deployment across multiple machines
- Real-time progress streaming to clients

## Technical Approach

### Architecture Notes
The indexing worker implements a stateless job processing pattern using pg-boss. Each job contains all necessary context (repository ID, commit SHA, job tracking ID) to execute independently. The worker pool processes jobs concurrently with sequential execution per worker to prevent resource contention.

### Key Modules to Touch
- **Queue Layer** (`app/src/queue/`): Add worker registration and lifecycle management
- **Indexer Layer** (`app/src/indexer/`): Reuse existing parsers, extractors, and repository management
- **Database Layer** (`app/src/db/`): Add atomic storage function for indexed data
- **Server Bootstrap** (`app/src/index.ts`): Integrate worker startup with queue initialization

### Data/API Impacts
- New Postgres function `store_indexed_data()` for atomic writes with transaction safety
- Job status transitions tracked in `index_jobs` table (pending → processing → completed/failed)
- Temporary directory usage (`/tmp/kotadb-<job-id>/`) requires cleanup guarantees
- pg-boss dead letter queue (`index-repo_dlq`) for failed jobs after 3 retry attempts

## Relevant Files

- `app/src/queue/client.ts` — Queue lifecycle management (startQueue, stopQueue, getQueue)
- `app/src/queue/config.ts` — Worker configuration constants (team size, retry policy)
- `app/src/queue/types.ts` — Job payload and result type definitions
- `app/src/indexer/parsers.ts` — File discovery and parsing functions (discoverSources, parseSourceFile)
- `app/src/indexer/repos.ts` — Repository cloning and checkout logic (prepareRepository)
- `app/src/indexer/symbol-extractor.ts` — Symbol extraction from AST (extractSymbols)
- `app/src/indexer/reference-extractor.ts` — Reference extraction (extractReferences)
- `app/src/indexer/dependency-extractor.ts` — Dependency graph construction (extractDependencies)
- `app/src/index.ts` — Server bootstrap and shutdown handlers
- `app/src/db/client.ts` — Supabase client for database operations
- `app/tests/helpers/db.ts` — Test database helpers (createTestJob, getJobStatus)

### New Files

- `app/src/queue/workers/index-repo.ts` — Main indexing worker implementation with pg-boss registration
- `app/src/queue/job-tracker.ts` — Job status update functions (updateJobStatus)
- `app/src/indexer/storage.ts` — Database storage layer for indexed data (storeIndexedData)
- `app/src/db/migrations/006_store_indexed_data_function.sql` — Postgres function for atomic storage
- `app/supabase/migrations/006_store_indexed_data_function.sql` — Supabase migration copy (sync required)
- `app/tests/queue/workers/index-repo.test.ts` — Worker end-to-end integration tests
- `app/tests/queue/workers/retry.test.ts` — Retry logic and failure recovery tests
- `app/tests/queue/workers/concurrent.test.ts` — Concurrent worker execution tests

## Task Breakdown

### Phase 1: Database Storage Foundation
- Create `store_indexed_data()` Postgres function with transaction safety
- Implement `storeIndexedData()` TypeScript wrapper in `app/src/indexer/storage.ts`
- Add migration sync validation to ensure `src/db/migrations/` matches `supabase/migrations/`
- Write unit tests for storage function with rollback scenarios

### Phase 2: Job Status Tracking
- Create `updateJobStatus()` in `app/src/queue/job-tracker.ts` for status transitions
- Add logging with correlation IDs (job_id, repository_id) for observability
- Write tests for status update sequences (pending → processing → completed/failed)

### Phase 3: Worker Implementation
- Create worker in `app/src/queue/workers/index-repo.ts` with pg-boss registration
- Implement 7-step pipeline: clone → discover → parse → extract symbols → extract references → extract dependencies → store
- Add temp directory cleanup in try/finally blocks to prevent orphaned files
- Integrate worker startup with `startQueue()` in server bootstrap

### Phase 4: Error Handling and Retry
- Configure pg-boss retry policy (3 attempts, exponential backoff)
- Implement error classification (transient vs permanent)
- Add dead letter queue handling for terminal failures
- Write tests for partial failures (some files fail, job continues)

### Phase 5: Testing and Validation
- Write integration tests with real Supabase Local database
- Test concurrent worker execution (3 jobs processed in parallel)
- Test retry scenarios (network failures, parse errors)
- Test cleanup guarantees (temp directories removed on success and failure)

## Step by Step Tasks

### Database Layer Setup
1. Create migration `006_store_indexed_data_function.sql` with idempotent DELETE + INSERT logic
2. Copy migration to `supabase/migrations/` for CLI compatibility
3. Create `app/src/indexer/storage.ts` with `storeIndexedData()` function calling RPC
4. Write storage tests verifying transaction rollback on error
5. Run migration sync validation: `cd app && bun run test:validate-migrations`

### Job Tracking Layer
6. Create `app/src/queue/job-tracker.ts` with `updateJobStatus(jobId, status, metadata?)` function
7. Implement status update with correlation logging (include job_id, repository_id in logs)
8. Add error metadata capture (error message, stack trace)
9. Add success metadata capture (files_indexed, symbols_extracted, references_found, dependencies_extracted)
10. Write job tracker tests for all status transitions

### Worker Core Implementation
11. Create `app/src/queue/workers/index-repo.ts` with worker registration skeleton
12. Implement Step 1: Clone repository to `/tmp/kotadb-<job-id>/`
13. Implement Step 2: Discover files using `discoverSources()`
14. Implement Step 3: Parse files using `parseSourceFile()` for each discovered file
15. Implement Step 4: Extract symbols using AST parser
16. Implement Step 5: Extract references using AST parser
17. Implement Step 6: Build dependency graph using extractors
18. Implement Step 7: Store indexed data with `storeIndexedData()`
19. Add temp directory cleanup in try/finally block (guaranteed execution)
20. Update job status to 'processing' at worker start
21. Update job status to 'completed' or 'failed' at worker end

### Worker Registration and Lifecycle
22. Export `startIndexWorker()` function from `app/src/queue/workers/index-repo.ts`
23. Call `startIndexWorker()` after `startQueue()` in `app/src/index.ts`
24. Add worker pool configuration (teamSize: 3, teamConcurrency: 1) from `config.ts`
25. Verify workers stop gracefully when `stopQueue()` is called (drain in-flight jobs)

### Error Handling and Retry
26. Configure retry policy in job payload (retryLimit: 3, retryDelay: 60, retryBackoff: true)
27. Implement error classification: re-throw transient errors (network, timeout), catch permanent errors (parse failure)
28. Add error logging with correlation IDs
29. Test retry scenario: mock network failure on first attempt, success on retry
30. Test dead letter queue: mock permanent failure, verify job in `index-repo_dlq` after 3 retries

### Integration Testing
31. Create `app/tests/queue/workers/index-repo.test.ts` with test server setup
32. Test end-to-end indexing: enqueue job → wait for completion → verify indexed data in database
33. Test status updates: poll job status during processing, verify transitions
34. Create `app/tests/queue/workers/retry.test.ts` for retry scenarios
35. Test partial failure: repository with invalid TypeScript file, verify job completes with partial data
36. Test transient retry: mock network error, verify automatic retry and eventual success
37. Test permanent failure: mock parse error, verify job marked 'failed' after 3 retries
38. Create `app/tests/queue/workers/concurrent.test.ts` for concurrency tests
39. Test concurrent execution: enqueue 5 jobs, verify 3 processing concurrently (worker pool size)
40. Test cleanup: verify no orphaned temp directories after job completion

### Validation and Documentation
41. Run type-check: `cd app && bunx tsc --noEmit`
42. Run linter: `cd app && bun run lint`
43. Run integration tests: `cd app && bun test --filter integration`
44. Run full test suite: `cd app && bun test`
45. Validate migration sync: `cd app && bun run test:validate-migrations`
46. Update `CLAUDE.md` if worker adds new architectural patterns
47. Commit changes with conventional format: `feat(queue): implement indexing worker with retry logic`
48. Push branch: `git push -u origin interactive-237-build-indexing-worker`

## Risks & Mitigations

### Risk: Temp Directory Exhaustion
**Mitigation**: Implement guaranteed cleanup using try/finally blocks. Add monitoring for orphaned directories. Test cleanup path explicitly in integration tests.

### Risk: Worker Deadlock on Shutdown
**Mitigation**: pg-boss provides graceful draining by default. Add timeout to `stopQueue()` (pg-boss default: 30 seconds). Test shutdown scenario in integration tests.

### Risk: Database Transaction Failures
**Mitigation**: Use Postgres function with explicit transaction boundaries. Implement idempotent DELETE + INSERT pattern for retry safety. Test rollback scenarios with connection interruption.

### Risk: Memory Leaks from Large Repositories
**Mitigation**: Process files in streaming batches if repository has >1000 files. Add memory usage logging. Defer optimization until production metrics indicate need (non-goal for MVP).

### Risk: Concurrent Job Conflicts
**Mitigation**: pg-boss ensures each job is processed by exactly one worker. Temp directories use unique job IDs to prevent collision. Test concurrent execution explicitly.

## Validation Strategy

### Automated Tests (Integration/E2E with Real Supabase)
- **End-to-End Indexing**: Worker processes job from queue, updates status, stores data in database
- **Status Transitions**: Job moves through pending → processing → completed with correct timestamps
- **Partial Failure Handling**: Job completes with partial data when some files fail to parse
- **Retry Logic**: Worker retries on transient network errors, succeeds on second attempt
- **Dead Letter Queue**: Permanent failures move to DLQ after 3 retry attempts
- **Temp Directory Cleanup**: No orphaned directories remain after success or failure
- **Concurrent Execution**: 3 workers process jobs in parallel without conflicts

### Manual Checks
- Start development server: `cd app && ./scripts/dev-start.sh`
- Trigger indexing via API: `curl -X POST http://localhost:3000/index -H "Authorization: Bearer $API_KEY" -d '{"repository":"kotadb/kotadb","ref":"main"}'`
- Poll job status: `curl http://localhost:3000/jobs/<job-id> -H "Authorization: Bearer $API_KEY"`
- Verify status transitions in logs: `tail -f app/logs/server.log | grep "job_id:<job-id>"`
- Check indexed data: `psql $SUPABASE_DB_URL -c "SELECT count(*) FROM indexed_files;"`
- Verify temp directory cleanup: `ls /tmp | grep kotadb` (should be empty)

### Release Guardrails
- **Monitoring**: pg-boss exposes queue depth metrics via `getQueue()` and `getQueueSize()`
- **Alerting**: Alert on queue depth > 100 (backlog building) or worker error rate > 10%
- **Rollback**: Feature flag to disable worker registration, fall back to synchronous indexing in `/index` endpoint

## Validation Commands

- `cd app && bun run lint`
- `cd app && bunx tsc --noEmit`
- `cd app && bun test --filter integration`
- `cd app && bun test`
- `cd app && bun run test:validate-migrations`
- `cd app && ./scripts/dev-start.sh` (manual server test)

## Issue Relationships

### Child Of
- #234 - Epic 4: Job Queue & Background Processing

### Depends On
- #235 (CLOSED) - pg-boss queue infrastructure
- #236 (CLOSED) - Job status tracking in `index_jobs` table
- #75 (CLOSED) - Reference extraction
- #76 (CLOSED) - Dependency graph extraction

### Blocks
- Epic 5: GitHub Integration - Webhooks will queue indexing jobs via this worker
- Production deployment - Cannot scale without async processing

### Related To
- Epic 6 (REST API) - `/index` endpoint integration
- Epic 8 (Monitoring) - Worker metrics (processing time, success rate, queue depth)
- Epic 3 (AST Parsing) - Worker uses existing extraction pipeline

## References

- Vision document: `docs/vision/epic-4-job-queue.md` (Issue #14)
- Epic tracking issue: #234
- Queue setup issue: #235 (merged)
- Job tracking issue: #236 (merged)
- Existing indexing pipeline: `app/src/indexer/` (parsers, extractors, repos)
- Anti-mocking philosophy: `.claude/commands/docs/anti-mock.md`
- Testing setup: `docs/testing-setup.md`
- Database schema: `docs/schema.md`
