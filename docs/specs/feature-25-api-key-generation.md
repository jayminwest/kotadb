# Feature Plan: API Key Generation

**Issue**: #25
**Title**: feat: implement API key generation to complement validation system
**Labels**: component:backend, component:api, priority:high, effort:small
**Branch**: `feat/25-api-key-generation`

## Overview

### Problem
The `develop` branch has a complete API key **validation** system (`app/src/auth/validator.ts`, `middleware.ts`, `cache.ts`) but lacks the **generation** side. Users cannot programmatically create API keys, making the authentication system incomplete. A reference implementation existed on `backup-main-auth-20250108` branch but used an incompatible key format and architecture.

### Desired Outcome
- Users can generate API keys programmatically via `generateApiKey()` function
- Generated keys use the correct format: `kota_<tier>_<keyId>_<secret>` (underscore separator, matching existing validator)
- Secrets are cryptographically secure and stored as bcrypt hashes (never plaintext)
- Keys support three tiers: `free`, `solo`, `team` with tier-appropriate rate limits
- Collision handling ensures uniqueness with retry logic
- Full integration test coverage using real Supabase Local (no mocks, per `/anti-mock`)

### Non-Goals
- API endpoint for key generation (future work; this PR focuses on the core function)
- Key rotation/revocation endpoints (separate feature)
- Multi-key management UI (out of scope)
- Migration of old key format from backup branch (not needed; backup branch is deprecated)

## Technical Approach

### Architecture Notes
This feature creates a new auth module (`app/src/auth/keys.ts`) that integrates with the existing auth system:
- Uses `getServiceClient()` from `app/src/db/client.ts` for database writes
- Aligns with `Tier` type from `app/src/auth/context.ts`
- Generates keys that validate correctly with `validateApiKey()` from `app/src/auth/validator.ts`
- Follows bcrypt hashing pattern (10 rounds) consistent with validator expectations

### Key Format Specification
```
kota_<tier>_<keyId>_<secret>
     ↓       ↓        ↓
   free    12-char  36-char
   solo    base32   hex
   team
```

**Components**:
- **Prefix**: `kota` (constant)
- **Tier**: `free`, `solo`, or `team`
- **Key ID**: 12 alphanumeric characters (base32, public portion)
- **Secret**: 36 hexadecimal characters (hashed before storage)

**Example**: `kota_free_ab1cd2ef3gh4_0123456789abcdef0123456789abcdef012345`

### Key Modules to Touch
- **New**: `app/src/auth/keys.ts` - Core generation logic
- **Reference**: `app/src/auth/validator.ts` - Ensure format compatibility
- **Reference**: `app/src/auth/context.ts` - Use existing `Tier` type
- **Reference**: `app/src/db/client.ts` - Database client patterns
- **New**: `app/tests/auth/keys.test.ts` - Comprehensive test suite

### Data/API Impacts

**Database Operations**:
- INSERT into `api_keys` table with fields:
  - `id` (UUID, auto-generated)
  - `user_id` (FK to auth.users)
  - `key_id` (public portion, unique index)
  - `secret_hash` (bcrypt hashed secret)
  - `tier` (enum: free/solo/team)
  - `rate_limit_per_hour` (tier-based default)
  - `enabled` (default true)
  - `org_id` (optional, for team tier - future enhancement)

**Rate Limit Defaults**:
```typescript
const TIER_RATE_LIMITS = {
  free: 100,    // requests/hour
  solo: 1000,   // requests/hour
  team: 10000,  // requests/hour
} as const;
```

**Type Exports**:
```typescript
export type ApiKeyTier = Tier; // Reuse from context.ts
export interface GenerateApiKeyInput {
  userId: string;
  tier: ApiKeyTier;
  orgId?: string; // Optional, for team tier
}
export interface GenerateApiKeyOutput {
  apiKey: string;        // Full key (only time user sees secret)
  keyId: string;         // Public portion
  tier: ApiKeyTier;
  rateLimitPerHour: number;
  createdAt: Date;
}
```

## Relevant Files

