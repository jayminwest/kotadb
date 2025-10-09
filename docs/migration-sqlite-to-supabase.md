# Migration Guide: SQLite to Supabase

This guide is for developers who have been working with KotaDB before PR #29 and need to migrate from the old SQLite-based implementation to the new Supabase (PostgreSQL) backend.

## Context

As of PR #29, KotaDB has **removed SQLite** and **standardized on Supabase (PostgreSQL)** for all environments. This change:

- Eliminates dual database implementations
- Enables Row Level Security (RLS) for multi-tenant isolation
- Unlocks production features (API keys, rate limiting, organizations)
- Aligns with the production-ready schema (10 tables vs. 3)

## Migration Steps

### 1. Update Your Branch

```bash
# Fetch latest changes
git fetch --all --prune

# If on a feature branch, rebase onto develop
git checkout your-feature-branch
git rebase origin/develop
```

**Expect merge conflicts if you modified:**
- `src/db/schema.ts` (file deleted)
- `src/api/queries.ts` (completely refactored)
- `src/index.ts` (bootstrap logic changed)

### 2. Install Dependencies

```bash
# Supabase client is now required
bun install
```

### 3. Set Up Supabase

Follow the complete setup guide in `docs/supabase-setup.md`:

1. Create Supabase project at https://supabase.com/dashboard
2. Copy API credentials (URL, anon key, service key)
3. Update `.env` file:

```bash
# Remove old SQLite config
# KOTA_DB_PATH=data/kotadb.sqlite  ← DELETE THIS

# Add Supabase config
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

4. Run database migrations (creates 10 tables):

```bash
# Option A: Automated migration runner
bun run src/db/migrate.ts

# Option B: Manual via Supabase Studio SQL Editor
# Copy contents of src/db/migrations/001_initial_schema.sql
# Paste into Studio → Database → SQL Editor → Run
```

### 4. Migrate Existing Data (Optional)

If you have **important test data** in your SQLite database (`data/kotadb.sqlite`), you'll need to manually migrate it.

**Warning**: SQLite schema was dev-only with 3 tables. Supabase has 10 tables with UUIDs and RLS. This is **not a direct mapping**.

#### Extract SQLite Data

```bash
# Dump SQLite data
sqlite3 data/kotadb.sqlite .dump > sqlite_backup.sql

# Inspect tables
sqlite3 data/kotadb.sqlite "SELECT * FROM files LIMIT 5;"
sqlite3 data/kotadb.sqlite "SELECT * FROM index_runs LIMIT 5;"
```

#### Map to Supabase Schema

| SQLite Table | Supabase Table | Notes |
|--------------|----------------|-------|
| `files` | `indexed_files` | Add `repository_id` (UUID), `language`, drop `project_root` |
| `index_runs` | `index_jobs` | Add `repository_id` (UUID), rename to `index_jobs` |
| `migrations` | `migrations` | Not needed (new migrations system) |

#### Manual Data Import

For each repository in your SQLite database:

1. Create repository record:

```sql
-- In Supabase SQL Editor
INSERT INTO repositories (id, user_id, full_name, git_url, default_branch)
VALUES (
  gen_random_uuid(),
  '<your-test-user-id>',  -- Replace with your auth.users ID
  'owner/repo',
  'https://github.com/owner/repo.git',
  'main'
);
```

2. Import indexed files (use the `repository_id` from step 1):

```sql
INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at)
SELECT
  gen_random_uuid(),
  '<repository-uuid>',  -- From step 1
  path,
  content,
  'typescript',  -- Detect language or set default
  indexed_at
FROM old_sqlite_files;  -- This won't work directly; use CSV import instead
```

**Recommendation**: Instead of migrating old data, **re-index repositories** using the new `POST /index` endpoint. This ensures data matches the new schema.

### 5. Update Your Code

If you have custom code that references the old database:

#### Replace SQLite Imports

```typescript
// OLD (DELETE)
import type { Database } from "bun:sqlite";
import { openDatabase, ensureSchema } from "@db/schema";

// NEW (USE THIS)
import { getServiceClient, getAnonClient } from "@db/client";
import type { SupabaseClient } from "@supabase/supabase-js";
```

#### Update Query Patterns

```typescript
// OLD (SQLite)
const db = openDatabase();
const results = db.query("SELECT * FROM files WHERE path = ?").all(filePath);

