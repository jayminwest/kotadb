# Bug Plan: Middleware JWT Token Support

## Bug Summary

### Observed Behaviour
- OAuth-authenticated users cannot proceed with checkout flow on `/pricing` page
- Frontend sends JWT token from Supabase session as `Authorization: Bearer <jwt_token>`
- Backend middleware at `app/src/auth/middleware.ts:81` calls `validateApiKey(token)` for all Bearer tokens
- `parseApiKey()` at `app/src/auth/validator.ts:43` fails because JWT doesn't match `kota_<tier>_<keyId>_<secret>` format
- Returns "Invalid API key" error (401) to frontend

### Expected Behaviour
- Middleware should accept **both** authentication methods:
  - **API keys** (`kota_*` format) for programmatic/MCP access
  - **JWT tokens** (Supabase session tokens) for OAuth web users
- OAuth users should successfully create checkout sessions and access authenticated endpoints

### Suspected Scope
- `app/src/auth/middleware.ts` - Authentication logic (lines 40-166)
- `app/src/auth/validator.ts` - API key validation (lines 43-73, 89-154)
- `app/src/auth/rate-limit.ts` - Rate limiting using `keyId` (lines 21-92)
- All authenticated API endpoints currently require API key format

## Root Cause Hypothesis

### Leading Theory
The authentication middleware was designed exclusively for API key validation and doesn't have a code path for JWT token validation. When the frontend sends a Supabase JWT token (obtained via GitHub OAuth), the middleware:

1. Extracts token from `Authorization: Bearer <token>` header (line 78)
2. Passes token directly to `validateApiKey(token)` (line 81)
3. `parseApiKey()` attempts to split token on `_` and validate `kota_<tier>_<keyId>_<secret>` format (lines 43-56)
4. JWT tokens (which are base64-encoded with `.` separators) fail format validation
5. Returns 401 with `AUTH_INVALID_KEY` error code

### Supporting Evidence
From browser automation testing (issue comment):
- Same API key works perfectly via CLI but fails in browser
- Frontend is authenticated via Supabase session cookies (works for Next.js pages)
- API calls from frontend fail because JWT token is sent in Authorization header
- `/api/subscriptions/current` endpoint exhibits same behavior (401 error)

Additional evidence from code inspection:
- `app/src/auth/middleware.ts` has no logic to distinguish between API keys and JWTs
- `parseApiKey()` function immediately returns `null` for non-`kota_*` format tokens
- Rate limiting uses `keyId` as primary identifier (line 124), which doesn't exist for JWT auth
- No existing JWT validation infrastructure in auth module

## Fix Strategy

### Code Changes

**1. Add JWT Token Detection** (middleware.ts:78-81)
After extracting the Bearer token, check format to route to appropriate validator:
- If token starts with `kota_`, use existing API key validation path
- Otherwise, attempt JWT validation using Supabase Auth

**2. Create JWT Validator** (new function in validator.ts or middleware.ts)
Implement `validateJwtToken()` function:
- Use `getServiceClient().auth.getUser(token)` to verify JWT with Supabase
- Query `subscriptions` table to fetch user's tier (with fallback to 'free')
- Build `AuthContext` matching the existing structure
- Return `ValidateApiKeyResult` or equivalent structure

**3. Update Rate Limiting Strategy** (rate-limit.ts + middleware.ts:124)
JWT-authenticated requests need stable identifier for rate limiting:
- **Recommended approach**: Generate synthetic keyId like `jwt_${userId}` for consistency
- Update `enforceRateLimit()` call to use this identifier
- Database function `increment_rate_limit()` works with any string identifier

**4. Update AuthContext Structure** (if needed)
- `keyId` field may be optional or synthetic for JWT auth
- Ensure all consumers of `AuthContext` handle JWT auth appropriately
- Rate limit headers should work identically for both auth methods

### Data/Config Updates
- No database schema changes required
- No environment variable changes required
- Subscriptions table already exists with proper structure

### Guardrails
- Maintain backward compatibility with existing API key authentication
- JWT validation should use same error codes/response format as API key validation
- Add caching for JWT validation similar to API key cache (60-second TTL)
- Log authentication method for observability (`[Auth] JWT auth success` vs existing API key logs)

## Relevant Files

