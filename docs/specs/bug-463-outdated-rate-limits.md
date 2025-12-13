# Bug Plan: Frontend Displays Outdated Rate Limits for Existing API Keys

## Bug Summary
- **Observed behaviour**: Dashboard displays old rate limit values (100, 1000, 10000) for existing API keys even after #423 updated the backend constants to new values (1000, 5000, 25000)
- **Expected behaviour**: Dashboard should display the updated rate limits (1000, 5000, 25000) matching the backend constants defined in `app/src/config/constants.ts`
- **Suspected scope**: Database migration needed to update existing `api_keys.rate_limit_per_hour` column values; no code changes required since new keys already use correct values

## Root Cause Hypothesis
- **Leading theory**: When #423 was implemented, the code constants (`RATE_LIMITS` in `app/src/config/constants.ts` and consumed via `app/src/auth/keys.ts:153`) were updated, but existing database records in the `api_keys` table were not migrated. The `rate_limit_per_hour` column still contains old values (100, 1000, 10000) for keys created before the change.
- **Supporting evidence**: 
  - Dashboard fetches `rate_limit_per_hour` directly from the database via `app/src/api/routes.ts:891` (`SELECT rate_limit_per_hour FROM api_keys`)
  - New API key generation in `app/src/auth/keys.ts:153` correctly uses `RATE_LIMITS[tier].HOURLY` from the centralized config
  - Migration #423 (`20251110202336_add_daily_rate_limits.sql`) added daily rate limit tracking but did not update existing hourly rate limit values

## Fix Strategy
- **Code changes**: None required - the code already uses the correct constants for new keys
- **Data/config updates**: Create a migration to update existing `api_keys.rate_limit_per_hour` values:
  - FREE tier: 100 → 1000
  - SOLO tier: 1000 → 5000  
  - TEAM tier: 10000 → 25000
- **Guardrails**: 
  - Migration is idempotent (WHERE clauses ensure only old values are updated)
  - No breaking changes to table structure
  - Auto-deploys to staging/production via Supabase GitHub App integration
  - Uses conditional updates to avoid touching keys that already have correct values

