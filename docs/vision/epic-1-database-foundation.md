# Epic 1: Database Foundation & Schema

**Status**: Not Started
**Priority**: Critical (Blocks most other work)
**Estimated Duration**: 1-2 weeks

## Overview

Establish the Supabase PostgreSQL database schema, migration system, and client configuration. This is the foundational epic that most other work depends on.

## Issues

### Issue #1: Design and implement Supabase schema

**Priority**: P0 (Critical)
**Depends on**: None
**Blocks**: All other database work

#### Description
Design and implement the complete Supabase schema with 8 core tables, foreign key relationships, indexes, and Row Level Security (RLS) policies.

#### Acceptance Criteria
- [ ] All tables created with proper column types and constraints
- [ ] Foreign key relationships established
- [ ] Indexes on frequently queried columns (user_id, repo_id, symbol_name, etc.)
- [ ] RLS policies implemented for all tables
- [ ] Supporting database function for rate limit increments deployed
- [ ] Documentation of schema relationships and design decisions

#### Tables to Create

**Core tables:**
```sql
-- Managed by Supabase Auth (reference only)
auth.users (id, email, created_at)

-- Custom tables
api_keys (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  key_id text UNIQUE NOT NULL,        -- public identifier embedded in key prefix
  secret_hash text NOT NULL,          -- bcrypt hash of secret portion
  tier text CHECK (tier IN ('free', 'solo', 'team')),
  org_id uuid REFERENCES organizations,
  rate_limit_per_hour int NOT NULL,
  created_at timestamptz,
  last_used_at timestamptz,
  enabled boolean DEFAULT true
)

organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz,
  owner_id uuid REFERENCES auth.users
)

user_organizations (
  user_id uuid REFERENCES auth.users,
  org_id uuid REFERENCES organizations,
  role text CHECK (role IN ('owner', 'admin', 'member')),
  PRIMARY KEY (user_id, org_id)
)

rate_limit_counters (
  key_id text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  request_count int NOT NULL,
  updated_at timestamptz DEFAULT now()
)

-- Helper to increment counters atomically (exposed via Supabase RPC)
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_key_id text,
  p_window_start timestamptz
)
RETURNS TABLE (request_count int, reset_at timestamptz) AS $$
BEGIN
  INSERT INTO rate_limit_counters AS r (key_id, window_start, request_count, updated_at)
  VALUES (p_key_id, p_window_start, 1, now())
  ON CONFLICT (key_id)
  DO UPDATE SET
    request_count = CASE
      WHEN r.window_start = EXCLUDED.window_start THEN r.request_count + 1
      ELSE 1
    END,
    window_start = CASE
      WHEN r.window_start = EXCLUDED.window_start THEN r.window_start
      ELSE EXCLUDED.window_start
    END,
    updated_at = now()
  RETURNING request_count,
    (window_start + interval '1 hour') AS reset_at;
END;
$$ LANGUAGE plpgsql;
```

**Repository management:**
```sql
repositories (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  org_id uuid REFERENCES organizations,
  full_name text NOT NULL, -- "owner/repo"
  installation_id bigint, -- GitHub App installation ID
  default_branch text,
  last_indexed_at timestamptz,
  last_indexed_commit text,
  created_at timestamptz
)

index_jobs (
  id uuid PRIMARY KEY,
  repository_id uuid REFERENCES repositories,
  status text CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  commit_sha text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  stats jsonb -- { files_processed, symbols_extracted, etc. }
)
```

**Code intelligence:**
```sql
indexed_files (
  id uuid PRIMARY KEY,
  repository_id uuid REFERENCES repositories,
  path text NOT NULL,
  content text,
  content_hash text,
  language text,
  size_bytes int,
  indexed_at timestamptz,
  UNIQUE (repository_id, path)
)

symbols (
  id uuid PRIMARY KEY,
  repository_id uuid REFERENCES repositories,
  file_id uuid REFERENCES indexed_files,
  name text NOT NULL,
  kind text CHECK (kind IN ('function', 'class', 'interface', 'type', 'variable', 'const', 'export')),
  line_start int,
  line_end int,
  column_start int,
  column_end int,
  signature text,
  docstring text,
  is_exported boolean DEFAULT false
)

references (
  id uuid PRIMARY KEY,
  repository_id uuid REFERENCES repositories,
  symbol_id uuid REFERENCES symbols,
  caller_file_id uuid REFERENCES indexed_files,
  caller_line int,
  caller_column int,
  reference_type text CHECK (reference_type IN ('import', 'call', 'property_access', 'type_reference'))
)

dependencies (
  id uuid PRIMARY KEY,
  repository_id uuid REFERENCES repositories,
  from_file_id uuid REFERENCES indexed_files,
  to_file_id uuid REFERENCES indexed_files,
  from_symbol_id uuid REFERENCES symbols,
  to_symbol_id uuid REFERENCES symbols,
  dependency_type text CHECK (dependency_type IN ('file_import', 'symbol_usage'))
)
```

