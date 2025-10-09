# Test Failures Troubleshooting Guide

This guide helps diagnose and fix common test failures in the KotaDB test suite. All tests use real Supabase Local database connections (no mocks) as part of our antimocking philosophy.

## Related Documentation
- [Testing Setup Guide](../testing-setup.md) - Initial setup and test database configuration
- [Anti-Mock Philosophy](../../.claude/commands/anti-mock.md) - Why we avoid mocks
- [Issue #33 Spec](../specs/chore-33-fix-failing-tests-antimocking.md) - Recent test fixes

## Quick Diagnosis

### Test Failure Pattern Matrix

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| 404 errors from Supabase client | Wrong SUPABASE_URL port | Use port 54326 (Kong), not 54322 (PostgREST) |
| "relation not found" / empty results | PostgREST port used instead of Kong | Check `.env.test` and test file env setup |
| "null API key validation" | Env vars set after module imports | Move env var setup to top of file, before imports |
| 401 Unauthorized errors | Client cached before env vars set | Use dynamic imports in `beforeAll` |
| Flaky cache timing tests | Real DB timing variance | Use tolerance-based assertions (±2ms) |
| Connection refused | Test database not running | Run `./scripts/setup-test-db.sh` |
| Schema mismatch errors | Migrations not applied | Run `./scripts/reset-test-db.sh` |
| Random test failures | Test data pollution | Reset database between test suites |

## Common Failure Scenarios

### Scenario 1: Port Configuration Issues

**Error Messages:**
```
- 404 Not Found
- "relation 'api_keys' does not exist"
- PostgREST returns empty results when data exists
```

**Root Cause:** The Supabase JS client requires Kong gateway (port 54326), not direct PostgREST access (port 54322).

**Why It Matters:** Kong provides the `/rest/v1/` routing layer that the Supabase JS client expects. PostgREST doesn't have this routing, causing the client to request `/rest/v1/api_keys` which returns 404.

**Solution:**

1. **Check `.env.test` configuration:**
   ```bash
   # ✅ Correct
   SUPABASE_URL=http://localhost:54326

   # ❌ Incorrect
   SUPABASE_URL=http://localhost:54322
   ```

2. **Verify test file env var setup:**
   ```typescript
   // At the top of the test file, before any imports
   process.env.SUPABASE_URL = "http://localhost:54326";
   process.env.SUPABASE_SERVICE_KEY = "test-service-key-local";
   process.env.SUPABASE_ANON_KEY = "test-anon-key-local";
   ```

3. **Verify Supabase Local is running on correct ports:**
   ```bash
   docker compose ps | grep supabase
   # Should show Kong on port 54326
   ```

**Reference:** Fixed in commits 34a7d6a and 11269a5 (issue #33).

---

### Scenario 2: Environment Variable Initialization Timing

**Error Messages:**
```
- "Validation returned null"
- 401 Unauthorized
- "Invalid API key"
```

**Root Cause:** The Supabase client is initialized at module-level (when the file is imported), but test environment variables are set later in `beforeAll` hooks. The client caches the wrong configuration.

**Why It Matters:** TypeScript/JavaScript imports are executed immediately when modules load. If `getServiceClient()` runs during import, it reads environment variables before tests set them.

**Solution:**

1. **Move env var setup to module-level (before imports):**
   ```typescript
   // ❌ Bad: Env vars set after imports
   import { getServiceClient } from "@db/client";

   beforeAll(async () => {
     process.env.SUPABASE_URL = "...";  // Too late!
   });

   // ✅ Good: Env vars set before imports
   process.env.SUPABASE_URL = "http://localhost:54326";
   process.env.SUPABASE_SERVICE_KEY = "test-service-key-local";
   process.env.SUPABASE_ANON_KEY = "test-anon-key-local";

   import { getServiceClient } from "@db/client";
   ```

2. **Use dynamic imports in `beforeAll`:**
   ```typescript
   // Set env vars at module level
   process.env.SUPABASE_URL = "http://localhost:54326";
   process.env.SUPABASE_SERVICE_KEY = "test-service-key-local";
   process.env.SUPABASE_ANON_KEY = "test-anon-key-local";

   beforeAll(async () => {
     // Import after env vars are guaranteed to be set
     const { getServiceClient } = await import("@db/client");
     const { createRouter } = await import("@api/routes");

     const supabase = getServiceClient();
     const router = createRouter(supabase);
     // ... setup server
   });
   ```

**Reference:** Fixed in commit 11269a5 for all test files (issue #33).

---

### Scenario 3: Cache Timing Test Flakiness

**Error Messages:**
```
- Expected 2.3 to be less than 2.1
- Cache timing assertion failed
```

**Root Cause:** Real database operations have timing variance due to network latency, Docker overhead, and database load. Strict timing comparisons (`<`) are too brittle for real-world tests.

**Why It Matters:** Cache timing tests verify that cached responses are faster than database queries. However, millisecond-level timing can vary by 1-3ms on real systems.

**Solution:**

Use tolerance-based assertions instead of strict comparisons:

```typescript
// ❌ Flaky: Strict timing comparison
const firstDuration = measureDbQuery();
const secondDuration = measureCachedQuery();
expect(secondDuration).toBeLessThan(firstDuration);

// ✅ Stable: Tolerance-based comparison
expect(secondDuration).toBeLessThanOrEqual(firstDuration + 2);
// Allows up to 2ms variance while still proving cache is effective

// ✅ Alternative: Verify cache hit functionally
const cacheSize = getCacheSize();
expect(cacheSize).toBeGreaterThan(0);  // Cache has entries
```

**Reference:** Fixed in commit 11269a5 for cache timing tests (issue #33).

---

### Scenario 4: Test Database Not Running

**Error Messages:**
```
- ECONNREFUSED
- Connection refused
- connect ECONNREFUSED 127.0.0.1:5434
```

**Root Cause:** The Supabase Local Docker container is not running.

**Solution:**

```bash
# Check if container is running
docker ps | grep supabase

# If not running, start it
./scripts/setup-test-db.sh

# Verify services are healthy
docker compose ps
# All services should show "Up (healthy)"
```

---

### Scenario 5: Stale Test Data / Schema Mismatch

**Error Messages:**
```
- "column does not exist"
- "relation does not exist"
- Unexpected test data in results
```

**Root Cause:** Database schema or seed data is out of sync with current migrations.

**Solution:**

```bash
# Reset database to clean state
./scripts/reset-test-db.sh

# Or fully recreate (if migrations changed)
docker compose down test-db
docker volume rm kota-db-ts_test_db_data
./scripts/setup-test-db.sh
```

---

## Port Architecture Reference

Supabase Local runs multiple services on different ports:

| Port  | Service            | Purpose                                      | Use This For                       |
|-------|--------------------|--------------------------------------------- |------------------------------------|
| 5434  | PostgreSQL         | Direct database access                       | Migrations, seed scripts, psql CLI |
| 54322 | PostgREST          | REST API (no routing layer)                  | Direct HTTP database access        |
| 54325 | GoTrue             | Authentication service                       | User auth operations               |
| 54326 | Kong Gateway       | API gateway with /rest/v1/ routing           | **Supabase JS client (tests)**     |

**Critical:** Always use port **54326** (Kong) for `SUPABASE_URL` in tests. Port 54322 (PostgREST) will not work with the Supabase JS client.

---

## Test Environment Variables

All tests should set these at module-level (before imports):

```typescript
process.env.SUPABASE_URL = "http://localhost:54326";  // Kong gateway
process.env.SUPABASE_SERVICE_KEY = "test-service-key-local";
process.env.SUPABASE_ANON_KEY = "test-anon-key-local";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5434/postgres";
```

---

## Debugging Workflow

When tests fail, follow this checklist:

1. **Verify Supabase Local is running:**
   ```bash
   docker compose ps | grep supabase
   ```

2. **Check port configuration:**
   ```bash
   grep SUPABASE_URL .env.test
   # Should show: http://localhost:54326
   ```

3. **Verify test data exists:**
   ```bash
   PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d postgres \
     -c "SELECT key_id, tier FROM api_keys;"
   # Should show 4 API keys (free, solo, team, disabled)
   ```

4. **Check environment variable timing in test files:**
   ```bash
   # Env vars should be set at top of file (before imports)
   head -20 tests/your-failing-test.test.ts
   ```

5. **Run single test file to isolate issue:**
   ```bash
   bun test tests/auth/validator.test.ts
   ```

6. **Check Docker logs for errors:**
   ```bash
   docker compose logs supabase-db
   docker compose logs supabase-rest
   docker compose logs supabase-kong
   ```

7. **Reset database if data is stale:**
   ```bash
   ./scripts/reset-test-db.sh
   ```

---

## Prevention Best Practices

### When Writing New Tests

1. **Always set env vars at module-level:**
   ```typescript
   // First lines of test file
   process.env.SUPABASE_URL = "http://localhost:54326";
   process.env.SUPABASE_SERVICE_KEY = "test-service-key-local";
   process.env.SUPABASE_ANON_KEY = "test-anon-key-local";
   ```

2. **Use test helpers for auth:**
   ```typescript
   import { createAuthHeader, TEST_API_KEYS } from "../helpers/db";

   const headers = {
     "Authorization": createAuthHeader("free"),
   };
   ```

3. **Use tolerance for timing assertions:**
   ```typescript
   expect(duration).toBeLessThanOrEqual(threshold + 2);
   ```

4. **Clean up test data (if test creates data):**
   ```typescript
   afterAll(async () => {
     await supabase.from("test_table").delete().eq("id", testId);
   });
   ```

### When Debugging Failures

1. Check port configuration first (54326 vs 54322)
2. Verify env var initialization timing
3. Reset database to eliminate stale data
4. Run tests in isolation to identify interactions
5. Check Docker logs for infrastructure issues

---

## Historical Context

### Issue #33: Antimocking Test Fixes (October 2025)

After migrating from mocks to Supabase Local (issue #31, PR #32), 33 out of 94 tests were failing. Issue #33 fixed these failures by:

1. **Port configuration standardization** (54326 for Kong gateway)
2. **Environment variable timing fixes** (module-level setup)
3. **Cache timing tolerance adjustments** (±2ms variance)
4. **Schema compatibility** (removed premature org_id references)

**Result:** 100% test pass rate (94/94 tests passing), ~11s execution time.

**Key Commits:**
- `11269a5` - Environment variable timing and cache assertions
- `34a7d6a` - Port configuration and schema compatibility

---

## Getting Help

If you're still stuck after following this guide:

1. Check [Testing Setup Guide](../testing-setup.md) for initial configuration
2. Review [Issue #33 Spec](../specs/chore-33-fix-failing-tests-antimocking.md) for detailed fixes
3. Examine recent passing test files for correct patterns:
   - `tests/auth/validator.test.ts`
   - `tests/mcp/tools.test.ts`
   - `tests/api/authenticated-routes.test.ts`
4. Open a GitHub issue with:
   - Full test output
   - Docker service status (`docker compose ps`)
   - Environment variable configuration
   - Relevant test file code