## Relevant Files
- `app/src/db/migrations/20241001000001_initial_schema.sql:10-21` — Initial api_keys table definition with default rate_limit_per_hour=100
- `app/src/config/constants.ts:16-29` — Current rate limit constants (updated in #423)
- `app/src/auth/keys.ts:153` — Key generation using RATE_LIMITS from centralized config
- `app/src/api/routes.ts:891` — Endpoint returning rate_limit_per_hour from database
- `web/app/dashboard/page.tsx:493` — Dashboard displaying rate limit
- `app/tests/integration/api/keys-management.test.ts:22` — Test imports RATE_LIMITS for validation

### New Files
- `app/src/db/migrations/YYYYMMDDHHMMSS_update_existing_rate_limits.sql` — Migration to update existing api_keys records
- `app/supabase/migrations/YYYYMMDDHHMMSS_update_existing_rate_limits.sql` — Synchronized copy for Supabase CLI

## Task Breakdown

### Verification
1. Confirm database state before migration:
   - Run local Supabase: `cd app && ./scripts/dev-start.sh`
   - Query existing keys: `SELECT tier, rate_limit_per_hour, COUNT(*) FROM api_keys GROUP BY tier, rate_limit_per_hour;`
   - Document current values to verify migration impact
2. Reproduce the bug:
   - Create test API keys with old rate limits manually via SQL
   - Verify dashboard displays old values (100, 1000, 10000)
   - Check `/api/keys/current` endpoint returns old values

### Implementation
1. Generate migration timestamp:
   - Run: `date -u +"%Y%m%d%H%M%S"` to get timestamp for migration filename
2. Create migration file: `app/src/db/migrations/YYYYMMDDHHMMSS_update_existing_rate_limits.sql`
   - Add header comment referencing issue #463 and #423
   - Write UPDATE statements for each tier with WHERE clauses for old values:
     ```sql
     -- Update existing API keys to match new rate limits from #423
     -- Resolves #463: frontend displaying outdated rate limits
     
     UPDATE api_keys
     SET rate_limit_per_hour = 1000
     WHERE tier = 'free' AND rate_limit_per_hour = 100;
     
     UPDATE api_keys
     SET rate_limit_per_hour = 5000
     WHERE tier = 'solo' AND rate_limit_per_hour = 1000;
     
     UPDATE api_keys
     SET rate_limit_per_hour = 25000
     WHERE tier = 'team' AND rate_limit_per_hour = 10000;
     ```
3. Synchronize migration to Supabase directory:
   - Copy file: `cp app/src/db/migrations/YYYYMMDDHHMMSS_update_existing_rate_limits.sql app/supabase/migrations/YYYYMMDDHHMMSS_update_existing_rate_limits.sql`
   - Verify both files are identical: `diff app/src/db/migrations/YYYYMMDDHHMMSS_update_existing_rate_limits.sql app/supabase/migrations/YYYYMMDDHHMMSS_update_existing_rate_limits.sql`
4. Apply migration locally:
   - Run: `cd app && bun run supabase:migration:up`
   - Verify no errors in migration output

### Validation
1. **Database validation**:
   - Query updated keys: `SELECT tier, rate_limit_per_hour, COUNT(*) FROM api_keys GROUP BY tier, rate_limit_per_hour;`
   - Confirm all keys now show new values (1000, 5000, 25000)
   - Verify no keys with old values remain
2. **Dashboard validation**:
   - View dashboard at http://localhost:3000/dashboard
   - Confirm rate limits display correctly for each tier
   - Test with multiple test users across all tiers
3. **API endpoint validation**:
   - Test `/api/keys/current` endpoint returns correct rate_limit_per_hour
   - Verify response matches RATE_LIMITS constants
4. **Test coverage** (add to existing test suite):
   - Add test in `app/tests/integration/api/keys-management.test.ts`:
     - Create API key via endpoint
     - Verify `rate_limit_per_hour` matches `RATE_LIMITS[tier].HOURLY` from config
     - Test all three tiers (free, solo, team)
   - Ensure test uses real Supabase Local (antimocking principle)
5. **Migration sync validation**:
   - Run: `cd app && bun run test:validate-migrations`
   - Confirm both migration directories are synchronized
   - Verify no drift between `app/src/db/migrations/` and `app/supabase/migrations/`
6. **Idempotency validation**:
   - Run migration a second time
   - Verify it completes successfully with 0 rows affected
   - Confirm data remains unchanged

## Step by Step Tasks

### Pre-Implementation Checks
- Verify issue #463 has all required labels (component, priority, effort, status)
- Review #423 spec file: `docs/specs/feature-423-increase-rate-limits-daily-quotas.md`
- Confirm understanding of rate limit constants in `app/src/config/constants.ts`

### Migration Creation
- Generate timestamp for migration filename using `date -u +"%Y%m%d%H%M%S"`
- Create `app/src/db/migrations/YYYYMMDDHHMMSS_update_existing_rate_limits.sql` with UPDATE statements
- Add descriptive header comment referencing #463 and #423
- Write three UPDATE statements (one per tier) with WHERE clauses for old values
- Copy migration to `app/supabase/migrations/` directory
- Verify files are identical using `diff`

### Local Testing
- Start Supabase Local: `cd app && ./scripts/dev-start.sh`
- Create test keys with old rate limits for verification
- Query current state: `SELECT tier, rate_limit_per_hour, COUNT(*) FROM api_keys GROUP BY tier, rate_limit_per_hour;`
- Apply migration: `cd app && bun run supabase:migration:up`
- Query post-migration state to confirm updates
- Verify dashboard displays correct values
- Test API endpoint `/api/keys/current` returns correct rate_limit_per_hour

### Test Implementation
- Add test case in `app/tests/integration/api/keys-management.test.ts`
- Test verifies rate_limit_per_hour matches RATE_LIMITS[tier].HOURLY
- Test all three tiers (free, solo, team)
- Run test suite: `cd app && bun test app/tests/integration/api/keys-management.test.ts`
- Verify test passes

### Final Validation
- Run full validation suite:
  - `cd app && bun run lint`
  - `cd app && bunx tsc --noEmit`
  - `cd app && bun test`
  - `cd app && bun run test:validate-migrations`
  - `cd app && bun run build`
- Verify all validation commands pass
- Test idempotency by re-running migration
- Confirm 0 rows affected on second run

### Commit and Push
- Stage migration files: `git add app/src/db/migrations/YYYYMMDDHHMMSS_update_existing_rate_limits.sql app/supabase/migrations/YYYYMMDDHHMMSS_update_existing_rate_limits.sql`
- Stage test file if modified: `git add app/tests/integration/api/keys-management.test.ts`
- Commit with conventional format: `git commit -m "fix(db): update existing api_keys to new rate limits (#463)"`
- Push branch: `git push -u origin bug-463-ca4e2d14`

## Regression Risks
- **Adjacent features to watch**:
  - Rate limiting enforcement in `app/src/auth/rate-limit.ts` - migration only updates display values, enforcement logic unchanged
  - Daily rate limits added in #423 - separate table, no impact from this migration
  - API key generation in `app/src/auth/keys.ts` - already using correct constants
  - Key reset functionality in `app/src/auth/keys.ts:362` - preserves tier, will get correct rate limit
- **Follow-up work if risk materialises**:
  - If rate limiting enforcement breaks: verify `rate_limit_per_hour` is still correctly read from database
  - If new keys have wrong values: check RATE_LIMITS import path in `app/src/auth/keys.ts`
  - If dashboard still shows old values: clear browser cache, verify API endpoint response
  - If production keys not updated: verify Supabase GitHub App successfully ran migration on merge to develop/main

## Validation Commands
```bash
# Linting
cd app && bun run lint

# Type checking
cd app && bunx tsc --noEmit

# Migration sync validation
cd app && bun run test:validate-migrations

# Test suite
cd app && bun test

# Build verification
cd app && bun run build

# Database query to verify migration
cd app && bun run supabase:db:query "SELECT tier, rate_limit_per_hour, COUNT(*) FROM api_keys GROUP BY tier, rate_limit_per_hour ORDER BY tier;"

# Specific test file
cd app && bun test app/tests/integration/api/keys-management.test.ts
```

## Commit Message Validation
All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `fix(scope): subject`
- Valid types: fix (for this bug)
- Valid scopes: db, api, migration
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(db): update existing api_keys to new rate limits (#463)` not `Looking at the changes, this commit updates the api_keys table to fix rate limits`
- Reference issue number in commit message or PR body
- Example: `fix(db): update existing api_keys to new rate limits (#463)`
