# Bug Plan: Payment Links Not Redirecting to Stripe Checkout

## Bug Summary
- **Observed Behaviour**: Clicking "Upgrade to Solo" or "Upgrade to Team" buttons on /pricing page shows "Loading..." briefly but does not redirect to Stripe Checkout. No visible error message appears to the user.
- **Expected Behaviour**: User clicks upgrade button → Frontend calls POST /api/subscriptions/create-checkout-session → Backend returns Stripe Checkout URL → User redirects to Stripe's hosted checkout page
- **Suspected Scope**:
  1. Missing authentication header in frontend fetch request (confirmed via MCP investigation)
  2. Missing subscriptions table in staging database (confirmed via Supabase MCP)
  3. Price mismatch between UI ($20/$100) and Stripe configuration ($29.99/$49.99)
  4. Silent error handling in frontend (console.error only, no user-facing feedback)

## Root Cause Hypothesis

**Primary Root Cause: Missing JWT Authentication Header**

The checkout endpoint at `app/src/api/routes.ts:407` requires authentication via the global middleware at line 138. The middleware expects either:
- API key in `X-API-Key` header (for programmatic access)
- JWT bearer token in `Authorization: Bearer <token>` header (for OAuth web users)

The frontend at `web/app/pricing/page.tsx:20-30` calls the endpoint without sending authentication headers:

```typescript
const response = await fetch(`${apiUrl}/api/subscriptions/create-checkout-session`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // ❌ Missing: Authorization: `Bearer ${session.access_token}`
  },
  body: JSON.stringify({ tier, successUrl, cancelUrl }),
})
```

The AuthContext at `web/context/AuthContext.tsx:54` demonstrates the correct pattern for authenticated requests (used for fetching current subscription), but this pattern is not applied to the checkout session creation.

**Supporting Evidence:**
- Direct curl test returns `{"error": "Missing API key"}` (from MCP investigation comment)
- AuthContext.tsx:52-56 shows other endpoints successfully using `Authorization: Bearer ${session.access_token}`
- Frontend checks `isAuthenticated` before calling handleUpgrade (line 12-15) but doesn't pass session token

**Secondary Root Causes:**

1. **Missing subscriptions Table in Database**: MCP investigation confirms the table doesn't exist in staging, causing queries to fail at line 436-440 of routes.ts. Migration 20241023000001_subscriptions.sql exists but hasn't been applied to staging environment.

2. **Price Mismatch**: UI shows $20 (Solo) / $100 (Team) but Stripe has $29.99 / $49.99 configured. This is a data consistency issue, not a blocker for the redirect, but creates user confusion.

3. **Silent Error Handling**: Frontend only logs to console.error (lines 36, 39) instead of displaying user-facing error messages, making debugging impossible for end users.

## Fix Strategy

### Code Changes
1. **Frontend Authentication (Primary Fix)**:
   - Modify `web/app/pricing/page.tsx:20-30` to include Authorization header
   - Extract session token from useAuth hook (session.access_token)
   - Follow the pattern used in AuthContext.tsx:52-56 for /api/subscriptions/current

2. **Frontend Error Handling**:
   - Add toast/alert component for displaying errors
   - Parse error responses and show user-friendly messages
   - Handle specific error cases: 401 Unauthorized, 500 Server Error, network failures

3. **Price Alignment**:
   - Update pricing page tier definitions (lines 68, 84) to match Stripe configuration OR
   - Update Stripe price IDs to match intended pricing ($20/$100)
   - Decision required: align UI to Stripe or Stripe to UI?

### Data/Config Updates
1. **Apply Database Migration**:
   - Run migration 20241023000001_subscriptions.sql on staging database
   - Verify table creation with Supabase MCP list_tables tool
   - Confirm indexes and constraints are applied

2. **Verify Environment Variables**:
   - Confirm STRIPE_SECRET_KEY is deployed to staging (not just in .env.develop)
   - Verify STRIPE_SOLO_PRICE_ID and STRIPE_TEAM_PRICE_ID match Stripe dashboard
   - Use Stripe MCP to validate price IDs exist and match configuration

### Guardrails
1. Add integration test for checkout flow hitting real Supabase (per /anti-mock)
2. Add frontend validation to check session exists before making request
3. Add backend logging for subscription query failures
4. Monitor Stripe API errors via stderr.write logs

## Relevant Files

### Modified Files
- `web/app/pricing/page.tsx` — Add Authorization header to fetch request, implement error toast UI
- `web/app/pricing/page.tsx` — Update tier prices to match Stripe (lines 68, 84) OR create follow-up to update Stripe

### Files for Reference (No Changes)
- `app/src/api/routes.ts:407-470` — Checkout endpoint implementation (already correct)
- `app/src/api/routes.ts:138-175` — Authentication middleware (already correct)
- `web/context/AuthContext.tsx` — Auth pattern reference (lines 52-56)
- `app/src/api/stripe.ts` — Stripe configuration helpers

### Database
- `app/src/db/migrations/20241023000001_subscriptions.sql` — Migration to apply to staging

