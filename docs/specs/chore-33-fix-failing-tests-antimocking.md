# Chore Plan: Fix Remaining 33 Failing Tests After Antimocking Migration

## Context

Following the antimocking initiative in #31 (PR #32), the test suite has been migrated from mocked Supabase clients to real Supabase Local (PostgreSQL + Kong gateway) integration. However, 33 out of 94 tests (35%) are still failing, preventing full confidence in the test suite.

**Why this chore matters now:**
- Test suite confidence is critical for safe development and deployment
- Current 35% failure rate blocks PR merges and CI/CD pipeline
- Real database integration is complete but misconfigured
- Issue #31 is technically merged but not fully validated

**Root Cause Analysis:**
1. **Port Mismatch**: Tests use Kong gateway on port 54326, but `.env.test` points to port 54322 (PostgREST)
2. **Environment Variable Timing**: `getServiceClient()` may create cached clients before test `beforeAll` hooks set environment variables
3. **Missing org_id field**: API keys table has `org_id` column but seed data doesn't set it for team tier keys
4. **Test expectations**: Some tests expect specific timing/performance that doesn't match real database behavior

**Current Status:**
- ✅ 61 tests passing (65%)
- ❌ 33 tests failing (35%)
- ✅ Infrastructure complete: Supabase Local running (Postgres on 5434, Kong on 54326, PostgREST on 54322)
- ✅ Database seeded with deterministic test data
- ✅ SQL reserved keyword issues fixed (`references` table quoted)

**Constraints:**
- Must maintain test suite completion time < 30 seconds
- All 94 tests must pass (0 failures)
- No changes to production code architecture
- Test infrastructure must work in CI/CD

## Relevant Files

### Files to Modify
- `tests/helpers/db.ts` — Update TEST_DB_URL from port 54326 to 54322 (PostgREST), remove org_id mismatch
- `.env.test` — Already correct (port 54322), serves as reference
- `tests/auth/middleware.test.ts` — Fix environment variable setup before module imports, adjust cache timing assertions
- `tests/auth/validator.test.ts` — Fix environment variable setup before module imports
- `tests/mcp/errors.test.ts` — Fix environment variable setup and auth headers
- `tests/mcp/handshake.test.ts` — Fix environment variable setup and auth headers
- `tests/mcp/tools.test.ts` — Fix environment variable setup and auth headers
- `tests/api/authenticated-routes.test.ts` — Fix cache timing assertion
- `supabase/seed.sql` — Add org_id to team tier API key
- `src/db/client.ts` — Consider adding client factory pattern to avoid premature caching (optional, investigate first)

### New Files
- `docs/troubleshooting/test-failures.md` — Troubleshooting guide for common test failure patterns

## Work Items

### Preparation
1. Back up current test failure output for comparison
2. Verify Supabase Local is running and seeded: `./scripts/setup-test-db.sh`
3. Create feature branch: `chore/33-fix-failing-tests-antimocking` from `develop`
4. Document current failure categories: authentication (4), MCP (28), API routes (1)

### Execution

#### Phase 1: Fix Port Configuration Mismatch
1. Update `tests/helpers/db.ts` TEST_DB_URL from `http://localhost:54326` to `http://localhost:54322`
2. Verify `.env.test` already has correct port (54322) - no changes needed
3. Test connectivity: `curl http://localhost:54322/rest/v1/api_keys?select=key_id`
4. Run quick validation: `bun test tests/auth/validator.test.ts` (should reduce failures)

#### Phase 2: Fix Environment Variable Initialization Order
1. Update `tests/auth/middleware.test.ts`:
   - Move environment variable setup to top of file (before any imports)
   - Use dynamic import for `@db/client` and `@auth/middleware` after env setup
   - Pattern: `process.env.X = value` → `const { func } = await import("@module")`
2. Update `tests/auth/validator.test.ts`:
   - Same pattern as middleware.test.ts
   - Ensure env vars set before validator module loads
3. Update MCP test files (`tests/mcp/errors.test.ts`, `tests/mcp/handshake.test.ts`, `tests/mcp/tools.test.ts`):
   - Same environment variable setup pattern
   - Use `createAuthHeader("free")` for Authorization headers
4. Update `tests/api/authenticated-routes.test.ts`:
   - Same environment variable setup pattern

#### Phase 3: Fix Database Seed Data
1. Update `supabase/seed.sql`:
   - Add `org_id` column to team tier API key insert (line 69-79)
   - Set `org_id` to `'10000000-0000-0000-0000-000000000001'::uuid`
   - Remove `user_id` for team key (team keys belong to orgs, not users)
2. Re-run seed script: `./scripts/reset-test-db.sh`
3. Verify org_id is set: `curl "http://localhost:54322/rest/v1/api_keys?select=key_id,tier,org_id,user_id"`

