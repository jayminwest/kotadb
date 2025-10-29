# Feature Plan: Batch Processing for Large Repository Indexing

**Issue**: #313
**Title**: fix: implement batch processing for large repository indexing to prevent statement timeouts
**Priority**: Critical
**Effort**: Medium (1-3 days)
**Status**: needs-investigation

## Overview

### Problem
Repository indexing fails with PostgreSQL statement timeout when processing large codebases (>100 files). The current implementation uses a single transaction via `store_indexed_data()` to insert all indexed files, symbols, references, and dependency graph entries. For repositories with 200+ files (like kota-db-ts with 212 files), this transaction exceeds the default statement timeout, causing complete indexing failure with no partial data saved.

**Root Cause**: The Postgres function at `app/src/db/migrations/20241021000003_store_indexed_data_function.sql` performs:
1. DELETE phase: Removes all existing repository data (4 DELETE statements with cascading lookups)
2. INSERT phase: Loops through JSONB arrays inserting files one-by-one with ID mapping
3. Nested loops: For each file, potentially inserts symbols, references, and dependencies

For a 212-file repository: ~212 file inserts + ~1,000+ symbol inserts + ~500+ reference inserts + ~300+ dependency entries exceed the statement timeout.

### Desired Outcome
- Successfully index large repositories (200+ files) without timeout errors
- All indexed data persists to database with progress tracking between chunks
- Failed chunks do not roll back previous successful chunks (incremental progress)
- Retry logic handles partial completion correctly (resume from last chunk)
- System scales linearly to 500+ file repositories with configurable batch sizes

### Non-goals
- Increasing timeout as a permanent solution (masks scaling issue)
- Database-level transaction management changes (keep atomic inserts within chunks)
- Parallel chunk processing (adds complexity; sequential batching sufficient for MVP)

## Technical Approach

**Architecture**: Application-level batching with chunked storage calls

**Rationale**: Modify `app/src/queue/workers/index-repo.ts` to split file processing into chunks of 50 files (configurable) before calling `storeIndexedData()`. This approach:
- Requires no database migration (TypeScript-only change)
- Maintains transaction atomicity within each chunk
- Provides progress visibility via job stats updates between chunks
- Enables graceful partial failure handling (chunks 1-N committed, chunk N+1 fails)
- Supports idempotent retry (worker resumes from last successful chunk)

**Key Modules to Touch**:
1. `app/src/queue/workers/index-repo.ts` - Add batch processing loop in `processIndexJob()`
2. `app/src/indexer/storage.ts` - Add optional `filesAlreadyIndexed` parameter to skip DELETE phase on subsequent chunks
3. `app/src/db/migrations/20241021000003_store_indexed_data_function.sql` - Add `p_skip_delete` parameter to conditionally skip DELETE phase
4. `app/src/queue/config.ts` - Add `BATCH_SIZE` configuration constant
5. `app/tests/queue/workers/index-repo.test.ts` - Add large repository batch processing test

**Data/API Impacts**:
- `store_indexed_data()` function signature changes to accept `p_skip_delete` boolean parameter (default: false)
- `storeIndexedData()` TypeScript function adds optional `skipDelete` parameter
- `index_jobs.stats` JSONB column gains `chunks_completed` and `current_chunk` metadata for progress tracking
- No breaking changes to public API endpoints (worker-internal logic only)

## Relevant Files
- `app/src/queue/workers/index-repo.ts` - Implements 7-step indexing pipeline; STEP 7 calls `storeIndexedData()` once
- `app/src/indexer/storage.ts` - Wraps `store_indexed_data()` RPC function; returns StorageResult stats
- `app/src/db/migrations/20241021000003_store_indexed_data_function.sql` - Postgres function performing DELETE + INSERT in single transaction
- `app/src/queue/config.ts` - Queue configuration constants (retry, expiration, worker team size)
- `app/src/queue/job-tracker.ts` - Updates `index_jobs` status and stats
- `app/tests/queue/workers/index-repo.test.ts` - Integration tests for indexing worker with real Supabase

### New Files
- `app/supabase/migrations/YYYYMMDDHHMMSS_add_skip_delete_to_store_indexed_data.sql` - Migration adding `p_skip_delete` parameter to function
- `app/src/db/migrations/YYYYMMDDHHMMSS_add_skip_delete_to_store_indexed_data.sql` - Source copy of migration (dual location requirement)

## Task Breakdown