### Existing Files
- `app/src/auth/validator.ts` — Key parsing/validation logic; must accept generated keys
- `app/src/auth/context.ts` — `Tier` type definition; reuse for type safety
- `app/src/auth/cache.ts` — Validation caching; will cache generated keys after first use
- `app/src/auth/middleware.ts` — Authentication middleware; will authenticate generated keys
- `app/src/db/client.ts` — Supabase client patterns; use `getServiceClient()` for writes
- `app/src/db/migrations/001_initial_schema.sql` — `api_keys` table schema (lines 10-44)
- `app/tests/auth/validator.test.ts` — Validation tests; should pass with generated keys
- `app/tests/helpers/db.ts` — Test utilities; reference for test key format

### New Files
- `app/src/auth/keys.ts` — Core generation functions:
  - `generateKeyId()`: Cryptographic 12-char base32 ID
  - `generateSecret()`: Cryptographic 36-char hex secret
  - `generateApiKey()`: Main function; orchestrates generation + storage
- `app/tests/auth/keys.test.ts` — Integration test suite:
  - Key format validation
  - Cryptographic uniqueness
  - Bcrypt hashing verification
  - Database insertion success
  - Collision retry logic
  - Integration with validator

## Task Breakdown

### Phase 1: Core Generation Logic
**Objective**: Implement cryptographically secure key component generation

Tasks:
- Create `app/src/auth/keys.ts` with module exports
- Implement `generateKeyId()`: 12-character base32 string using `crypto.randomBytes()`
- Implement `generateSecret()`: 36-character hex string using `crypto.randomBytes()`
- Add tier constants `TIER_RATE_LIMITS` mapping tiers to rate limits
- Export TypeScript types: `ApiKeyTier`, `GenerateApiKeyInput`, `GenerateApiKeyOutput`

**Validation**: Type-check passes, no runtime execution yet

### Phase 2: Main Generation Function
**Objective**: Implement `generateApiKey()` with database persistence

Tasks:
- Implement `generateApiKey(input: GenerateApiKeyInput)` function
- Hash secret with `bcrypt.hash()` (10 rounds) before storage
- Construct full key string: `kota_${tier}_${keyId}_${secret}`
- Insert record into `api_keys` table via `getServiceClient()`
- Return `GenerateApiKeyOutput` with full key and metadata
- Add JSDoc comments documenting usage, parameters, return values

**Validation**: Type-check passes, linter passes

### Phase 3: Collision Handling
**Objective**: Handle key_id uniqueness constraint violations gracefully

Tasks:
- Wrap database insert in try-catch
- Detect unique constraint violation errors from Supabase
- Implement retry logic: regenerate key_id and retry up to 3 times
- Throw error if retries exhausted (extremely unlikely with 12-char base32)
- Add logging for collision events (useful for monitoring)

**Validation**: Logic review, type-check passes

### Phase 4: Integration Tests
**Objective**: Comprehensive test coverage using real Supabase Local

Tasks:
- Create `app/tests/auth/keys.test.ts` with Supabase Local setup
- Test: Key format validation (`kota_<tier>_<keyId>_<secret>`)
- Test: Uniqueness (generate 10 keys, verify all unique)
- Test: Bcrypt hashing (verify secret_hash in DB uses bcrypt, not plaintext)
- Test: Database insertion (verify all fields stored correctly)
- Test: Tier rate limits (free=100, solo=1000, team=10000)
- Test: Integration with validator (generate key, validate it successfully)
- Test: Collision retry (mock collision, verify retry logic)
- Test: Error cases (invalid tier, missing user_id)

**Validation**: `cd app && bun test app/tests/auth/keys.test.ts` passes

### Phase 5: Cross-Module Integration
**Objective**: Verify generated keys work with existing auth system

Tasks:
- Run existing validator tests with generated keys
- Verify cache works with generated keys
- Verify middleware authenticates generated keys
- Update test helpers if needed (e.g., dynamic key generation utilities)

**Validation**: `cd app && bun test app/tests/auth/` passes (all auth tests)