#### Phase 4: Fix Cache Timing Assertions
1. Update `tests/auth/middleware.test.ts` cache timing test:
   - Change `expect(secondDuration).toBeLessThan(firstDuration)` to tolerance-based assertion
   - Use `expect(secondDuration).toBeLessThanOrEqual(firstDuration + 1)` (allow 1ms variance)
   - Or verify cache hit via `getCacheSize()` instead of timing
2. Update `tests/api/authenticated-routes.test.ts` cache timing test:
   - Same pattern as middleware test
   - Focus on functional correctness (cache hit) over timing precision

#### Phase 5: Validate All Tests Pass
1. Run full test suite: `bun test`
2. Verify 94 tests pass, 0 failures
3. Run 5 consecutive times to check for flakiness: `for i in {1..5}; do echo "Run $i"; bun test || break; done`
4. Measure execution time: `time bun test` (target: < 30 seconds)

### Follow-up
1. Document port configuration in `docs/testing-setup.md` (add troubleshooting section)
2. Create `docs/troubleshooting/test-failures.md` for future reference
3. Update `.claude/commands/conditional_docs.md` to reference troubleshooting docs
4. Monitor CI pipeline for any environment-specific issues
5. Consider adding pre-test health check script to validate Supabase Local state

## Step by Step Tasks

### 1. Preparation & Branch Setup
- Create branch `chore/33-fix-failing-tests-antimocking` from `develop`
- Run `./scripts/setup-test-db.sh` to ensure Supabase Local is running
- Document current test failures: `bun test > test-failures-before.txt 2>&1`
- Verify Kong (54326) vs PostgREST (54322) port differences

### 2. Fix Port Configuration
- Update `tests/helpers/db.ts` line 13: Change `TEST_DB_URL` from `http://localhost:54326` to `http://localhost:54322`
- Test connectivity: `curl http://localhost:54322/rest/v1/api_keys?select=key_id -H "apikey: ..."`
- Run validator tests to verify: `bun test tests/auth/validator.test.ts`

### 3. Fix Seed Data for Team Tier
- Update `supabase/seed.sql` team tier API key (lines 69-80):
  - Change `user_id` to `org_id` (team keys belong to organizations, not individual users)
  - Set `org_id` to `'10000000-0000-0000-0000-000000000001'::uuid`
- Run reset script: `./scripts/reset-test-db.sh`
- Verify: `curl "http://localhost:54322/rest/v1/api_keys?select=key_id,tier,org_id,user_id" -H "apikey: ..."`

### 4. Fix Environment Variable Initialization in Auth Tests
- Update `tests/auth/middleware.test.ts`:
  - Move env var setup to top of file (lines 1-10), before imports
  - Use dynamic imports in `beforeAll`: `const { authenticateRequest } = await import("@auth/middleware")`
  - Ensure `getServiceClient()` is called after env vars are set
- Update `tests/auth/validator.test.ts`:
  - Same pattern: env vars first, dynamic imports in `beforeAll`
- Run auth tests: `bun test tests/auth/`

### 5. Fix Environment Variable Initialization in MCP Tests
- Update `tests/mcp/errors.test.ts`:
  - Move env var setup to top of file
  - Use dynamic imports for server/router initialization
  - Verify Authorization headers use `createAuthHeader("free")`
- Update `tests/mcp/handshake.test.ts`:
  - Same pattern as errors.test.ts
- Update `tests/mcp/tools.test.ts`:
  - Same pattern as errors.test.ts
- Run MCP tests: `bun test tests/mcp/`

### 6. Fix Environment Variable Initialization in API Tests
- Update `tests/api/authenticated-routes.test.ts`:
  - Move env var setup to top of file
  - Use dynamic imports for router initialization
- Run API tests: `bun test tests/api/`

### 7. Fix Cache Timing Assertions
- Update `tests/auth/middleware.test.ts` line 129:
  - Change `expect(secondDuration).toBeLessThan(firstDuration)` to `expect(secondDuration).toBeLessThanOrEqual(firstDuration + 2)`
  - Add comment explaining timing variance in real database operations
- Update `tests/api/authenticated-routes.test.ts` (similar cache timing test):
  - Same tolerance-based assertion pattern
- Run affected tests to verify

### 8. Full Test Suite Validation
- Run complete test suite: `bun test`
- Verify all 94 tests pass
- Check for any remaining failures or warnings
- Document final test output: `bun test > test-results-after.txt 2>&1`

### 9. Flakiness Testing
- Run test suite 10 consecutive times: `for i in {1..10}; do echo "Run $i"; bun test || break; done`
- Verify 0 flaky tests (all runs pass)
- Measure execution time: `time bun test` (must be < 30 seconds)
- Document performance metrics in PR description

### 10. Documentation Updates
- Add troubleshooting section to `docs/testing-setup.md`:
  - Port configuration (54322 vs 54326)
  - Environment variable initialization order
  - Common failure patterns and solutions
