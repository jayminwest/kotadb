# Testing Setup Guide

This document explains how to set up and run the KotaDB test suite with a real PostgreSQL test database.

## Overview

KotaDB follows an **antimocking philosophy** - tests use real database connections instead of mocks. This provides:

- Production parity testing
- Real connection/timeout/RLS behavior
- No mock maintenance burden
- True confidence in database interactions

## Prerequisites

- **Docker**: For running the PostgreSQL test database container
- **Bun**: v1.1+ for running tests
- **psql**: PostgreSQL client (for manual database inspection, optional)

## Quick Start

### 1. Start Test Database

```bash
./scripts/setup-test-db.sh
```

This script will:
- Start a PostgreSQL 15 container on port 5434
- Run schema migrations (auth schema + main schema)
- Seed test data (users, API keys, repositories, indexed files)

### 2. Run Tests

```bash
bun test
```

The test suite connects to the local PostgreSQL container automatically using credentials from `.env.test`.

### 3. Reset Database (Optional)

Between test runs, if you need a clean state:

```bash
./scripts/reset-test-db.sh
```

This truncates all tables and re-seeds test data.

## Test Database Architecture

### Connection Details

- **Host**: localhost
- **Port**: 5434 (to avoid conflicts with local Postgres)
- **Database**: postgres
- **User**: postgres
- **Password**: postgres

### Test Data

The database is seeded with deterministic test data (see `supabase/seed.sql`):

#### Test Users
- Free user: `00000000-0000-0000-0000-000000000001`
- Solo user: `00000000-0000-0000-0000-000000000002`
- Team user: `00000000-0000-0000-0000-000000000003`

#### Test API Keys
```typescript
// Free tier
kota_free_test1234567890ab_0123456789abcdef0123456789abcdef

// Solo tier
kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef

// Team tier
kota_team_team1234567890ab_0123456789abcdef0123456789abcdef

// Disabled (for testing disabled key handling)
kota_free_disabled12345678_0123456789abcdef0123456789abcdef
```

All test API keys use the same secret (`0123456789abcdef0123456789abcdef`) which is bcrypt-hashed in the database.

#### Test Repositories
- `testuser/test-repo` (user-owned)
- `solouser/solo-repo` (user-owned)
- `test-org/team-repo` (organization-owned)

### Schema

The test database uses the same schema as production:
- `auth.users` - Minimal auth schema for testing (mimics Supabase)
- `api_keys` - API key storage with bcrypt hashes
- `organizations` - Team workspaces
- `user_organizations` - Membership join table
- `repositories` - Git repositories
- `index_jobs` - Indexing job tracking
- `indexed_files` - Parsed source files
- `symbols`, `references`, `dependencies` - Code intelligence tables

## Writing Tests

### Using Test Helpers

Import test helpers from `tests/helpers/db.ts`:

```typescript
import { createAuthHeader, TEST_API_KEYS, TEST_USER_IDS } from "../helpers/db";

// Create auth header with test API key
const headers = {
  "Authorization": createAuthHeader("free"),  // or "solo", "team"
};

// Access test data IDs
const userId = TEST_USER_IDS.free;
const apiKey = TEST_API_KEYS.solo;
```

### Test Environment Variables

Tests automatically set these environment variables:

```typescript
process.env.SUPABASE_URL = "http://localhost:5434";
process.env.SUPABASE_SERVICE_KEY = "test-service-key-local";
process.env.SUPABASE_ANON_KEY = "test-anon-key-local";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5434/postgres";
```

### Example Test

```typescript
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createAuthHeader } from "../helpers/db";

const TEST_PORT = 3100;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  // Set test environment
  process.env.SUPABASE_URL = "http://localhost:5434";
  process.env.SUPABASE_SERVICE_KEY = "test-service-key-local";
  process.env.SUPABASE_ANON_KEY = "test-anon-key-local";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5434/postgres";

  // Start test server with real database
  const { createRouter } = await import("@api/routes");
  const { getServiceClient } = await import("@db/client");

  const supabase = getServiceClient();
  const router = createRouter(supabase);

  server = Bun.serve({
    port: TEST_PORT,
    fetch: router.handle,
  });
});

afterAll(() => {
  server.stop();
});

describe("My Feature", () => {
  test("does something", async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/endpoint`, {
      headers: {
        "Authorization": createAuthHeader("free"),
      },
    });

    expect(response.status).toBe(200);
  });
});
```

## Supabase Local Port Architecture

When using Supabase Local (via Docker), multiple services run on different ports:

| Port  | Service            | Purpose                                      | Usage                              |
|-------|--------------------|--------------------------------------------- |------------------------------------|
| 5434  | PostgreSQL         | Direct database access                       | Migrations, seed scripts, psql CLI |
| 54322 | PostgREST          | REST API (no routing layer)                  | Direct HTTP database access        |
| 54325 | GoTrue             | Authentication service                       | User auth operations               |
| 54326 | Kong Gateway       | API gateway with /rest/v1/ routing           | **Supabase JS client (tests use this)** |

### Critical Configuration for Tests

**The Supabase JS client requires the Kong gateway port (54326), not PostgREST (54322).**

Kong provides the `/rest/v1/` routing layer that the Supabase JS client expects. Direct PostgREST access doesn't include this routing, causing 404 errors when the client tries to access `/rest/v1/table_name`.

**Test Configuration (`.env.test`):**
```bash
SUPABASE_URL=http://localhost:54326  # Kong gateway, NOT 54322
SUPABASE_SERVICE_KEY=test-service-key-local
SUPABASE_ANON_KEY=test-anon-key-local
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/postgres
```

All test files set these environment variables at module-level (before imports) to ensure the Supabase client initializes with correct configuration.

## Troubleshooting

### Tests Fail with 404 or "relation not found"

**Symptom:** Tests fail with 404 errors or PostgREST returns empty results even though data exists.

**Cause:** SUPABASE_URL is pointing to PostgREST (port 54322) instead of Kong gateway (port 54326).

**Solution:**
1. Check `.env.test` - should use `http://localhost:54326` (Kong gateway)
2. Verify test files set `process.env.SUPABASE_URL = "http://localhost:54326"` at module-level
3. Ensure imports happen AFTER environment variables are set