### Phase 1: Database Foundation
1. Create migration adding `p_skip_delete` parameter to `store_indexed_data()` function
2. Update function logic to conditionally skip DELETE phase when `p_skip_delete = true`
3. Copy migration to both required locations (`app/src/db/migrations/` and `app/supabase/migrations/`)
4. Apply migration to local Supabase: `cd app && bun run db:migrate`
5. Validate migration sync: `cd app && bun run test:validate-migrations`

### Phase 2: Application-Level Batching
1. Add `BATCH_SIZE` constant to `app/src/queue/config.ts` (default: 50 files per chunk)
2. Update `storeIndexedData()` in `app/src/indexer/storage.ts` to accept optional `skipDelete` parameter
3. Modify `processIndexJob()` in `app/src/queue/workers/index-repo.ts`:
   - Chunk `files` array into batches of `BATCH_SIZE`
   - Loop through chunks sequentially
   - Call `storeIndexedData()` for each chunk with `skipDelete: chunkIndex > 0`
   - Update job stats after each chunk with `chunks_completed` and `current_chunk` metadata
   - Group symbols, references, and dependencies by file_path to maintain chunk associations
4. Add progress logging between chunks showing files_indexed and chunks_completed

### Phase 3: Testing and Validation
1. Add integration test to `app/tests/queue/workers/index-repo.test.ts`:
   - Create test repository with 250 mock files (5 chunks at batch_size=50)
   - Trigger indexing job and wait for completion
   - Verify all 250 files indexed successfully
   - Validate job stats reflect `chunks_completed: 5`
2. Add partial failure test:
   - Mock storage failure on chunk 3 of 5
   - Verify chunks 1-2 data persists in database
   - Verify job marked as failed with error metadata
3. Manual dogfooding test with kota-db-ts repository (212 files):
   - Start dev environment: `cd app && ./scripts/dev-start.sh`
   - Generate test API key: `bun run scripts/generate-test-key.ts team`
   - Trigger indexing via MCP `index_repository` tool
   - Monitor logs for chunk progress: `tail -f app/.dev-api.log | grep -E "(chunk|batch)"`
   - Validate completion in database: `SELECT COUNT(*) FROM indexed_files WHERE repository_id = '<repo_id>';`
   - Expected: 212 files indexed across 5 chunks (212 / 50 = 4.24 → 5 chunks)
4. Update `.env.example` with `INDEXER_BATCH_SIZE` documentation
5. Update `CLAUDE.md` Quick Reference section with batch size configuration guidance

## Step by Step Tasks

### Database Migration
1. Generate migration timestamp: `date -u +%Y%m%d%H%M%S`
2. Create migration file: `app/src/db/migrations/{timestamp}_add_skip_delete_to_store_indexed_data.sql`
3. Add `p_skip_delete boolean DEFAULT false` parameter to function signature
4. Wrap DELETE statements in `IF NOT p_skip_delete THEN ... END IF;` block
5. Copy migration to `app/supabase/migrations/{timestamp}_add_skip_delete_to_store_indexed_data.sql`
6. Apply migration: `cd app && supabase db reset --local` (or `supabase migration up`)
7. Validate sync: `cd app && bun run test:validate-migrations`

### Queue Configuration
1. Open `app/src/queue/config.ts`
2. Add constant: `export const BATCH_SIZE = 50;` (below `WORKER_TEAM_SIZE`)
3. Add JSDoc comment explaining chunk size rationale (balances transaction size vs API overhead)

### Storage Layer Update
1. Open `app/src/indexer/storage.ts`
2. Add optional `skipDelete?: boolean` parameter to `storeIndexedData()` function signature
3. Pass `p_skip_delete: skipDelete || false` in RPC call parameters object

### Worker Batch Processing Logic
1. Open `app/src/queue/workers/index-repo.ts`
2. Import `BATCH_SIZE` from `@queue/config`
3. After STEP 6 (before STEP 7), add file chunking logic:
   ```typescript
   // Chunk files for batch processing
   const chunks: FileData[][] = [];
   for (let i = 0; i < files.length; i += BATCH_SIZE) {
     chunks.push(files.slice(i, i + BATCH_SIZE));
   }
   ```
4. Replace STEP 7 single `storeIndexedData()` call with loop:
   - Iterate through chunks with index
   - For each chunk, extract associated symbols/references/dependencies using file_path filtering
   - Call `storeIndexedData(supabase, repositoryId, chunk, chunkSymbols, chunkRefs, chunkDeps, { skipDelete: chunkIndex > 0 })`
   - Accumulate stats from each chunk
   - Update job progress: `await updateJobStatus(indexJobId, "processing", { stats: { files_indexed: totalFilesIndexed, chunks_completed: chunkIndex + 1 } }, userId)`
   - Log chunk completion: `process.stdout.write(\`[STEP 7/${chunks.length}] Chunk ${chunkIndex + 1} completed...\`)`
