# Bug Plan: Subscription tier not updating after Stripe payment completion

## Bug Summary
**Observed Behavior:**
- User completes Stripe checkout flow successfully
- Payment processes and redirect occurs to dashboard
- Dashboard continues to show "You are on the free tier"
- API keys remain at free tier with free rate limits
- Subscription status not synchronized from Stripe to database

**Expected Behavior:**
- After successful payment, user's tier updates immediately to paid tier (solo/team)
- Dashboard displays current subscription status and tier
- API keys reflect new tier with appropriate rate limits
- Updates persist across page refreshes

**Suspected Scope:**
- Missing webhook handler for `checkout.session.completed` event
- Current implementation only handles `invoice.paid`, `customer.subscription.updated`, and `customer.subscription.deleted`
- Checkout completion event arrives before invoice.paid but is not processed

## Root Cause Hypothesis
The webhook handlers in `app/src/api/webhooks.ts` (lines 61-298) do **NOT** handle the `checkout.session.completed` event. This event is the first event Stripe sends after successful payment and contains the subscription ID needed to create the initial subscription record.

**Leading Theory:**
Stripe payment flow sends events in this order:
1. `checkout.session.completed` (MISSING HANDLER) - Contains subscription ID and customer metadata
2. `invoice.paid` (handled) - Invoice payment confirmation
3. `customer.subscription.created` - Subscription creation confirmation

The current webhook route (`app/src/api/routes.ts:170-230`) only handles:
- `invoice.paid` (line 208-213)
- `customer.subscription.updated` (line 214-220)
- `customer.subscription.deleted` (line 221-227)

Because `checkout.session.completed` is not handled, the initial subscription record is never created, leaving users on the free tier despite successful payment.

**Supporting Evidence:**
1. Issue description confirms payment succeeds (✅) but tier doesn't update (❌)
2. Checkout session creation includes `subscription_data.metadata.user_id` (routes.ts:656) - proving metadata is available
3. Existing `invoice.paid` handler (webhooks.ts:61-143) expects subscription to exist or creates it, but may arrive after user checks dashboard
4. Database schema supports unique constraint on `user_id` (subscriptions table) - designed for upsert pattern

## Fix Strategy

### Code Changes
1. **Add `handleCheckoutSessionCompleted` handler** in `app/src/api/webhooks.ts`
   - Extract `customer`, `subscription`, and `metadata.user_id` from checkout session
   - Retrieve full subscription details from Stripe API to get price ID
   - Determine tier from price ID using existing `getTierFromPriceId` helper
   - Upsert subscription record in database (idempotent via `onConflict: "user_id"`)
   - Update all API keys for user to new tier
   - Log success/errors to stdout/stderr

2. **Wire up event handler** in `app/src/api/routes.ts`
   - Import `handleCheckoutSessionCompleted` (line 32-37)
   - Add event routing for `checkout.session.completed` (before line 208)
   - Invoke handler asynchronously with error logging

