# Bug Plan: API Key Auto-Fetch Regression - Shows 'Generate' Button for Existing Keys

## Bug Summary

**Observed Behavior:**
All browsers (Chrome, Safari - desktop and mobile) display "Generate API Key" button by default instead of auto-fetching and displaying existing API keys. Users who already have API keys must manually click "Fetch" to see their existing keys, creating unnecessary friction.

**Expected Behavior:**
The dashboard should automatically fetch and display existing API keys on page load for authenticated users, similar to the MCP page behavior implemented in #451.

**Suspected Scope:**
Frontend issue in `web/app/dashboard/page.tsx` - the page relies on `apiKey` being pre-populated in AuthContext before attempting to fetch metadata. This creates a race condition where the page renders before AuthContext completes async validation of localStorage keys.

## Root Cause Hypothesis

**Leading Theory:**
The dashboard page only fetches key **metadata** when `apiKey` is already present (line 36: `if (user && apiKey)`), but unlike the MCP page (fixed in #451), it never actively fetches the API key itself from localStorage or backend. This regression occurred after Safari compatibility fixes in #441 where the focus was on handling "key already exists" messages, but auto-fetch logic was never added to match the MCP page pattern.

**Supporting Evidence:**
1. MCP page (`web/app/mcp/page.tsx:24-78`) has active API key fetching with localStorage fallback and backend fetch - added in #451
2. Dashboard page (`web/app/dashboard/page.tsx:35-39`) only fetches metadata **if** `apiKey` already exists in context
3. AuthContext (`web/context/AuthContext.tsx:83-95`) validates localStorage keys asynchronously, creating race condition
4. Safari fix commit e36c6c7 improved "already exists" error handling but didn't add auto-fetch logic
5. Bug #451 fixed identical issue on MCP page but dashboard was not updated with same pattern
6. Manual smoke testing in #448 discovered this regression across all browsers

## Fix Strategy

**Code Changes:**
1. Add active API key fetching to dashboard page matching MCP page pattern from #451
2. Implement `useEffect` hook to check localStorage and backend on mount when `user` exists but `apiKey` is null
3. Add loading state (`loadingKey`) to distinguish "fetching key" from "no key exists"
4. Maintain existing metadata fetching logic after key is populated
5. Ensure error states distinguish fetch failures from "no key exists"

**Data/Config Updates:**
None required - backend endpoints working correctly.

**Guardrails:**
1. Maintain consistency with MCP page's API key fetching pattern (lines 24-78 in `web/app/mcp/page.tsx`)
2. Respect AuthContext as source of truth after initial load
3. Preserve existing metadata fetching logic (lines 159-192)
4. Ensure Safari mobile compatibility (tested in #441 and #451)
5. Don't break existing "Generate API Key" flow for new users

## Relevant Files

- `web/app/dashboard/page.tsx` — Main bug location: needs auto-fetch logic added
- `web/app/mcp/page.tsx` — Reference implementation with correct auto-fetch pattern (lines 24-78)
- `web/context/AuthContext.tsx` — API key validation timing and localStorage access
- `app/src/api/routes.ts` — Backend `/api/keys/current` endpoint (lines 903-954)

### New Files
None - fix requires only edits to existing file.

## Task Breakdown

### Verification
1. Reproduce current failure:
   - Start local dev environment (`cd app && ./scripts/dev-start.sh` and `cd web && bun run dev`)
   - Create account and generate API key via dashboard
   - Log out and log back in
   - Navigate to dashboard page
   - Confirm "Generate API Key" button appears instead of auto-fetching existing key
2. Compare with MCP page behavior (should auto-fetch correctly after #451 fix)
3. Capture network logs to verify no `/api/keys/current` call on dashboard mount
4. Test on Chrome desktop, Safari mobile, Chrome mobile

### Implementation
1. **Add API key auto-fetch to dashboard page** (`web/app/dashboard/page.tsx`):
   - Add `loadingKey` state variable (similar to MCP page line 18)
   - Add `keyFetchError` state variable for error handling
   - Create `fetchApiKeyFromBackend()` function matching MCP page pattern (lines 25-75)
   - Add `useEffect` hook to trigger fetch when `user && !apiKey && !loadingKey && !isLoading`
   - Check localStorage first as immediate fallback before backend call
   - Call backend `/api/keys/current` endpoint if localStorage empty

2. **Update conditional rendering logic** (`web/app/dashboard/page.tsx:534-548`):
   - Change `if (!apiKey)` to account for `loadingKey` state
   - Show loading spinner when `loadingKey === true`
   - Show "Generate API Key" button only when `!apiKey && !loadingKey`
   - Display error state for fetch failures

3. **Preserve existing metadata fetching**:
   - Keep existing `useEffect` at lines 35-39 that fetches metadata when `apiKey` is present
   - Ensure new auto-fetch logic runs first and populates `apiKey` via `setApiKey()`
   - Metadata fetch will trigger automatically after `apiKey` state updates

### Validation
1. **Manual checks** (priority - matches smoke testing workflow):
   - Create test user account and generate API key
   - Log out and log back in
   - Navigate to dashboard
   - Verify API key auto-fetches and displays without manual action
   - Test "Generate API Key" button for new users without keys
   - Test on Chrome desktop, Safari mobile (iOS 17+), Chrome mobile (Android 13+)
   - Verify no console errors during auto-fetch
   - Check network tab for `/api/keys/current` call on page load

2. **Regression checks**:
   - Verify existing metadata display still works (key ID, tier, rate limits, created date, last used)
   - Test Reset API Key flow (modal + success message)
   - Test Revoke API Key flow (modal + page reload)
   - Verify MCP page still auto-fetches correctly (no regression of #451 fix)
   - Test Safari "key already exists" error handling from #441 (should still work)

## Step by Step Tasks

### Phase 1: Reproduce and Analyze
1. Start local development environment (backend + frontend)
2. Create test user account if needed
3. Generate API key via dashboard "Generate API Key" button
4. Log out using sign out button
5. Log back in via GitHub OAuth
6. Navigate to dashboard and observe "Generate API Key" button (incorrect behavior)
7. Navigate to `/mcp` page and verify key auto-fetches correctly (expected behavior from #451)
8. Open browser DevTools Network tab and compare API calls between dashboard and MCP page
9. Document behavioral difference confirming root cause hypothesis

### Phase 2: Implement Fix
1. Open `web/app/dashboard/page.tsx` in editor
2. Add state variables after line 31:
   - `const [loadingKey, setLoadingKey] = useState(false)`
   - `const [keyFetchError, setKeyFetchError] = useState<string | null>(null)`
3. Copy `fetchApiKeyFromBackend()` function from MCP page (lines 25-75) and adapt:
   - Place after line 32 (after state declarations)
   - Update dependency checks to match dashboard component
   - Use same localStorage check and backend fetch pattern
   - Reuse existing `apiUrl` constant
4. Add `useEffect` hook after existing metadata fetch effect (after line 39):
   - Call `fetchApiKeyFromBackend()` on mount
   - Dependencies: `[user, apiKey, isLoading, loadingKey, setApiKey]`
5. Update conditional rendering at lines 534-548:
   - Add loading state check: `{loadingKey && (<div>Loading API key...</div>)}`
   - Update "no key" condition: `{!apiKey && !loadingKey && (<div>...Generate API Key button...</div>)}`
   - Add error state display if `keyFetchError` is set
6. Run type-checking: `cd web && bunx tsc --noEmit`

### Phase 3: Test and Validate
1. Start dev servers: `cd app && ./scripts/dev-start.sh` (in terminal 1)
2. Start frontend: `cd web && bun run dev` (in terminal 2)
3. Test auto-fetch flow:
   - Log in to existing account with API key
   - Navigate to dashboard
   - Verify key displays immediately without manual action
   - Check browser DevTools for `/api/keys/current` call
   - Verify no console errors
4. Test new user flow:
   - Create new account (or revoke existing key)
   - Navigate to dashboard
   - Verify "Generate API Key" button appears
   - Click button and verify key generates successfully
5. Test Safari mobile (simulator or real device):
   - Open Safari DevTools for mobile
   - Navigate to dashboard
   - Verify auto-fetch works on Safari
   - Test localStorage access patterns
6. Test Chrome mobile (simulator):
   - Same verification as Safari
7. Run validation commands (see section below)

### Phase 4: Commit and Push
1. Stage changes: `git add web/app/dashboard/page.tsx`
2. Commit with message:
   ```
   fix(dashboard): auto-fetch existing API keys on page load

   The dashboard now actively fetches API keys from localStorage and backend
   on mount, matching MCP page behavior from #451. This resolves the regression
   where users with existing keys saw "Generate API Key" button instead of their
   existing key being auto-fetched.

   Adds loading state to distinguish fetch-in-progress from no-key-exists,
   and error handling for network failures. Preserves existing metadata
   fetching logic and Safari compatibility from #441.

   Fixes #454
   ```
3. Push branch: `git push -u origin bug/454-api-key-auto-fetch`
4. Verify push succeeded
5. Create PR targeting `develop` branch

## Regression Risks

**Adjacent Features to Watch:**
1. MCP page auto-fetch (#451) - ensure changes don't affect shared AuthContext state
2. Safari "already exists" error handling (#441) - verify Safari compatibility maintained
3. API key generation flow - ensure new users can still generate keys
4. API key reset/revoke flows - confirm dashboard updates correctly after key changes
5. Metadata display - verify key ID, tier, rate limits, dates still render correctly

**Follow-up Work if Risk Materializes:**
1. If AuthContext validation timing issues spread to other pages:
   - Refactor AuthContext to synchronously load from localStorage first, validate in background
   - Add global loading state until first validation completes
   - Consider React Suspense boundaries for async data loading
2. If localStorage access fails on mobile browsers:
   - Implement sessionStorage fallback
   - Add server-side session caching option
   - Log browser compatibility issues to Sentry
3. If race conditions persist between auto-fetch and metadata fetch:
   - Combine both fetches into single operation
   - Add retry logic for failed fetch attempts
   - Implement request deduplication to prevent double-fetching

## Validation Commands

```bash
# Type-checking
cd web && bunx tsc --noEmit

# Lint code
cd web && bun run lint

# Build production bundle
cd web && bun run build

# Start dev environment for manual testing
cd app && ./scripts/dev-start.sh &
cd web && bun run dev

# Test existing backend integration (ensure no backend regressions)
cd app && bun test --filter integration
cd app && bun test
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `fix(dashboard): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(dashboard): auto-fetch API keys on mount` not `Looking at the changes, this commit fixes the dashboard to auto-fetch API keys`

**Example good commit message:**
```
fix(dashboard): auto-fetch existing API keys on page load

The dashboard now actively fetches API keys from localStorage and backend
on mount, matching MCP page behavior from #451. This resolves the regression
where users with existing keys saw "Generate API Key" button instead of their
existing key being auto-fetched.

Adds loading state to distinguish fetch-in-progress from no-key-exists,
and error handling for network failures. Preserves existing metadata
fetching logic and Safari compatibility from #441.

Fixes #454
```
