# Feature Plan: Tier-Based Rate Limiting Middleware

**Issue**: #26
**Title**: feat: implement tier-based rate limiting middleware
**Labels**: component:backend, component:api, priority:high, effort:medium

## Overview

### Problem
KotaDB currently has no protection against API abuse or enforcement of tier-based usage limits. The authentication middleware validates API keys but does not track or limit request rates. A previous implementation (PR #18, issue #14) was reverted due to branch incompatibility with the new modular auth system.

### Desired Outcome
Implement production-ready rate limiting that:
- Enforces tier-specific hourly limits: `free=100/hr`, `solo=1000/hr`, `team=10000/hr`
- Returns `429 Too Many Requests` with proper retry headers when limits are exceeded
- Adds rate limit status headers to all authenticated responses
- Uses atomic database operations to prevent race conditions
- Integrates seamlessly with the existing auth middleware architecture

### Non-Goals
- Request quota rollover or credit banking between hours
- Dynamic rate limit adjustments per endpoint
- Distributed rate limiting across multiple servers (single-node atomic operations are sufficient)
- Rate limiting for unauthenticated endpoints like `/health`

## Technical Approach

### Architecture Notes
The implementation adapts the reverted SQLite-based rate limiting (commit `2fa5df2`) to work with the current Supabase/PostgreSQL architecture on `develop`. The existing `increment_rate_limit()` database function provides atomic counter updates using `INSERT ... ON CONFLICT` semantics.

**Key Integration Points**:
1. **Authentication Flow**: `authenticateRequest()` → **rate limit check** → `AuthContext` (enhanced)
2. **Response Headers**: All successful responses include `X-RateLimit-*` headers
3. **Database Function**: Existing `increment_rate_limit()` in `src/db/functions/increment_rate_limit.sql`
4. **Error Handling**: New 429 response with `Retry-After` header

### Key Modules to Touch
- `src/auth/rate-limit.ts` (new) - Core rate limiting logic
- `src/auth/middleware.ts` - Integration with `authenticateRequest()`
- `src/auth/context.ts` - Add `rateLimit` field to `AuthContext`
- `src/api/routes.ts` - Response header injection
- `tests/auth/rate-limit.test.ts` (new) - Comprehensive test suite
- `tests/auth/middleware.test.ts` - Integration tests

### Data/API Impacts

**Database**:
- Uses existing `rate_limit_counters` table (no schema changes required)
- Calls existing `increment_rate_limit()` function for atomic updates
- Window-based hourly reset using `window_start` truncated to hour boundaries

**API Changes**:
- **429 Response Format**:
  ```json
  {
    "error": "Rate limit exceeded",
    "retryAfter": 3456
  }
  ```
- **New Response Headers** (all authenticated endpoints):
  - `X-RateLimit-Limit`: Total limit for user's tier (e.g., "100")
  - `X-RateLimit-Remaining`: Requests remaining in current window (e.g., "58")
  - `X-RateLimit-Reset`: Unix timestamp when limit resets (e.g., "1728475200")
  - `Retry-After`: Seconds until reset (429 responses only)

**AuthContext Enhancement**:
```typescript
export interface AuthContext {
  userId: string;
  tier: Tier;
  orgId?: string;
  keyId: string;
  rateLimitPerHour: number;
  rateLimit?: RateLimitResult; // NEW
}
```

## Relevant Files

### Existing Files (to modify)
- `src/auth/middleware.ts` — Add rate limit enforcement after key validation
- `src/auth/context.ts` — Extend `AuthContext` with `rateLimit?: RateLimitResult`
- `src/api/routes.ts` — Inject rate limit headers into responses
- `src/db/functions/increment_rate_limit.sql` — Already exists, verified compatible
- `tests/auth/middleware.test.ts` — Add integration tests for rate limiting
- `docs/schema.md` — Already documents `rate_limit_counters` table

### New Files
- `src/auth/rate-limit.ts` — Core rate limiting module
  - `RateLimitResult` interface
  - `enforceRateLimit(keyId, rateLimitPerHour)` function
  - Supabase client integration
- `tests/auth/rate-limit.test.ts` — Comprehensive test suite
  - Unit tests for `enforceRateLimit()`
  - Window reset behavior verification
  - Concurrent request handling
  - Header presence and accuracy

## Task Breakdown

### Phase 1: Core Rate Limiting Module
- Extract rate limiting logic from historical implementation (commit `2fa5df2`)
- Create `src/auth/rate-limit.ts` with Supabase adapter
- Implement `enforceRateLimit()` using `increment_rate_limit()` database function
- Define `RateLimitResult` interface matching database return type
- Add error handling for database failures

### Phase 2: Middleware Integration
- Update `src/auth/context.ts` to add optional `rateLimit` field
- Modify `src/auth/middleware.ts` to call rate limiting after successful auth
- Implement 429 response with proper headers when limit exceeded
- Store rate limit result in context for downstream use
- Ensure `/health` endpoint remains exempt (already skips auth)

### Phase 3: Response Header Injection
- Update `src/api/routes.ts` to add rate limit headers to all authenticated responses
- Extract header injection into reusable helper function
- Ensure headers are present on both success (200/202) and error (400/500) responses
- Validate header format matches HTTP standards

### Phase 4: Testing & Validation
- Create comprehensive test suite in `tests/auth/rate-limit.test.ts`
- Add integration tests to `tests/auth/middleware.test.ts`
- Test concurrent request handling for race condition safety
- Verify window reset behavior across hour boundaries
- Validate all response headers are present and accurate
- Run full validation suite (lint, typecheck, tests, build)

## Step by Step Tasks

### 1. Create Core Rate Limiting Module
- Create `src/auth/rate-limit.ts`
- Define `RateLimitResult` interface:
  ```typescript
  export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfter?: number;
    resetAt: number;
    limit: number;
  }
  ```
- Implement `enforceRateLimit(keyId: string, rateLimitPerHour: number)` function
- Use service role Supabase client from `@db/client`
- Call `increment_rate_limit()` database function via `.rpc()`
- Parse JSON response and map to `RateLimitResult`
- Handle database errors gracefully (fail closed: deny request)

### 2. Extend Authentication Context
- Update `src/auth/context.ts`
- Add `rateLimit?: RateLimitResult` field to `AuthContext` interface
- Document field purpose in JSDoc comments

### 3. Integrate with Authentication Middleware
- Update `src/auth/middleware.ts`
- Import `enforceRateLimit` from `@auth/rate-limit`
- After successful API key validation (line 96-105), call `enforceRateLimit()`
- If `!rateLimit.allowed`, return 429 response:
  ```typescript
  return {
    response: new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        retryAfter: rateLimit.retryAfter
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(context.rateLimitPerHour),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateLimit.resetAt),
          "Retry-After": String(rateLimit.retryAfter || 0)
        }
      }
    )
  };
  ```
- If allowed, attach `rateLimit` to context: `return { context: { ...context, rateLimit } }`

### 4. Add Response Header Injection
- Update `src/api/routes.ts`
- Create helper function `addRateLimitHeaders(response: Response, rateLimit: RateLimitResult): Response`
- In `handleAuthenticatedRequest()`, wrap all response returns:
  ```typescript
  async function handleAuthenticatedRequest(..., context: AuthContext, ...) {
    // ... existing logic ...
    const response = await json({ results });

    if (context.rateLimit) {
      return addRateLimitHeaders(response, context.rateLimit);
    }
    return response;
  }
  ```
- Apply to all return paths: `/index`, `/search`, `/files/recent`, `/mcp`
- Ensure headers don't interfere with existing `Content-Type` and error headers

### 5. Write Comprehensive Tests
- Create `tests/auth/rate-limit.test.ts`
- Test scenarios:
  - ✅ First request increments counter to 1
  - ✅ Subsequent requests increment counter correctly
  - ✅ Request at limit is allowed (e.g., 100th request for free tier)
  - ✅ Request exceeding limit returns `allowed: false`
  - ✅ Counter resets when hour window changes
  - ✅ Concurrent requests don't cause race conditions
  - ✅ Different key IDs have independent counters
  - ✅ Database errors fail closed (deny request)
- Use real Supabase Local instance (no mocks per `/anti-mock` policy)
- Seed test API keys via `getTestApiKey()` helper

### 6. Add Middleware Integration Tests
- Update `tests/auth/middleware.test.ts`
- New test cases:
  - ✅ Authenticated request includes rate limit context
  - ✅ Request within limit succeeds with headers
  - ✅ Request exceeding limit returns 429 with retry headers
  - ✅ Rate limit headers present on all authenticated responses
  - ✅ `/health` endpoint exempt from rate limiting

### 7. Add End-to-End Integration Tests
- Create test scenario hitting actual `/search` endpoint
- Verify response headers are present:
  ```typescript
  expect(response.headers.get("X-RateLimit-Limit")).toBe("100");
  expect(response.headers.get("X-RateLimit-Remaining")).toBeDefined();
  expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
  ```
- Test rate limit exhaustion: make 101 requests, verify 101st is 429
- Verify `Retry-After` header accuracy

### 8. Run Validation Suite (Level 2)
- Execute validation commands in order:
  - `bun run lint` — Verify linting passes
  - `bun run typecheck` — Verify no type errors
  - `bun test --filter integration` — Run integration tests
  - `bun test` — Run full test suite
  - `bun run build` — Verify build succeeds
- Fix any failures before proceeding

### 9. Update Documentation
- Verify `docs/schema.md` accurately documents `rate_limit_counters` table (already exists)
- Check if `.claude/commands/conditional_docs.md` needs rate limiting guidance (likely not)
- Document rate limit headers in README.md API section

### 10. Commit and Push Implementation
- Stage all changes: `git add src/ tests/ docs/`
- Commit with descriptive message:
  ```bash
  git commit -m "feat: implement tier-based rate limiting middleware (#26)

  - Add enforceRateLimit() using increment_rate_limit() DB function
  - Integrate rate limiting into auth middleware
  - Return 429 with Retry-After header when limit exceeded
  - Add X-RateLimit-* headers to all authenticated responses
  - Comprehensive test coverage with real Supabase integration
  - Window-based hourly reset with atomic counter updates

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>"
  ```
- Push to feature branch: `git push -u origin feat/26-tier-based-rate-limiting`

### 11. Create Pull Request
- Run `/pull_request feat/26-tier-based-rate-limiting <issue_json> docs/specs/feature-26-tier-based-rate-limiting.md <adw_id>`
- PR title must end with issue number: `feat: implement tier-based rate limiting middleware (#26)`
- Include validation evidence in PR description:
  - All tests passing
  - Rate limit headers verified in integration tests
  - Atomic counter updates tested under concurrent load

## Risks & Mitigations

### Risk: Race Conditions in Concurrent Requests
**Mitigation**: Use atomic `increment_rate_limit()` database function with `INSERT ... ON CONFLICT` semantics. Test with concurrent request scenarios.

### Risk: Database Function Unavailable
**Mitigation**: Verify `increment_rate_limit()` exists in Supabase Local test environment. Include migration sync validation in pre-test checks.

### Risk: Clock Skew Affecting Window Boundaries
**Mitigation**: Use `date_trunc('hour', now())` in database function to ensure server-side time consistency. All window calculations happen in PostgreSQL, not application code.

### Risk: Performance Impact on Hot Paths
**Mitigation**: Database function uses indexed lookup on `(key_id, window_start)`. RLS policies allow direct access via `SECURITY DEFINER`. Minimal overhead (~5-10ms per request).

### Risk: Rate Limit Bypass via Multiple Keys
**Mitigation**: Rate limits are per API key, not per user. Document that users can create multiple keys but each key has independent limits. Future enhancement: user-level rate limiting.

### Risk: Test Flakiness with Time-Based Windows
**Mitigation**: Use fixed test data with predictable timestamps. Avoid testing near hour boundaries. Add retry logic for timing-sensitive tests if needed.

## Validation Strategy

### Automated Tests (Real Supabase Integration)
All tests use real Supabase Local instance per `/anti-mock` policy:

1. **Unit Tests** (`tests/auth/rate-limit.test.ts`):
   - Rate limit enforcement logic
   - Counter increment accuracy
   - Window reset behavior
   - Concurrent request handling
   - Error handling (database failures)

2. **Integration Tests** (`tests/auth/middleware.test.ts`):
   - Rate limiting integrated with authentication flow
   - 429 response generation
   - Header injection on all endpoints
   - `/health` endpoint exemption

3. **End-to-End Tests**:
   - Full request lifecycle through router
   - Response header presence and accuracy
   - Rate limit exhaustion and recovery
   - Multi-tier behavior (free, solo, team)

### Manual Testing Scenarios

**Scenario 1: Normal Usage (Within Limits)**
```bash
# Start Supabase Local
bun run test:setup

# Start server
bun run src/index.ts

# Make requests within free tier limit (100/hr)
for i in {1..5}; do
  curl -v -H "Authorization: Bearer $(cat .test-api-key)" \
    http://localhost:3000/search?term=test 2>&1 | grep "X-RateLimit"
done

# Expected: X-RateLimit-Limit: 100, X-RateLimit-Remaining: 95, 94, 93, 92, 91
```

**Scenario 2: Rate Limit Exhaustion**
```bash
# Make 101 requests (exceeding free tier)
for i in {1..101}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $(cat .test-api-key)" \
    http://localhost:3000/search?term=test
done

# Expected: First 100 return 200, 101st returns 429
```

**Scenario 3: Concurrent Requests (Race Condition Test)**
```bash
# Make 50 concurrent requests
seq 1 50 | xargs -P10 -I{} curl -s \
  -H "Authorization: Bearer $(cat .test-api-key)" \
  http://localhost:3000/search?term=test > /dev/null

# Verify counter accuracy in database
psql $DATABASE_URL -c "SELECT request_count FROM rate_limit_counters WHERE key_id = 'test_key_id';"

# Expected: request_count = 50 (exactly, no missed increments)
```

**Scenario 4: Window Reset**
```bash
# Wait until next hour boundary (or adjust system time in test env)
# Make request after window reset
curl -v -H "Authorization: Bearer $(cat .test-api-key)" \
  http://localhost:3000/search?term=test 2>&1 | grep "X-RateLimit-Remaining"

# Expected: X-RateLimit-Remaining: 99 (counter reset)
```

### Release Guardrails
- **Monitoring**: Log rate limit denials (429 responses) for abuse detection
- **Alerting**: Alert if 429 rate exceeds threshold (e.g., >10% of requests)
- **Rollback Plan**: Feature toggle to disable rate limiting if issues arise
- **Real-Service Evidence**: All validation tests use real Supabase Local, not mocks

## Validation Commands

```bash
# Level 2 Validation (required for feature work)
bun run lint
bun run typecheck
bun test --filter integration
bun test
bun run build

# Domain-specific checks
bun run test:validate-migrations  # Ensure migration sync
bun run test:status              # Verify Supabase Local running

# Optional: Load testing (not required for merge)
# autocannon -c 10 -d 5 -H "Authorization: Bearer <key>" http://localhost:3000/search?term=test
```

## References

- **Original Implementation**: Commit `2fa5df2` (reverted on main, SQLite-based)
- **Issue #14**: Original rate limiting issue (completed then reverted)
- **PR #18**: Reverted implementation (incompatible with new auth architecture)
- **Issue #13**: Auth middleware foundation (prerequisite, completed)
- **Issue #25**: API key generation (prerequisite, completed)
- **Database Function**: `src/db/functions/increment_rate_limit.sql` (already exists)
- **Schema Documentation**: `docs/schema.md` lines 320-348

## Dependencies

- ✅ Auth middleware (Issue #13) — Completed
- ✅ API key generation (Issue #25) — Completed
- ✅ `rate_limit_counters` table — Exists in schema
- ✅ `increment_rate_limit()` function — Exists in `src/db/functions/`
- ✅ Supabase Local test environment — Available via `bun run test:setup`

## Success Criteria

1. ✅ Rate limits enforced per tier: free=100/hr, solo=1000/hr, team=10000/hr
2. ✅ 429 responses include `Retry-After` header with accurate seconds until reset
3. ✅ All authenticated responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
4. ✅ No race conditions under concurrent load (verified via load tests)
5. ✅ Window resets automatically at hour boundaries
6. ✅ `/health` endpoint exempt from rate limiting
7. ✅ All tests pass with real Supabase integration (no mocks)
8. ✅ Type-safe integration with existing auth system (zero TypeScript errors)
9. ✅ Validation suite passes: lint, typecheck, integration tests, full test suite, build
10. ✅ PR created and ready for review

## Branch Strategy

**Feature Branch**: `feat/26-tier-based-rate-limiting`
**Base Branch**: `develop`
**Target Branch**: `develop` (follows `feat/*` → `develop` → `main` flow)

## Effort Estimate

**Medium** (~1-2 days):
- 3 hours: Core rate limiting module and Supabase integration
- 2 hours: Middleware integration and response header injection
- 4 hours: Comprehensive test suite (unit, integration, e2e)
- 1 hour: Documentation and validation
- 1 hour: PR creation and review preparation

**Total**: ~11 hours
