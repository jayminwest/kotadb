# Feature Plan: Stripe Webhook Handlers for Subscription Lifecycle

## Overview

**Problem**: Payment flow works end-to-end (users can purchase subscriptions via Stripe Checkout), but subscription status does not update in the dashboard after payment completion. When users upgrade to Solo or Team tier, they successfully pay via Stripe, but the database never receives notification of subscription status changes, leaving the dashboard showing "You are on the free tier."

**Root Cause**: Webhook handlers for Stripe subscription lifecycle events are partially implemented (app/src/api/webhooks.ts:1-299) but not registered as HTTP endpoints in the Express routing layer (app/src/api/routes.ts).

**Desired Outcome**: Complete webhook integration so that:
- Stripe subscription events (`invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`) trigger database updates
- Dashboard immediately reflects correct subscription tier after payment
- Subscription cancellations automatically downgrade users to free tier
- Rate limits update to match new subscription tier

**Non-goals**:
- Email notifications for subscription events (future enhancement)
- Billing portal integration (separate feature)
- Pro-rated upgrades (separate feature)
- Team seat management (separate feature)

## Technical Approach

### Architecture Notes

The webhook handler functions already exist in app/src/api/webhooks.ts and follow the same pattern as GitHub webhook handlers (app/src/github/webhook-handler.ts). The implementation follows KotaDB's antimocking philosophy by using Stripe Test Mode for all testing rather than creating mock infrastructure.

**Key Pattern**: The Express routing layer (app/src/api/routes.ts:56-119) already demonstrates the webhook registration pattern with GitHub webhooks:
1. Register BEFORE express.json() middleware using express.raw() to preserve raw body for HMAC verification
2. Verify webhook signature using timing-safe comparison
3. Parse JSON after signature verification
4. Process events asynchronously with .catch() error handling
5. Return 200 OK immediately to acknowledge receipt

### Key Modules to Touch

**Primary Files**:
- app/src/api/routes.ts:120 - Add POST /webhooks/stripe endpoint registration following GitHub webhook pattern
- app/src/api/webhooks.ts:34-53 - Webhook signature verification (already implemented)
- app/src/api/webhooks.ts:56-143 - handleInvoicePaid (already implemented)
- app/src/api/webhooks.ts:146-221 - handleSubscriptionUpdated (already implemented)
- app/src/api/webhooks.ts:224-277 - handleSubscriptionDeleted (already implemented)

**Supporting Files**:
- app/src/api/stripe.ts:20-36 - Stripe client singleton (already implemented)
- app/src/db/migrations/20241023000001_subscriptions.sql:1-48 - Subscriptions table schema (already exists)

### Data/API Impacts

**Database Changes**: None required. The subscriptions table already exists with all required fields (app/src/db/migrations/20241023000001_subscriptions.sql:10-25).

**API Surface**: New public endpoint POST /webhooks/stripe that:
- Accepts requests from Stripe webhook delivery system
- Validates requests via HMAC-SHA256 signature verification
- Updates subscriptions and api_keys tables based on event type
- Returns 200 OK for valid signatures, 400/401 for invalid requests

**Environment Variables**:
- STRIPE_WEBHOOK_SECRET (already configured in preview environment per issue comment)
- STRIPE_SECRET_KEY (already configured)
- STRIPE_SOLO_PRICE_ID (already configured)
- STRIPE_TEAM_PRICE_ID (already configured)

## Relevant Files

### Existing Implementation
- app/src/api/webhooks.ts - Stripe webhook event handlers (verifyWebhookSignature, handleInvoicePaid, handleSubscriptionUpdated, handleSubscriptionDeleted)
- app/src/api/stripe.ts - Stripe client initialization and price ID configuration
- app/src/github/webhook-handler.ts - GitHub webhook pattern (signature verification, payload parsing, structured logging)
- app/tests/api/webhooks.test.ts - GitHub webhook test patterns (real Express server, signature generation, async event processing)
- app/src/api/routes.ts - Express routing layer where webhook endpoints are registered
- app/src/db/migrations/20241023000001_subscriptions.sql - Subscriptions table schema

### New Files
- app/tests/api/stripe-webhooks.test.ts - Integration tests for Stripe webhook endpoint using real Stripe Test Mode

## Task Breakdown

### Phase 1: Endpoint Registration
- Read app/src/api/routes.ts:56-119 to understand GitHub webhook registration pattern
- Add POST /webhooks/stripe endpoint registration after line 119, before express.json() middleware registration at line 122
- Import Stripe webhook handlers from app/src/api/webhooks.ts (verifyWebhookSignature, handleInvoicePaid, handleSubscriptionUpdated, handleSubscriptionDeleted)
- Follow exact pattern from GitHub webhook: express.raw() middleware, signature verification, JSON parsing after verification, async event processing