5. Update final stats logging to show total chunks processed

### Integration Testing
1. Open `app/tests/queue/workers/index-repo.test.ts`
2. Add test case: `"should handle 250+ files via batch processing"`
   - Create test repository with 250 TypeScript files using loop
   - Commit files to git (required for discovery)
   - Create and enqueue index job
   - Wait for completion (increase timeout to 60000ms)
   - Verify `completedJob.stats.files_indexed === 250`
   - Verify `completedJob.stats.chunks_completed === 5` (250 / 50)
   - Query `indexed_files` table and validate 250 rows exist
   - Query `symbols` table and validate symbols extracted from all files
3. Add test case: `"should persist partial progress on chunk failure"`
   - Create test repository with 150 files (3 chunks)
   - Mock Supabase RPC error on third chunk (use test helper to inject failure)
   - Verify job status = "failed"
   - Verify `indexed_files` contains ~100 rows (first 2 chunks persisted)
   - Verify error metadata includes chunk failure information

### Documentation Updates
1. Open `app/.env.example`
2. Add entry:
   ```
   # Indexer batch size (number of files per storage transaction)
   # Larger batches = fewer database calls but higher timeout risk
   # Smaller batches = more overhead but better progress granularity
   INDEXER_BATCH_SIZE=50
   ```
3. Open `CLAUDE.md`
4. Update Quick Reference section with batch size configuration note

### Validation Commands Execution
1. Run `cd app && bun run lint` - verify no linting errors
2. Run `cd app && bunx tsc --noEmit` - verify type safety
3. Run `cd app && bun test:setup` - start Supabase containers
4. Run `cd app && bun test --filter integration` - run integration tests including new batch processing test
5. Run `cd app && bun test` - run full test suite
6. Run `cd app && bun run build` - verify production build succeeds
7. Manual dogfooding: Index kota-db-ts repository and verify 212 files indexed successfully
8. Push changes to remote: `git push -u origin feat/313-batch-processing-indexing`

## Risks & Mitigations

**Risk**: Chunking introduces partial failure scenarios where chunks 1-N succeed but chunk N+1 fails, leaving repository in partially-indexed state
**Mitigation**: Add `chunks_completed` metadata to job stats for observability. Implement idempotent retry logic where failed jobs resume from `chunks_completed + 1` instead of starting from scratch. Document partial state recovery in error messages.

**Risk**: Symbol/reference extraction requires mapping file_path to file_id, which spans chunks (symbols in chunk 2 may reference files in chunk 1)
**Mitigation**: Current implementation already uses file_path lookups via `v_file_id_map` in Postgres function. This works across chunks because DELETE phase only runs on first chunk - subsequent chunks insert additively. Symbol keys use file_path, not file_id, maintaining referential integrity.

**Risk**: Configuring batch size too small causes performance degradation (many small RPC calls)
**Mitigation**: Default to 50 files/chunk based on kota-db-ts profile (~212 files / 50 = 5 chunks, each completing in <10s). Make `BATCH_SIZE` configurable via environment variable. Document performance tuning guidance in `.env.example`.

**Risk**: DELETE phase skipping on subsequent chunks could leave orphaned data if retry occurs after partial completion
**Mitigation**: Job tracker marks jobs as "failed" on error. Retry attempts re-index from scratch (chunk 1 with DELETE phase). pg-boss retry logic ensures failed jobs restart cleanly, not resume mid-stream.

**Risk**: Integration test with 250 files may exceed CI timeout limits
**Mitigation**: Set test timeout to 60000ms (60 seconds). Use smaller file content in test fixtures to reduce parse/AST overhead. If CI still times out, reduce test file count to 150 (3 chunks) which still validates multi-chunk behavior.

## Validation Strategy

### Automated Tests (Integration/E2E hitting Supabase per /anti-mock)
1. **Large Repository Test**: 250-file repository indexed successfully across 5 chunks
   - Data seeded: 250 TypeScript files with minimal valid syntax (`export const file{i} = {i};`)
   - Failure scenarios: None (happy path validation)
   - Real-service evidence: Query `indexed_files` and `symbols` tables post-indexing; verify counts match expected