### Phase 6: Final Validation & Documentation
**Objective**: Ensure production-readiness and maintainability

Tasks:
- Run full validation suite (Level 2):
  - `cd app && bun run lint`
  - `cd app && bun run typecheck`
  - `cd app && bun test --filter integration`
  - `cd app && bun test`
  - `cd app && bun run build`
- Add comprehensive JSDoc to all exported functions
- Update `.claude/commands/conditional_docs.md` if needed (likely not required)
- Verify migration sync: `cd app && bun run test:validate-migrations`

**Validation**: All Level 2 commands pass

### Phase 7: Git Workflow & PR Creation
**Objective**: Push branch and create pull request

Tasks:
- Stage changes: `git add app/src/auth/keys.ts app/tests/auth/keys.test.ts`
- Commit with conventional commits format
- Push branch: `git push -u origin feat/25-api-key-generation`
- Run `/pull_request feat/25-api-key-generation <issue_json> <plan_path> <adw_id>`
- Verify PR title ends with issue number: `feat: implement API key generation (#25)`

**Validation**: PR created successfully, CI passes

## Step by Step Tasks

### Setup & Scaffolding
1. Create branch: `git checkout -b feat/25-api-key-generation` from `develop`
2. Create file: `app/src/auth/keys.ts` with module structure
3. Create file: `app/tests/auth/keys.test.ts` with test structure
4. Import required dependencies (`bcryptjs`, `crypto`, `@db/client`, `@auth/context`)

### Core Implementation
5. Implement `generateKeyId()`: Use `crypto.randomBytes(9).toString('base64url').slice(0, 12)`
6. Implement `generateSecret()`: Use `crypto.randomBytes(18).toString('hex')` (36 hex chars)
7. Define `TIER_RATE_LIMITS` constant object
8. Export TypeScript interfaces: `GenerateApiKeyInput`, `GenerateApiKeyOutput`
9. Implement `generateApiKey()` main function:
   - Generate key_id and secret
   - Hash secret with bcrypt (10 rounds)
   - Construct full key string
   - Insert into database with error handling
   - Return output with full key (only time user sees secret)

### Collision Handling
10. Add retry loop (max 3 attempts) around database insert
11. Detect Supabase unique constraint error codes
12. Regenerate key_id on collision and retry
13. Throw descriptive error if retries exhausted

### Testing (Anti-Mock Compliance)
14. Set up test environment with Supabase Local credentials
15. Write test: `generates valid key format`
16. Write test: `generates unique keys`
17. Write test: `stores bcrypt hash not plaintext`
18. Write test: `inserts all fields correctly`
19. Write test: `applies correct rate limits per tier`
20. Write test: `integrates with validateApiKey()`
21. Write test: `handles collision with retry`
22. Write test: `validates input parameters`

### Integration & Validation
23. Run `cd app && bun test app/tests/auth/keys.test.ts` - verify all tests pass
24. Run `cd app && bun test app/tests/auth/validator.test.ts` - verify compatibility
25. Run `cd app && bun test app/tests/auth/middleware.test.ts` - verify middleware integration
26. Run `cd app && bun run lint` - fix any linting issues
27. Run `cd app && bun run typecheck` - fix any type errors
28. Run `cd app && bun test` - verify full test suite passes
29. Run `cd app && bun run build` - verify production build works
30. Run `cd app && bun run test:validate-migrations` - verify migration sync

### Documentation & Finalization
31. Add comprehensive JSDoc to all exported functions
32. Review code for security best practices (no plaintext secrets, timing attack mitigation)
33. Verify anti-mock compliance: all tests use real Supabase Local

### Git & PR Workflow
34. Stage changes: `git add app/src/auth/keys.ts app/tests/auth/keys.test.ts`
35. Commit: `git commit -m "feat: implement API key generation with bcrypt hashing and collision handling"`
36. Push branch: `git push -u origin feat/25-api-key-generation`
37. Run `/pull_request feat/25-api-key-generation <issue_json> <plan_path> <adw_id>` to create PR
38. Verify PR created with title: `feat: implement API key generation (#25)`
39. Verify CI pipeline passes
40. Request review from team

