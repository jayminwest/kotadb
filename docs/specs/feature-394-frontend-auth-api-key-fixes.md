# Feature Plan: Frontend Authentication and API Key Management Fixes

**Issue**: #394
**Title**: fix: frontend authentication and API key management blocking production usage
**Type**: Critical Bug Fix
**Priority**: Critical (blocks production launch #355)
**Effort**: Medium (1-3 days)
**Status**: Needs investigation

## Overview

### Problem

The frontend web application has critical authentication and API key management issues that completely block production usage:

1. **Middleware blocks API key authentication** - Routes `/search`, `/files`, `/repository-index` redirect to login even with valid API keys, preventing authenticated access to features
2. **No API key validation** - AuthContext loads keys from localStorage without verifying they're still valid, causing silent failures
3. **Race condition in key generation** - OAuth callback and dashboard both try to generate keys simultaneously, leading to unreliable key generation
4. **Missing validation endpoint** - No backend route to check if an API key is currently valid without making full API request

**Current User Experience**:
```
User logs in via GitHub OAuth
→ Redirected to dashboard
→ Clicks "Generate API Key" button
→ [Sometimes] Key appears, [sometimes] nothing happens
→ Navigates to /search
→ [Always] Redirected to /login (even with valid API key)
→ Cannot use any frontend features
```

### Desired Outcome

- Users can access `/search`, `/files`, `/repository-index` with valid API keys (no OAuth session required)
- Invalid/expired keys are automatically detected and cleared from localStorage
- API key generation is reliable and deterministic (no race conditions)
- Dashboard only requires OAuth for subscription management
- Production launch unblocked

### Non-Goals

- Implementing API key expiration (future enhancement)
- Adding periodic auto-refresh of validation (Phase 2 work)
- Security audit of localStorage usage (Phase 3 work)
- E2E tests for full OAuth flow (Phase 3 work)

## Technical Approach

### 1. Middleware Fix (web/middleware.ts)

**Problem**: Middleware incorrectly treats search/files/repository-index as OAuth-protected routes.

**Current (broken)**:
```typescript
const protectedRoutes = ['/dashboard', '/search', '/files', '/repository-index']
const isProtectedRoute = protectedRoutes.some((route) =>
  request.nextUrl.pathname.startsWith(route)
)

if (isProtectedRoute && !user) {
  return NextResponse.redirect(new URL('/login', request.url))
}
```

**Fixed**:
```typescript
// Only dashboard requires OAuth session
// Other routes work with API key authentication (handled by backend)
const oauthOnlyRoutes = ['/dashboard']
const requiresOAuth = oauthOnlyRoutes.some((route) =>
  request.nextUrl.pathname.startsWith(route)
)

if (requiresOAuth && !user) {
  return NextResponse.redirect(new URL('/login', request.url))
}
```

**Rationale**: Backend API already handles API key authentication via `authenticateRequest` middleware (app/src/auth/middleware.ts:40-177). Frontend middleware should only enforce OAuth for subscription management routes.

### 2. API Key Validation Endpoint (app/src/api/routes.ts)

**Problem**: No backend endpoint to validate API keys without consuming rate limit.

**Solution**: Add lightweight validation endpoint that reuses existing authentication middleware.

**Implementation**:
```typescript
// GET /api/keys/validate - Validate API key or JWT token
app.get("/api/keys/validate", async (req: AuthenticatedRequest, res: Response) => {
  // Uses existing authenticateRequest middleware (automatically validates)
  const context = req.authContext!;

  res.json({
    valid: true,
    tier: context.tier,
    userId: context.userId,
    rateLimitInfo: {
      limit: context.rateLimitPerHour,
      remaining: context.rateLimitRemaining,
      reset: context.rateLimitReset
    }
  });
});
```

**Integration**: Endpoint goes through existing `authenticateRequest` middleware (app/src/api/routes.ts:340-377), so it automatically validates both API keys and JWT tokens using established validation logic.

**Rate Limiting**: Validation consumes rate limit quota (prevents abuse of validation endpoint for probing).

### 3. AuthContext Validation (web/context/AuthContext.tsx)

**Problem**: API keys loaded from localStorage without verification.

**Solution**: Add validation on mount and expose validation function.

**Implementation**:
```typescript
const validateApiKey = async (key: string): Promise<boolean> => {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    const response = await fetch(`${apiUrl}/api/keys/validate`, {
      headers: {
        'Authorization': `Bearer ${key}`,
      },
    })
    return response.ok
  } catch (error) {
    process.stderr.write(`[Auth] API key validation error: ${error instanceof Error ? error.message : String(error)}\n`)
    return false
  }
}

// Update useEffect to validate on mount
useEffect(() => {
  const stored = localStorage.getItem('kotadb_api_key')
  if (stored) {
    validateApiKey(stored).then(valid => {
      if (valid) {
        setApiKeyState(stored)
      } else {
        localStorage.removeItem('kotadb_api_key')
        process.stderr.write('[Auth] Removed invalid API key from localStorage\n')
      }
    })
  }
}, [])
```

**User Experience**: Invalid keys silently removed, user sees "No API key configured" in dashboard.

### 4. Simplify Dashboard Flow (web/app/dashboard/page.tsx)

**Problem**: OAuth callback passes API key via URL query parameters, creating race condition with manual generation.

**Solution**: Remove query parameter handling, keep only manual "Generate API Key" button workflow.

**Changes**:
- Remove lines 34-54: Query parameter handling for `api_key`, `key_generated`, `existing_key`, `key_error`
- Keep lines 90-142: Manual "Generate API Key" button
- Keep lines 152-185: API key metadata fetching
- Keep lines 187-253: Reset and revoke handlers

**After successful generation**:
```typescript
const handleGenerateApiKey = async () => {
  setLoadingKeyGen(true)
  setKeyGenError(null)
  setKeyGenSuccess(null)

  try {
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      setKeyGenError('No active session')
      return
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    const response = await fetch(`${apiUrl}/api/keys/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
    })

    if (response.ok) {
      const keyData = await response.json()
      if (keyData.apiKey) {
        localStorage.setItem('kotadb_api_key', keyData.apiKey)
        setApiKey(keyData.apiKey) // Update AuthContext
        setKeyGenSuccess('API key successfully generated!')
        // Auto-refresh metadata to show new key info
        await fetchKeyMetadata()
      }
    } else {
      const errorText = await response.text()
      setKeyGenError(`Failed to generate API key: ${errorText}`)
    }
  } catch (error) {
    setKeyGenError(`Error generating API key: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    setLoadingKeyGen(false)
  }
}
```

### 5. Remove OAuth Auto-Generation (web/app/auth/callback/route.ts)

**Problem**: OAuth callback tries to auto-generate API key with retry logic, causing race conditions.

**Solution**: Simple redirect to dashboard, user generates key manually.

**Replace lines 25-93 with**:
```typescript
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      process.stderr.write(`[OAuth] Failed to exchange code for session: ${error.message}\n`)
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }
  }

  // Simple redirect - user will generate API key manually from dashboard
  return NextResponse.redirect(`${origin}/dashboard`)
}
```

**Rationale**: Eliminates race condition, simplifies error handling, makes user flow explicit and debuggable.

## Relevant Files

### Modified Files

- `web/middleware.ts:39-46` — Fix protected routes logic (remove search/files/repository-index)
- `web/context/AuthContext.tsx:67-72` — Add API key validation on mount
- `web/app/dashboard/page.tsx:34-54` — Remove OAuth query parameter handling
- `web/app/auth/callback/route.ts:25-93` — Remove auto-generation retry logic
- `app/src/api/routes.ts` — Add `/api/keys/validate` endpoint (after line 906)

### New Files

None (all changes are modifications to existing files)

### Test Files to Update

- `app/tests/integration/auth.test.ts` — Add validation endpoint tests
- `app/tests/integration/keys.test.ts` — Add key generation without race conditions

## Task Breakdown

### Phase 1: Backend Validation Endpoint (1-2 hours)

- Add `/api/keys/validate` endpoint in `app/src/api/routes.ts`
- Verify endpoint uses existing `authenticateRequest` middleware
- Test with valid API keys (200 response with metadata)
- Test with invalid keys (401 response)
- Test with JWT tokens (200 response with metadata)
- Write integration tests for validation endpoint

### Phase 2: Frontend Middleware Fix (30 minutes)

- Update `web/middleware.ts` protected routes array
- Remove `/search`, `/files`, `/repository-index` from protected routes
- Keep only `/dashboard` as OAuth-required route
- Test unauthenticated access redirects correctly
- Test API key access works for search/files/repository-index

### Phase 3: AuthContext Validation (1-2 hours)

- Add `validateApiKey` function to `web/context/AuthContext.tsx`
- Update `useEffect` to validate on mount
- Clear invalid keys from localStorage
- Test with valid keys (key persists)
- Test with invalid keys (key cleared)
- Test with no keys (no validation attempt)

### Phase 4: Simplify Dashboard (1-2 hours)

- Remove query parameter handling in `web/app/dashboard/page.tsx` (lines 34-54)
- Update `handleGenerateApiKey` to auto-refresh metadata
- Test manual generation workflow
- Test success/error messages
- Test metadata refresh after generation

### Phase 5: Remove OAuth Auto-Generation (30 minutes)

- Simplify `web/app/auth/callback/route.ts` (remove lines 25-93)
- Test OAuth flow redirects to dashboard
- Verify "No API key configured" message appears
- Test manual generation from dashboard

## Step by Step Tasks

### Backend Development

1. **Add validation endpoint**:
   - Open `app/src/api/routes.ts`
   - Add new GET `/api/keys/validate` endpoint after line 906
   - Implement endpoint using existing `authenticateRequest` middleware
   - Return structured validation response with tier, rate limit info

2. **Write integration tests**:
   - Create test file `app/tests/integration/key-validation.test.ts`
   - Test valid API key validation (200 response)
   - Test invalid API key validation (401 response)
   - Test JWT token validation (200 response)
   - Test missing Authorization header (401 response)

3. **Run backend validation**:
   - `cd app && bun run lint`
   - `cd app && bun run typecheck`
   - `cd app && bun test --filter integration`
   - `cd app && bun test`

### Frontend Development

4. **Fix middleware protected routes**:
   - Open `web/middleware.ts`
   - Update `protectedRoutes` array to `oauthOnlyRoutes` containing only `/dashboard`
   - Rename `isProtectedRoute` to `requiresOAuth`
   - Test route access with/without OAuth session

5. **Add AuthContext validation**:
   - Open `web/context/AuthContext.tsx`
   - Add `validateApiKey` async function
   - Update useEffect to validate on mount (lines 67-72)
   - Clear invalid keys from localStorage
   - Test validation behavior

6. **Simplify dashboard flow**:
   - Open `web/app/dashboard/page.tsx`
   - Remove lines 34-54 (query parameter handling)
   - Update `handleGenerateApiKey` to refresh metadata after success
   - Remove OAuth callback integration logic
   - Test manual generation workflow

7. **Remove OAuth auto-generation**:
   - Open `web/app/auth/callback/route.ts`
   - Remove lines 25-93 (retry logic and key generation)
   - Replace with simple redirect to `/dashboard`
   - Test OAuth flow

### Integration Testing

8. **Manual testing checklist**:
   - Start backend (`cd app && ./scripts/dev-start.sh`)
   - Start frontend (`cd web && bun run dev`)
   - Test OAuth flow → dashboard → manual generation
   - Test API key validation on mount
   - Test search/files/repository-index access with API key
   - Test dashboard OAuth requirement
   - Test invalid key clearing

9. **Run frontend validation**:
   - `cd web && bun run lint`
   - `cd web && bun run typecheck`
   - `cd web && bun run build`

### Documentation and Cleanup

10. **Update documentation**:
    - Update `web/README.md` with simplified OAuth flow
    - Document validation endpoint in API documentation
    - Add troubleshooting guide for API key issues

11. **Final validation**:
    - Re-run all backend tests (`cd app && bun test`)
    - Re-run all integration tests (`cd app && bun test --filter integration`)
    - Verify type checking passes (`cd app && bunx tsc --noEmit`)
    - Verify frontend builds (`cd web && bun run build`)
    - Push branch (`git push -u origin feat/394-frontend-auth-fixes`)

## Risks & Mitigations

### Risk: Breaking existing API key users
**Mitigation**: Validation endpoint reuses existing `authenticateRequest` middleware, ensuring consistent validation logic. Existing API keys remain valid.

### Risk: localStorage security concerns
**Mitigation**: Document in Phase 2 user experience improvements. LocalStorage is acceptable for API keys (not JWTs). Keys are user-specific and can be revoked.

### Risk: Validation endpoint abuse
**Mitigation**: Validation consumes rate limit quota. Free tier (100/hr) prevents unlimited validation probing.

### Risk: Frontend builds break due to type errors
**Mitigation**: Run `bunx tsc --noEmit` after each change. Fix type errors before proceeding to next phase.

### Risk: Breaking existing OAuth flow for mobile/CLI clients
**Mitigation**: No mobile/CLI clients exist yet. OAuth flow changes only affect web application.

## Validation Strategy

### Automated Tests

**Backend Integration Tests** (`app/tests/integration/`):
- API key validation endpoint (`key-validation.test.ts`)
  - Valid API key returns 200 with metadata
  - Invalid API key returns 401
  - JWT token returns 200 with metadata
  - Missing Authorization header returns 401
  - Expired/revoked keys return 401

**Test Database**: All tests use real Supabase Local (per antimocking philosophy in `.claude/commands/docs/anti-mock.md`)

### Manual Testing

**OAuth Flow**:
1. Visit `/login` and click "Sign in with GitHub"
2. Complete GitHub OAuth flow
3. Verify redirect to `/dashboard` (no API key auto-generation)
4. Verify "No API key configured" message appears
5. Click "Generate API Key" button
6. Verify API key appears in UI within 2 seconds
7. Verify key is stored in localStorage
8. Refresh page and verify key persists

**API Key Validation**:
1. Load dashboard with valid API key in localStorage
2. Verify key validates on mount (network request to `/api/keys/validate`)
3. Manually set invalid key in localStorage: `localStorage.setItem('kotadb_api_key', 'kota_free_invalid_key')`
4. Refresh page
5. Verify invalid key is cleared from localStorage
6. Verify "No API key configured" message appears

**Route Access**:
1. Log out (clear session and localStorage)
2. Manually set valid API key: `localStorage.setItem('kotadb_api_key', '<your-real-key>')`
3. Visit `/search` - should NOT redirect to login
4. Visit `/files` - should NOT redirect to login
5. Visit `/repository-index` - should NOT redirect to login
6. Visit `/dashboard` - SHOULD redirect to login (OAuth required)

**API Key Management**:
1. Generate API key from dashboard
2. Verify key metadata card appears (tier, rate limit, created date)
3. Click "Reset API Key" button
4. Confirm modal, verify new key appears
5. Verify old key no longer works (test with `/api/keys/validate`)
6. Click "Revoke API Key" button
7. Confirm modal, verify key disappears
8. Verify localStorage cleared

### Health Checks

```bash
# Backend health
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"...","queue":{...}}

# Validation endpoint (with real API key)
curl -H "Authorization: Bearer kota_free_<your-key>" http://localhost:3000/api/keys/validate
# Expected: {"valid":true,"tier":"free","userId":"...","rateLimitInfo":{...}}

# Validation endpoint (invalid key)
curl -H "Authorization: Bearer invalid_key" http://localhost:3000/api/keys/validate
# Expected: 401 {"error":"Invalid API key format","code":"AUTH_INVALID_KEY"}
```

## Validation Commands

### Level 2 (Required Minimum)

```bash
# Backend validation
cd app
bun run lint
bun run typecheck
bun test --filter integration
bun test
bun run build

# Frontend validation
cd web
bun run lint
bun run typecheck
bun run build
```

### Domain-Specific Checks

```bash
# Test validation endpoint directly
cd app
./scripts/dev-start.sh &
sleep 5
curl -H "Authorization: Bearer kota_free_test_key" http://localhost:3000/api/keys/validate

# Test frontend route access
cd web
bun run dev &
# Open browser to http://localhost:3001
# Test routes with API key in localStorage
```

## Issue Relationships

- **Blocks**: #355 (Production MVP launch) - Cannot launch without functional frontend auth
- **Related To**: #327 (JWT middleware bug) - Historical middleware authentication issues
- **Related To**: #390 (Frontend API integration) - Previous frontend/backend alignment work
- **Related To**: #386 (API key dashboard UI) - Dashboard implementation that needs fixes
- **Related To**: #368 (API key reset/revoke endpoints) - Backend endpoints that work but frontend cannot access

## Success Criteria

**Definition of Done**:
1. ✅ All Phase 1-5 tasks completed
2. ✅ Manual testing checklist passes 100%
3. ✅ Integration tests validate all endpoints
4. ✅ Users can access `/search`, `/files`, `/repository-index` with API keys
5. ✅ Dashboard API key generation works reliably (no race conditions)
6. ✅ Invalid/expired keys detected and cleared automatically
7. ✅ No breaking changes to backend API
8. ✅ All validation commands pass (Level 2)
9. ✅ Ready for production deployment

**Launch Blockers Resolved**:
- ✅ Users can use frontend features with API keys
- ✅ API key generation is reliable and deterministic
- ✅ Invalid keys handled gracefully (no silent failures)
- ✅ OAuth flow simplified (no auto-generation complexity)

**Estimated Time**: 4-6 hours for Phase 1-5 (critical path to unblock launch)
