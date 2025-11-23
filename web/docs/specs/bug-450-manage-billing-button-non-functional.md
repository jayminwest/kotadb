# Bug Plan: Manage Billing Button Non-Functional

## Bug Summary
- **Observed Behaviour**: "Manage Billing" button on dashboard (develop.kotadb.io) is non-functional when clicked. No navigation occurs, no visible error message to user. Issue affects all browsers (Safari, Chrome) on both mobile and desktop platforms.
- **Expected Behaviour**: User clicks "Manage Billing" → Frontend calls POST `/api/subscriptions/create-portal-session` with JWT auth → Backend returns Stripe billing portal URL → Browser redirects to `billing.stripe.com`
- **Suspected Scope**:
  1. Missing authentication header in frontend fetch request (primary suspect)
  2. Silent error handling prevents user from seeing failure reason
  3. Backend endpoint may be rejecting unauthenticated requests with 401

## Root Cause Hypothesis

**Primary Root Cause: Missing JWT Authentication Header**

The billing portal endpoint at `app/src/api/routes.ts:785` requires authentication via the global middleware (line 434-472). The middleware enforces either:
- API key in `X-API-Key` header (programmatic access)
- JWT bearer token in `Authorization: Bearer <token>` header (OAuth web users)

The `handleManageBilling` function at `web/app/dashboard/page.tsx:40-65` calls the endpoint **without authentication headers**:

```typescript
const response = await fetch(`${apiUrl}/api/subscriptions/create-portal-session`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // ❌ MISSING: 'Authorization': `Bearer ${session.access_token}`
  },
  body: JSON.stringify({ returnUrl: window.location.href }),
})
```

**Supporting Evidence:**
- Same authentication pattern bug was previously fixed in #320 for checkout session endpoint
- `AuthContext.tsx:48-52` demonstrates correct pattern (used in `fetchSubscription`)
- Dashboard component uses `useAuth()` hook (line 20) but doesn't access `session` property
- Backend logs would show 401 errors if monitoring were enabled

**Secondary Issues:**

1. **Silent Error Handling**: Lines 58-63 only log to `process.stderr.write()` without displaying user-facing error messages. User has no feedback when request fails.

2. **No Session Validation**: Function doesn't verify `session` exists before attempting request, risking undefined access errors.

## Fix Strategy

### Code Changes

1. **Frontend Authentication (Primary Fix)**:
   - Modify `web/app/dashboard/page.tsx:40-65` to include Authorization header
   - Extract `session` from `useAuth()` hook (line 20)
   - Follow pattern from `AuthContext.tsx:48-52` for authenticated requests
   - Add defensive session check before making request

2. **Frontend Error Handling**:
   - Add user-facing error state display
   - Parse error response and show specific messages (401, 404, 500)
   - Handle edge cases: missing session, network failure, Stripe config errors
   - Consider toast notification or inline error display

3. **Logging Enhancement** (Backend - Optional):
   - Add structured logging for portal session creation failures
   - Log customer ID lookup failures separately from Stripe API errors
   - Aid in debugging production issues

### Guardrails

1. Add integration test for billing portal flow hitting real Supabase (per /anti-mock)
2. Add frontend validation to verify session exists before request
3. Add user feedback mechanism for all error cases
4. Test across browsers mentioned in issue (Safari, Chrome, mobile & desktop)

## Relevant Files

### Modified Files
- `web/app/dashboard/page.tsx` — Add Authorization header to billing portal request (lines 40-65), add error state UI
- `web/app/dashboard/page.tsx` — Extract session from useAuth hook (line 20)

### Files for Reference (No Changes)
- `app/src/api/routes.ts:785-835` — Billing portal endpoint (already correct)
- `app/src/api/routes.ts:434-472` — Authentication middleware (already correct)
- `web/context/AuthContext.tsx:48-52` — Auth pattern reference for JWT token usage
- `docs/specs/bug-320-payment-links-not-redirecting.md` — Previous fix for identical issue in checkout flow

### New Files
- `web/tests/dashboard/manage-billing.test.ts` — E2E test for billing portal flow (Playwright)

## Task Breakdown

### Verification
1. **Reproduce Bug on Staging**:
   - Navigate to https://develop.kotadb.io/dashboard (logged in with paid subscription)
   - Locate "Manage Billing" button in Subscription section
   - Open browser DevTools → Network tab
   - Click "Manage Billing" button
   - Observe POST request to `/api/subscriptions/create-portal-session`
   - Confirm response status 401 and error: `{"error": "Missing API key"}`
   - Verify no user-facing error message appears

2. **Verify Backend Endpoint**:
   - Review `app/src/api/routes.ts:785-835` to confirm endpoint requires auth
   - Verify endpoint returns 404 if no subscription exists (line 803-805)
   - Confirm Stripe client initialization (lines 808-819)
   - Test endpoint directly with curl + JWT token (should succeed)