### Phase 2: Integration Testing
- Create app/tests/api/stripe-webhooks.test.ts following pattern from app/tests/api/webhooks.test.ts
- Test signature verification (valid signature returns 200, invalid returns 401, missing signature returns 401)
- Test event routing (invoice.paid calls handleInvoicePaid, customer.subscription.updated calls handleSubscriptionUpdated, customer.subscription.deleted calls handleSubscriptionDeleted)
- Test subscription lifecycle: create test Stripe customer/subscription in beforeAll, trigger events via real Stripe Test Mode, verify database state changes using waitForCondition helper
- Test idempotency: duplicate webhook events don't cause data corruption
- Test error handling: database errors don't cause webhook retries for unrecoverable failures

### Phase 3: Validation & Documentation
- Run bun run lint to verify code style
- Run bun run typecheck to verify TypeScript types
- Run bun test --filter integration to execute Stripe webhook tests
- Run bun test to execute full test suite
- Run bun run build to verify production build
- Update app/.env.example to document STRIPE_WEBHOOK_SECRET requirement
- Update .claude/commands/app/environment.md to document Stripe webhook configuration

## Step by Step Tasks

### Endpoint Registration Tasks
1. Read app/src/api/routes.ts lines 56-119 to review GitHub webhook registration pattern
2. Import Stripe webhook handlers at top of app/src/api/routes.ts: import { verifyWebhookSignature as verifyStripeSignature, handleInvoicePaid, handleSubscriptionUpdated, handleSubscriptionDeleted } from "@api/webhooks"
3. Register POST /webhooks/stripe endpoint after line 119, using express.raw({ type: "application/json" }) middleware
4. Implement signature verification using STRIPE_WEBHOOK_SECRET environment variable and verifyStripeSignature function
5. Parse JSON body after signature verification succeeds
6. Route events to handlers based on event.type: invoice.paid -> handleInvoicePaid, customer.subscription.updated -> handleSubscriptionUpdated, customer.subscription.deleted -> handleSubscriptionDeleted
7. Process events asynchronously with .catch() error handling to avoid blocking webhook response
8. Return 200 OK immediately after signature verification for valid webhooks

### Testing Tasks
9. Create app/tests/api/stripe-webhooks.test.ts with describe block for "POST /webhooks/stripe - Integration"
10. Set up beforeAll hook to initialize real Stripe client using test credentials (process.env.STRIPE_SECRET_KEY)
11. Create real Express server on random port for test isolation
12. Implement generateStripeSignature helper using stripe.webhooks.constructEvent pattern
13. Test valid signature: create real test invoice.paid event payload, generate valid signature, send to endpoint, expect 200 response
14. Test invalid signature: send event with wrong signature, expect 401 response
15. Test missing signature: send event without signature header, expect 401 response
16. Test missing webhook secret: temporarily unset STRIPE_WEBHOOK_SECRET, send event, expect 500 response, restore secret
17. Test subscription lifecycle: create real Stripe customer and subscription in beforeAll, trigger invoice.paid event, use waitForCondition to verify subscription record created with status=active and correct tier
18. Test subscription update: trigger customer.subscription.updated with status=past_due, verify database updates subscription status and maintains tier
19. Test subscription cancellation: trigger customer.subscription.deleted, verify database sets status=canceled and downgrades api_keys.tier to free
20. Test idempotency: trigger same event twice with different delivery IDs, verify only one database update occurs
21. Clean up test resources in afterAll: delete Stripe customer/subscription, delete database records, close server

### Validation Tasks
22. Execute bun run lint and fix any linting errors in app/src/api/routes.ts or app/tests/api/stripe-webhooks.test.ts
23. Execute bun run typecheck and fix any type errors
24. Execute bun test --filter integration to run Stripe webhook integration tests, verify all tests pass
25. Execute bun test to run full test suite including unit and integration tests, verify no regressions
26. Execute bun run build to verify production build succeeds without errors
27. Update app/.env.example to add STRIPE_WEBHOOK_SECRET with documentation comment
28. Update .claude/commands/app/environment.md to document STRIPE_WEBHOOK_SECRET configuration requirement and link to Stripe Dashboard webhook setup
29. Validate that webhook endpoint works with local Stripe CLI: start dev server, run stripe listen --forward-to localhost:3000/webhooks/stripe, trigger test events, verify logs show successful processing
30. Push branch to origin: git push -u origin feat/332-stripe-webhook-handlers