### New Files
- `app/src/api/__tests__/checkout-session.integration.test.ts` — Integration test for checkout flow
- `web/components/Toast.tsx` — Toast notification component for errors (if doesn't exist)

## Task Breakdown

### Verification
1. **Reproduce Bug on Staging**:
   - Navigate to https://develop.kotadb.io/pricing (logged in)
   - Click "Upgrade to Solo" button
   - Open browser DevTools → Network tab
   - Observe POST request to /api/subscriptions/create-checkout-session
   - Confirm response status 401 and error body `{"error": "Missing API key"}`

2. **Verify Database State**:
   - Use Supabase MCP list_tables to confirm subscriptions table missing
   - Check staging environment variables for Stripe keys
   - Use Stripe MCP list_prices to confirm price configurations

3. **Verify Stripe Configuration**:
   - Login to Stripe dashboard
   - Navigate to Products section
   - Record actual prices: Solo ($29.99), Team ($49.99)
   - Compare with UI-displayed prices: Solo ($20), Team ($100)

### Implementation

1. **Apply Database Migration to Staging**:
   ```bash
   cd app
   # Connect to staging Supabase project
   bunx supabase link --project-ref <staging-project-ref>
   # Apply migration
   bunx supabase db push
   # Verify table created
   bunx supabase db remote status
   ```

2. **Fix Frontend Authentication** (Primary):
   - Open `web/app/pricing/page.tsx`
   - Extract session from useAuth: `const { isAuthenticated, subscription, session } = useAuth()`
   - Update fetch headers at line 22-24 to include:
     ```typescript
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${session?.access_token}`,
     }
     ```
   - Add defensive check: if !session after isAuthenticated check, show error

3. **Add Frontend Error Handling**:
   - Install/create Toast component for notifications
   - Add state: `const [error, setError] = useState<string | null>(null)`
   - Update catch block at line 38-39 to:
     ```typescript
     if (!response.ok) {
       const errorData = await response.json()
       const message = errorData.error || 'Failed to create checkout session'
       setError(message)
       return
     }
     ```
   - Render error toast component in JSX

4. **Resolve Price Mismatch**:
   - Option A: Update UI to match Stripe ($29.99/$49.99)
     - Change line 68: `price: '$29.99'`
     - Change line 84: `price: '$49.99'`
   - Option B: Update Stripe to match UI ($20/$100)
     - Use Stripe MCP create_price to create new prices
     - Update environment variables with new price IDs
   - **Decision Required**: Confirm with stakeholders which direction

5. **Add Integration Test**:
   - Create `app/src/api/__tests__/checkout-session.integration.test.ts`
   - Test authenticated user can create checkout session
   - Test unauthenticated request returns 401
   - Test missing Stripe config returns 500
   - Test invalid tier returns 400
   - All tests hit real Supabase Local database (per /anti-mock)

6. **Add Logging and Monitoring**:
   - Add stderr.write log when subscriptions query fails (routes.ts:436)
   - Add log for successful Stripe customer creation
   - Consider adding Sentry error tracking for production

### Validation

1. **Manual Testing on Staging**:
   - Deploy changes to staging environment
   - Login to https://develop.kotadb.io
   - Navigate to /pricing page
   - Click "Upgrade to Solo"
   - **Expected**: Redirect to Stripe Checkout URL (checkout.stripe.com)
   - Complete test payment with Stripe test card (4242 4242 4242 4242)
   - Verify redirect back to success URL
   - Check subscriptions table has new row with stripe_customer_id and stripe_subscription_id

2. **Error Case Testing**:
   - Test without authentication (logout first): Should redirect to /login
   - Test with invalid Stripe config (temporarily unset env var): Should show error toast
   - Test network failure (throttle network): Should show error toast with retry option

3. **Integration Test Suite**:
   - Run `cd app && bun test --filter checkout`
   - Verify all 5+ test cases pass
   - Confirm tests hit real Supabase Local (not mocks)

4. **Price Consistency Check**:
   - Verify UI prices match Stripe configuration
   - Test that correct price ID is passed to Stripe API
   - Confirm Stripe Checkout shows expected amount before payment

## Step by Step Tasks

### Database Setup
1. Connect to staging Supabase project via CLI
2. Run `bunx supabase db push` to apply subscriptions migration
3. Verify table creation with `bunx supabase db remote status`
4. Use Supabase MCP list_tables to confirm subscriptions table exists

### Frontend Authentication Fix
1. Open `web/app/pricing/page.tsx`
2. Update useAuth destructuring to include session (line 8)
3. Add Authorization header to fetch request (line 22-24)
4. Add defensive check for missing session.access_token
5. Run `cd web && bun run lint` to verify no type errors

### Frontend Error Handling
1. Create or import Toast component in web/components
2. Add error state to PricingPage component
3. Update handleUpgrade catch blocks to set error state
4. Render Toast component with error message
5. Add retry mechanism for failed requests

### Price Resolution
1. Discuss with stakeholders: update UI or update Stripe?
2. If updating UI: Change price strings in tier definitions (lines 68, 84)
3. If updating Stripe: Use Stripe MCP to create new prices at $20/$100
4. Update environment variables if new price IDs created
5. Commit decision to issue comment for audit trail

### Integration Testing
1. Create `app/src/api/__tests__/checkout-session.integration.test.ts`
2. Write test case: authenticated user creates checkout session successfully
3. Write test case: unauthenticated user receives 401
4. Write test case: missing Stripe config returns 500 error
5. Write test case: invalid tier value returns 400 error
6. Run tests: `cd app && bun test --filter checkout`
7. Verify all tests pass with real Supabase connection

### End-to-End Validation
1. Deploy frontend and backend changes to staging
2. Verify environment variables deployed correctly
3. Test complete checkout flow: login → pricing → checkout → payment → return
4. Test error cases: logout → try upgrade → verify redirect to login
5. Check browser console for any remaining console.error logs
6. Verify Stripe dashboard shows test customer and subscription

### Documentation and Cleanup
1. Update CHANGELOG.md with bug fix entry
2. Add code comment explaining Authorization header requirement
3. Document price resolution decision in issue comment
4. Remove any debugging logs added during investigation
5. Run full validation suite (see Validation Commands section)

### Push and PR Creation
1. Stage all changes: `git add .`
2. Commit with message: `fix: add authentication to checkout session endpoint (#320)`
3. Push branch: `git push -u origin bug/320-payment-links-not-redirecting`
4. Create PR with gh CLI or GitHub UI
5. Link PR to issue #320 in PR description

## Regression Risks

### Adjacent Features to Watch

1. **Subscription Status Fetching** (`/api/subscriptions/current`):
   - Already uses Authorization header correctly (AuthContext.tsx:52-56)
   - Low risk: no changes to this endpoint
   - Verify: After checkout, dashboard shows correct subscription tier

2. **Billing Portal Access** (`/api/subscriptions/create-portal-session`):
   - Also requires authentication via same middleware
   - Medium risk: If checkout creates malformed subscription record, portal may fail
   - Mitigation: Integration test validates subscription record structure

3. **Rate Limiting**:
   - Authentication middleware affects rate limit identification
   - Low risk: Rate limits keyed by user_id from auth context
   - Verify: X-RateLimit-* headers still present in responses

4. **Other OAuth Endpoints** (GitHub OAuth, key generation):
   - Share same authentication middleware
   - Low risk: No changes to middleware logic
   - Verify: Login flow still works after deployment

### Follow-up Work if Risk Materializes

1. **If Checkout Works But Webhooks Fail**:
   - Issue #223 mentions webhook integration is incomplete
   - Subscriptions may create successfully but not update on payment events
   - Follow-up: Implement Stripe webhook handlers for subscription.updated events

2. **If Price Mismatch Causes Confusion**:
   - Even after technical fix, users may question pricing discrepancy
   - Follow-up: Update marketing materials, documentation, FAQ
   - Consider adding "Prices subject to change" disclaimer

3. **If Subscriptions Table Missing in Production**:
   - If production also missing subscriptions table, migration needed there too
   - Follow-up: Coordinate production migration deployment window
   - Mitigation: Test migration on staging first, verify no data loss

4. **If Error Handling Insufficient**:
   - Users may encounter edge cases not covered by generic error messages
   - Follow-up: Add Sentry integration for client-side error tracking
   - Add specific error codes (AUTH_REQUIRED, STRIPE_CONFIG_ERROR, etc.)

## Validation Commands

```bash
# Type checking
cd app && bunx tsc --noEmit
cd web && bunx tsc --noEmit

# Linting
cd app && bun run lint
cd web && bun run lint

# Unit and integration tests
cd app && bun test

# Focused checkout tests
cd app && bun test --filter checkout

# Build verification
cd app && bun run build
cd web && bun run build

# Database migration validation
cd app && bun run test:validate-migrations

# Manual staging test
# 1. Deploy to staging
# 2. Navigate to https://develop.kotadb.io/pricing
# 3. Login with test account
# 4. Click "Upgrade to Solo"
# 5. Verify redirect to checkout.stripe.com
# 6. Complete payment with test card 4242424242424242
# 7. Verify return to success URL
# 8. Check dashboard shows "Solo" tier

# Stripe API validation via MCP
# (Run in Claude Code with Stripe MCP enabled)
# - mcp__stripe__list_customers → Should show test customer after checkout
# - mcp__stripe__list_payment_intents → Should show successful payment intent
# - mcp__stripe__list_subscriptions → Should show active subscription

# Supabase validation via MCP
# (Run in Claude Code with Supabase MCP enabled)
# - mcp__supabase__list_tables → Confirm subscriptions table exists
# - mcp__supabase__execute_sql → Query subscriptions table for test user
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix: add authentication to checkout endpoint` not `Looking at the changes, this commit fixes the checkout endpoint`

Example good commit messages:
```
fix(api): add authentication header to checkout session request
test(api): add integration tests for checkout session endpoint
fix(ui): update pricing tier amounts to match Stripe configuration
docs(bug-320): document price resolution decision
```

Example bad commit messages (do NOT use):
```
fix: based on the issue, this commit should fix the checkout
fix: looking at the changes, the payment flow is now working
fix: here is the fix for the authentication bug
fix: this commit adds auth headers to the request
```
