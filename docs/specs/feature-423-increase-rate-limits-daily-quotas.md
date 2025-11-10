# Feature Plan: Increase Rate Limits and Add Daily Quotas

**Issue**: #423
**Title**: feat: increase rate limits and add daily quotas for improved developer experience
**Labels**: component:backend, component:api, component:database, priority:high, effort:medium, status:needs-investigation

## Overview

### Problem
Current rate limits are too restrictive for practical usage, especially for the free tier. During a single Claude Code testing session, 100 requests were consumed, hitting the hourly free tier limit. This severely impacts developer experience and makes the service difficult to evaluate or use for development workflows.

**Current Rate Limits:**
- **Free**: 100 requests/hour, no daily limit
- **Solo**: 1,000 requests/hour, no daily limit
- **Team**: 10,000 requests/hour, no daily limit

**Observed Issue:**
A single Claude Code session consumed 100+ requests during typical development workflow testing (indexing, searching, dependency analysis). This makes the free tier essentially unusable for evaluation purposes and blocks developer adoption.

### Desired Outcome
Implement revised rate limits that support realistic development workflows while maintaining abuse protection:

**Hourly Limits:**
- **Free**: 1,000 requests/hour (10x increase)
- **Solo**: 5,000 requests/hour (5x increase)
- **Team**: 25,000 requests/hour (2.5x increase)

**Daily Limits (NEW):**
- **Free**: 5,000 requests/day
- **Solo**: 25,000 requests/day
- **Team**: 100,000 requests/day

This allows developers to fully evaluate the product with the free tier while daily limits prevent sustained abuse. The dual-limit approach enables burst usage (MCP workflows) while providing cost protection.