// NEW (Supabase)
const supabase = getServiceClient();
const { data, error } = await supabase
  .from("indexed_files")
  .select("*")
  .eq("path", filePath);
```

#### Update Table Names

- `files` → `indexed_files`
- `index_runs` → `index_jobs`
- `project_root` column → `repository_id` (UUID)

#### Update Type Definitions

```typescript
// OLD
interface IndexedFile {
  id: number;  // SQLite INTEGER
  project_root: string;
  indexed_at: string;  // TEXT timestamp
}

// NEW
interface IndexedFile {
  id: string;  // UUID
  repository_id: string;  // UUID foreign key
  indexed_at: string;  // ISO 8601 timestamptz
}
```

### 6. Update Tests

If you have custom tests:

```typescript
// OLD (SQLite mock)
import { Database } from "bun:sqlite";
const mockDb = new Database(":memory:");

// NEW (Supabase mock)
import { createMockSupabaseClient } from "tests/helpers/supabase-mock";
const mockSupabase = createMockSupabaseClient();
```

See `tests/helpers/supabase-mock.ts` for the mock client implementation.

### 7. Clean Up Old SQLite Files

```bash
# Remove SQLite database files
rm -f data/kotadb.sqlite data/kotadb.sqlite-shm data/kotadb.sqlite-wal

# Remove SQLite backups (if any)
rm -f data/*.sqlite*
```

### 8. Validate Everything Works

```bash
# Type-check
bunx tsc --noEmit

# Lint
bun run lint

# Run tests (requires Supabase credentials)
bun test

# Start server
bun run src/index.ts
```

Expected output:
```
Database health check: OK
Server running on port 3000
```

Test API endpoints:
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok"}
```

## Troubleshooting

### Error: "module not found: @db/schema"

**Cause**: Old imports referencing deleted `src/db/schema.ts`

**Solution**: Replace with `import { getServiceClient } from "@db/client"`

### Error: "Table 'files' does not exist"

**Cause**: Using old SQLite table names

**Solution**: Update to `indexed_files` and ensure migrations ran successfully

### Error: "Missing environment variable: SUPABASE_URL"

**Cause**: `.env` file not configured with Supabase credentials

**Solution**: Follow Step 3 above, copy credentials from Supabase dashboard

### Error: "row-level security policy violated"

**Cause**: Queries running with anon client need `app.user_id` context set

**Solution**: Use service client for admin operations, or set RLS context:

```typescript
// For user-scoped queries
const supabase = getAnonClient();
await supabase.rpc('set_config', {
  parameter: 'app.user_id',
  value: userId
});
```

### Tests failing with "Cannot connect to Supabase"

**Cause**: Tests now use Supabase mock client

**Solution**: Import from `tests/helpers/supabase-mock.ts`:

```typescript
import { createMockSupabaseClient } from "tests/helpers/supabase-mock";
```

## Breaking Changes Summary

| Component | Old (SQLite) | New (Supabase) |
|-----------|--------------|----------------|
| Database client | `bun:sqlite` Database | `@supabase/supabase-js` SupabaseClient |
| Table: files | `files` | `indexed_files` |
| Table: index_runs | `index_runs` | `index_jobs` |
| Primary keys | INTEGER | UUID (string) |
| Foreign keys | `project_root` (TEXT) | `repository_id` (UUID) |
| Timestamps | TEXT | timestamptz (ISO 8601) |
| Query syntax | `.query().all()` | `await .from().select()` |
| Schema file | `src/db/schema.ts` | Deleted (use `src/db/client.ts`) |
| Environment vars | `KOTA_DB_PATH` | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` |

## Additional Resources

- [Supabase Setup Guide](./supabase-setup.md) - Complete Supabase configuration walkthrough
- [Database Schema](./schema.md) - Full 10-table schema with RLS policies
- [Spec: SQLite to Postgres Migration](./specs/chore-27-standardize-postgres-remove-sqlite.md) - Implementation spec for PR #29
- [Supabase Documentation](https://supabase.com/docs) - Official Supabase docs

## Need Help?

If you encounter issues during migration:

1. Check existing issue #27 for discussion: https://github.com/kotadb/kotadb/issues/27
2. Review the PR #29 diff for code examples: https://github.com/kotadb/kotadb/pull/29
3. Open a new issue with the `migration` label

**Note**: SQLite support will not return. All development must use Supabase going forward.
