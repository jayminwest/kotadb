# Bug Plan: MCP Page Shows "No API Key Generated" Despite Valid Key

## Bug Summary

**Observed Behavior:**
The `/mcp` page displays "No API Key Generated" message despite the dashboard showing a valid API key for the user. This creates a confusing UX where users see conflicting states across different pages.

**Expected Behavior:**
The `/mcp` page should detect and display existing API keys consistently with the dashboard, fetching from localStorage and validating them on mount.

**Suspected Scope:**
Frontend issue in `web/app/mcp/page.tsx` - the page relies solely on `useAuth()` context's `apiKey` state which may not be populated when:
1. User navigates directly to `/mcp` without visiting dashboard first
2. AuthContext hasn't completed validation on mount
3. localStorage API key exists but hasn't been loaded into context yet

## Root Cause Hypothesis

**Leading Theory:**
Race condition in API key loading sequence. The AuthContext validates localStorage keys asynchronously via `validateApiKey()` during mount (line 83-95 in `web/context/AuthContext.tsx`), but the MCP page checks `apiKey` state before validation completes.

**Supporting Evidence:**
1. Dashboard page (web/app/dashboard/page.tsx:34-38) actively fetches key metadata via `fetchKeyMetadata()` when `user && apiKey` conditions are met
2. MCP page (web/app/mcp/page.tsx:13) passively consumes `apiKey` from context without any fetching logic
3. AuthContext loads localStorage key asynchronously via Promise chain: `validateApiKey(stored).then(valid => { if (valid) setApiKeyState(stored) })`
4. MCP page renders before the async validation completes, showing "No API Key Generated" state (line 83-113)
5. No localStorage-direct fallback check in MCP page like dashboard has

## Fix Strategy

**Code Changes:**
1. Add active API key fetching to MCP page similar to dashboard's `fetchKeyMetadata()` pattern
2. Implement useEffect hook to check both context and localStorage on mount
3. Add fallback logic to fetch from `/api/keys/current` if context is empty but user is authenticated
4. Show loading state during API key fetch to distinguish "loading" from "no key exists"

**Data/Config Updates:**
None required - backend endpoints are working correctly.

**Guardrails:**
1. Maintain consistency with dashboard's API key fetching pattern
2. Respect AuthContext as source of truth after validation completes
3. Add error boundary to distinguish "fetch failed" vs "no key exists" states
4. Ensure mobile browser compatibility (Safari and Chrome mobile tested)

## Relevant Files

- `web/app/mcp/page.tsx` — Main bug location: passive API key consumption without fetch logic
- `web/context/AuthContext.tsx` — API key validation timing and state management
- `web/app/dashboard/page.tsx` — Reference implementation with active `fetchKeyMetadata()`
- `app/src/api/routes.ts` — Backend endpoint `/api/keys/current` (lines 903-954)

### New Files
None - fix requires only edits to existing files.

## Task Breakdown

### Verification
1. Reproduce current failure:
   - Start local dev environment (`cd app && ./scripts/dev-start.sh` and `cd web && bun run dev`)
   - Log in on mobile Safari/Chrome simulator
   - Verify dashboard shows API key
   - Navigate to `/mcp` page
   - Confirm "No API Key Generated" message appears despite valid key
2. Capture network logs to verify `/api/keys/current` endpoint responses
3. Add console logging to track AuthContext validation timing

### Implementation
1. **Add API key fetching to MCP page** (web/app/mcp/page.tsx):
   - Import necessary hooks and types from AuthContext
   - Add `useEffect` hook to fetch key on mount if `user` exists but `apiKey` is null
   - Implement `fetchApiKeyFromBackend()` function mirroring dashboard pattern (lines 139-172)
   - Add loading state (`loadingKey`) to distinguish from "no key exists"
   - Check localStorage as immediate fallback before API call

2. **Update conditional rendering logic** (web/app/mcp/page.tsx:83-113):
   - Change condition from `if (!apiKey)` to `if (loadingKey)` for loading spinner
   - Change condition to `if (!apiKey && !loadingKey)` for "No API Key Generated" message
   - Add error state display for fetch failures

3. **Ensure mobile compatibility**:
   - Test localStorage access patterns work on Safari mobile
   - Verify async/await patterns don't block UI rendering
   - Test on Safari mobile and Chrome mobile browsers