## Risks & Mitigations

### Risk: Key Format Mismatch
**Impact**: Generated keys fail validation
**Mitigation**: Integration test validates generated keys with `validateApiKey()`. Key format strictly follows validator's `parseApiKey()` expectations.

### Risk: Weak Cryptographic Randomness
**Impact**: Predictable keys, security vulnerability
**Mitigation**: Use Node.js `crypto.randomBytes()` (CSPRNG) for both key_id and secret. Avoid `Math.random()` or user-provided entropy.

### Risk: Bcrypt Hash Incompatibility
**Impact**: Validator cannot verify generated keys
**Mitigation**: Use same bcrypt library (`bcryptjs@^2.4.3`) and rounds (10) as validator. Test hash verification explicitly.

### Risk: Unique Constraint Collisions
**Impact**: Key generation fails occasionally
**Mitigation**: Retry logic (3 attempts) handles collisions gracefully. With 12-char base32 (~68 bits entropy), collisions are astronomically rare.

### Risk: Plaintext Secret Leakage
**Impact**: Catastrophic security breach if secrets stored unhashed
**Mitigation**: Integration test verifies `secret_hash` column contains bcrypt hash (starts with `$2a$10$`). Code review ensures `bcrypt.hash()` called before INSERT.

### Risk: Rate Limit Configuration Drift
**Impact**: Tiers get inconsistent rate limits
**Mitigation**: `TIER_RATE_LIMITS` constant is single source of truth. Tests verify correct limits applied per tier.

### Risk: Missing Backup Branch Reference
**Impact**: Cannot extract reference implementation
**Mitigation**: Backup branch confirmed missing. Plan uses validator.ts as reference instead. Key format and bcrypt approach already documented in issue.

## Validation Strategy

### Automated Tests (Integration/E2E hitting Supabase per `/anti-mock`)

**Pre-Test Setup**:
```bash
# Start Supabase Local if not running
cd app && bun run test:setup

# Verify Supabase Local connectivity
cd app && bun run test:status
```

**Test Execution**:
```bash
# Unit + integration tests for key generation
cd app && bun test app/tests/auth/keys.test.ts

# Verify compatibility with existing auth tests
cd app && bun test app/tests/auth/validator.test.ts
cd app && bun test app/tests/auth/middleware.test.ts

# Full auth suite integration
cd app && bun test app/tests/auth/

# Complete test suite
cd app && bun test
```

**Test Evidence Requirements**:
- All tests use real Supabase Local (port 54326)
- No mocks, stubs, or fakes (per `/anti-mock`)
- Database queries logged/verifiable via Supabase logs
- Bcrypt verification tests confirm hashing in database
- Integration tests prove generated keys authenticate successfully

### Manual Checks (Document Data Seeded and Failure Scenarios Exercised)

**Manual Verification Steps**:
1. Generate key for each tier (free, solo, team):
   ```typescript
   import { generateApiKey } from '@auth/keys';

   const freeKey = await generateApiKey({
     userId: TEST_USER_IDS.free,
     tier: 'free'
   });
   console.log('Free key:', freeKey.apiKey);
   // Verify format: kota_free_<12chars>_<36chars>
   ```

2. Validate generated key works:
   ```typescript
   import { validateApiKey } from '@auth/validator';

   const result = await validateApiKey(freeKey.apiKey);
   console.log('Validation:', result); // Should succeed
   ```

3. Verify database storage:
   ```sql
   -- Connect to Supabase Local
   SELECT key_id, tier, rate_limit_per_hour,
          LEFT(secret_hash, 10) as hash_prefix
   FROM api_keys
   WHERE key_id = '<generated_key_id>';

   -- Verify secret_hash starts with $2a$10$ (bcrypt)
   ```

4. Test failure scenarios:
   - Invalid tier: Should throw error
   - Missing user_id: Should throw error
   - Disabled key: Should store but fail validation

