# Epic 4: Job Queue & Background Processing

> **Reference Document**: This epic was from original planning. See [ROADMAP.md](./ROADMAP.md) for current priorities and [CURRENT_STATE.md](./CURRENT_STATE.md) for gap analysis.

**Status**: 🔴 0% Complete (**MVP BLOCKER**)
**Priority**: Critical (Enables async indexing)
**Estimated Duration**: 1-2 weeks
**Actual Progress**: Not started. All indexing runs synchronously. **Second-highest priority gap for MVP.**

## Overview

Implement pg-boss job queue for reliable async indexing. Workers consume jobs, process repositories, and update status for frontend visibility.

## Issues

### Issue #12: Set up pg-boss job queue

**Priority**: P0 (Critical)
**Depends on**: #2 (Supabase Postgres connection)
**Blocks**: #13, #14

#### Description
Configure pg-boss to use Supabase Postgres as job store. Initialize queue, configure workers, and handle retries.

#### Acceptance Criteria
- [ ] pg-boss initialized with Supabase connection
- [ ] Job queue tables created automatically by pg-boss
- [ ] Queue health check function
- [ ] Retry configuration (3 attempts, exponential backoff)
- [ ] Dead letter queue for permanently failed jobs
- [ ] Graceful shutdown on process termination

#### Technical Notes
- pg-boss uses Postgres for job storage (no Redis needed)
- Creates its own schema (`pgboss`) with job tracking tables
- Handles locking, retries, and expiration automatically
- Requires a native Postgres connection string (e.g., `postgresql://user:pass@host:port/db`)
- Store the connection string in `SUPABASE_DB_URL` (separate from the REST `SUPABASE_URL`)

#### Files to Create
- `src/queue/client.ts` - pg-boss initialization
- `src/queue/config.ts` - Queue configuration
- `src/queue/types.ts` - Job payload types

#### Example Implementation
```typescript
import PgBoss from 'pg-boss'

const connectionString = process.env.SUPABASE_DB_URL

if (!connectionString) {
  throw new Error('Missing SUPABASE_DB_URL environment variable')
}

export const queue = new PgBoss({
  connectionString,
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  expireInHours: 24,
  archiveCompletedAfterSeconds: 3600,
})

export async function startQueue() {
  await queue.start()
  console.log('Job queue started')
}

export async function stopQueue() {
  await queue.stop()
  console.log('Job queue stopped')
}

export async function checkQueueHealth(): Promise<boolean> {
  try {
    await queue.getQueueSize('index-repo')
    return true
  } catch {
    return false
  }
}
```

---

### Issue #13: Implement job status tracking

**Priority**: P1 (High)
**Depends on**: #12, #1 (needs `index_jobs` table)
**Blocks**: #14, #22 (job status API)

#### Description
Track indexing job status in `index_jobs` table. Update status as jobs progress through queue.

#### Acceptance Criteria
- [ ] Create job record when queued (status: pending)
- [ ] Update status when processing starts (status: processing)
- [ ] Update status when completed (status: completed, with stats)
- [ ] Update status when failed (status: failed, with error message)
- [ ] Store job metadata: commit SHA, started/completed timestamps
- [ ] Store job statistics: files processed, symbols extracted, etc.
- [ ] Link jobs to repositories

#### Technical Notes
- `index_jobs` table is source of truth (not pg-boss tables)
- pg-boss job ID stored in `index_jobs.queue_job_id` for correlation
- Frontend polls `index_jobs` for status updates

#### Files to Create
- `src/queue/job-tracker.ts` - Job status tracking functions