### Validation
1. **Integration tests** (new test file: `web/__tests__/mcp-page.test.tsx`):
   - Test: MCP page fetches API key when context is empty but localStorage has key
   - Test: MCP page shows loading state during key fetch
   - Test: MCP page displays "No API Key Generated" only when no key exists
   - Test: MCP page handles fetch errors gracefully
   - Test: Direct navigation to `/mcp` loads key correctly (no dashboard visit required)

2. **Manual checks**:
   - Seed test user with API key via dashboard
   - Clear React context (hard refresh)
   - Navigate directly to `/mcp` page
   - Verify key displays without visiting dashboard first
   - Test on Safari mobile simulator (iOS 17+)
   - Test on Chrome mobile simulator (Android 13+)
   - Verify error states show correct messages (network failure vs no key)

## Step by Step Tasks

### Phase 1: Reproduce and Investigate
1. Start local development environment (backend + frontend)
2. Create test user account and generate API key via dashboard
3. Open browser DevTools Network tab
4. Navigate to `/mcp` page and capture initial state
5. Document timing of AuthContext validation vs page render
6. Verify `/api/keys/current` endpoint returns valid data when called directly

### Phase 2: Implement Fix
1. Edit `web/app/mcp/page.tsx`:
   - Add `loadingKey` state variable
   - Add `keyFetchError` state variable
   - Create `fetchApiKeyFromBackend()` function (lines 34-60 similar to dashboard)
   - Add useEffect hook to trigger fetch when `user && !apiKey && !loadingKey`
   - Update conditional rendering: loading spinner → error state → no key state → key display
2. Add localStorage fallback check before API call
3. Update TypeScript imports for Supabase client and types

### Phase 3: Test and Validate
1. Run type-checking: `cd web && bun run typecheck`
2. Run existing tests: `cd web && bun test`
3. Create integration test file: `web/__tests__/mcp-page.test.tsx`
4. Write test cases covering:
   - Direct navigation with localStorage key
   - Context empty but backend has key
   - Loading states
   - Error states
   - No key exists state
5. Manual testing on mobile browsers (Safari iOS, Chrome Android)
6. Verify consistency with dashboard key display behavior

### Phase 4: Documentation and Commit
1. Update `docs/specs/bug-451-mcp-no-key-display.md` with resolution notes
2. Add code comments explaining fetch timing in MCP page
3. Stage changes: `git add web/app/mcp/page.tsx web/__tests__/mcp-page.test.tsx docs/specs/bug-451-mcp-no-key-display.md`
4. Commit with message following conventional commits format
5. Push branch: `git push -u origin bug-451-67a2287d`
6. Create PR targeting `develop` branch with title: `fix: MCP page displays existing API keys correctly (#451)`

## Regression Risks

**Adjacent Features to Watch:**
1. Dashboard API key display - ensure changes don't affect shared AuthContext state
2. API key generation flow - verify new keys populate to MCP page immediately
3. API key reset/revoke - confirm MCP page updates when keys change
4. Other pages consuming `useAuth()` context - monitor for validation timing issues

**Follow-up Work if Risk Materializes:**
1. If AuthContext validation timing issues spread to other pages:
   - Refactor validation to be synchronous on mount (load from localStorage first, validate in background)
   - Add global loading state until first validation completes
2. If localStorage access fails on certain mobile browsers:
   - Implement sessionStorage fallback
   - Add server-side session caching option
3. If race conditions persist:
   - Implement React Suspense boundaries for async data loading
   - Add retry logic for failed validation attempts

## Validation Commands

```bash
# Type-checking
cd web && bunx tsc --noEmit

# Run all tests
cd web && bun test

# Lint code
cd web && bun run lint

# Build production bundle
cd web && bun run build

# Start dev environment for manual testing
cd app && ./scripts/dev-start.sh &
cd web && bun run dev
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `fix(web): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(web): fetch API key on MCP page mount` not `Looking at the changes, this commit fixes the API key display on MCP page`

**Example good commit message:**
```
fix(web): fetch existing API keys on MCP page mount

The MCP page now actively fetches API keys from localStorage and backend
on mount, matching dashboard behavior. This resolves race conditions where
AuthContext validation completes after page render, causing "No API Key
Generated" to display incorrectly.

Adds loading state to distinguish fetch-in-progress from no-key-exists,
and error handling for network failures.

Fixes #451
```