3. **Add integration tests** in `app/tests/api/stripe-webhooks.test.ts`
   - Test checkout session completion creates subscription
   - Test API key tier updates immediately
   - Test idempotency (duplicate events don't corrupt data)
   - Test missing user_id in metadata logs error without retry loop

### Data/Config Updates
None required - all necessary environment variables already configured:
- `STRIPE_WEBHOOK_SECRET` (webhook signature validation)
- `STRIPE_SOLO_PRICE_ID` (tier mapping)
- `STRIPE_TEAM_PRICE_ID` (tier mapping)

### Guardrails
1. **Idempotency**: Upsert pattern with `onConflict: "user_id"` prevents duplicate subscriptions
2. **Error Handling**: Missing user_id logs error and returns success (no retry loop)
3. **Race Conditions**: Both `checkout.session.completed` and `invoice.paid` use upsert - last write wins
4. **Backward Compatibility**: New handler is additive - existing `invoice.paid` continues as fallback

## Relevant Files

### Modified Files
- `app/src/api/webhooks.ts` — Add `handleCheckoutSessionCompleted` function after line 143
- `app/src/api/routes.ts:32-37` — Import new webhook handler
- `app/src/api/routes.ts:207-230` — Wire up `checkout.session.completed` event routing

### Test Files
- `app/tests/api/stripe-webhooks.test.ts` — Add checkout session completion tests (existing file)

### New Files
None - all changes are modifications to existing files

## Task Breakdown

### Verification
**Steps to reproduce current failure:**
1. Start local backend: `cd app && ./scripts/dev-start.sh`
2. Start Stripe webhook forwarding: `stripe listen --forward-to localhost:3000/webhooks/stripe`
3. Trigger test checkout: `stripe trigger checkout.session.completed`
4. Check backend logs - no handler output for checkout.session.completed event
5. Query database: `SELECT tier FROM api_keys WHERE user_id = '<test-user-id>'` - returns "free"
6. Expected: "solo" tier after checkout completion

**Logs/Metrics to Capture:**
- Stripe webhook event type and ID (already logged at routes.ts:203-205)
- Handler processing output (will add stdout logging)
- Database query errors (already logged via stderr)
- Missing user_id warnings (already handled in other handlers)

### Implementation
1. **Add `handleCheckoutSessionCompleted` to `app/src/api/webhooks.ts`** (after line 143)
   - Function signature: `async function handleCheckoutSessionCompleted(event: Stripe.CheckoutSessionCompletedEvent): Promise<void>`
   - Extract session from `event.data.object`
   - Extract `customerId` and `subscriptionId` from session (handle string | object union types)
   - Early return if missing subscription/customer ID (log to stderr)
   - Retrieve full subscription: `await stripe.subscriptions.retrieve(subscriptionId)`
   - Retrieve customer metadata: `await stripe.customers.retrieve(customerId)`
   - Extract `userId` from subscription metadata OR customer metadata (fallback)
   - Early return if missing user_id (log to stderr, return success to avoid retry)
   - Determine tier: `const tier = getTierFromPriceId(subscription.items.data[0]?.price.id)`
   - Upsert subscription record with all fields from subscription object
   - Update API keys tier: `UPDATE api_keys SET tier = $1 WHERE user_id = $2`
   - Log success to stdout

2. **Import handler in `app/src/api/routes.ts`** (line 32-37)
   - Add `handleCheckoutSessionCompleted` to existing import statement
   - Verify import uses `@api/webhooks` path alias

3. **Wire up event routing in `app/src/api/routes.ts`** (before line 208)
   - Add conditional: `if (event.type === "checkout.session.completed")`
   - Invoke handler asynchronously: `handleCheckoutSessionCompleted(event as Stripe.CheckoutSessionCompletedEvent).catch(error => { ... })`
   - Log errors to stderr with event type prefix
   - Place BEFORE existing `invoice.paid` handler to prioritize checkout completion

4. **Run type check** to verify Stripe types
   - Execute: `cd app && bunx tsc --noEmit`
   - Verify no TypeScript errors for Stripe event types

### Validation
**Tests to Add (integration/e2e hitting Supabase per anti-mock):**

1. **Test: Checkout session completed creates subscription**
   - Create test user and API key in database
   - Create Stripe customer with `metadata.user_id`
   - Create checkout session with subscription
   - Trigger `checkout.session.completed` webhook via Stripe CLI
   - Wait for webhook processing (use `waitForCondition` helper)
   - Query database: verify subscription record exists with correct tier
   - Query database: verify API key tier updated to solo/team
   - Verify subscription fields match Stripe data (status, period dates, etc.)

2. **Test: Idempotency - duplicate events don't corrupt data**
   - Get initial subscription count for user
   - Trigger `checkout.session.completed` twice with same session ID
   - Wait for both webhooks to process
   - Verify subscription count unchanged (no duplicates)
   - Verify subscription data is consistent

3. **Test: Missing user_id in metadata**
   - Create checkout session WITHOUT user_id in metadata
   - Trigger `checkout.session.completed` webhook
   - Verify handler logs error to stderr
   - Verify no subscription created in database
   - Verify webhook returns 200 OK (no retry loop)

4. **Test: Race condition - concurrent checkout and invoice.paid**
   - Trigger both `checkout.session.completed` and `invoice.paid` simultaneously
   - Wait for both webhooks to process
   - Verify single subscription record exists
   - Verify tier is correct (either handler succeeds)

**Manual Checks:**
1. **Stripe CLI webhook forwarding test**
   ```bash
   # Terminal 1: Start backend
   cd app && ./scripts/dev-start.sh

   # Terminal 2: Forward webhooks
   stripe listen --forward-to localhost:3000/webhooks/stripe

   # Terminal 3: Trigger event
   stripe trigger checkout.session.completed
   ```
   - Verify backend logs show: "Subscription <id> created for user <id> (tier: solo)"
   - Verify database query: `SELECT tier FROM subscriptions WHERE user_id = '<id>'` returns "solo"
   - Verify API key query: `SELECT tier FROM api_keys WHERE user_id = '<id>'` returns "solo"

2. **E2E payment flow test**
   - Start frontend: `cd web && bun run dev`
   - Start backend: `cd app && ./scripts/dev-start.sh`
   - Log in via GitHub OAuth
   - Navigate to /pricing
   - Click "Upgrade to Solo" ($20/month)
   - Complete checkout with test card `4242 4242 4242 4242`
   - Verify redirect to /dashboard?upgrade=success
   - **CRITICAL**: Dashboard shows "You are on the solo tier" (not "free tier")
   - Verify API key metadata shows tier="solo" and rate_limit=1000/hr
   - Refresh page and verify tier persists

## Step by Step Tasks

### Phase 1: Implement Handler
1. Open `app/src/api/webhooks.ts`
2. Add `handleCheckoutSessionCompleted` function after line 143 (before `handleSubscriptionUpdated`)
3. Copy structure from `handleInvoicePaid` as template
4. Extract session, customerId, subscriptionId from event
5. Add early returns for missing subscription/customer ID (log to stderr)
6. Retrieve full subscription details via `stripe.subscriptions.retrieve()`
7. Retrieve customer metadata via `stripe.customers.retrieve()`
8. Extract userId from subscription metadata OR customer metadata (fallback)
9. Add early return for missing user_id (log error, return success to avoid retry)
10. Determine tier using `getTierFromPriceId(subscription.items.data[0]?.price.id)`
11. Upsert subscription record with all fields (use pattern from `handleInvoicePaid`)
12. Update API keys tier for all keys: `UPDATE api_keys SET tier WHERE user_id`
13. Log success to stdout with subscription ID, user ID, and tier
14. Verify error handling throws on database errors (propagates to async error handler)

### Phase 2: Wire Up Event Route
1. Open `app/src/api/routes.ts`
2. Add `handleCheckoutSessionCompleted` to import statement (line 32-37)
3. Navigate to webhook event routing (line 207)
4. Add `if (event.type === "checkout.session.completed")` condition BEFORE `invoice.paid` check
5. Call handler asynchronously: `handleCheckoutSessionCompleted(event as Stripe.CheckoutSessionCompletedEvent)`
6. Add `.catch()` error handler that logs to stderr with event type prefix
7. Verify async pattern matches existing handlers (don't block webhook response)
8. Run type check: `cd app && bunx tsc --noEmit`
9. Fix any TypeScript errors

### Phase 3: Add Integration Tests
1. Open `app/tests/api/stripe-webhooks.test.ts`
2. Add test: "handles checkout.session.completed webhook via Stripe CLI"
   - Create test customer with user_id metadata
   - Create test checkout session
   - Wait for webhook delivery using `waitForCondition` (timeout: 10s)
   - Query subscription record from database
   - Assert subscription exists with correct stripe_subscription_id
   - Assert tier matches expected value (solo/team)
   - Assert API key tier updated
3. Add test: "processes checkout webhooks idempotently (no duplicate records)"
   - Get initial subscription count
   - Trigger duplicate checkout.session.completed events
   - Wait for processing
   - Assert subscription count unchanged
4. Add test: "handles missing user_id in checkout metadata"
   - Create checkout session without user_id metadata
   - Trigger webhook
   - Assert no subscription created
   - Assert handler returns success (no retry loop)
5. Run integration tests: `cd app && bun test --filter integration`

### Phase 4: Manual Validation
1. Start local development environment: `cd app && ./scripts/dev-start.sh`
2. Start Stripe CLI forwarding: `stripe listen --forward-to localhost:3000/webhooks/stripe`
3. Create test user and API key in database (or use existing test user)
4. Trigger checkout session: `stripe trigger checkout.session.completed`
5. Verify backend logs show handler output
6. Query database to verify subscription created and API key tier updated
7. Test E2E flow with real checkout (use Stripe test card)
8. Verify dashboard updates immediately after payment
9. Test duplicate webhook delivery (retry scenario)
10. Verify idempotency (no duplicate subscriptions)

### Phase 5: Final Validation and Commit
1. Run all tests: `cd app && bun test`
2. Run linter: `cd app && bun run lint`
3. Run type checker: `cd app && bun run typecheck`
4. Run build: `cd app && bun run build`
5. Review changes with `git diff`
6. Stage changes: `git add app/src/api/webhooks.ts app/src/api/routes.ts app/tests/api/stripe-webhooks.test.ts`
7. Commit with message: `fix: handle checkout.session.completed webhook to update subscription tier (#398)`
8. Push branch: `git push -u origin bug/398-stripe-checkout-tier-update`

## Regression Risks

### Risk: Breaking existing webhook processing
**Impact:** Existing subscription lifecycle events (invoice.paid, subscription.updated, subscription.deleted) might stop working

**Likelihood:** Low - new handler is additive and doesn't modify existing code paths

**Mitigation:**
- Run full test suite before commit
- Verify existing webhook tests still pass
- Test all three existing webhook events manually with Stripe CLI

**Follow-up Work:** None required - existing handlers remain unchanged

### Risk: Race condition between checkout.session.completed and invoice.paid
**Impact:** Both events might try to create subscription record simultaneously, potentially causing conflicts

**Likelihood:** Medium - Stripe sends multiple events in quick succession

**Mitigation:**
- Both handlers use `upsert` with `onConflict: "user_id"` (idempotent)
- Last write wins - both events should produce same result (tier update)
- Add integration test for concurrent event delivery

**Follow-up Work:** Monitor production logs for race condition errors (if any)

### Risk: Missing user_id in metadata causing retry loops
**Impact:** Webhooks without user_id could retry indefinitely, consuming resources

**Likelihood:** Very Low - checkout session creation includes `subscription_data.metadata.user_id` (routes.ts:656)

**Mitigation:**
- Handler logs error and returns success (no exception thrown)
- Stripe won't retry if webhook returns 200 OK
- Add test case for missing user_id scenario

**Follow-up Work:** Add monitoring alert for "no user_id" log messages

### Risk: Incorrect tier mapping from price ID
**Impact:** Users might get wrong tier (free instead of solo/team)

**Likelihood:** Very Low - existing `getTierFromPriceId` function already tested

**Mitigation:**
- Reuse existing `getTierFromPriceId` helper (webhooks.ts:285-298)
- Verify environment variables configured: `STRIPE_SOLO_PRICE_ID`, `STRIPE_TEAM_PRICE_ID`
- Add integration test to verify tier mapping

**Follow-up Work:** Add production monitoring for tier updates (log tier changes)

## Validation Commands

```bash
# Lint code
cd app && bun run lint

# Type check
cd app && bun run typecheck

# Run all tests
cd app && bun test

# Run integration tests only
cd app && bun test --filter integration

# Build application
cd app && bun run build

# Manual webhook testing with Stripe CLI
stripe listen --forward-to localhost:3000/webhooks/stripe
stripe trigger checkout.session.completed

# Database verification queries
psql $DATABASE_URL -c "SELECT * FROM subscriptions WHERE user_id = '<user-id>';"
psql $DATABASE_URL -c "SELECT tier FROM api_keys WHERE user_id = '<user-id>';"
```

**Level 3 Validation (High Impact - Blocks Production):**
- ✅ All unit and integration tests pass
- ✅ Manual E2E payment flow succeeds (test card → dashboard tier update)
- ✅ Stripe CLI webhook forwarding test succeeds
- ✅ Idempotency verified (duplicate events handled correctly)
- ✅ No TypeScript errors
- ✅ No linting errors
- ✅ Build succeeds
- ✅ Database queries confirm tier updates
- ✅ Existing webhook tests still pass (no regression)

## Commit Message Validation

All commits for this bug fix will be validated against Conventional Commits format.

**Valid commit message examples:**
```
fix: handle checkout.session.completed webhook to update subscription tier (#398)
fix(webhooks): add checkout session completed handler for tier updates (#398)
test: add integration tests for checkout session webhook (#398)
```

**AVOID meta-commentary patterns:**
- ❌ "Based on the issue, this commit fixes the subscription tier bug"
- ❌ "Looking at the webhook handlers, this commit adds checkout session support"
- ❌ "Here is the fix for the subscription tier update issue"
- ❌ "This commit should resolve the problem with tier updates"

**Use direct, imperative statements:**
- ✅ "fix: handle checkout.session.completed webhook to update subscription tier"
- ✅ "test: verify checkout webhook creates subscription and updates tier"
- ✅ "refactor: extract user_id metadata lookup to helper function"
