# Database

**Template Category**: Message-Only
**Prompt Level**: 4 (Contextual)

Database schema, Supabase configuration, and RLS policies for KotaDB.

## Supabase Client Initialization

Database clients are initialized in `app/src/db/client.ts`:

- **Service role client**: Bypasses RLS for admin operations
- **Anon client**: Enforces RLS for user-scoped queries

Configuration via environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_ANON_KEY`

## Database Schema

KotaDB uses PostgreSQL via Supabase with 10 tables:

- `api_keys` - API key storage with bcrypt hashing
- `organizations` - Multi-tenant organization management
- `repositories` - Indexed repository metadata
- `index_jobs` - Repository indexing job tracking
- `indexed_files` - File content and metadata
- `symbols` - Code symbols extracted from files
- `references` - Symbol references and usage tracking
- `dependencies` - File dependency graph
- Additional support tables for RLS and rate limiting

## Row Level Security (RLS)

RLS is enabled for multi-tenant data isolation with two policy types:

- **User-scoped policies**: Restrict access based on authenticated user
- **Organization-scoped policies**: Restrict access based on organization membership

All queries via anon client enforce RLS automatically. Service role client bypasses RLS for admin operations.

## Supabase Local Port Architecture

For local development and testing:

- **Port 5434**: PostgreSQL (migrations, seed scripts, psql)
  - Direct database access for migration application
  - Used by `psql` for manual queries

- **Port 54322**: PostgREST API (raw HTTP access)
  - RESTful API for database operations
  - Not typically used directly by KotaDB

- **Port 54325**: GoTrue auth service
  - User authentication and session management
  - Not directly accessed by KotaDB (uses Supabase client)

- **Port 54326**: Kong gateway (Supabase JS client - **use this for tests**)
  - Unified gateway for all Supabase services
  - **This is the port tests should use**
  - Set `SUPABASE_URL=http://localhost:54326` in tests

## Migrations

Database migrations exist in **two locations**:

1. `app/src/db/migrations/` - Source of truth for application
2. `app/supabase/migrations/` - Copy for Supabase CLI compatibility

**IMPORTANT**: Both directories must stay synchronized.

### Migration Sync Requirement

- When adding or modifying migrations in `app/src/db/migrations/`, you **must** also update `app/supabase/migrations/`
- Run `cd app && bun run test:validate-migrations` to check for drift
- CI validates sync in setup job

### Migration Naming Convention

All migration files must use timestamped format: `YYYYMMDDHHMMSS_description.sql`

Example: `20241024143000_add_rate_limiting.sql`

Rationale:
- Prevents merge conflicts when multiple developers create migrations concurrently
- Aligns with Supabase CLI expectations and industry standards
- Ensures deterministic ordering regardless of file system

Generate timestamp: `date -u +%Y%m%d%H%M%S`

## Testing with Supabase Local

All tests use real Supabase Local database connections (antimocking philosophy).

### Test Environment Setup

1. Start Supabase Local via Docker Compose
2. Apply migrations directly to PostgreSQL (port 5434)
3. Generate `app/.env.test` with correct ports
4. Tests automatically load environment via preload script

### Environment Variable Loading

- `app/tests/setup.ts`: Preload script that parses `.env.test`
- Test script uses `bun test --preload ./tests/setup.ts`
- Tests read `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `process.env`
- Validation: `cd app && bun run test:validate-env` detects hardcoded URLs

### Test Database Commands

```bash
./scripts/setup-test-db.sh       # Start Supabase Local test database
./scripts/reset-test-db.sh       # Reset test database to clean state
```

## Related Documentation

- [Architecture](./.claude/commands/docs/architecture.md)
- [Testing Guide](./.claude/commands/testing/testing-guide.md)
- [Environment Variables](./.claude/commands/app/environment.md)
- [CI Configuration](./.claude/commands/ci/ci-configuration.md)