## Risks & Mitigations

**Risk**: Webhook signature verification bypass attempt
**Mitigation**: Always verify signatures using stripe.webhooks.constructEvent before processing events. Never process events without valid signature. Log all verification failures for security monitoring. Implementation already exists in app/src/api/webhooks.ts:34-53 using timing-safe comparison.

**Risk**: Race conditions with concurrent webhook events (e.g., subscription.updated and invoice.paid arriving simultaneously)
**Mitigation**: Use database-level constraints (UNIQUE index on subscriptions.user_id from app/src/db/migrations/20241023000001_subscriptions.sql:31) and upsert operations with onConflict to handle concurrent updates safely. Test concurrent event processing in integration tests.

**Risk**: Webhook event delivery failures (network issues, API downtime)
**Mitigation**: Stripe automatically retries failed webhooks with exponential backoff. Implement idempotency by checking existing database state before updates. Return 200 OK for successfully processed events to prevent unnecessary retries. Log all processing errors for manual investigation.

**Risk**: Tier downgrade during active API usage
**Mitigation**: Implementation already handles graceful tier transitions in app/src/api/webhooks.ts:266-274. API key tier updates are atomic. Rate limit changes take effect on next request. No active requests are terminated.

**Risk**: Test flakiness due to async webhook processing
**Mitigation**: Use waitForCondition helper (app/tests/helpers/async-assertions.ts) with appropriate timeout (3000ms) and polling interval (50ms) to handle async database visibility. Pattern demonstrated in app/tests/api/webhooks.test.ts:343-356.

**Risk**: Missing user_id in webhook event metadata
**Mitigation**: Handler already implements fallback chain (app/src/api/webhooks.ts:83-93): check subscription.metadata.user_id first, then customer.metadata.user_id. Log and skip events with no user_id to avoid Stripe retry loops. Return 200 OK to acknowledge receipt even for skipped events.

## Validation Strategy

### Automated Tests
All tests use real Stripe Test Mode (sk_test_* credentials) and real Supabase Local database per KotaDB antimocking philosophy (.claude/commands/docs/anti-mock.md). No mocking infrastructure required.

**Integration Tests** (app/tests/api/stripe-webhooks.test.ts):
- Signature verification: valid signature returns 200, invalid returns 401, missing returns 401, missing secret returns 500
- Event routing: each event type (invoice.paid, customer.subscription.updated, customer.subscription.deleted) routes to correct handler function
- Subscription lifecycle: create real Stripe subscription, trigger events, verify database state changes using real Supabase connection
- Idempotency: duplicate events with same subscription ID don't cause duplicate database records or incorrect state
- Race conditions: concurrent events for same subscription update database safely without conflicts
- Error handling: database errors logged but don't cause Stripe webhook retries for unrecoverable failures

**Test Environment**:
- Stripe Test Mode credentials already configured in preview environment (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_SOLO_PRICE_ID, STRIPE_TEAM_PRICE_ID per issue comment)
- Tests create real Stripe customers/subscriptions in beforeAll hooks
- Tests clean up resources in afterAll hooks to prevent test pollution
- Real Express server started on random port for test isolation
- Real Supabase Local connection for database operations

### Manual Checks
**Local Development Flow**:
1. Start Supabase Local: cd app && bun test:setup
2. Start API server: cd app && bun run dev (listens on port 3000)
3. Start Stripe CLI webhook forwarding: stripe listen --forward-to localhost:3000/webhooks/stripe (copy webhook signing secret to app/.env as STRIPE_WEBHOOK_SECRET)
4. Trigger test events: stripe trigger invoice.paid, stripe trigger customer.subscription.updated, stripe trigger customer.subscription.deleted
5. Verify logs show successful processing: grep "Subscription .* activated" in server output
6. Query database to verify state: psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT * FROM subscriptions ORDER BY updated_at DESC LIMIT 1;"
7. Verify dashboard shows correct tier (requires web app running and authenticated session)

**Production Setup** (documented in issue body):
1. Login to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Set endpoint URL: https://api.kotadb.com/webhooks/stripe
4. Select events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed
5. Copy webhook signing secret to STRIPE_WEBHOOK_SECRET environment variable in production deployment
6. Test webhook delivery using "Send test webhook" in Stripe Dashboard
7. Monitor webhook delivery logs in Stripe Dashboard for failures
8. Monitor API server logs for processing errors

