# Feature Plan: Authentication Middleware

## Overview

### Problem
KotaDB currently has no authentication or authorization layer. All API endpoints (`/index`, `/search`, `/files/recent`, `/mcp`) are publicly accessible without any user identification or access control. This prevents:
- Multi-tenant data isolation (users see all indexed repositories)
- API key-based authentication and rate limiting
- User and organization-scoped operations
- Enforcement of Row Level Security (RLS) policies in the Supabase database

The API routes (src/api/routes.ts:22-74) directly handle requests without any authentication check, making them vulnerable to abuse and incompatible with the Supabase schema's RLS policies that require authenticated user context.

### Desired Outcome
Implement authentication middleware that:
1. **Validates API keys**: Extract and validate `Authorization: Bearer <key>` headers against the `api_keys` table
2. **Establishes user context**: Create an `AuthContext` object containing `userId`, `tier`, `orgId`, `keyId`, and rate limit information
3. **Enables RLS enforcement**: Inject user context into database queries via session variables
4. **Provides security**: Return 401 for missing/invalid keys, 403 for disabled keys
5. **Supports caching**: Cache validated keys for 5 seconds to reduce database load
6. **Logs authentication events**: Track successful and failed authentication attempts for audit trails

### Non-Goals
- Implementing rate limiting enforcement (separate Issue #13)
- Building JWT-based authentication (future epic; API keys only for now)
- Creating API key generation endpoints (Issue #12 dependency)
- Web-based authentication UI (API-first; deferred)
- OAuth flow integration (Supabase Auth handles this separately)
- Multi-factor authentication (future enhancement)

---

## Technical Approach

### Architecture Notes

**Middleware Pattern: Request Interceptor**
The authentication middleware follows a standard request interceptor pattern, executing before route handlers:

```
Request → authenticateRequest() → Router → Response
             ↓ (if invalid)
          401/403 Response
```

**Key Flow**:
1. Extract `Authorization: Bearer <key>` header from request
2. Parse key format: `kota_<tier>_<key_id>_<secret>`
3. Check in-memory cache for recent validations (5-second TTL)
4. If cache miss, query Supabase `api_keys` table
5. Hash provided secret with bcrypt and compare against `secret_hash`
6. Verify key is enabled (`enabled = true`)
7. Update `last_used_at` timestamp asynchronously
8. Create `AuthContext` object with user metadata
9. Attach context to request (via custom property or separate map)
10. Pass request to router with context available

**Integration Points**:
- **src/api/routes.ts:22**: Modify `createRouter()` to apply middleware before all handlers except `/health`
- **src/api/queries.ts**: Update query functions to accept `userId` parameter for RLS context
- **src/db/client.ts**: Add function to set RLS session variable (`SET LOCAL app.user_id = '<uuid>'`)
- **src/types/index.ts**: Extend to include `AuthContext` and `AuthenticatedRequest` types

**Caching Strategy**:
Use in-memory Map with TTL to avoid repeated bcrypt comparisons (expensive):
- Key: `key_id` (public portion of API key)
- Value: `{ userId, tier, orgId, keyId, rateLimitPerHour, expiresAt }`
- Eviction: Check `expiresAt` before returning cached entry
- TTL: 5 seconds (balances performance vs. security; revoked keys detected quickly)

**Security Considerations**:
- Never log full API keys (only log `key_id` prefix)
- Use bcrypt `compare()` async to avoid blocking event loop
- Timing attack mitigation: Always hash even if key doesn't exist (constant-time response)
- Clear cache on server restart (no persistent cache)
- Separate cache per key tier for rate limit segregation

### Key Modules to Touch

**New Files to Create**:
- `src/auth/middleware.ts` — Core authentication middleware with `authenticateRequest()` function
- `src/auth/context.ts` — Type definitions: `AuthContext`, `AuthenticatedRequest`, `Tier`
- `src/auth/cache.ts` — In-memory cache with TTL for validated API keys
- `src/auth/validator.ts` — API key validation logic: format parsing, database lookup, bcrypt comparison
- `tests/auth/middleware.test.ts` — Test authentication flow: valid key, invalid key, disabled key, cache hits
- `tests/auth/validator.test.ts` — Test key parsing, validation logic, error cases

**Existing Files to Modify**:
- `src/api/routes.ts:20-24` — Add middleware to `createRouter()`: wrap handlers with authentication check
- `src/api/routes.ts:29-106` — Update route handlers to access `AuthContext` from request
- `src/api/queries.ts` — Add `userId` parameter to query functions; set RLS session variable before queries
- `src/types/index.ts` — Add authentication type exports
- `src/db/client.ts` — Add `withUserContext(supabase, userId)` helper for RLS enforcement
- `package.json` — Add `bcryptjs` dependency (pure JS bcrypt for Bun compatibility)

### Data/API Impacts

**Breaking Changes**:
- **All endpoints now require authentication**: Except `/health`, all endpoints must include `Authorization: Bearer <key>` header
- **Response format changes**:
  - New 401 response: `{"error": "Missing API key"}` or `{"error": "Invalid API key"}`
  - New 403 response: `{"error": "API key disabled"}`
- **Request context**: Handlers now receive authenticated user context (transparent to client)

**New API Contracts**:
- **Authentication header format**: `Authorization: Bearer kota_<tier>_<key_id>_<secret>`
  - Example: `Authorization: Bearer kota_free_abc123def456_7890...`
- **Error response format**:
  ```json
  {
    "error": "Invalid API key",
    "code": "AUTH_INVALID_KEY"
  }
  ```

**Database Requirements**:
- `api_keys` table must exist (created in Supabase migration)
- Columns: `id`, `user_id`, `key_id`, `secret_hash`, `tier`, `rate_limit_per_hour`, `enabled`, `last_used_at`
- Index on `key_id` for fast lookups
- RLS policies must allow service role to query `api_keys` (service role used for auth checks)

**Performance Impacts**:
- First request per key: ~50-100ms overhead (bcrypt comparison + database query)
- Cached requests: <1ms overhead (memory lookup)
- Database load: Reduced by 95% due to caching (every 5 seconds per key vs. every request)

---

## Relevant Files

### Existing Files

**API Layer**:
- `src/api/routes.ts:16-76` — Router implementation; needs middleware integration at request entry point
- `src/api/routes.ts:29-106` — Individual route handlers (`/index`, `/search`, `/mcp`); will receive `AuthContext`
- `src/api/queries.ts:1-78` — Database query functions; need RLS context injection

**Database Layer**:
- `src/db/schema.ts:12-24` — `openDatabase()` function; will be replaced with Supabase client
- `src/db/client.ts` — (Future) Supabase client initialization; needs RLS session helper
- `docs/schema.md:36-66` — `api_keys` table schema documentation

**Type Definitions**:
- `src/types/index.ts:1-21` — Current type exports; needs `AuthContext` and related types

**Configuration**:
- `package.json:17` — Dependencies; needs `bcryptjs` (or `@types/bcrypt` + `bcrypt`)

### New Files

**Authentication Core**:
- `src/auth/context.ts` — Authentication context types:
  ```typescript
  export type Tier = 'free' | 'solo' | 'team'
  export interface AuthContext {
    userId: string
    tier: Tier
    orgId?: string
    keyId: string
    rateLimitPerHour: number
  }
  export interface AuthenticatedRequest extends Request {
    auth: AuthContext
  }
  ```

- `src/auth/validator.ts` — API key validation logic:
  ```typescript
  export interface ValidateApiKeyResult {
    userId: string
    tier: Tier
    orgId?: string
    keyId: string
    rateLimitPerHour: number
  }
  export async function validateApiKey(key: string): Promise<ValidateApiKeyResult | null>
  export function parseApiKey(key: string): { tier: Tier; keyId: string; secret: string } | null
  ```

- `src/auth/cache.ts` — In-memory cache for validated keys:
  ```typescript
  export interface CacheEntry {
    userId: string
    tier: Tier
    orgId?: string
    keyId: string
    rateLimitPerHour: number
    expiresAt: number
  }
  export function getCachedValidation(keyId: string): CacheEntry | null
  export function setCachedValidation(keyId: string, entry: Omit<CacheEntry, 'expiresAt'>): void
  export function clearCache(): void
  ```

- `src/auth/middleware.ts` — Main authentication middleware:
  ```typescript
  export async function authenticateRequest(
    request: Request
  ): Promise<{ context?: AuthContext; response?: Response }>
  ```

**Tests**:
- `tests/auth/middleware.test.ts` — Test middleware behavior:
  - Valid API key returns context
  - Invalid API key returns 401
  - Disabled key returns 403
  - Missing header returns 401
  - Cache reduces database queries
  - Last used timestamp updated

- `tests/auth/validator.test.ts` — Test validation logic:
  - Key parsing extracts tier, keyId, secret
  - Invalid format returns null
  - Valid key in database returns user data
  - Invalid secret returns null
  - Timing attack resistance (constant time)

- `tests/auth/cache.test.ts` — Test cache behavior:
  - Cache hit returns stored entry
  - Cache miss returns null
  - Expired entries not returned
  - Cache clear removes all entries

---

## Task Breakdown

### Phase 1: Type Definitions and Core Structures
**Goal**: Define authentication types and establish core data structures.

- Create `src/auth/context.ts` with `Tier`, `AuthContext`, `AuthenticatedRequest` types
- Update `src/types/index.ts` to export authentication types
- Create `src/auth/cache.ts` with cache data structure and TTL logic
- Write tests for cache functionality (`tests/auth/cache.test.ts`)

### Phase 2: API Key Validation Logic
**Goal**: Implement API key parsing, database lookup, and bcrypt verification.

- Add `bcryptjs` dependency to `package.json`
- Create `src/auth/validator.ts` with `parseApiKey()` function (format validation)
- Implement `validateApiKey()` function (database query + bcrypt comparison)
- Add `withUserContext()` helper to `src/db/client.ts` (RLS session variable)
- Write validator tests (`tests/auth/validator.test.ts`)

### Phase 3: Middleware Implementation
**Goal**: Build authentication middleware with caching and error handling.

- Implement `src/auth/middleware.ts` with `authenticateRequest()` function
- Integrate cache: check before database lookup, update on successful validation
- Add logging: successful auth (info), failed auth (warn), with `keyId` only
- Update `last_used_at` asynchronously (don't block response)
- Write middleware tests (`tests/auth/middleware.test.ts`)

### Phase 4: Router Integration
**Goal**: Apply middleware to all protected routes, preserve `/health` as public.

- Modify `src/api/routes.ts:20-24` to apply middleware before router logic
- Exempt `/health` endpoint from authentication
- Pass `AuthContext` to route handlers (via request property or closure)
- Update route handlers to extract `userId` from context
- Test end-to-end: authenticated requests work, unauthenticated return 401

### Phase 5: Database Query Updates
**Goal**: Inject user context into database queries for RLS enforcement.

- Update `src/api/queries.ts` functions to accept `userId` parameter
- Set RLS session variable before queries: `SET LOCAL app.user_id = '<userId>'`
- Ensure queries respect RLS policies (users see only their data)
- Add integration tests: verify RLS filtering works with authenticated context

---

## Step by Step Tasks

### Foundational Setup

1. **Create authentication types file**: Write `src/auth/context.ts`
   - Define `Tier` enum: `'free' | 'solo' | 'team'`
   - Define `AuthContext` interface with required fields
   - Define `AuthenticatedRequest` interface extending `Request`
   - Export all types

2. **Update shared types**: Modify `src/types/index.ts`
   - Export `AuthContext`, `Tier`, `AuthenticatedRequest` from `@auth/context`
   - Add JSDoc comments explaining usage

3. **Add bcrypt dependency**: Update `package.json`
   - Add `"bcryptjs": "^2.4.3"` to dependencies
   - Add `"@types/bcryptjs": "^2.4.6"` to devDependencies
   - Run `bun install`

4. **Create cache module**: Write `src/auth/cache.ts`
   - Implement `Map<string, CacheEntry>` with TTL checking
   - Export `getCachedValidation()` function: check expiry before return
   - Export `setCachedValidation()` function: set 5-second TTL
   - Export `clearCache()` function: reset map
   - Add eviction logic: periodic cleanup every 60 seconds

5. **Write cache tests**: Create `tests/auth/cache.test.ts`
   - Test cache hit returns valid entry
   - Test cache miss returns null
   - Test expired entry returns null (TTL works)
   - Test cache clear removes all entries
   - Test concurrent access (multiple keys)

### API Key Validation

6. **Create validator module**: Write `src/auth/validator.ts`
   - Import `bcryptjs` for hash comparison
   - Import Supabase client from `@db/client`
   - Define `ValidateApiKeyResult` interface

7. **Implement key parsing**: In `src/auth/validator.ts`, add `parseApiKey()`
   - Validate format: `kota_<tier>_<keyId>_<secret>`
   - Extract tier (validate against known tiers)
   - Extract keyId (16+ hex characters)
   - Extract secret (32+ hex characters)
   - Return `null` if invalid format

8. **Implement key validation**: In `src/auth/validator.ts`, add `validateApiKey()`
   - Parse key with `parseApiKey()`, return `null` if invalid
   - Check cache with `getCachedValidation(keyId)`
   - If cache hit, return cached result
   - Query `api_keys` table by `key_id` (use service role client)
   - Return `null` if key not found (timing-safe: still hash secret)
   - Compare secret hash with `bcrypt.compare(secret, secret_hash)`
   - Return `null` if hash mismatch
   - Check `enabled` flag, return `null` if disabled
   - Build `ValidateApiKeyResult` object from database row
   - Cache result with `setCachedValidation()`
   - Return result

9. **Add RLS context helper**: Update `src/db/client.ts`
   - Add `setUserContext(supabase, userId)` function
   - Execute: `SET LOCAL app.user_id = '<userId>'` as raw SQL
   - Return same supabase client (for chaining)

10. **Write validator tests**: Create `tests/auth/validator.test.ts`
    - Test `parseApiKey()` with valid format
    - Test `parseApiKey()` with invalid formats (missing parts, wrong tier)
    - Test `validateApiKey()` with valid key (mock database)
    - Test `validateApiKey()` with invalid secret (hash mismatch)
    - Test `validateApiKey()` with disabled key
    - Test `validateApiKey()` with non-existent key
    - Test cache integration: second call uses cache
    - Test timing attack resistance: measure execution time consistency

### Middleware Implementation

11. **Create middleware module**: Write `src/auth/middleware.ts`
    - Import validator, cache, context types
    - Import logger (or use `console.log/warn`)

12. **Implement authentication function**: In `src/auth/middleware.ts`, add `authenticateRequest()`
    - Extract `Authorization` header from request
    - Check header exists and starts with `Bearer `
    - If missing, return `{ response: new Response(..., 401) }`
    - Extract token (slice off `Bearer ` prefix)
    - Call `validateApiKey(token)`
    - If validation fails, log warning with `keyId` (if parsed)
    - Return `{ response: new Response({ error: "Invalid API key" }, 401) }`
    - If key disabled (check via additional flag), return 403
    - Build `AuthContext` from validation result
    - Log successful auth (info level) with `userId` and `keyId`
    - Queue async update of `last_used_at` timestamp (via `queueMicrotask()`)
    - Return `{ context }`

13. **Add last_used_at updater**: In `src/auth/middleware.ts`, add `updateLastUsed()`
    - Async function: `UPDATE api_keys SET last_used_at = NOW() WHERE key_id = $1`
    - Use service role client
    - Catch and log errors (don't throw; non-critical)

14. **Write middleware tests**: Create `tests/auth/middleware.test.ts`
    - Test valid key returns `{ context }` with correct fields
    - Test invalid key returns 401 response
    - Test missing header returns 401 response
    - Test malformed header (no `Bearer`) returns 401
    - Test disabled key returns 403 response
    - Test `last_used_at` updated asynchronously (mock database)
    - Test cache reduces database calls (spy on `validateApiKey`)
    - Test logging: verify info/warn calls with correct data

### Router Integration

15. **Add middleware to router**: Modify `src/api/routes.ts:20-24`
    - Import `authenticateRequest` from `@auth/middleware`
    - In `createRouter()`, wrap handler logic:
      ```typescript
      handle: async (request: Request) => {
        const { pathname } = new URL(request.url);

        // Skip auth for health check
        if (pathname === "/health") {
          return json({ status: "ok", timestamp: new Date().toISOString() });
        }

        // Authenticate all other requests
        const { context, response } = await authenticateRequest(request);
        if (response) return response; // Auth failed

        // Continue with route handling, pass context
        return handleAuthenticatedRequest(request, context!, db);
      }
      ```

16. **Refactor route handlers**: In `src/api/routes.ts`, extract handler logic
    - Create `handleAuthenticatedRequest(request, context, db)` function
    - Move route matching logic into this function
    - Pass `context.userId` to query functions

17. **Update index handler**: Modify `src/api/routes.ts:78-107`
    - Accept `context: AuthContext` parameter
    - Pass `context.userId` to `recordIndexRun(db, indexRequest, userId)`

18. **Update search handler**: Modify `src/api/routes.ts:33-49`
    - Accept `context: AuthContext` parameter
    - Pass `context.userId` to `searchFiles(db, term, { ...options, userId })`

19. **Update files/recent handler**: Modify `src/api/routes.ts:52-55`
    - Accept `context: AuthContext` parameter
    - Pass `context.userId` to `listRecentFiles(db, limit, userId)`

20. **Update MCP handler**: Modify `src/api/routes.ts:57-71`
    - Accept `context: AuthContext` parameter
    - Pass `context` to `handleMcpRequest(db, request, context)`

### Database Query Updates

21. **Update queries module signature**: Modify `src/api/queries.ts`
    - Add `userId: string` parameter to all exported functions
    - Import `setUserContext` from `@db/client`

22. **Update searchFiles function**: In `src/api/queries.ts`
    - Add `userId` parameter
    - Set RLS context: `setUserContext(supabase, userId)` before query
    - Query `indexed_files` with RLS filtering active

23. **Update listRecentFiles function**: In `src/api/queries.ts`
    - Add `userId` parameter
    - Set RLS context before query

24. **Update recordIndexRun function**: In `src/api/queries.ts`
    - Add `userId` parameter
    - Set RLS context before insert

25. **Update saveIndexedFiles function**: In `src/api/queries.ts`
    - Add `userId` parameter
    - Set RLS context before insert

### Testing and Validation

26. **Write integration test**: Create `tests/api/authenticated-routes.test.ts`
    - Test `/index` with valid auth returns 202
    - Test `/search` with valid auth returns results
    - Test `/index` without auth returns 401
    - Test endpoints with disabled key return 403

27. **Update existing tests**: Modify `tests/smoke.test.ts`
    - Add `Authorization` header to all requests
    - Create test API key fixture
    - Update assertions for new response formats

28. **Manual smoke test**: Document in plan
    - Create test API key via Supabase Studio
    - Start server: `bun run src/index.ts`
    - Test authenticated request: `curl -H "Authorization: Bearer <key>" http://localhost:3000/search?term=test`
    - Test unauthenticated request: `curl http://localhost:3000/search?term=test` (expect 401)
    - Verify cache: send same request twice, check logs show cache hit

---

## Risks & Mitigations

### Risk: Bcrypt Performance Bottleneck
**Impact**: Bcrypt hashing on every request adds 50-100ms latency, degrading user experience.
**Mitigation**: Implement 5-second cache with in-memory Map. Cache hit reduces overhead to <1ms. Monitor cache hit rate; if low, increase TTL to 10-15 seconds. Benchmark with `bun test` performance tests. Consider faster hashing (Argon2) if bottleneck persists despite caching.

### Risk: Cache Invalidation Delay
**Impact**: Revoked or disabled keys remain valid for up to 5 seconds (cache TTL), allowing brief unauthorized access.
**Mitigation**: 5-second window is acceptable trade-off (immediate revocation rare). For critical scenarios, add cache invalidation API: `DELETE /auth/cache/:keyId` (admin-only). Document cache behavior in API docs. Monitor audit logs for post-revocation access attempts.

### Risk: Timing Attack on Key Validation
**Impact**: Attackers could infer valid vs. invalid keys by measuring response times (bcrypt comparison skipped for non-existent keys).
**Mitigation**: Always hash provided secret even if key doesn't exist in database (constant-time response). Use bcrypt `compare()` with dummy hash for non-existent keys. Add jitter (random 1-5ms delay) to response times. Test with validator tests: verify consistent timing across valid/invalid keys.

### Risk: Memory Exhaustion from Cache
**Impact**: Unbounded cache grows indefinitely as new keys are used, causing memory leak.
**Mitigation**: Implement periodic eviction: every 60 seconds, remove expired entries. Add max cache size limit (1000 entries): evict oldest if exceeded. Log cache size on eviction for monitoring. Consider LRU cache library (`lru-cache`) if manual eviction insufficient.

### Risk: RLS Policy Misconfiguration
**Impact**: Incorrectly set session variables could leak data between users or block legitimate access.
**Mitigation**: Test RLS policies in Supabase Studio with multiple `user_id` contexts before deploying. Add integration tests simulating multi-user scenarios. Use `SET LOCAL` (transaction-scoped) instead of `SET` (session-scoped) to prevent bleed between requests. Verify session variable cleared after query.

### Risk: Dependency on Issue #12 (API Key Generation)
**Impact**: Middleware cannot be tested end-to-end without API keys existing in database.
**Mitigation**: Create mock API keys in test fixtures (hardcoded UUIDs, pre-hashed secrets). Use test database with seeded keys. Coordinate with Issue #12: merge generation system before middleware. Document setup instructions for manual testing (insert test key via Supabase Studio).

### Risk: Breaking Change for Existing Consumers
**Impact**: All endpoints now require authentication; existing integrations break immediately.
**Mitigation**: This is Epic 2 (authentication infrastructure); no production consumers yet (dev-only). Document breaking change in CHANGELOG.md. Provide migration guide: "All requests must include `Authorization: Bearer <key>` header." Add deprecation notice to README if needed.

### Risk: Service Role Key Exposure
**Impact**: Service role client used for auth queries has full database access; leaked key compromises entire system.
**Mitigation**: Store `SUPABASE_SERVICE_KEY` as environment variable (never commit). Use separate anon key for user-scoped queries (RLS-enforced). Rotate service key if exposed. Add alerting for unusual service role usage (monitor Supabase dashboard). Restrict service role client usage to auth middleware only (not exposed to route handlers).

---

## Validation Strategy

### Automated Tests

**Unit Tests**:
- `tests/auth/cache.test.ts`: Cache storage, retrieval, expiry, eviction
- `tests/auth/validator.test.ts`: Key parsing, validation logic, bcrypt comparison, database queries
- `tests/auth/middleware.test.ts`: Authentication flow, error responses, logging, last_used_at updates

**Integration Tests**:
- `tests/api/authenticated-routes.test.ts`: End-to-end auth flow for all endpoints
  - Valid key grants access to `/index`, `/search`, `/files/recent`, `/mcp`
  - Invalid key returns 401 for protected endpoints
  - Disabled key returns 403
  - `/health` remains unauthenticated (public)
- `tests/api/rls-enforcement.test.ts`: Verify RLS policies filter data by user
  - User A cannot see User B's repositories
  - Org members see org-owned repositories
  - Service role bypasses RLS (for admin operations)

**Performance Tests**:
- `tests/auth/performance.test.ts`: Benchmark authentication overhead
  - Cold request (cache miss): <100ms
  - Warm request (cache hit): <2ms
  - Cache hit rate: >90% under load
  - Bcrypt comparison: <80ms per call

**Coverage Target**: >85% line coverage on `src/auth/*`, >75% on modified `src/api/routes.ts`

### Manual Checks

**Supabase Studio Verification**:
- Inspect `api_keys` table: verify test keys exist with bcrypt-hashed secrets
- Test RLS policies: `SET LOCAL app.user_id = '<test-uuid>'; SELECT * FROM repositories;`
- Verify `last_used_at` updates after authenticated API call
- Check audit logs for authentication events (if logging configured)

**API Smoke Test**:
1. **Create test API key**: Insert via Supabase Studio SQL editor
   ```sql
   INSERT INTO api_keys (id, user_id, key_id, secret_hash, tier, rate_limit_per_hour, enabled)
   VALUES (
     gen_random_uuid(),
     '<test-user-id>',
     'test_abc123',
     '$2a$10$...',  -- bcrypt hash of 'test_secret_456'
     'free',
     100,
     true
   );
   ```

2. **Start server**: `bun run src/index.ts`

3. **Test unauthenticated request** (expect 401):
   ```bash
   curl http://localhost:3000/search?term=function
   # Expected: {"error": "Missing API key"}
   ```

4. **Test authenticated request** (expect success):
   ```bash
   curl -H "Authorization: Bearer kota_free_test_abc123_test_secret_456" \
     http://localhost:3000/search?term=function
   # Expected: {"results": [...]}
   ```

5. **Test invalid key** (expect 401):
   ```bash
   curl -H "Authorization: Bearer kota_free_invalid_wrong" \
     http://localhost:3000/search?term=function
   # Expected: {"error": "Invalid API key"}
   ```

6. **Test disabled key** (expect 403):
   - Update test key in Supabase: `UPDATE api_keys SET enabled = false WHERE key_id = 'test_abc123'`
   - Retry authenticated request
   - Expected: `{"error": "API key disabled"}`

7. **Test cache behavior**:
   - Send same authenticated request twice rapidly
   - Check server logs: first shows "Database lookup", second shows "Cache hit"

8. **Verify /health remains public**:
   ```bash
   curl http://localhost:3000/health
   # Expected: {"status": "ok", "timestamp": "..."}
   ```

**Cache Testing**:
- Send 1000 requests with same key over 10 seconds
- Monitor cache hit rate in logs (expect >95%)
- Verify memory usage stable (no leak)
- Check cache eviction runs every 60 seconds (log entry)

**RLS Testing**:
- Create two test users (User A, User B)
- Insert repositories for each user
- Authenticate as User A, call `/search`
- Verify results only include User A's repositories
- Repeat for User B, verify isolation

### Release Guardrails

**Pre-Merge Checks** (CI/CD):
- `bunx tsc --noEmit` must pass (no type errors)
- `bun test` must pass (all tests green)
- `bun run lint` (if configured) must pass
- Coverage threshold: >80% on `src/auth/*`

**Deployment Checklist**:
- [ ] Issue #12 (API key generation) completed and merged
- [ ] Supabase `api_keys` table exists with correct schema
- [ ] `SUPABASE_SERVICE_KEY` environment variable set in deployment
- [ ] Test API keys seeded in database (for staging/dev)
- [ ] Monitor logs for authentication failures (alert on high rate)
- [ ] Verify RLS policies active in Supabase Studio
- [ ] End-to-end smoke test passes in staging environment

**Rollback Plan**:
- If authentication breaks: disable middleware by returning `{ context: mockContext }` immediately
- Emergency bypass: set `SKIP_AUTH=true` environment variable, check in middleware
- Rollback commit: revert router changes to remove auth check
- Database rollback: not required (schema changes from Issue #10, already applied)

---

## Validation Commands

Run in order to validate authentication middleware implementation:

```bash
# 1. Install dependencies (including bcryptjs)
bun install

# 2. Type-check TypeScript (must have 0 errors)
bunx tsc --noEmit

# 3. Run linter (if configured)
bun run lint

# 4. Run test suite (must pass all tests)
bun test

# 5. Run authentication tests specifically
bun test tests/auth/

# 6. Run integration tests with auth
bun test tests/api/authenticated-routes.test.ts

# 7. Check test coverage (target >80% on src/auth/*)
bun test --coverage

# 8. Start dev server
bun run src/index.ts
# Expected output: "Server running on port 3000"

# 9. Test health endpoint (public, no auth)
curl http://localhost:3000/health
# Expected: {"status": "ok", "timestamp": "2025-10-08T..."}

# 10. Test unauthenticated request (expect 401)
curl http://localhost:3000/search?term=test
# Expected: {"error": "Missing API key"}

# 11. Create test API key (via Supabase Studio SQL editor or Issue #12 API)
# INSERT INTO api_keys (...) VALUES (...);
# Save generated key: kota_free_<keyId>_<secret>

# 12. Test authenticated /search (expect success)
curl -H "Authorization: Bearer kota_free_<keyId>_<secret>" \
  http://localhost:3000/search?term=test
# Expected: {"results": [...]}

# 13. Test authenticated /index (expect 202)
curl -X POST http://localhost:3000/index \
  -H "Authorization: Bearer kota_free_<keyId>_<secret>" \
  -H "Content-Type: application/json" \
  -d '{"repository": "user/repo", "ref": "main"}'
# Expected: {"runId": "<uuid>"}

# 14. Test invalid API key (expect 401)
curl -H "Authorization: Bearer kota_free_invalid_wrong" \
  http://localhost:3000/search?term=test
# Expected: {"error": "Invalid API key"}

# 15. Test disabled key (expect 403)
# First, disable key: UPDATE api_keys SET enabled = false WHERE key_id = '<keyId>'
curl -H "Authorization: Bearer kota_free_<keyId>_<secret>" \
  http://localhost:3000/search?term=test
# Expected: {"error": "API key disabled"}

# 16. Test cache performance (send 2 requests rapidly)
time curl -H "Authorization: Bearer kota_free_<keyId>_<secret>" \
  http://localhost:3000/search?term=test
time curl -H "Authorization: Bearer kota_free_<keyId>_<secret>" \
  http://localhost:3000/search?term=test
# Second request should be faster (cache hit)

# 17. Verify last_used_at timestamp updated (check Supabase Studio)
# SELECT last_used_at FROM api_keys WHERE key_id = '<keyId>';
# Should be recent timestamp (within last minute)

# 18. Test RLS enforcement (requires two test users)
# Authenticate as User A, index repository
# Authenticate as User B, search for User A's repository (should not appear)

# 19. Run performance benchmarks
bun test tests/auth/performance.test.ts
# Verify: cache miss <100ms, cache hit <2ms

# 20. Final type-check and build
bunx tsc --noEmit && echo "Build successful"
```

**Domain-Specific Validation**:
- Verify `src/auth/` directory created with 4 modules (middleware, context, cache, validator)
- Check `Authorization` header required for all endpoints except `/health`
- Confirm bcrypt hashing takes 50-80ms (acceptable for cache miss)
- Validate cache hit rate >90% under load (1000 requests over 10 seconds)
- Test RLS session variable set correctly: query `current_setting('app.user_id')` in Postgres
- Verify service role client used only in auth middleware (not exposed to handlers)
- Check logs show authentication events: `[INFO] Auth success: userId=<uuid>, keyId=<id>`
- Confirm `last_used_at` updates asynchronously (doesn't block response)

---

## Summary

This feature implements authentication middleware for KotaDB that:

1. **Validates API keys** from `Authorization: Bearer <key>` headers using bcrypt comparison against the `api_keys` table
2. **Creates user context** (`AuthContext` with `userId`, `tier`, `orgId`, `keyId`, `rateLimitPerHour`) for authenticated requests
3. **Enables RLS enforcement** by setting `app.user_id` session variable for database queries

Key deliverables:
- `src/auth/middleware.ts` — Main authentication function with caching and error handling
- `src/auth/validator.ts` — API key parsing and database validation
- `src/auth/cache.ts` — In-memory cache with 5-second TTL
- `src/auth/context.ts` — Type definitions for authentication
- Updated `src/api/routes.ts` — Middleware integration with exemption for `/health`
- Updated `src/api/queries.ts` — RLS context injection for all queries
- Comprehensive tests — Unit, integration, and performance tests for auth flow

Relative path to plan: `specs/authentication-middleware.md`