2. **Partial Failure Test**: 150-file repository with chunk 3 failure
   - Data seeded: 150 TypeScript files
   - Failure scenarios: Mock RPC error on third `storeIndexedData()` call
   - Real-service evidence: Query database shows ~100 files persisted (chunks 1-2); job status = "failed"
3. **Idempotent Retry Test**: Failed job retries from scratch with DELETE phase
   - Data seeded: 100-file repository
   - Failure scenarios: First attempt fails on chunk 2; second attempt succeeds fully
   - Real-service evidence: Final database state shows 100 files with no duplicates; job status = "completed"

### Manual Checks (Document data seeded and failure scenarios exercised)
1. **kota-db-ts Dogfooding**:
   - Repository: Local clone of kota-db-ts (212 TypeScript/JavaScript files)
   - Indexing trigger: MCP `index_repository` tool via curl with API key
   - Expected result: 5 chunks completed (~43 files per chunk), 212 files in `indexed_files`, ~1000+ symbols extracted
   - Monitoring: `tail -f app/.dev-api.log | grep -E "(chunk|STEP 7)"` shows chunk progress
   - Database validation: `SELECT COUNT(*) FROM indexed_files WHERE repository_id = '<repo_id>';` returns 212
2. **Large Repository Simulation** (if time permits):
   - Repository: Generate synthetic 500-file repository using script
   - Expected result: 10 chunks completed, 500 files indexed, linear scaling (~100s total duration)
   - Performance validation: Compare total indexing time to (chunk_count * avg_chunk_duration)

### Release Guardrails (Monitoring, alerting, rollback) with real-service evidence
1. **Job Queue Monitoring**:
   - pg-boss dashboard shows completed jobs with `chunks_completed` metadata in stats
   - Failed jobs include error messages with chunk number context
2. **Performance Baseline**:
   - Measure indexing duration for 50, 100, 200, 500 file repositories
   - Document baseline in issue comment for future regression detection
3. **Rollback Plan**:
   - If production indexing failures increase post-deployment, revert to single-transaction storage by setting `BATCH_SIZE=999999` (effectively disables chunking)
   - Database migration is backward-compatible (`p_skip_delete` defaults to `false`, maintaining original behavior)
4. **Alerting**:
   - Monitor `index_jobs` table for increased failure rate (query: `SELECT COUNT(*) FROM index_jobs WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour'`)
   - Set up Supabase realtime subscription for failed jobs (future work - not blocking for this issue)

## Validation Commands

**Level 2 (Minimum Required)**:
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test:setup                    # Start Supabase containers
cd app && bun test --filter integration     # Run integration tests including batch processing test
cd app && bun test                          # Full test suite
cd app && bun run build                     # Production build verification
cd app && bun run test:validate-migrations  # Ensure migration sync between source and Supabase dirs
```

**Domain-Specific Checks**:
```bash
# Manual dogfooding test
cd app && ./scripts/dev-start.sh
bun run scripts/generate-test-key.ts team
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KOTA_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "index_repository",
      "arguments": {
        "repository": "kotadb/kota-db-ts",
        "localPath": "/Users/jayminwest/Projects/kota-db-ts"
      }
    }
  }'

# Monitor indexing progress
tail -f app/.dev-api.log | grep -E "(chunk|STEP 7|files_indexed)"

# Validate database state
psql "$SUPABASE_DB_URL" -c "SELECT status, stats FROM index_jobs ORDER BY started_at DESC LIMIT 1;"
psql "$SUPABASE_DB_URL" -c "SELECT COUNT(*) FROM indexed_files WHERE repository_id = '<repo_id>';"
```

## Commit Message Validation
All commits will follow Conventional Commits format. Avoid meta-commentary patterns:
- ✅ `feat(indexer): add batch processing with 50-file chunks`
- ✅ `fix(worker): prevent timeout by splitting storage into chunks`
- ❌ `feat: based on the plan, this commit adds batch processing`
- ❌ `fix: the commit should prevent timeouts by chunking`

## Issue Relationships

**Depends On**:
- #234 - feat: implement pg-boss job queue for async indexing (merged - provides worker infrastructure)
- #237 - feat: build indexing worker with retry logic and pipeline orchestration (merged - implements current single-transaction storage)

**Related To**:
- #261 - feat: integrate webhooks with job queue for auto-indexing (closed - uses same storage function)
- #297 - feat: add ADW workflow orchestration tools to MCP server (open - depends on reliable indexing for ADW state queries)

**Blocks**:
- Production deployment - cannot index real-world repositories without this fix
- Dogfooding workflows - developers cannot test with their own projects
- MCP integration validation - requires indexed code for meaningful search results
