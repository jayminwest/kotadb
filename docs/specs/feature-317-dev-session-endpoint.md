# Feature Plan: Dev-Mode Session Endpoint for Agent Authentication Bypass

**Issue**: #317
**Title**: feat: add dev-mode session endpoint for agent authentication bypass
**Component**: backend, testing
**Priority**: high
**Effort**: medium

## Overview

### Problem
Playwright agents and automated workflows need authenticated browser sessions for testing frontend user flows, but cannot complete GitHub OAuth in headless environments. Manual test account generation (via #316 script) requires copying tokens and manually setting cookies, which is impractical for automated CI/CD pipelines and ADW workflows.

### Desired Outcome
A development-mode HTTP endpoint that generates authenticated Supabase sessions on-demand with strict production guards. This enables Playwright agents to authenticate programmatically via a single HTTP request, receiving both session tokens and API keys for seamless workflow execution.

### Non-Goals
- Bypassing production authentication (MUST fail in production environments)
- Replacing GitHub OAuth as primary authentication method
- Providing privileged access or bypassing rate limits
- Implementing session management beyond standard Supabase lifecycle

## Technical Approach

### Architecture Notes
- Next.js 15 App Router route handler at `web/app/auth/dev-session/route.ts`
- Critical security guard: dual environment check (`NODE_ENV === 'production' && VERCEL_ENV === 'production'`) → 403 Forbidden
- Leverages Supabase Auth Admin API for user creation and session token generation
- Auto-generates API keys by calling existing backend `/api/keys/generate` endpoint
- Returns complete authentication payload: access token, refresh token, API key

### Key Modules to Touch
- `web/app/auth/dev-session/route.ts` (NEW) — Primary route handler with POST and GET methods
- `web/lib/supabase-server.ts` (reference) — Existing Supabase SSR client pattern
- `app/src/api/routes.ts` (reference) — Backend API key generation endpoint

### Data/API Impacts
- User metadata enhancement: `test_account: true` flag for filtering in admin queries
- No database schema changes required (uses existing `auth.users` table)
- Session tokens follow standard Supabase expiration (1 hour access token, 7-day refresh token)
- API keys subject to standard tier-based rate limiting (no special privileges)

## Relevant Files

### New Files
- `web/app/auth/dev-session/route.ts` — Main endpoint implementation with environment guards and session generation
- `web/tests/auth/dev-session.test.ts` — Playwright integration tests for session creation and authentication flow
- `web/lib/playwright-helpers.ts` — Reusable utilities for cookie injection and session initialization

### Modified Files
- `web/.env.sample` — Document optional `ENABLE_DEV_SESSION` configuration flag
- `web/middleware.ts` (potential) — May need exemption for `/auth/dev-session` from middleware auth checks

## Task Breakdown

### Phase 1: Core Endpoint Implementation
- Create route handler file `web/app/auth/dev-session/route.ts`
- Implement environment guard logic with dual check (`NODE_ENV` + `VERCEL_ENV`)
- Add request validation for `email` (required) and `tier` (optional, defaults to `free`)
- Implement user creation via `supabase.auth.admin.createUser()` with idempotency
- Call `supabase.auth.admin.generateLink({ type: 'magiclink' })` for session tokens
- Extract `access_token` and `refresh_token` from response

### Phase 2: API Key Integration
- Make authenticated request to backend `/api/keys/generate` using access token
- Handle idempotent API key generation (existing key returns without error)
- Parse response and extract `apiKey` field
- Add error handling for backend API failures (log but continue)

### Phase 3: Response Formatting & Health Check
- Structure JSON response with `userId`, `email`, `session`, `apiKey`, `message` fields
- Add GET endpoint for health check showing availability status and environment
- Document cookie format requirements for Supabase SSR (project-ref pattern)
- Include expiration metadata for session tokens

### Phase 4: Testing & Validation
- Write Playwright integration test using real Next.js dev server
- Test environment guard blocks production requests (403 Forbidden)
- Verify session tokens authenticate successfully with middleware
- Test cookie injection flow and page navigation persistence
- Validate API key works with backend endpoints

## Step by Step Tasks

### Endpoint Scaffolding
1. Create file `web/app/auth/dev-session/route.ts` with TypeScript boilerplate
2. Add environment guard function `isProductionEnvironment()` checking both `NODE_ENV` and `VERCEL_ENV`
3. Implement POST handler with early return for production environment (403 status)
4. Add request body parsing with Zod schema validation for `email` and optional `tier`

### User & Session Creation
5. Import `createClient()` from `web/lib/supabase-server.ts` for SSR client
6. Implement user creation via `supabase.auth.admin.createUser({ email, email_confirm: true, user_metadata: { test_account: true } })`
7. Add error handling for duplicate users (check for `User already registered` message, continue silently)
8. Call `supabase.auth.admin.generateLink({ type: 'magiclink', email })` to obtain session tokens
9. Extract `properties.access_token`, `properties.refresh_token`, and expiration data from response

### API Key Generation
10. Construct backend API URL from `NEXT_PUBLIC_API_URL` environment variable
11. Make POST request to `${apiUrl}/api/keys/generate` with `Authorization: Bearer ${access_token}` header
12. Parse response and extract `apiKey` field (handle both new key and existing key responses)
13. Add error handling with try/catch to continue even if API key generation fails
14. Log errors to console for debugging but include partial response to user

### Response & Health Check
15. Structure JSON response with fields: `userId`, `email`, `session: { access_token, refresh_token, expires_in, expires_at }`, `apiKey`, `message`
16. Add GET endpoint at same route returning availability status: `{ available: boolean, environment: string }`
17. Add JSDoc comments documenting request/response schemas and cookie format
18. Include example curl commands in route comments for manual testing

### Testing Infrastructure
19. Create test file `web/tests/auth/dev-session.test.ts` with Playwright setup
20. Test case: verify POST returns 403 in production mode (mock env vars)
21. Test case: verify POST creates test user and returns valid session tokens in dev mode
22. Test case: verify GET health check returns correct availability status
23. Test case: inject session cookies and navigate to protected route (dashboard)
24. Test case: verify API key from response works with backend API endpoint

### Helper Utilities
25. Create `web/lib/playwright-helpers.ts` with `generatePlaywrightCookies(session, projectRef)` function
26. Add cookie format documentation showing Supabase SSR structure: `sb-{project-ref}-auth-token`
27. Implement `injectSessionCookies(page, session)` helper for automated cookie injection
28. Add TypeScript types for session response format

### Documentation & Validation
29. Update `web/.env.sample` to document optional `ENABLE_DEV_SESSION` flag
30. Add usage examples in route file comments showing Playwright integration pattern
31. Run linting: `cd web && bun run lint` (if lint script exists)
32. Run type-checking: `cd web && bunx tsc --noEmit`
33. Run Playwright tests: `cd web && bun test` (if test infrastructure exists)
34. Manual validation: test endpoint with curl in local, staging, and production-like environments
35. Push branch: `git push -u origin feat/317-dev-session-endpoint`

## Risks & Mitigations

### Risk: Production Environment Guard Bypass
**Mitigation**: Use dual environment check (`NODE_ENV === 'production' && VERCEL_ENV === 'production'`) to ensure both variables must be set. Add comprehensive integration tests mocking production environment variables. Include CI validation step that verifies guard logic.

### Risk: Supabase Cookie Format Mismatch
**Mitigation**: Cookie name format varies by project ref (`sb-{project-ref}-auth-token`). Document expected format in response and provide helper utilities that automatically detect project ref from environment variables. Test with both Supabase Local and production project refs.

### Risk: Session Tokens Expire During Long Tests
**Mitigation**: Include `expires_in` and `expires_at` fields in response so clients can detect expiration. Provide `refresh_token` for token refresh workflows. Document expiration defaults (1 hour access, 7-day refresh) in endpoint response.

### Risk: API Key Generation Failure Blocks Workflow
**Mitigation**: Make API key generation non-blocking. Return partial response with session tokens even if backend API call fails. Log errors for debugging but don't fail entire request. Playwright tests can retry or fall back to manual key generation.

### Risk: Test Account Pollution in Database
**Mitigation**: User metadata includes `test_account: true` flag for filtering. Document cleanup strategy for periodic test account pruning. Consider adding created_at timestamp to enable automated cleanup of stale test accounts.

## Validation Strategy

### Automated Tests
- **Unit Test**: Environment guard logic correctly identifies production vs non-production
- **Integration Test**: POST endpoint creates test user via real Supabase Admin API
- **Integration Test**: Session tokens authenticate successfully with Supabase Auth
- **Integration Test**: API key generation succeeds and key works with backend endpoints
- **Integration Test**: Cookie injection enables navigation to protected routes
- **Regression Test**: GET health check returns correct availability status

### Manual Checks
- **Data Seeded**: Test user created with email `test-agent@kotadb.internal` and `test_account: true` metadata
- **Failure Scenarios**:
  - Production environment request → expect 403 Forbidden with clear error message
  - Invalid email format → expect 400 Bad Request with validation error
  - Backend API unreachable → expect partial response with session tokens but no API key
  - Expired session tokens → expect 401 from protected routes
- **Success Path**:
  - Playwright agent calls endpoint → receives session + API key
  - Injects cookies → navigates to dashboard → sees authenticated content
  - Uses API key → makes backend request → receives valid response

### Release Guardrails
- **Monitoring**: Log all dev-session endpoint calls with environment context for audit trail
- **Alerting**: Set up alerts for production environment 403 responses (should NEVER succeed)
- **Rollback**: Environment guard is failsafe (no flag enables production access)
- **Documentation**: Endpoint MUST be documented as dev-only in OpenAPI spec and README

## Validation Commands

```bash
# Linting (if script exists)
cd web && bun run lint || bunx biome check .

# Type-checking
cd web && bunx tsc --noEmit

# Playwright tests (if test infrastructure exists)
cd web && bun test || echo "Test infrastructure TBD"

# Manual endpoint testing - Local
cd web && bun run dev  # Start Next.js dev server
curl -X POST http://localhost:3001/auth/dev-session \
  -H "Content-Type: application/json" \
  -d '{"email":"test@local.dev","tier":"free"}'

# Manual endpoint testing - Production guard
NODE_ENV=production VERCEL_ENV=production curl -X POST http://localhost:3001/auth/dev-session \
  -H "Content-Type: application/json" \
  -d '{"email":"test@local.dev"}'
# Expected: 403 Forbidden

# Health check
curl http://localhost:3001/auth/dev-session

# Backend API key validation
curl -X GET http://localhost:3000/api/subscriptions/current \
  -H "Authorization: Bearer <api_key_from_response>"
```

## Issue Relationships

- **Child Of**: #315 (Test account authentication epic) - Phase 2: Frontend infrastructure
- **Depends On**: #316 (Test account script) - Uses similar session generation patterns via Admin API
- **Blocks**: #318 (Playwright helper module) - Foundation for automated cookie injection utilities
- **Related To**: #271 (GitHub OAuth) - Maintains OAuth as primary auth method, dev endpoint is testing-only

## Implementation Notes

### Supabase Auth Admin API Reference
```typescript
// User creation (idempotent via email uniqueness)
const { data: user, error } = await supabase.auth.admin.createUser({
  email: 'test@example.com',
  email_confirm: true,  // Skip email confirmation
  user_metadata: { test_account: true }
})

// Session token generation (magic link without email)
const { data, error } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email: 'test@example.com'
})

// Response structure:
{
  properties: {
    action_link: string,      // Not needed
    access_token: string,     // JWT for API authentication
    refresh_token: string,    // Token for refresh workflow
    hashed_token: string,     // Server-side hash
    email_otp: string,        // Not needed
    expires_in: number,       // Seconds until expiration
    expires_at: number        // Unix timestamp
  },
  user: { id: string, email: string, ... }
}
```

### Cookie Format for Supabase SSR
Cookie name pattern: `sb-{project-ref}-auth-token`
- Supabase Local: `sb-localhost-auth-token`
- Production: `sb-abcdefghijklmnop-auth-token` (16-char project ref)

Cookie value structure (JSON string):
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "refresh-token-here",
  "expires_in": 3600,
  "expires_at": 1234567890,
  "token_type": "bearer"
}
```

Cookie attributes:
- `domain`: `localhost` (dev) or `.yourdomain.com` (production)
- `path`: `/`
- `httpOnly`: `false` (required for SSR client access)
- `secure`: `false` (dev) or `true` (production)
- `sameSite`: `Lax`

### Playwright Cookie Injection Example
```typescript
import { generatePlaywrightCookies } from '@/lib/playwright-helpers'

