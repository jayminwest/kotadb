# Chore Plan: Standardize Postgres Usage and Remove SQLite Implementation

## Context

KotaDB currently has a **dual database implementation** where SQLite and Supabase (PostgreSQL) code coexist in the codebase. This creates:
- **Confusion**: Developers don't know which database client to use
- **Type mismatches**: SQLite uses `INTEGER` IDs, Postgres uses `UUID`
- **Schema drift**: SQLite has 3 tables, Postgres has 10 tables
- **Security gaps**: SQLite has no Row Level Security (RLS); production security model depends on Postgres
- **Deployment risk**: Production expects Postgres; SQLite code path is dead code

This chore addresses **Epic 1: Database Foundation** by completing the SQLite-to-Postgres migration and removing all SQLite remnants. This is a **high-priority, medium-effort** maintenance task that must be completed before implementing API key generation (#25) and rate limiting (#26), which depend on Postgres-only tables.

**Constraints**:
- No production data in SQLite (dev-only) — safe to remove
- Must maintain backward compatibility with existing API endpoints
- All tests must pass with Postgres client only
- Zero downtime requirement (Postgres already deployed)

## Relevant Files

### Core Database Layer
- `src/db/schema.ts` — **Legacy SQLite schema initialization (DELETE or gut)**
  - Contains `openDatabase()`, `ensureSchema()` using `bun:sqlite` API
  - Creates 3 tables: `files`, `index_runs`, `migrations` with SQLite syntax
- `src/db/client.ts` — **Production Supabase client (KEEP, enhance)**
  - Service role and anon client initialization
  - RLS context management (`setUserContext`, `clearUserContext`)
  - Already production-ready, no changes needed

### Bootstrap & Initialization
- `src/index.ts:2,7-8,10,35` — **Remove SQLite initialization**
  - Currently imports from `@db/schema` and calls `openDatabase()`, `ensureSchema()`
  - Passes SQLite `db` instance to router
  - Must migrate to Supabase client initialization

### API Query Layer
- `src/api/queries.ts` — **Refactor all query functions**
  - Line 1: Imports `Database` from `bun:sqlite`
  - Functions: `recordIndexRun`, `updateIndexRunStatus`, `saveIndexedFiles`, `searchFiles`, `listRecentFiles`
  - All use SQLite-specific syntax (`.prepare()`, `.run()`, `.all()`)
  - Must migrate to Supabase `.from()` syntax
  - Table name changes: `files` → `indexed_files`, `index_runs` → `index_jobs`
  - Type changes: `INTEGER` → `UUID`, `TEXT` timestamps → `timestamptz`

### API Routing
- `src/api/routes.ts` — **Update router initialization**
  - Currently accepts SQLite `Database` instance
  - Must change to accept/use Supabase client

### Type Definitions
- `src/types/index.ts` — **Update type definitions**
  - Currently imports `Database` from `bun:sqlite` for type annotations
  - Must migrate to Supabase types

### MCP Protocol Layer
- `src/mcp/handler.ts` — **Update database client usage**
- `src/mcp/tools.ts` — **Update query calls to use Supabase**

### Test Suite
- `tests/mcp/tools.test.ts` — **Migrate to Supabase test client**
- `tests/mcp/handshake.test.ts` — **Update database setup**
- `tests/mcp/errors.test.ts` — **Update database mocks**
- `tests/api/authenticated-routes.test.ts` — **Update to use Supabase client**
- `tests/smoke.test.ts` — **Verify no SQLite dependencies**

### Configuration Files
- `.env.sample:8,13` — **Update database environment variables**
  - Remove `KOTA_DB_PATH=data/kotadb.sqlite`
  - Remove `DATABASE_URL_LOCAL=sqlite:///data/kotadb.sqlite`
  - Ensure `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` are documented
- `CLAUDE.md` — **Update architecture documentation**
  - Remove SQLite references from "Database" section
  - Update to reference only Postgres/Supabase
- `README.md` — **Update getting started guide**
  - Remove SQLite setup instructions
  - Ensure Supabase setup is documented
- `docker-compose.yml` — **Update environment variables**
  - Remove SQLite volume mounts if present
  - Ensure Supabase env vars are passed to containers

### New Files
- `docs/specs/chore-27-standardize-postgres-remove-sqlite.md` — **This plan document**
- `src/db/queries/indexed_files.ts` — **Postgres query helpers for indexed_files table (optional refactor)**
- `src/db/queries/index_jobs.ts` — **Postgres query helpers for index_jobs table (optional refactor)**

## Work Items

### Preparation
1. **Verify Supabase connectivity**
   - Ensure `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` are set in `.env`
   - Verify connection with quick test script: `bun run src/db/client.ts` should not throw
2. **Backup current state**
   - Commit any uncommitted work: `git status` should be clean
   - Create feature branch from `develop`: `git checkout -b chore/27-standardize-postgres-remove-sqlite`
3. **Audit SQLite usage**
   - Run `git grep "bun:sqlite"` to list all import locations (9 files identified)
   - Run `git grep "from.*@db/schema"` to find all consumers of legacy schema (4 files identified)
   - Document all affected files and functions

### Execution
1. **Phase 1: Update API query layer** (src/api/queries.ts)
   - Remove `import type { Database } from "bun:sqlite"`
   - Add `import { getServiceClient, type SupabaseClient } from "@db/client"`
   - Refactor `recordIndexRun()`:
     - Change signature: `db: Database` → `client: SupabaseClient`
     - Replace `index_runs` → `index_jobs`
     - Use Supabase `.insert()` instead of SQLite `.prepare().run()`
     - Generate UUID for `id` instead of relying on `AUTOINCREMENT`
     - Set `user_id` from `userId` parameter (not ignored)
   - Refactor `updateIndexRunStatus()`:
     - Change to use `index_jobs` table
     - Use `.update()` with `.eq('id', id)`
   - Refactor `saveIndexedFiles()`:
     - Change to use `indexed_files` table
     - Add `repository_id` UUID (derive from `projectRoot` or accept as parameter)
     - Use `.upsert()` for conflict handling
     - Set `language`, `size_bytes` if available
   - Refactor `searchFiles()`:
     - Use `indexed_files` table
     - Use `.ilike('content', `%${term}%`)` or full-text search with `.textSearch('content', term)`
     - Update filters to use `repository_id` instead of `project_root`
   - Refactor `listRecentFiles()`:
     - Use `indexed_files` table with `.order('indexed_at', { ascending: false })`

2. **Phase 2: Update API routing layer** (src/api/routes.ts)
   - Change `createRouter()` signature to accept/use `SupabaseClient` instead of SQLite `Database`
   - Pass Supabase client to all query functions
   - Update type imports

3. **Phase 3: Update bootstrap logic** (src/index.ts)
   - Remove imports: `import { ensureSchema, openDatabase } from "@db/schema"`
   - Add import: `import { getServiceClient } from "@db/client"`
   - Replace `openDatabase()` and `ensureSchema()` calls with:
     ```typescript
     const supabase = getServiceClient();
     const router = createRouter(supabase);
     ```
   - Update console log from "Using SQLite database at..." to "Connected to Supabase at [SUPABASE_URL]"
   - Add error handling for missing Supabase credentials

4. **Phase 4: Update MCP protocol layer**
   - Update `src/mcp/handler.ts`: Change to use Supabase client
   - Update `src/mcp/tools.ts`: Replace query calls with Supabase-based queries
   - Update type imports

5. **Phase 5: Update type definitions** (src/types/index.ts)
   - Remove `import type { Database } from "bun:sqlite"`
   - Add Supabase-compatible type definitions (UUID, timestamptz)
   - Update `IndexedFile`, `IndexRequest` interfaces to match Postgres schema

6. **Phase 6: Remove or refactor SQLite schema file** (src/db/schema.ts)
   - **Option A** (recommended): Delete file entirely
     - Only if no Postgres-compatible helpers are needed
   - **Option B**: Refactor to Postgres migration runner
     - Remove `openDatabase()`, `ensureSchema()`, SQLite imports
     - Optionally add `runMigrations()` function for Postgres migrations

7. **Phase 7: Update configuration files**
   - `.env.sample`:
     - Remove `KOTA_DB_PATH=data/kotadb.sqlite`
     - Remove `DATABASE_URL_LOCAL=sqlite:///data/kotadb.sqlite`
     - Add comments documenting required Supabase env vars
   - `CLAUDE.md`:
     - Update "Database (src/db/)" section to remove SQLite references
     - Update "Database path: data/kotadb.sqlite" to "Supabase connection via environment variables"
   - `README.md`:
     - Remove SQLite setup instructions
     - Add Supabase setup section (link to docs/supabase-setup.md if exists)
   - `docker-compose.yml`:
     - Remove SQLite-related environment variables and volume mounts
     - Ensure Supabase env vars are available in container

8. **Phase 8: Update test suite**
   - Create test helper for Supabase test database setup
   - Update `tests/mcp/tools.test.ts`: Replace SQLite mock with Supabase test client
   - Update `tests/mcp/handshake.test.ts`: Use Supabase client for setup
   - Update `tests/mcp/errors.test.ts`: Update database mocks
   - Update `tests/api/authenticated-routes.test.ts`: Migrate to Supabase
   - Update `tests/smoke.test.ts`: Verify Supabase connection, not SQLite

### Follow-up
1. **Verify no SQLite remnants**
   - Run `git grep "bun:sqlite"` → should return 0 results
   - Run `git grep "Database.*from.*bun"` → should return 0 results
   - Run `git grep "KOTA_DB_PATH"` → should return 0 results
   - Verify no `data/kotadb.sqlite*` files created on server start
2. **Manual smoke test**
   - Start server: `bun run src/index.ts`
   - Verify Supabase connection success in logs
   - Test `POST /index` endpoint
   - Test `GET /search` endpoint
   - Test `GET /files/recent` endpoint
   - Verify data appears in Supabase dashboard
3. **Documentation verification**
   - Ensure all docs reference Postgres/Supabase, not SQLite
   - Update any developer onboarding docs
4. **CI/CD updates**
   - Ensure CI has Supabase credentials configured (or uses test database)
   - Verify GitHub Actions workflow passes

## Step by Step Tasks

### Phase 1: Audit and Preparation
1. Verify all Supabase environment variables are set locally
2. Create feature branch `chore/27-standardize-postgres-remove-sqlite` from `develop`
3. Run `git grep "bun:sqlite"` and document affected files
4. Run `bun test` to establish baseline (tests may fail, that's expected)

### Phase 2: Query Layer Migration
1. Open `src/api/queries.ts` and refactor `recordIndexRun()` to use Supabase `.insert()`
2. Refactor `updateIndexRunStatus()` to use `.update().eq()`
3. Refactor `saveIndexedFiles()` to use `indexed_files` table and `.upsert()`
4. Refactor `searchFiles()` to use `.ilike()` or `.textSearch()`
5. Refactor `listRecentFiles()` to use `.select().order()`
6. Update all function signatures to accept `SupabaseClient` instead of `Database`
7. Update type imports at top of file

### Phase 3: Bootstrap and Router
1. Update `src/index.ts` to remove SQLite imports and initialization
2. Initialize Supabase client with `getServiceClient()`
3. Pass Supabase client to router
4. Update console logs
5. Update `src/api/routes.ts` to accept `SupabaseClient` instead of `Database`

### Phase 4: MCP Layer
1. Update `src/mcp/handler.ts` to use Supabase client
2. Update `src/mcp/tools.ts` to call refactored query functions
3. Remove SQLite type imports

### Phase 5: Type Definitions
1. Update `src/types/index.ts` to remove SQLite imports
2. Add Supabase-compatible types (UUID, timestamptz)
3. Update interfaces to match Postgres schema (repository_id vs project_root)

### Phase 6: Remove SQLite Schema
1. Delete `src/db/schema.ts` entirely (recommended)
2. Verify no other files import from this module
3. If needed, create Postgres migration runner as replacement

### Phase 7: Configuration Updates
1. Update `.env.sample` to remove SQLite vars, document Supabase vars
2. Update `CLAUDE.md` database section
3. Update `README.md` getting started guide
4. Update `docker-compose.yml` if needed

### Phase 8: Test Migration
1. Create `tests/helpers/supabase-test-client.ts` for test database setup
2. Update each test file to use Supabase test client
3. Run `bun test` and fix failures iteratively
4. Ensure all tests pass with Postgres client only

### Phase 9: Validation
1. Run full validation suite (see Validation Commands below)
2. Perform manual smoke tests
3. Verify no SQLite imports remain
4. Check Supabase dashboard for data integrity

## Risks

| Risk | Mitigation |
|------|------------|
| **Breaking existing tests that depend on SQLite** | Update tests incrementally, create reusable Supabase test helpers, use test database or in-memory Postgres |
| **Missing Supabase environment variables in CI/dev** | Update `.env.sample` with clear documentation, add validation check in bootstrap that throws clear error if vars missing, update CI config to inject test credentials |
| **Data loss if SQLite was still in use** | Epic 1 is dev-only; no production data in SQLite; safe to remove. Verify with team before proceeding if unsure |
| **Type mismatches between SQLite INTEGER and Postgres UUID** | Update all type definitions systematically, use UUID generation library (`crypto.randomUUID()`), ensure foreign keys use correct UUID types |
| **Schema drift between SQLite and Postgres tables** | Use docs/schema.md as authoritative reference, map old table names to new (files → indexed_files, index_runs → index_jobs) |
| **RLS policies not enforced during migration** | Ensure `userId` parameter is properly passed to query functions, use anon client for user-scoped queries, service client only for admin operations |
| **Performance regression from SQLite to Postgres** | Postgres is production-ready and already deployed; no performance concerns; connection pooling handled by Supabase |
| **Broken MCP endpoints due to client changes** | Test MCP tools thoroughly, ensure session management still works, verify authentication flow unchanged |

## Validation Commands

### Required Validation (always run)
```bash
bun run lint          # Biome linting
bun run typecheck     # TypeScript type checking
bun test              # Full test suite
bun run build         # Production build verification
```

### Supplemental Checks (impact level: HIGH)
```bash
# Verify no SQLite imports remain
git grep "bun:sqlite"
git grep "Database.*from.*bun"
git grep "KOTA_DB_PATH"

# Verify Supabase client usage
git grep "@supabase/supabase-js"
git grep "getServiceClient\|getAnonClient"

# Manual smoke tests
bun run src/index.ts  # Start server, check logs
curl http://localhost:3000/health
curl -X POST http://localhost:3000/index -H "Content-Type: application/json" -d '{"repository": "test/repo"}'
curl "http://localhost:3000/search?term=test"
curl http://localhost:3000/files/recent

# Verify no SQLite files created
ls -la data/kotadb.sqlite*  # Should not exist after restart

# Check Supabase dashboard
# Log into Supabase console and verify:
# - index_jobs table populated
# - indexed_files table populated
# - No errors in logs
```

### Test Coverage Verification
```bash
# Run tests with coverage (if configured)
bun test --coverage

# Verify specific test suites pass
bun test tests/api/
bun test tests/mcp/
bun test tests/auth/
```

## Deliverables

### Code Changes
- ✅ `src/api/queries.ts` — Refactored to use Supabase client with Postgres schema
- ✅ `src/api/routes.ts` — Updated to accept/use Supabase client
- ✅ `src/index.ts` — Bootstrap logic migrated to Supabase initialization
- ✅ `src/mcp/handler.ts` — Updated to use Supabase client
- ✅ `src/mcp/tools.ts` — Refactored to call Supabase-based queries
- ✅ `src/types/index.ts` — Updated type definitions for Postgres schema
- ✅ `src/db/schema.ts` — **DELETED** (SQLite implementation removed)
- ✅ All test files migrated to Supabase test client

### Config Updates
- ✅ `.env.sample` — SQLite vars removed, Supabase vars documented
- ✅ `docker-compose.yml` — Environment variables updated (if applicable)

### Documentation Updates
- ✅ `CLAUDE.md` — Database section updated to reference only Postgres/Supabase
- ✅ `README.md` — Getting started guide updated with Supabase setup
- ✅ `docs/specs/chore-27-standardize-postgres-remove-sqlite.md` — This plan document created
- ✅ `.claude/commands/conditional_docs.md` — Updated with conditions for this spec (if needed)

### Validation Evidence
- ✅ All tests pass: `bun test` exits 0
- ✅ Type checking passes: `bunx tsc --noEmit` exits 0
- ✅ Linting passes: `bun run lint` exits 0
- ✅ No SQLite imports: `git grep "bun:sqlite"` returns 0 results
- ✅ Server starts successfully with Supabase connection
- ✅ Manual API smoke tests pass
- ✅ Supabase dashboard shows indexed data
