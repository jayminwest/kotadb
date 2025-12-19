# Local SQLite Mode Server Bootstrap

**Issue**: #571
**Type**: feature
**Created**: 2025-12-19

## Summary

Enable the KotaDB API server to start in local SQLite mode without requiring Supabase credentials. This allows developers to run the server locally for testing and development using SQLite as the database backend, bypassing cloud-specific dependencies like pg-boss queue and Supabase health checks.

## Expert Analysis Summary

### Architecture
- Leverage existing `isLocalMode()` pattern used in 12+ locations
- Use mode-aware `getClient()` abstraction (already returns SQLite or Supabase)
- Make Express app signature flexible to support optional Supabase parameter
- Conditional initialization of cloud-specific services (queue, health checks)

### Testing Strategy
- Validation Level: 2 (Manual testing + automated integration tests)
- Test both cloud mode (with credentials) and local mode (without credentials) startup paths
- Verify existing antimocking tests continue to pass
- Test server startup, health endpoint, and basic API operations in local mode

### Security Considerations
- LOW RISK: Credential bypass only active when `KOTA_LOCAL_MODE=true` explicitly set
- Auth boundaries properly enforced (LOCAL_AUTH_CONTEXT with team tier)
- No new RLS policies needed (local mode uses single placeholder user)
- Queue startup must be conditional to prevent pg-boss dependency in local mode
- Health check must route based on mode to avoid getServiceClient() failure

### Integration Impact
- pg-boss queue: Skip entirely in local mode (requires PostgreSQL)
- Supabase client: Use existing getClient() abstraction throughout
- Express app: No breaking changes to external API contracts
- Health endpoint: Add graceful fallback for queue metrics in local mode

### UX/DX Impact
- Improved developer experience: Server starts without cloud credentials
- Clear error messages for cloud mode missing credentials
- Existing local mode patterns remain consistent
- No impact on production cloud deployments

## Requirements

- [ ] Replace hardcoded Supabase credential check with mode-aware validation
- [ ] Make getServiceClient() call conditional on cloud mode
- [ ] Skip pg-boss queue startup entirely in local mode
- [ ] Add mode-aware health check routing (skip Supabase health in local mode)
- [ ] Ensure Express app works with optional Supabase client
- [ ] Add logging for mode detection and skipped services
- [ ] Verify all existing mode-aware patterns continue to work

## Implementation Steps

### Step 1: Replace Hardcoded Credential Check
**Files**: `app/src/index.ts`
**Changes**:
- Remove lines 15-24 (hardcoded SUPABASE_URL/KEY check)
- Add call to `getEnvironmentConfig()` early in bootstrap()
- This provides centralized validation and fails fast if cloud mode lacks credentials
- Preserves production safety while allowing local mode to proceed

### Step 2: Make Queue Startup Conditional
**Files**: `app/src/index.ts`
**Changes**:
- Wrap queue startup (lines 82-103) with `if (!isLocalMode())` guard
- Add else branch with logger.info("Queue disabled in local mode (SQLite only)")
- This prevents pg-boss initialization that requires SUPABASE_DB_URL
- Skip startIndexWorker() call in local mode as well

### Step 3: Make Supabase Client Optional in Bootstrap
**Files**: `app/src/index.ts`
**Changes**:
- Replace line 69 `const supabase = getServiceClient()` with conditional:
  - `const supabase = !isLocalMode() ? getServiceClient() : undefined`
- Update health check (lines 72-78) to skip if local mode
- Express app already uses getClient() internally, no changes needed there

### Step 4: Add Mode-Aware Health Check
**Files**: `app/src/index.ts`
**Changes**:
- Wrap Supabase health check (lines 72-78) with `if (supabase)` guard
- Add local mode health check using SQLite client if needed
- Log health check mode for observability

### Step 5: Update Health Endpoint for Queue Metrics
**Files**: `app/src/api/index.ts` (health endpoint, lines 102-147)
**Changes**:
- Wrap queue.getQueue() calls in try-catch
- Skip queue metrics gracefully if queue unavailable in local mode
- Return partial health status without queue metrics

### Step 6: Add Startup Logging
**Files**: `app/src/index.ts`
**Changes**:
- Log detected mode at startup using process.stdout.write pattern
- Log which services are enabled/disabled based on mode
- Helps with debugging and mode verification

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `app/src/index.ts` | modify | Remove hardcoded credential check, add conditional queue/Supabase initialization |
| `app/src/api/index.ts` | modify | Add graceful queue metrics fallback in health endpoint |

## Files to Create

None (all changes are modifications to existing files)

## Testing Strategy