#### RLS Policies
- Users can only see their own data (via `user_id` match)
- Team members can see org data (via `user_organizations` join)
- API key validation extracts `user_id` for RLS enforcement

#### Technical Notes
- Use `uuid` for primary keys (Supabase default)
- Use `timestamptz` for all timestamps
- Use `jsonb` for flexible metadata (job stats, etc.)
- Create indexes on: `user_id`, `repository_id`, `symbol_id`, `file_id`, `name`, `api_keys.key_id`
- Store only hashed secrets (`secret_hash`) in `api_keys`
- Expose `increment_rate_limit` as a Supabase RPC function for rate limiting
- Enable full-text search on `symbols.name`, `symbols.docstring`, `indexed_files.content`

#### Files to Create
- `src/db/schema.sql` - Complete schema definition
- `src/db/migrations/001_initial_schema.sql` - Initial migration
- `src/db/functions/increment_rate_limit.sql` - Postgres function backing rate limit RPC
- `docs/schema.md` - Schema documentation with ERD

---

### Issue #2: Set up Supabase client and connection pooling

**Priority**: P0 (Critical)
**Depends on**: #1
**Blocks**: All database queries

#### Description
Configure Supabase JavaScript client with proper connection management, environment-based configuration, and error handling.

#### Acceptance Criteria
- [ ] Supabase client initialized with service role key (bypasses RLS for admin operations)
- [ ] Environment variables for `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`
- [ ] Connection health check function
- [ ] Automatic retry logic for transient errors
- [ ] Typed client wrapper for type safety

#### Technical Notes
- Use `@supabase/supabase-js` package
- Service role key for backend operations (admin)
- Anon key for RLS-enforced operations (user context)
- Connection pooling handled by Supabase automatically

#### Files to Create
- `src/db/client.ts` - Supabase client initialization
- `src/db/health.ts` - Connection health checks
- `.env.sample` - Updated with Supabase variables

#### Example Implementation
```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types' // Generated from schema

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)

export async function checkDatabaseHealth() {
  const { error } = await supabase.from('repositories').select('count').limit(1)
  return !error
}
```

---

### Issue #3: Implement migration system with rollback

**Priority**: P1 (High)
**Depends on**: #1
**Blocks**: CI/CD deployment (#32)

#### Description
Build a migration system that tracks applied migrations, supports rollback, and integrates with CI/CD for automated deployment.

#### Acceptance Criteria
- [ ] `migrations` table to track applied migrations
- [ ] Migration runner script (apply pending migrations)
- [ ] Rollback script (undo last migration)
- [ ] Up/down migration file format
- [ ] Dry-run mode for testing
- [ ] CI integration (migrate before deploy)

#### Technical Notes
- Store migrations in `src/db/migrations/` as numbered files
- Track applied migrations in `migrations` table
- Each migration has `up.sql` and `down.sql`
- Fail fast if rollback is not possible
- Generate migration stubs with CLI tool

#### Files to Create
- `src/db/migrate.ts` - Migration runner
- `src/db/rollback.ts` - Rollback script
- `scripts/migrate.sh` - Shell wrapper for CI
- `scripts/create-migration.sh` - Generate migration stub

#### Migration Table
```sql
CREATE TABLE migrations (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  applied_at timestamptz DEFAULT now()
);
```

#### Example Migration File
```
src/db/migrations/
  001_initial_schema.sql
  001_initial_schema_rollback.sql
  002_add_indexes.sql
  002_add_indexes_rollback.sql
```

---

## Success Criteria

- [ ] All 8 tables exist in Supabase with proper relationships
- [ ] RLS policies prevent unauthorized data access
- [ ] Supabase client connects successfully in all environments
- [ ] Migration system can apply and rollback changes
- [ ] Schema documentation is complete and accurate

## Dependencies for Other Epics

This epic must be completed before:
- Epic 2 (needs `api_keys` table)
- Epic 3 (needs code intelligence tables)
- Epic 4 (needs `index_jobs` table)
- Epic 5 (needs `repositories` table)
- Epic 6 (needs all tables for REST API)
- Epic 7 (needs all tables for MCP queries)
