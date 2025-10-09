# Feature Plan: Database Foundation & Supabase Migration

## Overview

### Problem
KotaDB currently uses SQLite (`bun:sqlite`) with a simple in-process database schema (src/db/schema.ts:27-57) that supports basic file indexing and job tracking. To scale the platform for multi-tenant SaaS use with user authentication, API key management, and team collaboration, we need:
- Multi-user authentication (Supabase Auth integration)
- Row Level Security (RLS) for data isolation
- API key tier management with rate limiting
- Organization/team support
- Advanced code intelligence (symbols, references, dependencies)
- Managed PostgreSQL with automatic backups and connection pooling

The current SQLite schema has only 3 tables (`migrations`, `files`, `index_runs`) and lacks user ownership, authentication, or security boundaries.

### Desired Outcome
Migrate from SQLite to Supabase PostgreSQL with a complete 8-table schema that enables:
1. **User & Auth**: Leverage Supabase Auth for user management (auth.users table)
2. **API Keys**: Tiered key system (free/solo/team) with bcrypt-hashed secrets and rate limiting
3. **Organizations**: Multi-user team workspaces with role-based access
4. **Repository Management**: User/org-owned repositories with GitHub App integration hooks
5. **Code Intelligence**: Symbol extraction, cross-references, and dependency graphs
6. **Row Level Security**: RLS policies ensure users only see their own data or org-shared data
7. **Migration System**: Versioned SQL migrations with up/down support and CI integration
8. **Type Safety**: Generated TypeScript types from Supabase schema for compile-time safety

### Non-Goals
- Migrating existing SQLite data (fresh start; current DB is dev-only)
- Building a web UI for user/org management (API-first; UI in future epic)
- Implementing GitHub OAuth flow (Supabase Auth handles this; configuration only)
- Advanced rate limiting strategies (Redis-backed, distributed counters) - using simple PostgreSQL function
- Multi-region deployment or read replicas (Supabase handles infrastructure)
- Full-text search optimization beyond basic PostgreSQL indexes (vector search deferred)

---

## Technical Approach

### Architecture Notes

**Migration Strategy: Parallel Tracks → Cutover**
1. **Phase 1**: Schema design and Supabase setup (no code changes to indexer/API)
2. **Phase 2**: Supabase client integration alongside SQLite (dual-write preparation)
3. **Phase 3**: Migration system implementation (SQL versioning, rollback)
4. **Phase 4**: Refactor API/indexer to use Supabase client (remove SQLite dependencies)
5. **Phase 5**: Update deployment configs and documentation

**Key Architectural Changes**:
- **Database Driver**: Replace `bun:sqlite` (src/db/schema.ts:3) with `@supabase/supabase-js`
- **Schema Location**: Move from inline `db.exec()` SQL strings to versioned `src/db/migrations/*.sql` files
- **Connection Management**: Replace synchronous `openDatabase()` with async Supabase client (connection pooling automatic)
- **Type Generation**: Use Supabase CLI to generate TypeScript types from live schema (`src/db/types.ts`)
- **Row Level Security**: All queries filter by `user_id` (extracted from API key or JWT) via RLS policies
- **Rate Limiting**: Replace in-memory counters with PostgreSQL `rate_limit_counters` table + atomic RPC function

**Data Model Evolution**:

| Current (SQLite) | New (Supabase) | Relationship |
|------------------|----------------|--------------|
| `files` (project_root, path) | `indexed_files` (repository_id, path) | Now owned by `repositories` table |
| `index_runs` (repository, ref) | `index_jobs` (repository_id, status, stats) | Owned by `repositories`, tracks detailed metrics |
| N/A | `repositories` (user_id, org_id, full_name) | Central ownership table |
| N/A | `api_keys` (user_id, tier, secret_hash) | Authentication + rate limiting |
| N/A | `organizations`, `user_organizations` | Team collaboration |
| N/A | `symbols`, `references`, `dependencies` | Code intelligence layer |

**Supabase Features Leveraged**:
- **Supabase Auth**: Pre-built user management (auth.users, magic links, OAuth)
- **Supabase Storage**: Future use for large file caching (deferred to Epic 3)
- **Supabase RPC**: Expose PostgreSQL functions as REST endpoints (`increment_rate_limit`)
- **Supabase Realtime**: Future use for live index job progress (deferred)
- **Supabase Studio**: Web UI for schema inspection and RLS policy testing

### Key Modules to Touch