3. **Review Related Bug Fix**:
   - Compare with `docs/specs/bug-320-payment-links-not-redirecting.md`
   - Confirm identical root cause (missing Authorization header)
   - Reuse testing approach and validation strategy

### Implementation

1. **Fix Frontend Authentication**:
   - Open `web/app/dashboard/page.tsx`
   - Update line 20: Extract session from useAuth hook
     ```typescript
     const { user, subscription, apiKey, setApiKey, isLoading, session } = useAuth()
     ```
   - Add session validation before request (after line 41):
     ```typescript
     if (!session?.access_token) {
       process.stderr.write('No session available for billing portal request\n')
       return
     }
     ```
   - Add Authorization header (line 46-48):
     ```typescript
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${session.access_token}`,
     }
     ```

2. **Add User-Facing Error Handling**:
   - Add error state at top of DashboardContent component:
     ```typescript
     const [billingError, setBillingError] = useState<string | null>(null)
     ```
   - Update error handling block (replace lines 58-63):
     ```typescript
     if (response.ok) {
       const data: CreatePortalSessionResponse = await response.json()
       window.location.href = data.url
     } else if (response.status === 401) {
       setBillingError('Authentication failed. Please refresh and try again.')
       process.stderr.write('Billing portal auth failed: 401 Unauthorized\n')
     } else if (response.status === 404) {
       setBillingError('No subscription found. Please contact support.')
       process.stderr.write('Billing portal failed: No subscription found\n')
     } else {
       setBillingError('Failed to open billing portal. Please try again.')
       const errorData = await response.json().catch(() => ({}))
       process.stderr.write(`Billing portal error: ${JSON.stringify(errorData)}\n`)
     }
     ```
   - Render error message in Subscription section (after line 324):
     ```typescript
     {billingError && (
       <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
         <p className="text-sm text-red-800 dark:text-red-200">{billingError}</p>
       </div>
     )}
     ```

3. **Clear Error on Retry**:
   - Add `setBillingError(null)` at start of handleManageBilling (after line 41)

4. **Add Playwright E2E Test**:
   - Create `web/tests/dashboard/manage-billing.test.ts`
   - Test authenticated user with paid subscription can open billing portal
   - Test user without subscription sees error
   - Test unauthenticated user is redirected to login
   - Use Playwright browser automation to verify redirect behavior
   - Leverage dev-session endpoint for test authentication (per feature-317)

5. **Type Safety Check**:
   - Verify `CreatePortalSessionResponse` type exists in `@shared/types/api` (line 147-150)
   - Confirm import at top of dashboard file (line 6)

### Validation

1. **Manual Testing on Staging**:
   - Deploy changes to develop.kotadb.io
   - Test as authenticated user with paid subscription:
     - Click "Manage Billing" button
     - **Expected**: Redirect to `billing.stripe.com` portal
     - **Expected**: Return URL brings user back to dashboard
   - Test as free tier user:
     - "Manage Billing" button should NOT be visible (line 315 conditional)
   - Test error cases:
     - Simulate 404 by temporarily revoking subscription in DB
     - Verify user sees "No subscription found" error message

2. **Cross-Browser Testing**:
   - Test on Safari (macOS and iOS per issue description)
   - Test on Chrome (desktop and mobile per issue description)
   - Verify button click handler fires in all browsers
   - Check DevTools console for any JavaScript errors

3. **Network Inspection**:
   - Verify Authorization header present in request
   - Confirm response status 200 (not 401)
   - Validate response body contains `{"url": "https://billing.stripe.com/..."}`

4. **Error Display Testing**:
   - Force 401 error: Remove Authorization header temporarily
   - Verify error message appears in red box
   - Force 404 error: Delete subscription record
   - Verify "No subscription found" message
   - Force 500 error: Temporarily break Stripe config
   - Verify generic error message

## Step by Step Tasks

### Investigation and Reproduction
1. Log into develop.kotadb.io with test account that has paid subscription
2. Open browser DevTools → Network tab
3. Click "Manage Billing" button
4. Capture failed request details (status, headers, response body)
5. Document error in issue comment for stakeholder visibility

### Frontend Authentication Fix
1. Open `web/app/dashboard/page.tsx`
2. Update useAuth destructuring to include session (line 20)
3. Add session validation check (after line 41)
4. Add Authorization header to fetch request (lines 46-48)
5. Run `cd web && bunx tsc --noEmit` to verify type safety

### Error Handling Implementation
1. Add billingError state variable to DashboardContent component
2. Update handleManageBilling error handling (lines 58-63)
3. Add error message rendering in Subscription section UI (after line 324)
4. Clear error on retry by adding setBillingError(null) at function start
5. Test error display with mock 401/404/500 responses

### E2E Test Creation
1. Create `web/tests/dashboard/manage-billing.test.ts`
2. Write test: authenticated user with subscription can access billing portal
3. Write test: user without subscription sees helpful error
4. Write test: button not visible for free tier users
5. Run tests: `cd web && bun test tests/dashboard/manage-billing.test.ts`

### Cross-Browser Validation
1. Deploy changes to staging environment
2. Test on Safari desktop (macOS)
3. Test on Safari mobile (iOS simulator or device)
4. Test on Chrome desktop
5. Test on Chrome mobile (Android simulator or device)
6. Document results in issue comment

### Production Readiness
1. Run full validation suite (see Validation Commands)
2. Test with real Stripe test mode configuration
3. Verify Stripe billing portal displays correctly
4. Confirm return URL navigation works
5. Check for any console errors or warnings

### Documentation and Cleanup
1. Add code comment explaining Authorization header requirement
2. Update issue #450 with fix verification results
3. Document cross-browser test results
4. Remove any temporary debugging code
5. Run linter and fix any style issues

### Push and PR Creation
1. Stage changes: `git add web/app/dashboard/page.tsx web/tests/dashboard/manage-billing.test.ts`
2. Commit: `fix: add authentication to billing portal request (#450)`
3. Push branch: `git push -u origin bug/450-manage-billing-button-non-functional`
4. Create PR linking to issue #450
5. Request review from team

## Regression Risks

### Adjacent Features to Watch

1. **Other Dashboard Actions** (API key generation, reset, revoke):
   - Functions: `handleGenerateApiKey` (line 67), `handleResetApiKey` (line 174), `handleRevokeApiKey` (line 209)
   - All use JWT authentication correctly (extract session, set Authorization header)
   - Low risk: No changes to these functions
   - Verify: API key management still works after deployment

2. **Subscription Display** (`AuthContext.fetchSubscription`):
   - Already uses Authorization header correctly (AuthContext.tsx:48-52)
   - Powers subscription tier badge on dashboard
   - Low risk: Uses same session object we're now accessing
   - Verify: Subscription details still display correctly

3. **Checkout Flow** (Fixed in #320):
   - Pricing page → Stripe Checkout session creation
   - Was previously broken due to same missing auth header issue
   - Low risk: Separate endpoint, already fixed
   - Verify: Upgrade flow from /pricing still works

4. **MCP Configuration Navigation** (line 374-392):
   - Router.push to /mcp page (client-side navigation)
   - No API calls, no authentication required
   - Very low risk: Pure navigation logic
   - Verify: "Configure MCP Integration" button still navigates

### Follow-up Work if Risk Materializes

1. **If Button Still Non-Functional**:
   - Check browser console for JavaScript errors
   - Verify React event handler is attached to button element
   - Inspect button's disabled state logic (line 318)
   - Check if CSS is preventing click events (z-index, pointer-events)

2. **If Backend Returns Different Error**:
   - May indicate environment variable issues (STRIPE_SECRET_KEY)
   - Could mean Stripe customer ID is missing/invalid in database
   - Follow-up: Add backend logging to distinguish error types
   - Follow-up: Create admin tool to audit subscription records

3. **If Billing Portal Redirect Fails**:
   - Stripe API may be rejecting customer ID
   - Return URL validation may fail (Stripe checks domain whitelist)
   - Follow-up: Add Stripe webhook logging to track portal events
   - Follow-up: Verify Stripe dashboard settings allow return URLs

4. **If Error Messages Too Generic**:
   - Users may need more specific guidance for resolution
   - Follow-up: Add error code system (BILLING_AUTH_FAILED, BILLING_NO_SUB, etc.)
   - Follow-up: Create help center article for common billing errors

## Validation Commands

```bash
# Type checking
cd web && bunx tsc --noEmit

# Linting
cd web && bun run lint

# E2E tests
cd web && bun test tests/dashboard/manage-billing.test.ts

# Build verification
cd web && bun run build

# Manual staging test checklist:
# 1. Deploy to develop.kotadb.io
# 2. Login with paid subscription test account
# 3. Navigate to /dashboard
# 4. Verify "Manage Billing" button visible
# 5. Click button
# 6. Verify redirect to billing.stripe.com
# 7. Verify return URL brings back to dashboard
# 8. Check Network tab: POST request has Authorization header
# 9. Check Network tab: Response status 200
# 10. Check console: No JavaScript errors

# Cross-browser validation:
# - Safari macOS: ✓
# - Safari iOS: ✓
# - Chrome desktop: ✓
# - Chrome mobile: ✓

# Error case testing:
# - Free tier user: Button not visible ✓
# - No session: Error displayed ✓
# - 404 (no subscription): Error displayed ✓
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix: add authentication to billing portal request` not `This commit adds authentication to the billing request`

Example good commit messages:
```
fix(dashboard): add JWT authentication to billing portal request
test(dashboard): add E2E tests for manage billing button
fix(dashboard): display user-facing errors for billing portal failures
docs(bug-450): document cross-browser test results
```

Example bad commit messages (do NOT use):
```
fix: based on issue #450, this should fix the billing button
fix: looking at the dashboard, I can see the auth header is missing
fix: here is the fix for the manage billing bug
fix: this commit adds the Authorization header to the request
```