// Get session from dev endpoint
const response = await fetch('http://localhost:3001/auth/dev-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com', tier: 'free' })
})
const { session, apiKey } = await response.json()

// Inject cookies
const cookies = generatePlaywrightCookies(session, 'localhost')
await page.context().addCookies(cookies)

// Navigate to protected route
await page.goto('http://localhost:3001/dashboard')
await expect(page.locator('h1')).toContainText('Dashboard')
```

### Environment Guard Implementation
```typescript
function isProductionEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  )
}

export async function POST(request: NextRequest) {
  if (isProductionEnvironment()) {
    return NextResponse.json(
      { error: 'Dev session endpoint not available in production' },
      { status: 403 }
    )
  }

  // ... rest of implementation
}
```

### API Key Generation Integration
```typescript
// After obtaining session tokens
try {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  const response = await fetch(`${apiUrl}/api/keys/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`
    }
  })

  if (response.ok) {
    const keyData = await response.json()
    apiKey = keyData.apiKey || keyData.message
  }
} catch (error) {
  console.error('[dev-session] API key generation failed:', error)
  // Continue without API key - partial response still useful
}
```

### Request Validation Schema
```typescript
import { z } from 'zod'

const DevSessionRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  tier: z.enum(['free', 'solo', 'team']).default('free')
})

// Usage
const body = await request.json()
const { email, tier } = DevSessionRequestSchema.parse(body)
```

### Response Type Definition
```typescript
interface DevSessionResponse {
  userId: string
  email: string
  session: {
    access_token: string
    refresh_token: string
    expires_in: number      // seconds
    expires_at: number      // unix timestamp
  }
  apiKey?: string          // Optional (may fail to generate)
  message: string
}
```