### Release Guardrails
**Monitoring**:
- All webhook events logged with structured metadata (timestamp, event type, subscription ID, user ID) via process.stdout.write per .claude/commands/testing/logging-standards.md
- Signature verification failures logged to stderr for security monitoring
- Database errors logged to stderr with full error messages for debugging
- Webhook processing latency measured via timestamp diff between event creation and database update

**Alerting**:
- Alert on webhook signature verification failure rate > 5% over 5 minutes (potential security issue or misconfiguration)
- Alert on webhook processing error rate > 10% over 5 minutes (potential database or Stripe API issue)
- Alert on subscription sync lag > 60 seconds (webhook delivery delays or processing bottleneck)

**Rollback**:
- If webhook endpoint causes errors: remove endpoint URL from Stripe Dashboard to pause event delivery
- If database corruption detected: restore subscriptions table from backup, manually reconcile state from Stripe API using stripe.subscriptions.list
- If rate limiting breaks: manually update api_keys.tier in database to restore service while investigating webhook issue
- No code deployment required for emergency rollback: webhook endpoint can be disabled via Stripe Dashboard configuration

**Real-Service Evidence**:
- Integration tests create real Stripe subscriptions using Test Mode API (proof: test logs show Stripe API request/response)
- Tests verify database updates using real Supabase Local connection (proof: query results in test assertions)
- Manual testing uses Stripe CLI to forward real webhook events to local server (proof: Stripe CLI output shows event delivery and signature verification)
- Production monitoring tracks Stripe webhook delivery success rate via Stripe Dashboard metrics (proof: dashboard shows delivery attempts, response codes, retry counts)

## Validation Commands

Level 2 validation (minimum required for features):
- bun run lint
- bun run typecheck
- bun test --filter integration
- bun test
- bun run build

Domain-specific validation:
- bun test app/tests/api/stripe-webhooks.test.ts - Run Stripe webhook tests only
- stripe listen --forward-to localhost:3000/webhooks/stripe - Forward webhooks to local server for manual testing
- stripe trigger invoice.paid - Trigger test invoice.paid event
- stripe trigger customer.subscription.updated - Trigger test subscription update event
- stripe trigger customer.subscription.deleted - Trigger test subscription deletion event

Database validation:
- psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT * FROM subscriptions WHERE status = 'active' ORDER BY updated_at DESC LIMIT 5;" - Verify active subscriptions
- psql -h localhost -p 54322 -U postgres -d postgres -c "SELECT s.tier, s.status, k.tier AS api_key_tier FROM subscriptions s JOIN api_keys k ON s.user_id = k.user_id ORDER BY s.updated_at DESC LIMIT 5;" - Verify subscription/API key tier consistency

## Issue Relationships

**Depends On**:
- PR #276 (Stripe infrastructure) - Subscription checkout and database schema already implemented
- Issue #223 (Stripe payment infrastructure) - Parent issue documenting webhook integration gap

**Related To**:
- Issue #320 (Payment links not redirecting) - Fixed in PR #323, enabling webhook work to proceed
- Issue #327 (Middleware JWT validation) - Fixed in PR #330, ensures webhook endpoint has proper auth context for logging

**Blocks**:
- User subscription tier visibility in dashboard (immediate user-facing impact)
- Accurate rate limiting based on subscription tier (API functionality)
- Subscription cancellation flow (business requirement)

## Follow-Up Work

**User Notifications** (separate feature):
- Send email when subscription created (welcome email with tier details)
- Send email when subscription canceled (confirmation with downgrade timeline)
- Send email when payment fails (retry instructions and support contact)
- Implementation requires email service integration (Postmark, SendGrid, or Resend)

**Billing Portal** (separate feature):
- Add "Manage Billing" button to dashboard
- Link to Stripe Customer Portal for self-service subscription management
- Users can update payment method, view invoices, cancel subscription
- Requires stripe.billingPortal.sessions.create API integration

**Subscription Analytics** (separate feature):
- Track MRR (Monthly Recurring Revenue) over time
- Calculate churn rate (canceled subscriptions / total subscriptions)
- Measure upgrade/downgrade conversion rates
- Requires analytics table and aggregation queries

**Pro-rated Upgrades** (separate feature):
- Handle mid-cycle tier changes with pro-ration
- Calculate pro-rated credit when downgrading
- Apply immediate pro-rated charge when upgrading
- Requires Stripe proration_behavior configuration

**Team Seat Management** (separate feature):
- Track per-seat billing for team tier
- Allow team admins to add/remove seats
- Sync seat count with Stripe subscription quantity
- Requires team membership table and seat tracking logic