**Existing Files to Modify**:
- `src/db/schema.ts:27-57` — **Remove** inline `ensureSchema()` SQL; replace with migration runner call
- `src/db/schema.ts:12-24` — **Replace** `openDatabase()` with `initSupabaseClient()` (async)
- `src/index.ts` — Update bootstrap to call async `runMigrations()` + `initSupabaseClient()`
- `src/api/queries.ts` — Refactor all DB queries to use Supabase client (`supabase.from('indexed_files').select()`)
- `src/api/routes.ts` — Add API key validation middleware, extract `user_id` for RLS context
- `src/indexer/repos.ts` — Update to insert into `repositories` table before indexing
- `src/indexer/parsers.ts` — Insert into `indexed_files` (no longer `files` table)
- `src/indexer/extractors.ts` — Insert into new `symbols`, `dependencies` tables
- `package.json:17` — Add `@supabase/supabase-js` dependency
- `.env.sample:14-18` — Replace SQLite `DATABASE_URL_*` vars with `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`
- `tsconfig.json:16-20` — Already has path aliases; no changes needed (keeps `@db/*`)

**New Files to Create**:
- `src/db/client.ts` — Supabase client initialization with service role + anon clients
- `src/db/health.ts` — Connection health check for readiness probes
- `src/db/migrate.ts` — Migration runner (apply pending, track in `migrations` table)
- `src/db/rollback.ts` — Rollback last applied migration
- `src/db/types.ts` — **Generated** TypeScript types from Supabase schema (via `supabase gen types`)
- `src/db/schema.sql` — Master schema definition (for reference; not executed directly)
- `src/db/migrations/001_initial_schema.sql` — Create all 8 tables + RLS policies
- `src/db/migrations/001_initial_schema_rollback.sql` — Drop all tables (cascade)
- `src/db/functions/increment_rate_limit.sql` — PostgreSQL function for atomic rate limit increments
- `src/middleware/auth.ts` — API key validation middleware (extract `user_id` from key or JWT)
- `scripts/create-migration.sh` — CLI tool to generate numbered migration stubs
- `scripts/migrate.sh` — Shell wrapper for CI/CD migration runs
- `scripts/setup-supabase.sh` — One-time Supabase project setup (create tables, enable RLS)
- `tests/db/migrations.test.ts` — Test migration runner (up/down, idempotency)
- `tests/db/client.test.ts` — Test Supabase client initialization and health checks
- `tests/middleware/auth.test.ts` — Test API key validation and `user_id` extraction
- `docs/schema.md` — Schema documentation with table relationships and RLS policies
- `docs/supabase-setup.md` — Step-by-step Supabase project provisioning guide

### Data/API Impacts

**Breaking Changes**:
- **API Authentication**: All endpoints now require `Authorization: Bearer <api-key>` header (or JWT)
  - Current `/index` and `/search` endpoints are unauthenticated
  - Add migration guide for existing API consumers (if any)
- **Request/Response Formats**:
  - `POST /index` request: `repository` field now required to match `repositories.full_name`
  - Search results now include `repository_id` UUID instead of `project_root` string
  - Index runs return UUID `id` instead of integer `id`
- **Database Schema**:
  - `files` table renamed to `indexed_files`
  - `project_root` column removed; replaced with `repository_id` foreign key
  - All tables use UUID primary keys (instead of INTEGER AUTOINCREMENT)
  - Timestamps use `timestamptz` (instead of TEXT ISO8601)

**New API Contracts**:
- **API Key Format**: `kota_<tier>_<key_id>_<secret>` (e.g., `kota_free_abc123_def456...`)
  - `key_id`: public identifier (16 hex chars)
  - `secret`: bcrypt-hashed portion (32 hex chars)
- **Rate Limit Headers**: Response includes `X-RateLimit-Remaining`, `X-RateLimit-Reset` (via middleware)
- **Error Responses**: New 401 Unauthorized (invalid key), 429 Too Many Requests (rate limit exceeded)

**Database Constraints**:
- Foreign keys with `ON DELETE CASCADE` (e.g., deleting repository deletes all indexed files)
- Unique constraints: `api_keys.key_id`, `repositories(user_id, full_name)`, `indexed_files(repository_id, path)`
- Check constraints: `api_keys.tier IN ('free', 'solo', 'team')`, `index_jobs.status IN (...)`, `symbols.kind IN (...)`

---

## Relevant Files

### Existing Files

**Core Database**:
- `src/db/schema.ts:1-57` — Current SQLite schema; will be replaced with Supabase client initialization
- `src/index.ts:5-24` — Bootstrap logic; needs async migration runner + Supabase client init

**API Layer**:
- `src/api/routes.ts:19-58` — Router logic; add auth middleware before handlers
- `src/api/queries.ts:1-78` — DB query functions; refactor for Supabase client (`.from()`, `.select()`, `.insert()`)