### Non-Goals
- Per-endpoint rate limits (e.g., index=100/day, search=5000/day) - reserved for future enhancement
- Enterprise tier implementation (#405) - separate initiative
- Dynamic rate limit adjustments based on load - single fixed limits per tier
- Request quota rollover or credit banking between windows

## Technical Approach

### Architecture Notes
The implementation extends the existing hourly rate limiting system to add parallel daily tracking. Both hourly and daily limits must be enforced simultaneously, with the most restrictive limit taking precedence. The existing `increment_rate_limit()` function provides the foundation; we'll create a parallel `increment_rate_limit_daily()` function following the same atomic pattern.

**Key Integration Points:**
1. **Database Layer**: New `rate_limit_counters_daily` table mirroring hourly structure
2. **Database Function**: New `increment_rate_limit_daily()` function for atomic daily counter updates
3. **Middleware Enhancement**: Dual limit checking in `enforceRateLimit()`
4. **Constants Update**: New `DAILY_RATE_LIMITS` constant in `shared/types/rate-limit.ts`
5. **Response Headers**: Header logic updated to reflect most restrictive limit

### Key Modules to Touch
- `shared/types/rate-limit.ts` — Add `DAILY_RATE_LIMITS` constant
- `app/src/auth/rate-limit.ts` — Add daily limit enforcement logic
- `app/src/auth/middleware.ts` — Update to check both hourly and daily limits
- `app/src/db/migrations/20251110202336_add_daily_rate_limits.sql` — New migration
- `app/src/db/functions/increment_rate_limit_daily.sql` — New function
- `app/tests/auth/rate-limit.test.ts` — Add daily limit test coverage
- `app/tests/integration/rate-limiting.test.ts` — Integration tests for dual limits

### Data/API Impacts

**Database Changes:**
- New table `rate_limit_counters_daily` with structure matching hourly table
- New database function `increment_rate_limit_daily(p_key_id, p_daily_limit)`
- RLS policies matching existing hourly table policies

**API Changes:**
- No breaking changes to response format
- Header behavior: `X-RateLimit-Remaining` reflects minimum of hourly/daily remaining
- `X-RateLimit-Reset` reflects next reset time (typically hourly as it comes sooner)
- 429 responses include `retryAfter` based on soonest reset

**Behavioral Changes:**
- Free tier can now make 1,000 req/hr but only 5,000/day total
- Example: User makes 1,000 requests in hour 1, then 1,000 in each of hours 2-5 (5,000 total). Hour 6 requests are blocked by daily limit even though hourly quota available.

## Relevant Files

### Existing Files (to modify)
- `shared/types/rate-limit.ts:64-68` — Add DAILY_RATE_LIMITS constant
- `app/src/auth/rate-limit.ts` — Add enforceDailyRateLimit() and update enforceRateLimit()
- `app/src/auth/middleware.ts:96-120` — Update to check both limits
- `app/tests/auth/rate-limit.test.ts` — Add daily limit tests
- `.claude/commands/docs/workflow.md:67-71` — Update rate limit tiers documentation
- `web/app/pricing/page.tsx:63-104` — Update tier features to show both hourly and daily limits

### New Files
- `app/src/db/migrations/20251110202336_add_daily_rate_limits.sql` — Daily counter table and indexes
- `app/src/db/functions/increment_rate_limit_daily.sql` — Atomic daily increment function

## Task Breakdown

### Phase 1: Database Foundation
- Create migration for `rate_limit_counters_daily` table
- Implement `increment_rate_limit_daily()` database function
- Add RLS policies matching hourly table
- Sync migration to `app/supabase/migrations/`

### Phase 2: Type System and Constants
- Add `DAILY_RATE_LIMITS` constant to `shared/types/rate-limit.ts`
- Verify `RateLimitResult` interface supports dual limits (no changes needed)
- Update JSDoc comments to document daily limit behavior

### Phase 3: Rate Limit Logic
- Implement `enforceDailyRateLimit()` in `app/src/auth/rate-limit.ts`
- Update `enforceRateLimit()` to call both hourly and daily checks
- Return most restrictive result (minimum remaining, soonest reset)
- Increase hourly limit constants in `RATE_LIMITS`

### Phase 4: Testing
- Add unit tests for daily limit enforcement
- Add integration tests for dual limit scenarios
- Test midnight UTC reset behavior
- Test limit exhaustion paths (hourly vs daily blocking)
- Validate all tests use real Supabase Local (antimocking compliance)

### Phase 5: Frontend Updates
- Update pricing page (`web/app/pricing/page.tsx`) to show new limits
- Update tier feature lists to include both hourly and daily limits
- Ensure clarity that both limits are enforced

### Phase 6: Documentation and Validation
- Update workflow.md with new rate limit tiers
- Run full validation suite (Level 2)
- Validate migration sync
- Push feature branch and prepare for PR

## Step by Step Tasks

### 1. Create Daily Rate Limit Table Migration
- Create `app/src/db/migrations/20251110202336_add_daily_rate_limits.sql`
- Define `rate_limit_counters_daily` table:
  ```sql
  CREATE TABLE rate_limit_counters_daily (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key_id text NOT NULL,
      day_start timestamptz NOT NULL,  -- Start of UTC day
      request_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(key_id, day_start)
  );
  ```
- Add indexes: `idx_rate_limit_counters_daily_key_id`, `idx_rate_limit_counters_daily_day`
- Enable RLS and create policy matching hourly table pattern
- Copy migration to `app/supabase/migrations/20251110202336_add_daily_rate_limits.sql`

### 2. Create Daily Increment Database Function
- Create `app/src/db/functions/increment_rate_limit_daily.sql`
- Implement function using `date_trunc('day', now())` for day boundaries
- Follow same atomic pattern as `increment_rate_limit()` with `INSERT...ON CONFLICT`
- Return jsonb with `request_count`, `day_start`, `remaining`, `reset_at` (day_start + 1 day)
- Grant execute permissions to `authenticated` and `service_role`

### 3. Update Rate Limit Constants
- Update `shared/types/rate-limit.ts:64-68`
- Change `RATE_LIMITS` values:
  ```typescript
  export const RATE_LIMITS: Record<Tier, number> = {
    free: 1000,    // was 100
    solo: 5000,    // was 1000
    team: 25000,   // was 10000
  };
  ```
- Add new constant:
  ```typescript
  export const DAILY_RATE_LIMITS: Record<Tier, number> = {
    free: 5000,
    solo: 25000,
    team: 100000,
  };
  ```

### 4. Implement Daily Rate Limit Enforcement
- Update `app/src/auth/rate-limit.ts`
- Import `DAILY_RATE_LIMITS` from `@shared/types/rate-limit`
- Create `enforceDailyRateLimit(keyId: string, dailyLimit: number): Promise<RateLimitResult>`
- Call `supabase.rpc('increment_rate_limit_daily', { p_key_id, p_daily_limit })`
- Parse response and map to `RateLimitResult` (same format as hourly)

### 5. Update enforceRateLimit to Check Both Limits
- Modify `enforceRateLimit()` to accept tier parameter instead of just hourly limit
- Call both `enforceRateLimit()` (hourly) and `enforceDailyRateLimit()` (daily)
- Implement dual-check logic:
  ```typescript
  export async function enforceRateLimit(
    keyId: string,
    tier: Tier
  ): Promise<RateLimitResult> {
    const hourlyLimit = RATE_LIMITS[tier];
    const dailyLimit = DAILY_RATE_LIMITS[tier];

    // Check hourly limit
    const hourlyResult = await enforceHourlyRateLimit(keyId, hourlyLimit);
    if (!hourlyResult.allowed) {
      return hourlyResult; // Blocked by hourly limit
    }

    // Check daily limit
    const dailyResult = await enforceDailyRateLimit(keyId, dailyLimit);
    if (!dailyResult.allowed) {
      return dailyResult; // Blocked by daily limit
    }

    // Both limits passed - return most restrictive remaining count
    return {
      allowed: true,
      remaining: Math.min(hourlyResult.remaining, dailyResult.remaining),
      resetAt: hourlyResult.resetAt, // Hourly resets sooner, use for retry
      limit: hourlyLimit, // Keep hourly limit in header for compatibility
    };
  }
  ```
- Refactor existing logic into `enforceHourlyRateLimit()` helper

### 6. Update Middleware to Pass Tier Instead of Rate Limit
- Update `app/src/auth/middleware.ts:96-120`
- Change `enforceRateLimit()` call from:
  ```typescript
  const rateLimit = await enforceRateLimit(keyId, rateLimitPerHour);
  ```
  to:
  ```typescript
  const rateLimit = await enforceRateLimit(keyId, tier);
  ```
- No other changes needed (headers already use rateLimit.limit from result)

### 7. Write Unit Tests for Daily Limits
- Update `app/tests/auth/rate-limit.test.ts`
- Add test suite "Daily Rate Limits":
  - ✅ First request increments daily counter to 1
  - ✅ Requests increment daily counter across multiple hours
  - ✅ Daily counter resets at UTC midnight
  - ✅ Request at daily limit is allowed (e.g., 5000th for free)
  - ✅ Request exceeding daily limit returns `allowed: false`
  - ✅ Different key IDs have independent daily counters
  - ✅ Concurrent requests don't cause race conditions in daily table

### 8. Write Integration Tests for Dual Limit Enforcement
- Create `app/tests/integration/rate-limiting.test.ts` (if doesn't exist)
- Test scenarios:
  - ✅ Free tier allows 1000 requests/hour (verify increased limit)
  - ✅ Free tier blocks 5001st request in same day (daily limit)
  - ✅ Solo tier allows 5000 requests/hour
  - ✅ Solo tier blocks 25001st request in same day
  - ✅ Hourly reset doesn't reset daily counter
  - ✅ Daily reset allows new requests even if hourly would block
  - ✅ Headers show most restrictive remaining count

### 9. Test Midnight Reset Behavior
- Add test that simulates crossing UTC midnight boundary
- Verify daily counter resets while hourly counter maintains separate lifecycle
- Use Supabase Local with time-mocked test data (seed specific timestamps)

### 10. Update Frontend Pricing Page
- Update `web/app/pricing/page.tsx:55-105`
- Modify `tiers` array to show both hourly and daily limits in features:
  ```typescript
  // Free tier features
  features: [
    '1,000 requests per hour',
    '5,000 requests per day',
    'Basic code search',
    'Repository indexing',
    'Community support',
  ],

  // Solo tier features
  features: [
    '5,000 requests per hour',
    '25,000 requests per day',
    'Advanced code search',
    'Unlimited repositories',
    'Priority support',
    'API access',
  ],

  // Team tier features
  features: [
    '25,000 requests per hour',
    '100,000 requests per day',
    'Advanced code search',
    'Unlimited repositories',
    'Priority support',
    'API access',
    'Team collaboration',
    'Dedicated support',
  ],
  ```
- Ensure both limits are prominently displayed as first two features for each tier

### 11. Update Documentation
- Update `.claude/commands/docs/workflow.md:67-71`
- Change rate limit tiers section to:
  ```markdown
  ## Rate Limit Tiers

  ### Hourly Limits
  - **free**: 1,000 requests/hour
  - **solo**: 5,000 requests/hour
  - **team**: 25,000 requests/hour

  ### Daily Limits
  - **free**: 5,000 requests/day
  - **solo**: 25,000 requests/day
  - **team**: 100,000 requests/day

  Both hourly and daily limits are enforced. Whichever limit is reached first will block requests.
  ```

### 12. Run Validation Suite (Level 2)
- Execute validation commands:
  - `cd app && bun run lint` — Verify linting passes
  - `cd app && bun run typecheck` — Verify no type errors
  - `cd app && bun test --filter integration` — Run integration tests
  - `cd app && bun test` — Run full test suite
  - `cd app && bun run build` — Verify build succeeds
  - `cd app && bun run test:validate-migrations` — Verify migration sync
- Fix any failures before proceeding

### 13. Commit and Push Implementation
- Stage all changes: `git add app/src/ app/tests/ shared/ docs/ app/supabase/ web/app/pricing/`
- Commit with Conventional Commits format:
  ```bash
  git commit -m "feat: increase rate limits and add daily quotas (#423)

  - Increase hourly limits: free=1000, solo=5000, team=25000
  - Add daily limits: free=5000, solo=25000, team=100000
  - Create rate_limit_counters_daily table and increment function
  - Enforce both hourly and daily limits in middleware
  - Add comprehensive test coverage for dual-limit scenarios
  - Update workflow documentation with new tier limits
  - Update frontend pricing page to display both limits clearly

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>"
  ```
- Push to feature branch: `git push -u origin feat/423-increase-rate-limits-daily-quotas`

## Risks & Mitigations

### Risk: Increased API Costs from Higher Free Tier Usage
**Mitigation**: Daily limits provide cost ceiling (5,000 req/day = ~150k req/month max per free user). Current Supabase usage shows <1% of free tier database capacity consumed. 10x increase in free tier requests is financially viable based on current metrics.

### Risk: Daily Counter Growing Unbounded
**Mitigation**: Implement cleanup job to delete counters older than 7 days. Add database index on `day_start` for efficient deletion. Daily counters only stored temporarily for active windows.

### Risk: Time Zone Confusion (UTC vs Local)
**Mitigation**: All calculations use `date_trunc('day', now())` in database (server-side UTC). Document clearly that daily limits reset at UTC midnight, not local midnight. Include examples in API documentation.

### Risk: Race Conditions Between Hourly and Daily Checks
**Mitigation**: Each check is atomic (database function with `INSERT...ON CONFLICT`). No cross-table transactions needed. Order of checks (hourly first, then daily) prevents unnecessary daily increment if hourly blocked.

### Risk: Migration Drift Between Directories
**Mitigation**: Copy migration immediately to both locations. Run `bun run test:validate-migrations` before committing. Pre-commit hooks enforce sync validation. CI validates on every push.

### Risk: Test Flakiness with Time-Dependent Tests
**Mitigation**: Use fixed seed data with predictable timestamps. Tests use `date_trunc` logic to calculate expected windows. Avoid testing near actual hour/day boundaries. Real Supabase Local provides consistent time handling.

## Validation Strategy

### Automated Tests (Real Supabase Integration)
All tests use real Supabase Local instance per antimocking policy:

1. **Unit Tests** (`app/tests/auth/rate-limit.test.ts`):
   - Daily counter increment accuracy
   - Daily window reset at UTC midnight
   - Concurrent request handling for daily table
   - Error handling for database failures
   - Dual-limit precedence logic

2. **Integration Tests** (`app/tests/integration/rate-limiting.test.ts`):
   - Increased hourly limits for all tiers
   - Daily limit enforcement across multiple hours
   - Hourly reset doesn't affect daily counter
   - Daily reset allows requests after exhaustion
   - Headers reflect most restrictive limit

3. **End-to-End Tests**:
   - Full request lifecycle through authentication and both rate checks
   - 429 response when daily limit exceeded (after hourly resets)
   - Response headers show correct remaining count (min of hourly/daily)

### Manual Testing Scenarios

**Scenario 1: Verify Increased Hourly Limits**
```bash
# Start Supabase Local
cd app && ./scripts/dev-start.sh

# Generate free tier API key
# Make 101 requests in same hour
for i in {1..101}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer <free_key>" \
    http://localhost:3000/search?term=test
done

# Expected: First 1000 return 200, 1001st returns 429 (was 101st before)
```

**Scenario 2: Daily Limit Blocks After Multiple Hour Windows**
```bash
# Make 1000 requests in hour 1 (free tier hourly limit)
# Wait for hour 2 (or reset test database with new window)
# Make 1000 more requests in hour 2
# Repeat for hours 3, 4, 5 (5000 total = free daily limit)
# Make 5001st request

# Expected: 5001st request returns 429 with daily limit exceeded
```

**Scenario 3: Headers Show Most Restrictive Limit**
```bash
# Make 500 requests in same hour (free tier)
curl -v -H "Authorization: Bearer <free_key>" \
  http://localhost:3000/search?term=test 2>&1 | grep "X-RateLimit"

# Expected:
# X-RateLimit-Limit: 1000 (hourly limit)
# X-RateLimit-Remaining: 500 (min of hourly=500, daily=4500)
# X-RateLimit-Reset: <next hour timestamp>
```

**Scenario 4: Daily Reset at UTC Midnight**
```bash
# Consume 5000 requests (free tier daily limit)
# Verify 5001st is blocked with 429
# Advance test database time to next UTC day
# Make request

# Expected: Request succeeds (daily counter reset), headers show 999/4999 remaining
```

### Release Guardrails
- **Monitoring**: Log 429 responses with reason (hourly vs daily) for pattern analysis
- **Alerting**: Alert if 429 rate exceeds 10% of requests (indicates limit misconfiguration)
- **Rollback Plan**: Can revert constants in `shared/types/rate-limit.ts` to old values without database rollback
- **Real-Service Evidence**: All validation tests use real Supabase Local, confirming database functions work as expected

## Validation Commands

```bash
# Level 2 Validation (required for feature work)
cd app && bun run lint
cd app && bun run typecheck
cd app && bun test --filter integration
cd app && bun test
cd app && bun run build

# Domain-specific checks
cd app && bun run test:validate-migrations  # Ensure migration sync
cd app && bun run test:status              # Verify Supabase Local running

# Optional: Manual testing
cd app && ./scripts/dev-start.sh           # Start dev environment
# Run manual test scenarios above
```

## Issue Relationships

**Builds on:**
- #26 (feat: implement tier-based rate limiting middleware) - Extends with daily tracking
- #25 (feat: API key generation) - Foundation for key-based rate limiting

**Related:**
- #405 (feat: enterprise-grade security enhancements) - Aligns with tier differentiation (Enterprise: 100k/hr mentioned)
- #223 (feat: Stripe subscription payment infrastructure) - Paid tier upgrades for higher limits
- #217 (feat: expose ADW atomic agents as MCP tools) - MCP usage patterns justify higher limits

**Enables:**
- Developer adoption (free tier evaluation)
- MCP Claude Code integration testing (requires >100 req/hr)
- Realistic development workflow usage

**Follow-Up Opportunities:**
- Per-endpoint rate limits (index vs search)
- User-level rate limiting (aggregate across all keys)
- Rate limit analytics dashboard

## Acceptance Criteria

- [ ] Hourly rate limits increased: free=1000, solo=5000, team=25000
- [ ] Daily rate limits added: free=5000, solo=25000, team=100000
- [ ] Database migration creates `rate_limit_counters_daily` table with indexes and RLS
- [ ] `increment_rate_limit_daily()` function implemented and granted to authenticated/service_role
- [ ] Middleware enforces BOTH hourly and daily limits
- [ ] API responses include correct `X-RateLimit-*` headers reflecting most restrictive limit
- [ ] 429 responses indicate which limit was exceeded (hourly vs daily) in logs
- [ ] Unit tests cover daily limit enforcement and midnight reset
- [ ] Integration tests verify new limits for all tiers and dual-limit scenarios
- [ ] Documentation updated in workflow.md with new rate limit tiers
- [ ] Frontend pricing page updated to show both hourly and daily limits
- [ ] Migrations synced between `app/src/db/migrations/` and `app/supabase/migrations/`
- [ ] Migration sync validation passes (`bun run test:validate-migrations`)
- [ ] Pre-commit hooks pass (no console.log, type safety)
- [ ] All existing rate limit tests still pass (no regression)
- [ ] Level 2 validation suite passes (lint, typecheck, integration tests, full tests, build)

## References

**Current Implementation:**
- `shared/types/rate-limit.ts:64-68` - Current RATE_LIMITS constants (100/1000/10000)
- `app/src/auth/rate-limit.ts` - Rate limit enforcement logic (hourly only)
- `app/src/auth/middleware.ts:96-120` - Authentication middleware integration
- `app/src/db/schema.sql:62-74` - `rate_limit_counters` table (hourly)
- `app/src/db/functions/increment_rate_limit.sql` - Hourly increment function pattern

**Testing:**
- `app/tests/auth/rate-limit.test.ts` - Existing hourly limit unit tests
- `.claude/commands/docs/anti-mock.md` - Antimocking philosophy (real Supabase required)
- `.claude/commands/testing/testing-guide.md` - Test environment setup

**Documentation:**
- `.claude/commands/docs/workflow.md:67-71` - Rate limit tiers (needs update)
- `docs/specs/feature-26-tier-based-rate-limiting.md` - Original rate limiting implementation

**Related Issues:**
- #405 - Enterprise tier (100k/hr unlimited daily)
- #26 - Original rate limiting implementation (hourly only)
- #223 - Stripe integration (paid tier upgrades)

**Industry Benchmarks:**
- GitHub API: 5,000 requests/hour (authenticated)
- Algolia: 10,000 requests/month free tier
- Stripe API: 100 requests/second (no daily cap)

## Notes

- **Cost Analysis**: Current Supabase free tier usage <1%. 10x increase in free tier sustainable.
- **Abuse Protection**: Daily limits provide safeguard while hourly limits enable burst (MCP workflows).
- **Migration Strategy**: Non-breaking (existing keys automatically get new higher limits).
- **Monitoring**: Watch `rate_limit_counters_daily` table growth, implement cleanup job if needed.
- **Future Work**: Consider per-endpoint limits (index=100/day, search=5000/day) after monitoring usage patterns.
- **Developer Experience**: Free tier should allow full product evaluation (multiple indexing + search sessions).
