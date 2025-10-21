# Feature Plan: pg-boss Job Queue Infrastructure

**Issue**: #235
**Title**: feat: set up pg-boss job queue infrastructure
**Labels**: component:backend, priority:critical, effort:medium, status:needs-investigation

## Overview

**Problem**:
Currently, all repository indexing runs synchronously in the POST /index endpoint, blocking API requests for 30+ seconds on large repositories. This creates a poor user experience and prevents horizontal scaling since requests cannot be distributed across multiple worker processes.

**Desired Outcome**:
Establish pg-boss job queue infrastructure using Supabase Postgres as the job store. This provides the foundation for asynchronous indexing that will be implemented in subsequent issues. The queue must:
- Use existing Supabase Postgres connection (no external dependencies like Redis/RabbitMQ)
- Support automatic retry logic with exponential backoff
- Track failed jobs in dead letter queue
- Gracefully shutdown without losing in-flight jobs
- Expose health check for monitoring

**Non-Goals**:
- Implementing the actual indexing worker (tracked in issue #237)
- Modifying the /index endpoint to enqueue jobs (tracked in issue #236)
- Building queue monitoring UI or admin dashboard
- Supporting non-indexing job types (can be added later)

## Technical Approach

**Architecture Notes**:
pg-boss is a Postgres-based job queue that creates its own schema (`pgboss`) with automatic job tracking tables. It handles locking, retries, and expiration without external dependencies. The queue will:
- Connect via native Postgres connection string (not PostgREST HTTP API)
- Start on server initialization after database connection verification
- Stop gracefully on SIGTERM, draining in-flight jobs
- Use exponential backoff retry policy (60s, 120s, 180s)

**Key Modules to Touch**:
- `app/src/index.ts` - Bootstrap queue lifecycle (start after DB verification, stop on SIGTERM)
- `app/package.json` - Add pg-boss production dependency
- `app/.env.sample` - Document SUPABASE_DB_URL environment variable
- `app/scripts/dev-start.sh` - Auto-generate SUPABASE_DB_URL in .env file

**Data/API Impacts**:
- New environment variable `SUPABASE_DB_URL` required (native Postgres connection string)
- pg-boss creates `pgboss` schema automatically (no migrations needed)
- Health check function `checkQueueHealth()` will be called by /health endpoint (future work)
- No changes to existing API routes or database schema

## Relevant Files

### Existing Files to Modify
- `app/src/index.ts` - Add queue start/stop lifecycle management
- `app/package.json` - Add `pg-boss` dependency
- `app/.env.sample` - Document SUPABASE_DB_URL with examples
- `app/scripts/dev-start.sh` - Generate SUPABASE_DB_URL from Docker Compose ports
- `app/tsconfig.json` - Add `@queue/*` path alias for `src/queue/*`

### New Files to Create
- `app/src/queue/client.ts` - pg-boss initialization, start/stop/health check functions
- `app/src/queue/config.ts` - Queue configuration constants (retry, expiration, concurrency)
- `app/src/queue/types.ts` - TypeScript job payload types (IndexRepoJobPayload, JobResult)
- `app/tests/queue/client.test.ts` - Queue initialization and health check tests
- `app/tests/queue/lifecycle.test.ts` - Graceful shutdown and in-flight job tests
- `app/tests/queue/config.test.ts` - Configuration validation tests

## Task Breakdown

### Phase 1: Dependencies and Configuration
- Install pg-boss package as production dependency
- Add SUPABASE_DB_URL to .env.sample with documentation
- Update dev-start.sh to generate SUPABASE_DB_URL from Docker Compose
- Add @queue/* path alias to tsconfig.json

### Phase 2: Queue Infrastructure
- Create queue configuration constants (retry, expiration, archival)
- Create TypeScript job payload types
- Implement queue client initialization with error handling
- Implement queue lifecycle functions (start, stop, health check)
- Add structured logging for queue events

### Phase 3: Server Integration and Testing
- Integrate queue start into server bootstrap (after DB verification)
- Integrate queue stop into SIGTERM handler (drain in-flight jobs)
- Write integration tests for queue initialization
- Write integration tests for health checks
- Write integration tests for graceful shutdown
- Validate pgboss schema creation in tests

## Step by Step Tasks

### Installation and Configuration
- Run `cd app && bun add pg-boss` to install pg-boss as production dependency
- Add `SUPABASE_DB_URL` to `app/.env.sample` with development and production examples
- Update `app/scripts/dev-start.sh` to extract PostgreSQL port from Docker Compose and generate native connection string in `.env`
- Add `"@queue/*": ["src/queue/*"]` path alias to `app/tsconfig.json`

### Queue Configuration Module
- Create `app/src/queue/config.ts` with constants:
  - RETRY_LIMIT: 3 attempts
  - RETRY_DELAY: 60 seconds (first retry)
  - RETRY_BACKOFF: true (exponential: 60s, 120s, 180s)
  - EXPIRE_IN_HOURS: 24 hours (stale job cleanup)
  - ARCHIVE_COMPLETED_AFTER: 3600 seconds (1 hour)
  - WORKER_TEAM_SIZE: 3 concurrent workers (for future worker implementation)
- Define queue names enum: INDEX_REPO: 'index-repo'

### Queue Type Definitions
- Create `app/src/queue/types.ts` with TypeScript interfaces:
  - IndexRepoJobPayload: { indexJobId, repositoryId, commitSha }
  - JobResult: { success, filesProcessed?, symbolsExtracted?, error? }
- Export types for use by future worker and API modules

### Queue Client Implementation
- Create `app/src/queue/client.ts` with queue initialization:
  - Validate SUPABASE_DB_URL environment variable (throw if missing)
  - Initialize PgBoss instance with configuration from config.ts
  - Implement startQueue(): start pg-boss, log startup message
  - Implement stopQueue(): stop pg-boss with drain, log shutdown message
  - Implement checkQueueHealth(): verify queue connectivity by checking queue size
- Add error handling for connection failures with descriptive messages
- Add structured logging with timestamps for lifecycle events

### Server Integration
- Update `app/src/index.ts` bootstrap function:
  - Import queue lifecycle functions from @queue/client
  - Call startQueue() after successful database health check
  - Update SIGTERM handler to call stopQueue() before server.close()
  - Add error handling for queue startup failures (log and exit)
- Ensure graceful shutdown drains in-flight jobs before process exits

### Integration Tests - Initialization
- Create `app/tests/queue/client.test.ts`:
  - Test: Queue connects to Supabase Postgres successfully
  - Test: Queue initialization fails with descriptive error when SUPABASE_DB_URL missing
  - Test: pgboss schema is created automatically on first start
  - Use test helpers from `tests/helpers/db.ts` for Supabase connection
  - Follow antimocking philosophy (real Supabase Local, no mocks)

### Integration Tests - Health Checks
- Add health check tests to `app/tests/queue/client.test.ts`:
  - Test: checkQueueHealth() returns true when queue is running
  - Test: checkQueueHealth() returns false when queue is stopped
  - Test: checkQueueHealth() handles connection errors gracefully

### Integration Tests - Graceful Shutdown
- Create `app/tests/queue/lifecycle.test.ts`:
  - Test: Queue drains in-flight jobs on stopQueue()
  - Test: Enqueue job without starting worker, verify job persists after stop/restart
  - Test: SIGTERM handler integration (spawn server process, send signal, verify shutdown)
  - Use real Supabase Local for job persistence validation

### Unit Tests - Configuration
- Create `app/tests/queue/config.test.ts`:
  - Test: Retry configuration matches requirements (3 attempts, 60s delay, exponential backoff)
  - Test: Expiration and archival configuration matches requirements (24h, 1h)
  - Test: Queue names are defined correctly

### Validation and Documentation
- Run `cd app && bun run typecheck` to validate TypeScript compilation
- Run `cd app && bun test` to execute full test suite (verify 100% pass rate)
- Run `cd app && bun run lint` to validate code style
- Update `.env.sample` documentation with clear distinction between SUPABASE_URL (HTTP API) and SUPABASE_DB_URL (native Postgres)
- Document manual verification steps in plan:
  - Start dev server and verify queue startup in logs
  - Check pgboss schema exists: `psql $SUPABASE_DB_URL -c "\\dn"`
  - Check pg-boss tables: `psql $SUPABASE_DB_URL -c "\\dt pgboss.*"`
  - Stop server with Ctrl+C and verify graceful shutdown message

### Git Operations
- Stage all new and modified files: `git add app/src/queue/ app/tests/queue/ app/src/index.ts app/package.json app/.env.sample app/scripts/dev-start.sh app/tsconfig.json docs/specs/feature-235-pgboss-queue-infrastructure.md`
- Run validation suite before commit: `cd app && bun run typecheck && bun test && bun run lint`
- Commit with conventional commit message: `feat: add pg-boss queue infrastructure (#235)`
- Push branch to remote: `git push -u origin feat/235-pgboss-queue-infrastructure`

## Risks & Mitigations

**Risk: Native Postgres connection string format differs between local and production**
- Mitigation: Document both formats clearly in .env.sample with examples
- Mitigation: Add connection string validation in queue client (throw early with clear error)
- Mitigation: Test with both Supabase Local (postgresql://postgres:postgres@localhost:5434/postgres) and cloud format in CI

**Risk: pg-boss schema creation conflicts with Supabase migrations**
- Mitigation: pg-boss uses separate `pgboss` schema, no conflict with `public` schema tables
- Mitigation: Integration test validates pgboss schema creation doesn't affect existing tables
- Mitigation: Document schema isolation in CLAUDE.md queue section

**Risk: Graceful shutdown may not drain jobs before process termination**
- Mitigation: pg-boss.stop() is async and awaits job completion
- Mitigation: Integration test validates jobs persist across restart cycles
- Mitigation: Document timeout behavior (default: 30 seconds) for operations teams

**Risk: Connection pool exhaustion when running alongside existing Supabase client**
- Mitigation: pg-boss uses single connection by default, minimal overhead
- Mitigation: Monitor connection counts in production via pg_stat_activity
- Mitigation: Future optimization: configure pg-boss pool size separately from application pool

**Risk: Missing SUPABASE_DB_URL in production deployment**
- Mitigation: Server fails fast on startup with clear error message
- Mitigation: Document environment variable in deployment guide
- Mitigation: Add health check endpoint that includes queue status (future work)

## Validation Strategy

**Automated Tests (Integration/E2E hitting Supabase per /anti-mock)**:
- Queue initialization test: Verifies pg-boss connects to Supabase Postgres successfully
- Schema creation test: Validates pgboss schema and tables are created automatically
- Health check test: Confirms checkQueueHealth() accurately reflects queue status
- Graceful shutdown test: Ensures in-flight jobs are preserved across restart cycles
- Configuration test: Validates retry, expiration, and archival settings match requirements
- All tests use real Supabase Local instance (no mocks or stubs)

**Manual Checks (Document Data Seeded and Failure Scenarios)**:
- Start development server: `cd app && ./scripts/dev-start.sh`
- Verify queue startup message in logs: "Job queue started"
- Verify SUPABASE_DB_URL is auto-generated in `.env` file
- Check pgboss schema exists: `psql $SUPABASE_DB_URL -c "\\dn"`
- Check pg-boss tables: `psql $SUPABASE_DB_URL -c "\\dt pgboss.*"`
- Expected tables: `pgboss.job`, `pgboss.version`, `pgboss.archive`, `pgboss.schedule`
- Stop server with Ctrl+C, verify graceful shutdown message: "Job queue stopped"
- Restart server, verify queue reconnects without errors

**Failure Scenario Testing**:
- Missing SUPABASE_DB_URL: Server fails fast with clear error message
- Invalid connection string: pg-boss throws connection error on start
- Database unavailable: checkQueueHealth() returns false
- Process killed during job processing: Job remains in queue after restart (verified by lifecycle test)

**Release Guardrails (Monitoring, Alerting, Rollback)**:
- Add queue health metric to /health endpoint (future work in issue #236)
- Monitor pgboss.job table row count for queue depth alerting
- Monitor pg-boss retry counts in pgboss.job (retry_count column)
- Monitor dead letter queue size (pgboss.archive where state = 'failed')
- Rollback strategy: Queue is isolated, can be disabled via feature flag without data loss

## Validation Commands

The following commands must pass before merging:

```bash
# Lint check (code style)
cd app && bun run lint

# Type check (TypeScript compilation)
cd app && bun run typecheck

# Integration tests (real Supabase Local)
cd app && bun test --filter queue

# Full test suite (all integration tests)
cd app && bun test

# Build validation (ensure no compilation errors)
cd app && bun run build
```

**Domain-Specific Checks**:
- Verify pg-boss dependency installed: `cd app && bun pm ls | grep pg-boss`
- Verify SUPABASE_DB_URL in .env.sample: `grep SUPABASE_DB_URL app/.env.sample`
- Verify dev-start.sh generates SUPABASE_DB_URL: `grep -A 5 "SUPABASE_DB_URL" app/scripts/dev-start.sh`
- Verify @queue path alias: `grep -A 1 '"@queue/\*"' app/tsconfig.json`

## Issue Relationships

**Child Of**:
- #234 - Epic 4: Job Queue & Background Processing

**Depends On**:
- #27 (✅ Closed) - Postgres connection already established via Supabase

**Blocks**:
- #236 - Job status tracking infrastructure (requires queue for creating jobs)
- #237 - Indexing worker implementation (requires queue for job consumption)

**Related To**:
- Epic 8 (Monitoring) - Queue health check will be exposed via /health endpoint
- Epic 9 (Deployment) - Production SUPABASE_DB_URL must be configured as secret

**Follow-Up**:
- Add queue metrics to /health endpoint (show queue depth, worker count)
- Add queue monitoring dashboard (view pending/processing/failed jobs)
- Add queue management commands (retry failed jobs, clear dead letter queue)

## References

- Vision document: `docs/vision/epic-4-job-queue.md` (Issue #12)
- Epic tracking issue: #234
- pg-boss documentation: https://github.com/timgit/pg-boss
- Supabase Postgres connection guide: https://supabase.com/docs/guides/database/connecting-to-postgres
- Anti-mock testing philosophy: `.claude/commands/docs/anti-mock.md`