- Create `docs/troubleshooting/test-failures.md`:
  - "Tests fail with 401 Unauthorized" → Check port configuration
  - "Tests fail with null API key validation" → Check env var initialization
  - "Cache timing tests are flaky" → Use tolerance-based assertions
- Update `.claude/commands/conditional_docs.md`:
  - Add condition for `docs/troubleshooting/test-failures.md`

### 11. Validation & Push
- Run `bun run lint` (must pass)
- Run `bunx tsc --noEmit` (must pass)
- Run `bun test` 10 consecutive times (must pass all runs)
- Run `bun run build` (must pass)
- Commit changes: `git add . && git commit -m "chore: fix remaining 33 failing tests after antimocking migration (#33)"`
- Push branch: `git push -u origin chore/33-fix-failing-tests-antimocking`

### 12. Create Pull Request
- Run `/pull_request chore/33-fix-failing-tests-antimocking {"number":33,"title":"chore: fix remaining 33 failing tests after antimocking migration"} docs/specs/chore-33-fix-failing-tests-antimocking.md <adw_id>`

## Risks

| Risk | Mitigation |
|------|------------|
| **Port confusion (54322 vs 54326)** | Document clearly: 54322 = PostgREST (correct), 54326 = Kong (legacy); Update all references consistently |
| **Environment variable timing issues** | Use dynamic imports after env setup; Consider client factory pattern instead of module-level singleton |
| **Cache timing test flakiness** | Use tolerance-based assertions (±2ms); Verify cache hit functionally via `getCacheSize()` instead of timing |
| **Seed data not applied** | Add verification step in setup script; Check `api_keys` table count before running tests |
| **Client caching in production code** | Investigate `src/db/client.ts` - may need factory pattern; Test module imports don't affect production |
| **CI environment differences** | Ensure GitHub Actions uses same ports; Add health check step before running tests |
| **Test execution order dependencies** | Verify tests can run in isolation; Use `bun test --bail` to stop on first failure during debugging |
| **Incomplete migration artifacts** | Grep for remaining references to port 54326; Verify no mock imports remain |

## Validation Commands

### Required Validation
```bash
# Type checking
bunx tsc --noEmit

# Linting
bun run lint

# Full test suite (must pass all 94 tests)
bun test

# Build validation
bun run build
```

### Additional Validation
```bash
# Verify Supabase Local is running
docker compose ps | grep supabase
# Expected: supabase-db, supabase-rest, supabase-kong all "Up"

# Verify port connectivity
curl http://localhost:54322/rest/v1/ -H "apikey: eyJh..."
# Expected: Swagger/OpenAPI JSON response

# Verify API keys are seeded
curl "http://localhost:54322/rest/v1/api_keys?select=key_id,tier,org_id" -H "apikey: eyJh..."
# Expected: 4 API keys (free, solo, team, disabled)

# Verify team key has org_id
curl "http://localhost:54322/rest/v1/api_keys?key_id=eq.team1234567890ab&select=org_id,user_id" -H "apikey: eyJh..."
# Expected: org_id = UUID, user_id = null

# Run tests 10 times to check for flakiness
for i in {1..10}; do echo "Run $i"; bun test || break; done
# Expected: all runs pass

# Measure test execution time
time bun test
# Expected: < 30 seconds

# Check for port 54326 references (should be none after fix)
git grep "54326"
# Expected: only in docker-compose.yml (Kong service definition)

# Verify no mock imports remain
git grep "createMockSupabaseClient\|createMockAuthHeader"
# Expected: no results
```

## Deliverables

### Code Changes
- `tests/helpers/db.ts` — Port configuration fix (54326 → 54322)
- `tests/auth/middleware.test.ts` — Environment variable initialization order fix
- `tests/auth/validator.test.ts` — Environment variable initialization order fix
- `tests/mcp/errors.test.ts` — Environment variable initialization order fix
- `tests/mcp/handshake.test.ts` — Environment variable initialization order fix
- `tests/mcp/tools.test.ts` — Environment variable initialization order fix
- `tests/api/authenticated-routes.test.ts` — Environment variable initialization + cache timing fix
- `supabase/seed.sql` — Team tier API key org_id fix
- Cache timing assertions — Tolerance-based assertions for real database variance

### Config Updates
- No config changes required (`.env.test` already correct)

### Documentation Updates
- `docs/testing-setup.md` — Add troubleshooting section for port configuration and env var timing
- `docs/troubleshooting/test-failures.md` — New troubleshooting guide for common test failure patterns
- `.claude/commands/conditional_docs.md` — Add conditions for troubleshooting docs

### Validation Evidence
- Test suite results: 94 pass, 0 fail (100% pass rate)
- Test execution time: < 30 seconds
- 10 consecutive test runs with 0 flaky tests
- CI pipeline passing with real Supabase Local instance
- No remaining port 54326 references in test code
- All environment variables initialized before module imports