### Tests Fail with "null API key validation" or "401 Unauthorized"

**Symptom:** Auth tests fail with null validation results or unauthorized errors.

**Cause:** Supabase client initialized before test environment variables were set.

**Solution:**
1. Move env var setup to top of test file (before any imports)
2. Use dynamic imports in `beforeAll` after env vars are configured:
   ```typescript
   process.env.SUPABASE_URL = "http://localhost:54326";
   // ... other env vars

   beforeAll(async () => {
     const { getServiceClient } = await import("@db/client");
     // ... rest of setup
   });
   ```

### Cache Timing Tests Are Flaky

**Symptom:** Tests that verify cache performance fail intermittently with timing assertions.

**Cause:** Real database operations have timing variance (network latency, database load).

**Solution:** Use tolerance-based assertions instead of strict comparisons:
```typescript
// ❌ Flaky
expect(secondDuration).toBeLessThan(firstDuration);

// ✅ Stable
expect(secondDuration).toBeLessThanOrEqual(firstDuration + 2);
```

### Port Already in Use

If port 5434 is already in use:

```bash
# Find the process using port 5434
lsof -ti:5434

# Kill the process
kill $(lsof -ti:5434)

# Or use a different port by editing docker-compose.yml
```

### Container Won't Start

Check Docker logs:

```bash
docker logs kota-db-ts-test-db-1
```

Common issues:
- Permissions on mounted volumes
- Conflicting container names
- Out of disk space

### Tests Fail with "Connection Refused"

Ensure the test database is running:

```bash
docker ps | grep test-db
```

If not running, start it:

```bash
./scripts/setup-test-db.sh
```

### Schema Mismatch Errors

If migrations have changed, recreate the database:

```bash
# Stop and remove the container
docker compose down test-db

# Remove the volume
docker volume rm kota-db-ts_test_db_data

# Restart
./scripts/setup-test-db.sh
```

## CI/CD Integration

The test database runs in CI via GitHub Actions services. See `.github/workflows/ci.yml` for configuration.

Key steps:
1. Start PostgreSQL service container
2. Wait for health check
3. Run migrations and seed data
4. Execute test suite

## Antimocking Migration Complete

The KotaDB test suite now uses real PostgreSQL database connections instead of mocks.

**✅ Completed:**
- PostgreSQL test database container setup via Docker Compose
- Schema migrations for test environment (auth schema + main schema)
- Test data seeding scripts with deterministic test users, API keys, and repositories
- Real database test helper functions (`tests/helpers/db.ts`)
- All test files refactored to use real database:
  - MCP tests (`tests/mcp/*.test.ts`)
  - API tests (`tests/api/authenticated-routes.test.ts`)
  - Auth tests (`tests/auth/middleware.test.ts`, `tests/auth/validator.test.ts`)
- Mock helper files deleted (`tests/helpers/supabase-mock.ts`, `tests/helpers/auth-mock.ts`)
- CI/CD integration with PostgreSQL service container
- Setup and reset scripts for local development

**Benefits:**
- Tests exercise real database behavior (connections, timeouts, transactions)
- No mock maintenance burden
- True confidence in authentication and database flows
- Production parity testing

## Manual Database Inspection

To inspect the test database manually:

```bash
# Connect via psql
PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d postgres

# Useful queries
SELECT * FROM api_keys;
SELECT * FROM indexed_files;
SELECT * FROM repositories;

# Check schema
\dt  -- List tables
\d api_keys  -- Describe api_keys table
```

## References

- [Anti-Mock Philosophy](../.claude/commands/anti-mock.md)
- [Supabase Setup Guide](./supabase-setup.md)
- [Database Schema](./schema.md)
- [Migration Guide (SQLite → Postgres)](./migration-sqlite-to-supabase.md)