**Indexer**:
- `src/indexer/repos.ts:1-85` — Repository cloning; add `repositories` table insert before indexing
- `src/indexer/parsers.ts:1-120` — File parsing; update table name `files` → `indexed_files`
- `src/indexer/extractors.ts:1-45` — Dependency extraction; add symbol/reference insertion

**Configuration**:
- `package.json:17` — Dependencies; add `@supabase/supabase-js`, `bcrypt` (for key hashing)
- `.env.sample:10-18` — Environment variables; replace SQLite vars with Supabase vars
- `tsconfig.json:16-22` — Path aliases; already includes `@db/*` (no change needed)

**Tests**:
- `tests/smoke.test.ts` — Existing test pattern; reference for new DB tests

### New Files

**Database Layer**:
- `src/db/client.ts` — Initialize Supabase client (service role for admin, anon for RLS-enforced)
- `src/db/health.ts` — Health check function for Kubernetes/Docker readiness probes
- `src/db/migrate.ts` — Migration runner: apply pending migrations from `src/db/migrations/`
- `src/db/rollback.ts` — Rollback runner: undo last applied migration
- `src/db/types.ts` — **Generated** TypeScript types from Supabase schema (run `supabase gen types`)
- `src/db/schema.sql` — Master schema reference (not executed; migrations are source of truth)

**Migrations**:
- `src/db/migrations/001_initial_schema.sql` — Create 8 tables: `api_keys`, `organizations`, `user_organizations`, `rate_limit_counters`, `repositories`, `index_jobs`, `indexed_files`, `symbols`, `references`, `dependencies`
- `src/db/migrations/001_initial_schema_rollback.sql` — Drop all tables with CASCADE
- `src/db/functions/increment_rate_limit.sql` — PostgreSQL function for atomic rate limit counter updates

**Middleware**:
- `src/middleware/auth.ts` — API key validation: parse `Authorization` header, hash secret, query `api_keys` table, extract `user_id`

**Scripts**:
- `scripts/create-migration.sh` — Generate numbered migration files (e.g., `002_add_indexes.sql`, `002_add_indexes_rollback.sql`)
- `scripts/migrate.sh` — Run migrations in CI/CD (wrapper around `bun run src/db/migrate.ts`)
- `scripts/setup-supabase.sh` — One-time setup: create Supabase project, run initial migration, enable RLS

**Tests**:
- `tests/db/migrations.test.ts` — Test migration system: apply, rollback, idempotency, tracking
- `tests/db/client.test.ts` — Test Supabase client: connection, health check, service vs anon role
- `tests/middleware/auth.test.ts` — Test API key validation: valid key, invalid key, expired key, rate limit

**Documentation**:
- `docs/schema.md` — Schema documentation: table descriptions, relationships (ERD), RLS policies, indexes
- `docs/supabase-setup.md` — Supabase provisioning guide: create project, set env vars, run migrations, verify RLS

---

## Task Breakdown

### Phase 1: Schema Design & Supabase Setup (No Code Changes)
**Goal**: Design complete schema, provision Supabase project, validate RLS policies in Supabase Studio.

- Write `src/db/schema.sql` with all 8 table definitions
- Write `src/db/migrations/001_initial_schema.sql` (create tables + RLS policies)
- Write `src/db/migrations/001_initial_schema_rollback.sql` (drop tables)
- Write `src/db/functions/increment_rate_limit.sql` (PostgreSQL function)
- Create Supabase project via web UI (free tier for dev)
- Run initial migration manually via Supabase Studio SQL editor
- Verify RLS policies: test queries with different `user_id` values
- Document schema in `docs/schema.md` (table descriptions, ERD)
- Document setup in `docs/supabase-setup.md` (provisioning steps)

### Phase 2: Supabase Client Integration (Parallel to SQLite)
**Goal**: Add Supabase client alongside existing SQLite, prepare for dual-write testing.