### Files to Modify
- `app/src/auth/middleware.ts` - Add JWT detection and routing logic (lines 78-101)
- `app/src/auth/validator.ts` - Add `validateJwtToken()` function (new ~50 lines)
- `app/src/auth/rate-limit.ts` - Update to handle synthetic keyId for JWT auth (documentation only)
- `app/src/auth/cache.ts` - Extend caching to support JWT tokens (may need separate cache key strategy)

### Files to Update Tests
- `app/tests/api/checkout-session.test.ts` - Add JWT authentication test cases
- `app/tests/api/authenticated-routes.test.ts` - Add JWT authentication test cases for other endpoints
- `app/tests/unit/auth/validator.test.ts` - Add unit tests for `validateJwtToken()` (create if doesn't exist)

### Files for Reference
- `web/app/pricing/page.tsx:26` - Frontend sends JWT in Authorization header
- `web/context/AuthContext.tsx:52-56` - JWT token source (`session.access_token`)
- `app/src/api/routes.ts:407-470` - Checkout endpoint using authenticated context
- `app/src/db/migrations/20241023000001_subscriptions.sql` - Subscriptions table schema
- `shared/types/auth.ts` - AuthContext type definition (verify structure)

### New Files
None required - all changes are modifications to existing files

## Task Breakdown

### Verification
1. Run existing auth tests to establish baseline: `cd app && bun test --filter auth`
2. Run checkout session tests: `cd app && bun test --filter checkout`
3. Manually test API key authentication still works: `curl` with valid API key
4. Document current failure case with JWT token: `curl` with sample JWT (expected 401)

### Implementation

**Phase 1: JWT Validator Core**
1. Add `validateJwtToken()` function to `app/src/auth/validator.ts`:
   - Accept `token: string` parameter
   - Call `getServiceClient().auth.getUser(token)` to verify JWT
   - Query `subscriptions` table for user's tier (with LEFT JOIN or fallback logic)
   - Return `ValidateApiKeyResult` with synthetic `keyId: "jwt_${userId}"`
   - Return `null` for invalid/expired JWTs
   - Add timing attack mitigation (similar to API key validator)

2. Add JWT token caching in `app/src/auth/cache.ts`:
   - Use synthetic keyId (`jwt_${userId}`) as cache key
   - Same 60-second TTL as API key validation
   - Consider separate cache namespace to avoid collisions

**Phase 2: Middleware Integration**
3. Update `authenticateRequest()` in `app/src/auth/middleware.ts`:
   - After extracting token (line 78), check if it starts with `kota_`
   - If yes: use existing `validateApiKey()` path (lines 81-101)
   - If no: call new `validateJwtToken()` function
   - Unify error responses - both paths should return same 401 format
   - Add logging to distinguish auth methods: `[Auth] JWT auth success` vs existing logs

4. Update rate limiting call (line 124):
   - Pass `context.keyId` (which will be synthetic for JWT auth)
   - Verify `increment_rate_limit()` database function handles any string identifier
   - Ensure rate limit headers work correctly for both auth types

**Phase 3: Testing**
5. Add unit tests for `validateJwtToken()`:
   - Valid JWT returns correct AuthContext
   - Invalid JWT returns null
   - Expired JWT returns null
   - User without subscription defaults to 'free' tier
   - Timing attack mitigation works correctly

6. Add integration tests to `app/tests/api/checkout-session.test.ts`:
   - JWT-authenticated user can create checkout session
   - Invalid JWT returns 401 with `AUTH_INVALID_KEY`
   - Expired JWT returns 401
   - Rate limiting works with JWT auth (synthetic keyId)
   - Rate limit headers included in JWT auth responses

7. Add integration tests to `app/tests/api/authenticated-routes.test.ts`:
   - JWT auth works for `/api/subscriptions/current` endpoint
   - JWT auth works for other authenticated endpoints
   - API key auth still works (regression check)

**Phase 4: Validation**
8. Run full test suite: `cd app && bun test`
9. Run type checking: `cd app && bunx tsc --noEmit`
10. Test manually with dev-session endpoint:
    - Create test session: `POST http://localhost:3001/auth/dev-session`
    - Extract JWT token from response
    - Call checkout endpoint with JWT: `POST http://localhost:3000/api/subscriptions/create-checkout-session`
    - Verify successful response with Stripe checkout URL

11. Test API key auth still works (regression check):
    - Call checkout endpoint with valid API key
    - Verify successful response

12. Run pre-commit hooks: `cd app && bun run pre-commit`

## Step by Step Tasks

### Preparation
- Run existing test suite to establish baseline (`bun test`)
- Document current failure with sample JWT token

### Core Implementation
- Add `validateJwtToken()` function to validator.ts
- Extend JWT validation caching in cache.ts
- Update `authenticateRequest()` to route API keys vs JWTs
- Update rate limiting to use synthetic keyId for JWTs
- Add logging for JWT authentication success/failure

### Testing
- Write unit tests for `validateJwtToken()` function
- Add JWT auth test cases to checkout-session.test.ts
- Add JWT auth test cases to authenticated-routes.test.ts
- Verify API key auth regression tests pass

### Validation
- Run full test suite (`bun test`)
- Run type checking (`bunx tsc --noEmit`)
- Manual testing with dev-session JWT endpoint
- Manual testing with API key (regression check)
- Run pre-commit hooks
- Verify no logging standard violations (no `console.*`)

### Final Steps
- Run `cd app && bun run build` to verify production build
- Push branch to origin (`git push -u origin bug/327-middleware-rejects-jwt-tokens`)
- Open PR with title ending in issue number (e.g., "fix: support JWT tokens in auth middleware (#327)")

## Regression Risks

### Adjacent Features to Watch

**1. API Key Authentication**
- Risk: JWT detection logic could interfere with valid API keys starting with unexpected format
- Mitigation: Strict format check (`token.startsWith('kota_')`) before routing to API key validator
- Test: Comprehensive regression tests for all existing API key test cases

**2. Rate Limiting**
- Risk: Synthetic keyId for JWT auth could collide with real API key IDs
- Mitigation: Use `jwt_` prefix to avoid collisions with valid keyId format (8+ alphanumeric chars)
- Test: Verify rate limiting works independently for JWT users and API key users with same userId

**3. Validation Caching**
- Risk: Cache collisions between API key validation and JWT validation
- Mitigation: Use consistent cache key strategy (synthetic keyId with `jwt_` prefix)
- Test: Verify cache invalidation works correctly for both auth types

**4. Other Authenticated Endpoints**
- Risk: Some endpoints may assume `keyId` always exists or has specific format
- Mitigation: Review all consumers of `AuthContext.keyId` for JWT compatibility
- Test: Test JWT auth against multiple endpoint types (subscription, indexing, search)

### Follow-up Work if Risk Materialises

**If rate limiting collision occurs:**
- Create separate rate limit tracking tables/functions for JWT auth
- Update `increment_rate_limit()` to accept auth method parameter
- Maintain separate counters per auth method

**If cache collision occurs:**
- Implement separate cache namespaces (`api_key_cache` vs `jwt_cache`)
- Update cache.ts to support namespace parameter
- Update validators to use appropriate namespace

**If endpoints fail with synthetic keyId:**
- Update `AuthContext` type to make `keyId` optional
- Add `authMethod` field to context ('api_key' | 'jwt')
- Update endpoint logic to handle missing `keyId` gracefully

## Validation Commands

```bash
# Run all validation checks
cd app

# Linting
bun run lint

# Type checking
bunx tsc --noEmit

# Integration tests (authenticated routes)
bun test --filter integration

# All tests
bun test

# Production build
bun run build

# Pre-commit hooks (includes logging standards validation)
bun run pre-commit

# Migration sync validation
bun run test:validate-migrations
```

**Level 2 Validation** (recommended for this bug - impacts multiple endpoints):
- All commands above
- Manual testing with dev-session JWT endpoint
- Manual regression testing with API key authentication
- Browser automation testing via Playwright MCP (if available)
- Verify rate limiting works for both auth methods

**Level 3 Validation** (if time permits):
- Load testing with mixed API key and JWT traffic
- Test JWT token expiration handling
- Test with various Supabase JWT formats (different claims)
- End-to-end checkout flow test with real Stripe test mode

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix: add JWT token validation to auth middleware` not `Looking at the changes, this commit adds JWT token validation`

**Example good commit messages:**
```
fix(auth): add JWT token validation to middleware
test(auth): add JWT authentication test coverage
refactor(auth): extract token validation routing logic
docs(auth): update middleware comments for JWT support
```

**Example bad commit messages (DO NOT USE):**
```
fix: based on the analysis, this commit adds JWT support
fix: the changes here show that JWT validation is needed
fix: looking at the issue, i can see we need JWT support
```