**Validation Level**: 2 (Manual testing + automated integration tests)
**Justification**: Feature involves server startup logic and multiple integration points. Requires verification of both cloud and local modes, but no complex business logic or security-critical changes beyond mode detection.

### Test Cases
- [ ] Server starts successfully in local mode without Supabase credentials (KOTA_LOCAL_MODE=true)
- [ ] Server fails fast in cloud mode without Supabase credentials
- [ ] Queue is NOT initialized in local mode (verify no pg-boss logs)
- [ ] Queue IS initialized in cloud mode (verify pg-boss startup logs)
- [ ] Health endpoint returns 200 in local mode without queue metrics
- [ ] Health endpoint returns 200 in cloud mode with queue metrics
- [ ] Existing API routes work in local mode using SQLite
- [ ] Existing API routes work in cloud mode using Supabase
- [ ] Auth middleware returns LOCAL_AUTH_CONTEXT in local mode
- [ ] Auth middleware validates credentials in cloud mode

### Test Files
- Manual testing: Start server with/without credentials and KOTA_LOCAL_MODE flag
- Integration tests: Add test case to verify local mode bootstrap in existing test suite
- CI validation: Existing tests should continue to pass (they use local mode)

## Convention Checklist

- [ ] Path aliases used for all imports (@api/*, @db/*, @queue/*, @config/*)
- [ ] Logging via process.stdout.write (no console.*)
- [ ] Tests use real Supabase Local (antimocking) - no changes to test approach
- [ ] Migrations not affected (no schema changes)
- [ ] Pre-commit hooks pass (linting, formatting)
- [ ] Agent workflow compatible (no new tooling constraints)
- [ ] Follows existing isLocalMode() pattern used throughout codebase

## Dependencies

**Depends on**:
- `@config/environment` (getEnvironmentConfig, isLocalMode functions)
- `@db/client` (getClient, getServiceClient functions)
- `@queue/client` (startQueue function)

**Depended on by**:
- All API routes (benefit from optional Supabase client)
- MCP server tooling (can run in local mode)
- CI/CD pipeline (already runs in local mode)

## Risks

**Risk 1: Accidental local mode in production**
- **Mitigation**: getEnvironmentConfig() guards against KOTA_LOCAL_MODE=true in production by explicit check. Add deployment validation if needed.

**Risk 2: Missing queue functionality in local mode**
- **Mitigation**: Document that /index endpoint (async indexing) is disabled or synchronous in local mode. Consider adding 501 Not Implemented response for queue-dependent routes.

**Risk 3: Health check confusion**
- **Mitigation**: Health endpoint clearly indicates mode and which services are active. Add "mode" field to health response.

**Risk 4: Incomplete mode detection**
- **Mitigation**: Use centralized isLocalMode() function, already used in 12+ locations. Single source of truth prevents inconsistent behavior.

## Acceptance Criteria (from Issue #571)

- [ ] Server starts in local mode without SUPABASE_URL or SUPABASE_SERVICE_KEY
- [ ] Server logs mode detection at startup
- [ ] Queue initialization is skipped in local mode
- [ ] Health check passes in local mode without Supabase connection
- [ ] Existing local mode functionality (auth, rate limiting, API routes) continues to work
- [ ] Cloud mode behavior unchanged (credentials still required)
- [ ] No breaking changes to external API contracts

## Validation Plan

**Manual Testing**:
```bash
# Test local mode startup
unset SUPABASE_URL SUPABASE_SERVICE_KEY
export KOTA_LOCAL_MODE=true
cd app && ./scripts/dev-start.sh
# Verify: Server starts, logs show "Local mode", queue not initialized

# Test cloud mode startup (should fail without credentials)
unset KOTA_LOCAL_MODE
cd app && ./scripts/dev-start.sh
# Verify: Server throws error about missing Supabase credentials

# Test cloud mode startup (with credentials)
export SUPABASE_URL=<url>
export SUPABASE_SERVICE_KEY=<key>
cd app && ./scripts/dev-start.sh
# Verify: Server starts, logs show "Cloud mode", queue initialized
```

**Automated Testing**:
```bash
# Run existing test suite (uses local mode)
cd app && bun test

# Type-check
cd app && bunx tsc --noEmit

# Lint
cd app && bun run lint
```

## Rollback Plan

**How to revert**:
1. Restore hardcoded credential check in app/src/index.ts lines 15-24
2. Remove conditional isLocalMode() guards around queue/Supabase initialization
3. Restore unconditional getServiceClient() call at line 69

**Detection of failure**:
- Server fails to start in either mode
- Health check returns 500 in local mode
- Queue errors in logs for local mode
- Tests fail in CI

**Low risk rollback**: All changes are isolated to bootstrap logic in index.ts and health endpoint. No schema changes or external dependencies affected.