- Add `@supabase/supabase-js` to `package.json` dependencies
- Create `src/db/client.ts` with `initSupabaseClient()` function
- Create `src/db/health.ts` with `checkDatabaseHealth()` function
- Update `.env.sample` with `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`
- Generate TypeScript types: `supabase gen types typescript --local > src/db/types.ts`
- Write `tests/db/client.test.ts` (test client initialization, health check)
- Update `src/index.ts` to initialize Supabase client (but don't use yet; SQLite still active)

### Phase 3: Migration System Implementation
**Goal**: Build migration runner, rollback, and CI integration.

- Implement `src/db/migrate.ts` (migration runner with `migrations` table tracking)
- Implement `src/db/rollback.ts` (rollback last applied migration)
- Create `scripts/create-migration.sh` (generate migration stubs with timestamps)
- Create `scripts/migrate.sh` (CI wrapper for migration runner)
- Write `tests/db/migrations.test.ts` (test apply, rollback, idempotency)
- Update `src/index.ts` to run migrations on startup (`await runMigrations()`)
- Test migration flow: apply 001, rollback, re-apply (verify idempotency)

### Phase 4: API Key Middleware & Authentication
**Goal**: Implement API key validation, rate limiting, and `user_id` extraction for RLS.

- Implement `src/middleware/auth.ts` (parse header, hash secret, query `api_keys`, check rate limit)
- Add `bcrypt` dependency to `package.json` (for secret hashing)
- Update `src/api/routes.ts` to apply auth middleware before handlers
- Write `tests/middleware/auth.test.ts` (valid key, invalid key, rate limit exceeded)
- Add rate limit response headers (`X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- Document API key format in `docs/schema.md` (`kota_<tier>_<key_id>_<secret>`)

### Phase 5: Refactor API & Indexer for Supabase
**Goal**: Replace all SQLite queries with Supabase client, update table names, use UUIDs.

- Refactor `src/api/queries.ts`: replace SQLite queries with Supabase `.from()` calls
  - Update table names: `files` → `indexed_files`
  - Use UUID primary keys instead of integers
  - Add RLS context: inject `user_id` from auth middleware
- Refactor `src/indexer/repos.ts`: insert into `repositories` table before cloning
- Refactor `src/indexer/parsers.ts`: insert into `indexed_files` with `repository_id`
- Refactor `src/indexer/extractors.ts`: insert into `symbols`, `references`, `dependencies`
- Remove `src/db/schema.ts` functions: `openDatabase()`, `ensureSchema()` (replaced by migrations)
- Update tests: `tests/smoke.test.ts` now requires auth headers

### Phase 6: Deployment Configuration & Documentation
**Goal**: Update deployment configs, environment templates, and migration guides.

- Update `docker-compose.yml` with Supabase environment variables
- Update `Dockerfile` to run migrations before starting server
- Update `.env.sample` with Supabase vars (remove SQLite vars)
- Write migration guide for existing API consumers (add auth headers)
- Update README.md with Supabase setup instructions
- Add CI/CD step: run migrations before deploy (via `scripts/migrate.sh`)

### Phase 7: Validation & Cleanup
**Goal**: Run full test suite, type-check, lint, manual smoke tests, clean up legacy code.

- Run `bun test` and fix any failures (expect auth-related test updates)
- Run `bunx tsc --noEmit` and fix type errors (UUID vs number conversions)
- Run `bunx biome lint` and fix linting issues
- Manual smoke test: create API key, index repo, search files (with auth headers)
- Remove legacy SQLite code: delete `src/db/schema.ts` (if fully replaced)
- Clean up TODOs and debug logging
- Final documentation review: ensure all steps are accurate

---

## Step by Step Tasks

### Issue #1: Design and Implement Supabase Schema

1. **Create schema SQL file**: Write `src/db/schema.sql` with all table definitions
   - Core tables: `api_keys`, `organizations`, `user_organizations`, `rate_limit_counters`
   - Repository tables: `repositories`, `index_jobs`
   - Code intelligence: `indexed_files`, `symbols`, `references`, `dependencies`
   - Use UUID primary keys, timestamptz timestamps, jsonb for metadata

2. **Create initial migration**: Write `src/db/migrations/001_initial_schema.sql`
   - Copy table definitions from `src/db/schema.sql`
   - Add foreign key constraints with `ON DELETE CASCADE`
   - Add indexes on: `user_id`, `repository_id`, `symbol_id`, `file_id`, `name`, `api_keys.key_id`
   - Add unique constraints: `api_keys.key_id`, `repositories(user_id, full_name)`, `indexed_files(repository_id, path)`
   - Add check constraints: tier, status, kind enums

3. **Add RLS policies to migration**: In `001_initial_schema.sql`, add RLS policies for each table
   - Enable RLS: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
   - Policy for user-owned data: `CREATE POLICY user_select ON <table> FOR SELECT USING (user_id = current_setting('app.user_id')::uuid);`
   - Policy for org-shared data: `CREATE POLICY org_select ON <table> FOR SELECT USING (org_id IN (SELECT org_id FROM user_organizations WHERE user_id = current_setting('app.user_id')::uuid));`
   - Apply to all tables: `api_keys`, `repositories`, `indexed_files`, `symbols`, etc.

4. **Create rollback migration**: Write `src/db/migrations/001_initial_schema_rollback.sql`
   - Drop tables in reverse dependency order (dependencies first, then symbols, files, repos, orgs, keys)
   - Use `DROP TABLE IF EXISTS <table> CASCADE;` for clean rollback

5. **Create rate limit function**: Write `src/db/functions/increment_rate_limit.sql`
   - PostgreSQL function with `INSERT ... ON CONFLICT DO UPDATE` logic
   - Return current count and reset timestamp
   - Include in `001_initial_schema.sql` migration

6. **Provision Supabase project**: Create project via https://supabase.com/dashboard
   - Name: `kotadb-dev` (or custom)
   - Region: closest to dev environment
   - Save project URL and API keys (anon, service role) to `.env`

7. **Run initial migration**: Apply `001_initial_schema.sql` via Supabase Studio SQL editor
   - Copy SQL from migration file
   - Execute in SQL editor
   - Verify all 10 tables created (8 custom + migrations + auth.users reference)

8. **Test RLS policies**: In Supabase Studio, test queries with different `user_id` contexts
   - Set `app.user_id`: `SET LOCAL app.user_id = '<test-uuid>';`
   - Query `repositories` table, verify only user's repos returned
   - Repeat for org-shared data (insert into `user_organizations`, verify access)

9. **Document schema**: Write `docs/schema.md`
   - Table descriptions (purpose, key columns)
   - ERD diagram (use Mermaid or ASCII art)
   - RLS policy explanations
   - Index rationale

10. **Document setup**: Write `docs/supabase-setup.md`
    - Step-by-step provisioning guide
    - Environment variable configuration
    - Initial migration instructions
    - RLS testing procedure

### Issue #2: Set Up Supabase Client and Connection Pooling

11. **Add Supabase dependency**: Update `package.json`
    - Add `"@supabase/supabase-js": "^2.39.0"` to `dependencies`
    - Run `bun install` to fetch package

12. **Create Supabase client module**: Implement `src/db/client.ts`
    - Import `createClient` from `@supabase/supabase-js`
    - Export `supabase` (service role client for admin operations)
    - Export `supabaseAnon` (anon client for RLS-enforced operations)
    - Read `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` from env
    - Add error handling for missing env vars

13. **Implement health check**: Create `src/db/health.ts`
    - Export `checkDatabaseHealth()` async function
    - Query `repositories.count()` with `.limit(1)` to test connection
    - Return `true` if no error, `false` otherwise
    - Add timeout (5s) for health check query

14. **Generate TypeScript types**: Run Supabase type generation
    - Install Supabase CLI: `bun add -d supabase` (or `npm install -g supabase`)
    - Run: `supabase gen types typescript --project-id <project-id> > src/db/types.ts`
    - Commit generated `src/db/types.ts` file
    - Update `src/db/client.ts` to use typed client: `createClient<Database>(...)`

15. **Update environment template**: Modify `.env.sample`
    - Add `SUPABASE_URL=https://<project-id>.supabase.co`
    - Add `SUPABASE_SERVICE_KEY=<service-role-key>`
    - Add `SUPABASE_ANON_KEY=<anon-key>`
    - Remove or deprecate `DATABASE_URL_LOCAL`, `DATABASE_URL_STAGING`, `DATABASE_URL_PROD`

16. **Test client initialization**: Write `tests/db/client.test.ts`
    - Test `supabase` client initializes without error
    - Test `checkDatabaseHealth()` returns true (requires running Supabase project)
    - Test error handling for missing env vars (mock `process.env`)

17. **Add retry logic**: In `src/db/client.ts`, add retry wrapper
    - Export `withRetry(fn: () => Promise<T>, maxRetries = 3)` helper
    - Retry on transient errors: `ECONNREFUSED`, `ETIMEDOUT`, `PGRST*` errors
    - Exponential backoff: 100ms, 200ms, 400ms

18. **Update bootstrap logic**: Modify `src/index.ts`
    - Import `supabase`, `checkDatabaseHealth` from `src/db/client.ts`
    - Call `await checkDatabaseHealth()` after server starts
    - Log error and exit if health check fails
    - Keep SQLite initialization for now (parallel tracks)

### Issue #3: Implement Migration System with Rollback

19. **Create migrations table migration**: Already in `001_initial_schema.sql`
    - Verify `migrations` table defined: `id serial PRIMARY KEY, name text UNIQUE, applied_at timestamptz`

20. **Implement migration runner**: Create `src/db/migrate.ts`
    - Export `runMigrations()` async function
    - Read all `*.sql` files from `src/db/migrations/` (exclude `*_rollback.sql`)
    - Query `migrations` table for applied migrations
    - For each pending migration: execute SQL, insert into `migrations` table
    - Use transactions: rollback if migration fails
    - Log migration progress (name, duration)

21. **Implement rollback runner**: Create `src/db/rollback.ts`
    - Export `rollbackLastMigration()` async function
    - Query `migrations` table for last applied migration (`ORDER BY applied_at DESC LIMIT 1`)
    - Find corresponding `*_rollback.sql` file
    - Execute rollback SQL, delete from `migrations` table
    - Use transaction: rollback if SQL fails
    - Error if no migrations applied

22. **Create migration generator script**: Write `scripts/create-migration.sh`
    - Usage: `./scripts/create-migration.sh <name>`
    - Generate sequential number: find last migration number, increment
    - Create files: `src/db/migrations/<number>_<name>.sql`, `<number>_<name>_rollback.sql`
    - Populate with template comments: `-- Migration: <name>`, `-- Rollback: <name>`
    - Make script executable: `chmod +x scripts/create-migration.sh`

23. **Create CI migration wrapper**: Write `scripts/migrate.sh`
    - Shell script: `#!/bin/bash`
    - Run: `bun run src/db/migrate.ts`
    - Exit with error code if migration fails
    - Add `--dry-run` flag: log pending migrations without applying
    - Make executable: `chmod +x scripts/migrate.sh`

24. **Add dry-run mode**: Update `src/db/migrate.ts`
    - Check for `--dry-run` CLI flag: `process.argv.includes('--dry-run')`
    - If dry-run: log pending migrations, exit without executing
    - Output format: `Pending: 002_add_indexes.sql`

25. **Test migration system**: Write `tests/db/migrations.test.ts`
    - Test `runMigrations()` applies pending migrations
    - Test `runMigrations()` is idempotent (second run applies nothing)
    - Test `rollbackLastMigration()` undoes last migration
    - Test rollback fails gracefully if no migrations applied
    - Test migration failure rolls back transaction (no partial application)

26. **Integrate migrations into bootstrap**: Update `src/index.ts`
    - Import `runMigrations` from `src/db/migrate.ts`
    - Call `await runMigrations()` before starting server
    - Log migration completion: `Migrations applied successfully`
    - Exit with error if migration fails

27. **Add CI integration**: Update `.github/workflows/*.yml` (if exists, else document)
    - Add step before deploy: `run: ./scripts/migrate.sh`
    - Fail deployment if migrations fail
    - Document in README.md if no CI yet

28. **Test rollback flow**: Manual test
    - Apply `001_initial_schema.sql` via `runMigrations()`
    - Create dummy migration `002_test.sql` (add column)
    - Apply via `runMigrations()`
    - Rollback via `rollbackLastMigration()`
    - Verify column removed, `migrations` table updated

---

## Risks & Mitigations

### Risk: Supabase Free Tier Limits
**Impact**: Free tier limits (500MB storage, 2GB bandwidth) may be exceeded during development with large repositories.
**Mitigation**: Monitor usage via Supabase dashboard. Compress large files before indexing. Defer full repo indexing tests to staging (paid tier). Document upgrade path in `docs/supabase-setup.md`.

### Risk: RLS Policy Misconfiguration
**Impact**: Incorrectly configured RLS policies could leak data between users or block legitimate access.
**Mitigation**: Test RLS policies in Supabase Studio with multiple `user_id` contexts before deploying. Add integration tests that simulate multi-user scenarios. Use Supabase RLS policy templates as starting point. Document policy logic in `docs/schema.md`.

### Risk: Migration Rollback Failures
**Impact**: Rollback SQL may fail if schema has evolved (e.g., data exists, constraints added).
**Mitigation**: Design rollback SQL to be defensive (`DROP TABLE IF EXISTS`, `DROP COLUMN IF EXISTS`). Test rollback immediately after applying migration (before data inserted). Document rollback limitations in migration comments. Add `--force` flag to skip rollback checks in emergencies.

### Risk: API Key Secret Hashing Performance
**Impact**: Bcrypt hashing on every request could add 50-100ms latency.
**Mitigation**: Cache validated keys in-memory with TTL (5 minutes). Use `bcrypt.compare()` async version to avoid blocking event loop. Benchmark with `bun test` performance tests. Consider faster hashing (Argon2) in future if bottleneck confirmed.

### Risk: Type Generation Drift
**Impact**: Generated `src/db/types.ts` may become stale if schema changes applied manually in Supabase Studio.
**Mitigation**: Regenerate types after every migration: add `supabase gen types` to post-migration hook in `src/db/migrate.ts`. Add CI check: compare generated types with committed file, fail if mismatch. Document regeneration in `docs/supabase-setup.md`.

### Risk: Breaking Changes for Existing API Consumers
**Impact**: Current `/index`, `/search` endpoints are unauthenticated; adding auth headers will break existing integrations.
**Mitigation**: This is Epic 1 (foundation); no production API consumers yet (dev-only). Document breaking changes in CHANGELOG.md. When production-ready, add deprecation window: support both SQLite (legacy) and Supabase (new) for 1 release cycle.

### Risk: Foreign Key Cascade Deletes
**Impact**: Deleting a repository cascades to all indexed files, symbols, references (potential data loss).
**Mitigation**: Add soft delete column (`deleted_at timestamptz`) to `repositories` table instead of hard delete. Modify cascade to `ON DELETE SET NULL` for non-critical references. Add admin-only hard delete endpoint with confirmation prompt. Document cascade behavior in `docs/schema.md`.

### Risk: PostgreSQL Function Security
**Impact**: `increment_rate_limit` function could be called directly by malicious clients, bypassing rate limits.
**Mitigation**: Expose function only via Supabase RPC (not public schema). Add RLS policy on `rate_limit_counters` table: only allow updates via function. Validate `key_id` in function body (reject if not in `api_keys` table). Document security model in `docs/schema.md`.

---

## Validation Strategy

### Automated Tests

**Unit Tests**:
- `tests/db/client.test.ts`: Supabase client initialization, health checks, retry logic
- `tests/db/migrations.test.ts`: Migration runner, rollback, idempotency, failure handling
- `tests/middleware/auth.test.ts`: API key parsing, hashing, validation, rate limit checks

**Integration Tests**:
- `tests/api/queries.test.ts`: Supabase queries return correct data, RLS filtering works
- `tests/indexer/repos.test.ts`: Repository insertion before indexing, foreign key constraints
- `tests/indexer/extractors.test.ts`: Symbol/dependency insertion into new tables

**Schema Tests**:
- `tests/db/schema.test.ts`: Verify all 8 tables exist, foreign keys correct, indexes created
- `tests/db/rls.test.ts`: Simulate multi-user scenarios, verify RLS policies enforce isolation

**Coverage Target**: >80% line coverage on `src/db/*`, `src/middleware/auth.ts`

### Manual Checks

**Supabase Studio Verification**:
- Inspect tables via Supabase Studio UI (verify columns, constraints, indexes)
- Test RLS policies with SQL editor: `SET LOCAL app.user_id = '<uuid>'; SELECT * FROM repositories;`
- Verify `increment_rate_limit` function exists in Functions tab
- Check table storage size (ensure no bloat)

**API Smoke Test**:
1. Generate test API key: insert into `api_keys` table via Supabase Studio
2. Start server: `bun run src/index.ts`
3. Test `/index`: `curl -H "Authorization: Bearer <key>" -X POST http://localhost:3000/index -d '{"repository": "owner/repo"}'`
4. Test `/search`: `curl -H "Authorization: Bearer <key>" http://localhost:3000/search?term=function`
5. Verify rate limit headers in response: `X-RateLimit-Remaining`, `X-RateLimit-Reset`
6. Test invalid key: expect 401 Unauthorized
7. Test rate limit: send requests until 429 Too Many Requests

**Migration Flow Test**:
1. Clean Supabase project: drop all tables
2. Run migrations: `bun run src/db/migrate.ts`
3. Verify all tables created: check Supabase Studio
4. Create dummy migration: `./scripts/create-migration.sh test_column`
5. Add column in migration SQL: `ALTER TABLE repositories ADD COLUMN test_column TEXT;`
6. Apply: `bun run src/db/migrate.ts`
7. Verify column exists in Supabase Studio
8. Rollback: `bun run src/db/rollback.ts`
9. Verify column removed

### Release Guardrails

**Pre-Merge Checks** (CI/CD):
- `bunx tsc --noEmit` must pass (no type errors)
- `bunx biome lint` must pass (no linting errors)
- `bun test` must pass (all tests green)
- `./scripts/migrate.sh --dry-run` must show no pending migrations (on main branch)

**Deployment Checklist**:
- [ ] Supabase project provisioned (dev/staging/prod)
- [ ] Environment variables set in deployment platform (Fly.io, Docker Compose, etc.)
- [ ] Migrations applied via `./scripts/migrate.sh` before starting server
- [ ] Health check endpoint returns 200 OK: `GET /health` (add if not exists)
- [ ] Test API key created and validated via API call
- [ ] RLS policies verified via Supabase Studio (multi-user test)
- [ ] Monitor logs for migration errors or RLS denials

**Rollback Plan**:
- Epic 1 is foundational; rollback = revert all commits and restore SQLite schema
- Keep SQLite code in parallel branch until Supabase fully validated
- If rollback needed: switch `src/index.ts` to use SQLite client, redeploy
- Supabase data can be exported via Supabase Studio (SQL dump) for recovery

---

## Validation Commands

Run in order to validate Epic 1 implementation:

```bash
# 1. Install dependencies (including Supabase client)
bun install

# 2. Set up environment variables (copy .env.sample to .env, fill Supabase vars)
cp .env.sample .env
# Edit .env: add SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY

# 3. Generate TypeScript types from Supabase schema
supabase gen types typescript --project-id <your-project-id> > src/db/types.ts

# 4. Type-check TypeScript (must have 0 errors)
bunx tsc --noEmit

# 5. Lint code (must have 0 errors)
bunx biome lint

# 6. Run test suite (must pass all tests)
bun test

# 7. Run migrations (apply to Supabase project)
bun run src/db/migrate.ts
# Expected output: "Migrations applied successfully"

# 8. Test rollback (undo last migration)
bun run src/db/rollback.ts
# Expected output: "Rollback completed: <migration-name>"

# 9. Re-apply migrations (test idempotency)
bun run src/db/migrate.ts
# Expected output: "No pending migrations"

# 10. Start dev server (runs migrations on startup)
bun run src/index.ts
# Expected output: "Server running on port 3000", "Database health check: OK"

# 11. Test database health check
curl http://localhost:3000/health
# Expected: {"status": "ok"}

# 12. Create test API key (via Supabase Studio or SQL)
# In Supabase Studio SQL editor, run:
# INSERT INTO api_keys (id, user_id, key_id, secret_hash, tier, rate_limit_per_hour, enabled)
# VALUES (gen_random_uuid(), '<test-user-id>', 'test_key_abc123', '<bcrypt-hash>', 'free', 100, true);

# 13. Test authenticated /index endpoint
curl -X POST http://localhost:3000/index \
  -H "Authorization: Bearer kota_free_test_key_abc123_<secret>" \
  -H "Content-Type: application/json" \
  -d '{"repository": "owner/repo", "ref": "main"}'
# Expected: {"runId": "<uuid>", "status": "pending"}

# 14. Test authenticated /search endpoint
curl http://localhost:3000/search?term=function \
  -H "Authorization: Bearer kota_free_test_key_abc123_<secret>"
# Expected: {"results": [...], "count": N}

# 15. Test unauthenticated request (should fail)
curl http://localhost:3000/search?term=function
# Expected: 401 Unauthorized

# 16. Test rate limiting (send 101 requests rapidly)
for i in {1..101}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer kota_free_test_key_abc123_<secret>" \
    http://localhost:3000/search?term=test
done
# Expected: First 100 return 200, 101st returns 429

# 17. Verify RLS policies in Supabase Studio
# In SQL editor, run:
# SET LOCAL app.user_id = '<test-user-id>';
# SELECT * FROM repositories;
# Expected: Only repositories owned by test-user-id

# 18. Run type-check again (verify generated types are correct)
bunx tsc --noEmit

# 19. Build check (alias for typecheck)
bun run build

# 20. Final lint check
bunx biome lint
```

**Domain-Specific Validation**:
- Verify `data/` directory no longer contains SQLite file after cutover (removed in Phase 5)
- Check Supabase dashboard: verify 8 custom tables + migrations table exist
- Inspect `api_keys` table: verify test keys have bcrypt-hashed secrets (not plaintext)
- Check `rate_limit_counters` table: verify row created after first API call
- Test organization access: create org, add user to org, verify user can access org repos
- Verify foreign key cascades: delete repository in Supabase Studio, confirm indexed files deleted
- Test migration generator: `./scripts/create-migration.sh add_indexes`, verify files created
- End-to-end test: index real GitHub repo, verify symbols extracted, search returns results

---

## Summary

**Epic 1** establishes the database foundation for KotaDB's multi-tenant SaaS platform by migrating from SQLite to Supabase PostgreSQL. The implementation involves:

1. **Schema Design (Issue #1)**: 8-table schema with user auth, API keys, organizations, repositories, and code intelligence (symbols/dependencies). RLS policies ensure data isolation.

2. **Supabase Client (Issue #2)**: Replace `bun:sqlite` with `@supabase/supabase-js`, add health checks, retry logic, and TypeScript type generation.

3. **Migration System (Issue #3)**: Versioned SQL migrations with up/down support, rollback capability, and CI integration.

Key deliverables:
- Complete schema in `src/db/migrations/001_initial_schema.sql`
- Supabase client in `src/db/client.ts`
- Migration tooling: `src/db/migrate.ts`, `src/db/rollback.ts`, `scripts/create-migration.sh`
- API key middleware in `src/middleware/auth.ts`
- Refactored API/indexer to use Supabase (remove SQLite dependencies)
- Comprehensive docs: `docs/schema.md`, `docs/supabase-setup.md`

This epic blocks all other work (Epics 2-7) as it provides the foundational authentication, data model, and security layer.