#### Example Implementation
```typescript
export async function createIndexJob(
  repositoryId: string,
  commitSha: string
): Promise<string> {
  const { data, error } = await supabase
    .from('index_jobs')
    .insert({
      repository_id: repositoryId,
      status: 'pending',
      commit_sha: commitSha,
    })
    .select()
    .single()

  if (error) throw error

  // Queue the job with pg-boss
  const jobId = await queue.send('index-repo', {
    indexJobId: data.id,
    repositoryId,
    commitSha,
  })

  return data.id
}

export async function updateJobStatus(
  jobId: string,
  status: 'processing' | 'completed' | 'failed',
  metadata?: {
    error?: string
    stats?: { filesProcessed: number; symbolsExtracted: number }
  }
) {
  const updates: any = { status }

  if (status === 'processing') {
    updates.started_at = new Date().toISOString()
  } else if (status === 'completed' || status === 'failed') {
    updates.completed_at = new Date().toISOString()
  }

  if (metadata?.error) {
    updates.error_message = metadata.error
  }

  if (metadata?.stats) {
    updates.stats = metadata.stats
  }

  await supabase.from('index_jobs').update(updates).eq('id', jobId)
}
```

---

### Issue #14: Build indexing worker

**Priority**: P0 (Critical)
**Depends on**: #11 (extraction pipeline), #13 (job tracking), #12 (queue)
**Blocks**: Production indexing

#### Description
Implement worker that consumes `index-repo` jobs, orchestrates the full indexing pipeline, and handles errors gracefully.

#### Acceptance Criteria
- [ ] Worker consumes jobs from `index-repo` queue
- [ ] Orchestrate full pipeline: clone → parse → extract → store
- [ ] Update job status at each stage
- [ ] Handle partial failures (e.g., some files fail to parse)
- [ ] Store extracted data atomically (transaction)
- [ ] Clean up temporary files after processing
- [ ] Retry logic via pg-boss (automatic)
- [ ] Log all worker activity with correlation IDs

#### Technical Notes
- Clone repos to temp directory (`/tmp/kotadb-<job-id>/`)
- Use GitHub App tokens for private repo access (from #16)
- Parse all supported files (TS/JS/JSX/TSX)
- Store symbols, references, dependencies in transaction
- Clean up even if job fails

#### Files to Create
- `src/queue/workers/index-repo.ts` - Main indexing worker
- `src/queue/workers/orchestrator.ts` - Pipeline orchestration

#### Example Implementation
```typescript
export async function startIndexWorker() {
  await queue.work('index-repo', { teamSize: 3, teamConcurrency: 1 }, async (job) => {
    const { indexJobId, repositoryId, commitSha } = job.data

    try {
      await updateJobStatus(indexJobId, 'processing')

      // Step 1: Clone repository
      const repoPath = await cloneRepository(repositoryId, commitSha)

      // Step 2: Parse all files
      const files = await discoverFiles(repoPath)
      const parsedFiles = await parseFiles(files)

      // Step 3: Extract symbols, references, dependencies
      const symbols = await extractSymbols(parsedFiles)
      const references = await extractReferences(parsedFiles)
      const dependencies = await extractDependencies(parsedFiles, symbols, references)

      // Step 4: Store in database (transaction)
      await storeIndexedData(repositoryId, {
        files: parsedFiles,
        symbols,
        references,
        dependencies,
      })

      // Step 5: Update job status
      await updateJobStatus(indexJobId, 'completed', {
        stats: {
          filesProcessed: parsedFiles.length,
          symbolsExtracted: symbols.length,
        },
      })

      // Step 6: Clean up
      await fs.rm(repoPath, { recursive: true })
    } catch (error) {
      await updateJobStatus(indexJobId, 'failed', {
        error: error.message,
      })
      throw error // pg-boss will retry
    }
  })
}
```

---

## Success Criteria

- [ ] pg-boss queue is operational with Supabase
- [ ] Jobs are tracked in `index_jobs` table
- [ ] Worker processes repos end-to-end successfully
- [ ] Failed jobs are retried automatically
- [ ] Job status is visible to frontend via API
- [ ] Worker logs are structured and queryable

## Dependencies for Other Epics

This epic enables:
- Epic 5 (GitHub webhooks queue indexing jobs)
- Epic 6 (REST API exposes job status)
- Epic 7 (MCP tools query indexed data)