**Failure Injection**:
- Test collision retry by temporarily modifying key_id to force duplicate
- Test database errors by stopping Supabase Local mid-operation
- Test invalid bcrypt rounds (should fail validator integration test)

### Release Guardrails (Monitoring, Alerting, Rollback) with Real-Service Evidence

**Pre-Release Checklist**:
- ✅ All Level 2 validation passes
- ✅ Code review completed (security focus)
- ✅ Anti-mock compliance verified (no test mocks)
- ✅ Migration sync validated (`cd app && bun run test:validate-migrations`)

**Post-Merge Monitoring** (Future Work):
- API key generation success/failure rates (CloudWatch/Datadog)
- Bcrypt hashing duration metrics (should be ~100-200ms)
- Collision retry frequency (should be near-zero)
- Key validation success rates (should remain high)

**Rollback Strategy**:
- Feature is additive (no breaking changes)
- Rollback: Revert PR merge commit
- Database: No migration changes (uses existing `api_keys` table)
- Mitigation: Keys generated before rollback remain valid (validator unchanged)

## Validation Commands

**Level 2 – Integration Gate** (Feature work default):
```bash
cd app && bun run lint
cd app && bun run typecheck
cd app && bun test --filter integration
cd app && bun test
cd app && bun run build
```

**Detailed Execution**:
```bash
# 1. Lint check
cd app && bun run lint
# Expected: 0 errors, 0 warnings

# 2. Type check
cd app && bun run typecheck
# Expected: 0 type errors

# 3. Integration tests (real Supabase)
cd app && bun test --filter integration
# Expected: All integration tests pass, Supabase Local on port 54326

# 4. Full test suite
cd app && bun test
# Expected: All tests pass, including:
#   - app/tests/auth/keys.test.ts (new)
#   - app/tests/auth/validator.test.ts (compatibility)
#   - app/tests/auth/middleware.test.ts (integration)

# 5. Production build
cd app && bun run build
# Expected: Build succeeds, no import errors

# 6. Migration sync validation
cd app && bun run test:validate-migrations
# Expected: No drift between app/src/db/migrations and supabase/migrations
```

**Domain-Specific Checks**:
```bash
# Verify Supabase Local is running
cd app && bun run test:status

# Generate sample keys and validate (manual smoke test)
bun run app/src/auth/keys.ts # If module has CLI entrypoint (optional)
```

**Evidence Capture**:
- Screenshot of test output showing all passes
- Supabase Local logs showing database inserts
- Example generated key (redact secret portion in PR)
- Bcrypt hash verification output

## Success Criteria

**Functional Requirements**:
- ✅ API keys can be generated programmatically via `generateApiKey()`
- ✅ Generated keys validate successfully with existing `validateApiKey()`
- ✅ Secrets never stored in plaintext (bcrypt hashed in `secret_hash` column)
- ✅ Key format matches validator: `kota_<tier>_<keyId>_<secret>`
- ✅ All tests pass (unit + integration, no mocks)
- ✅ Type-safe integration with auth middleware and cache

**Non-Functional Requirements**:
- ✅ Cryptographically secure key generation (CSPRNG)
- ✅ Collision handling with retry logic (max 3 attempts)
- ✅ Performance: Key generation < 500ms (bcrypt dominates at ~100-200ms)
- ✅ Security: Timing attack mitigation in validator still works
- ✅ Maintainability: Comprehensive JSDoc and integration tests

**Documentation Requirements**:
- ✅ JSDoc comments on all exported functions
- ✅ Test coverage demonstrates usage patterns
- ✅ Plan document captures architecture decisions (this file)

**Integration Requirements**:
- ✅ Works with `validateApiKey()` from validator.ts
- ✅ Works with `authMiddleware()` from middleware.ts
- ✅ Works with validation cache from cache.ts
- ✅ Uses existing `Tier` type from context.ts
- ✅ Uses existing `getServiceClient()` from client.ts

---

**Plan Created**: 2025-10-09
**Plan Author**: Claude Code
**Estimated Effort**: 4-6 hours
**Validation Level**: Level 2 (Integration Gate)
