# Feature Plan: Stripe Subscription Payment Infrastructure with GitHub OAuth Web Frontend

## Overview

### Problem
KotaDB has well-defined subscription tiers (free, solo, team) with rate limits enforced in the backend, but lacks payment infrastructure to monetize paid tiers and lacks user authentication in the web application. Users cannot sign up, upgrade subscriptions, or manage billing without these critical components.

### Desired Outcome
- Users authenticate via GitHub OAuth (managed by Supabase Auth)
- Users can self-service upgrade from free to paid tiers via Stripe Checkout
- Subscription state synchronizes with API key tiers automatically via webhooks
- Web UI displays pricing, subscription status, and billing management
- Authenticated users access dashboard with API keys and subscription information

### Non-Goals
- Custom payment processing (delegated to Stripe)
- Per-seat billing for team tier (flat rate initially)
- Email verification for free tier (instant API key generation)
- Multi-provider OAuth (GitHub only for MVP)
- Mobile app authentication (web-only for now)

## Technical Approach

### Architecture Notes
This feature combines two tightly coupled subsystems that must coordinate from day 1:

**Authentication Layer (Issue #273)**:
- Supabase Auth SDK manages GitHub OAuth flow and session persistence
- AuthContext refactored from localStorage to Supabase session management
- Protected routes enforce authentication via Next.js middleware
- Session cookies use httpOnly and secure flags (managed by Supabase SDK)

**Payment Layer (Issue #223)**:
- Stripe SDK handles subscription creation, updates, and cancellations
- Webhook handlers synchronize subscription status with `api_keys.tier` column
- Database tracks subscription state in new `subscriptions` table
- AuthContext includes subscription data for UI conditional rendering

**Integration Points**:
- AuthContext must fetch subscription data via backend API on session load
- Dashboard displays subscription tier, status, and billing portal link
- Pricing page shows upgrade CTAs based on authenticated user's current tier
- API key tier automatically updates when webhook receives subscription events

### Key Modules to Touch

**Backend (app/src/)** - NEW ENDPOINTS:
- `db/migrations/002_subscriptions.sql` - New subscriptions table schema
- `api/routes.ts` - Add Stripe Checkout, portal, webhook endpoints
- `api/stripe.ts` - Stripe client initialization (new file)
- `api/webhooks.ts` - Webhook signature verification and handlers (new file)
- `auth/middleware.ts` - No changes (already handles tier-based auth)
- `auth/keys.ts` - No changes (tier sync happens via subscription updates)

**Web (web/)** - ENHANCE EXISTING APP:
- `lib/supabase.ts` - Browser Supabase client factory (new file)
- `lib/supabase-server.ts` - Server-side Supabase client factory (new file)
- `context/AuthContext.tsx` - **REFACTOR** from localStorage to Supabase session + subscription
- `middleware.ts` - Protect routes with auth check (new file)
- `app/login/page.tsx` - GitHub OAuth login page (new page)
- `app/auth/callback/route.ts` - OAuth callback handler (new route)
- `app/dashboard/page.tsx` - User profile, API keys, subscription status (new page)
- `app/pricing/page.tsx` - Three-tier pricing with upgrade CTAs (new page)
- `components/Navigation.tsx` - **MODIFY** to add sign in/out, tier badge, user avatar

**Shared (shared/types/)**:
- `entities.ts` - Add `Subscription` entity type
- `api.ts` - Add subscription-related request/response types
- `auth.ts` - Update `AuthContext` to include subscription fields

### Data/API Impacts

**Database Schema Changes**:
- New `subscriptions` table with Stripe customer/subscription IDs
- Foreign key: `user_id` references `auth.users(id)`
- Indexes on `stripe_customer_id`, `stripe_subscription_id`, `user_id`, `status`
- RLS policies restrict access to user's own subscription data

**New API Endpoints**:
- `POST /api/subscriptions/create-checkout-session` - Initiate Stripe Checkout (authenticated)
- `POST /api/subscriptions/create-portal-session` - Generate billing portal link (authenticated)
- `POST /webhooks/stripe` - Handle subscription lifecycle events (unauthenticated, signature-verified)
- `GET /api/subscriptions/current` - Fetch user's subscription data (authenticated)

**Subscription State Machine**:
```
[no subscription] → trialing (14 days) → active (invoice paid)
active → past_due (payment failed) → canceled (after grace period)
active → canceled (user cancellation, access until period end)
```

**Tier Synchronization Logic**:
- `invoice.paid` event → set status=active, update api_keys.tier to match subscription plan
- `customer.subscription.updated` event → update tier if plan changed
- `customer.subscription.deleted` event → set status=canceled, downgrade api_keys.tier to free
- Grace period for past_due: 7 days before tier downgrade

## Relevant Files

### Existing Web App Foundation
**Current State**: Web app exists with Next.js 14, working pages, components, and localStorage-based auth
- ✅ `web/app/page.tsx` - Landing page with API health check
- ✅ `web/app/search/page.tsx` - Code search interface
- ✅ `web/app/repository-index/page.tsx` - Repository indexing interface
- ✅ `web/app/files/page.tsx` - Recent files listing
- ✅ `web/app/layout.tsx` - Root layout with AuthProvider
- ✅ `web/components/Navigation.tsx` - Nav bar with API key input
- ✅ `web/components/ApiKeyInput.tsx` - API key management UI
- ✅ `web/components/RateLimitStatus.tsx` - Rate limit display
- ✅ `web/components/SearchBar.tsx` - Search input component
- ✅ `web/components/FileList.tsx` - File listing component
- ✅ `web/context/AuthContext.tsx` - localStorage-based auth (TO BE REPLACED)
- ✅ `web/lib/api-client.ts` - Type-safe API client
- ✅ `web/package.json` - Existing dependencies (Next.js, React, Tailwind)

### Backend Files to Modify
- `app/src/api/routes.ts` - Add 4 new routes (checkout, portal, webhook, current subscription)
- `app/package.json` - Add `stripe` dependency

### Backend Files to Create
- `app/src/db/migrations/002_subscriptions.sql` - Subscription table schema (matches 001 style)
- `app/supabase/migrations/002_subscriptions.sql` - Copy for Supabase CLI (sync requirement)
- `app/src/api/stripe.ts` - Stripe client initialization and helpers
- `app/src/api/webhooks.ts` - Webhook signature verification and event handlers
- `app/.env.example` - Update with Stripe environment variables

### Web Files to Modify
- `web/context/AuthContext.tsx` - **REPLACE** localStorage with Supabase session + subscription data
- `web/components/Navigation.tsx` - **ADD** sign in/out button, user avatar, tier badge (replace ApiKeyInput for authenticated users)
- `web/app/layout.tsx` - No changes needed (AuthProvider already wraps app)
- `web/package.json` - **ADD** `@supabase/supabase-js`, `@supabase/auth-helpers-nextjs`, `@stripe/stripe-js`

### Web Files to Create
- `web/lib/supabase.ts` - Browser Supabase client factory
- `web/lib/supabase-server.ts` - Server-side Supabase client factory
- `web/middleware.ts` - Protected route enforcement (redirect to /login)
- `web/app/login/page.tsx` - GitHub OAuth login page
- `web/app/auth/callback/route.ts` - OAuth callback handler (exchange code for session)
- `web/app/auth/logout/route.ts` - Logout handler (clear session)
- `web/app/dashboard/page.tsx` - User dashboard (profile, subscription, API keys)
- `web/app/pricing/page.tsx` - Pricing page with tier comparison and upgrade CTAs
- `web/.env.local.example` - Update with Supabase and Stripe env vars

### Shared Files to Modify
- `shared/types/entities.ts` - Add `Subscription` type
- `shared/types/api.ts` - Add `CreateCheckoutSessionRequest`, `CreateCheckoutSessionResponse`, etc.
- `shared/types/auth.ts` - Update `AuthContext` with `subscription` field

## Task Breakdown

### Phase 1: Foundation (Database + Dependencies)
**Goal**: Establish database schema and install required SDKs

- Create `app/src/db/migrations/002_subscriptions.sql` with subscriptions table
- Copy migration to `app/supabase/migrations/002_subscriptions.sql` (sync requirement)
- Add `stripe` to `app/package.json` and install
- Add `@supabase/supabase-js`, `@supabase/auth-helpers-nextjs` to `web/package.json` and install
- Add `@stripe/stripe-js` to `web/package.json` and install
- Update shared types: add `Subscription` entity, subscription API types
- Update `.env.example` files with new environment variables

### Phase 2: Backend Stripe Integration
**Goal**: Build Stripe Checkout, billing portal, and webhook handlers

- Create `app/src/api/stripe.ts` with Stripe client initialization
- Add `POST /api/subscriptions/create-checkout-session` endpoint in `routes.ts`
- Add `POST /api/subscriptions/create-portal-session` endpoint in `routes.ts`
- Create `app/src/api/webhooks.ts` with webhook signature verification
- Add `POST /webhooks/stripe` endpoint with event handlers (invoice.paid, subscription.updated, subscription.deleted)
- Implement tier synchronization logic in webhook handlers (update api_keys.tier based on subscription)
- Add `GET /api/subscriptions/current` endpoint to fetch user subscription data

### Phase 3: Web Authentication Infrastructure
**Goal**: Implement GitHub OAuth and session management

- Create `web/lib/supabase.ts` browser client factory
- Create `web/lib/supabase-server.ts` server-side client factory
- Create `web/app/login/page.tsx` with "Sign in with GitHub" button
- Create `web/app/auth/callback/route.ts` OAuth callback handler
- Create `web/app/auth/logout/route.ts` logout handler
- Create `web/middleware.ts` to protect routes (dashboard, search, files, repository-index)
- Update `web/context/AuthContext.tsx` to use Supabase session instead of localStorage
- Add subscription data fetching to AuthContext (call backend `/api/subscriptions/current`)
- Update `web/components/Navigation.tsx` with auth UI (sign in/out button, tier badge)

### Phase 4: Web Dashboard & Pricing
**Goal**: Build user-facing pages for subscription management

- Create `web/app/dashboard/page.tsx` with user profile section
- Add subscription status display to dashboard (tier, status, period dates)
- Add API keys section to dashboard (display existing keys with copy button)
- Add "Manage Billing" link to dashboard (routes to Stripe portal)
- Create `web/app/pricing/page.tsx` with three-tier comparison table
- Add upgrade CTAs to pricing page (route to Stripe Checkout)
- Display "Current Plan" badge on pricing page for authenticated users
- Add upgrade prompts to dashboard when user is on free tier

### Phase 5: Testing & Validation
**Goal**: Verify end-to-end flows with real Stripe test mode

- Configure Stripe test mode products and prices
- Test GitHub OAuth login flow (authorization, callback, session persistence)
- Test Stripe Checkout flow (create session, redirect, successful payment)
- Test webhook event handling using Stripe CLI (`stripe listen --forward-to`)
- Verify tier synchronization (subscription created → api_keys.tier updated)
- Test billing portal flow (create session, manage subscription)
- Test cancellation flow (cancel subscription → tier downgrade after period end)
- Test protected route redirects (unauthenticated access → login page)
- Validate session persistence across page reloads
- Test rate limit changes reflect new tier immediately after webhook

## Step by Step Tasks

### Database Setup
1. Create `app/src/db/migrations/002_subscriptions.sql` with full schema
2. Copy migration to `app/supabase/migrations/002_subscriptions.sql`
3. Run migration sync validation: `cd app && bun run test:validate-migrations`
4. Apply migration to local Supabase: `cd app && ./scripts/setup-test-db.sh`

### Backend Dependencies
5. Add Stripe SDK: `cd app && bun add stripe`
6. Update `app/.env.example` with Stripe environment variables
7. Create shared types for Subscription entity and API contracts

### Backend Stripe Implementation
8. Create `app/src/api/stripe.ts` with Stripe client singleton
9. Add checkout session endpoint to `app/src/api/routes.ts`
10. Add billing portal endpoint to `app/src/api/routes.ts`
11. Create `app/src/api/webhooks.ts` with signature verification
12. Add webhook endpoint to `app/src/api/routes.ts` (no auth middleware)
13. Implement `invoice.paid` event handler (activate subscription, update tier)
14. Implement `customer.subscription.updated` event handler (sync plan changes)
15. Implement `customer.subscription.deleted` event handler (cancel, downgrade tier)
16. Add `GET /api/subscriptions/current` endpoint for web app consumption

### Web Dependencies
17. Add Supabase SDKs: `cd web && bun add @supabase/supabase-js @supabase/auth-helpers-nextjs`
18. Add Stripe.js: `cd web && bun add @stripe/stripe-js`
19. Update `web/.env.local.example` with Supabase and Stripe env vars

### Web Authentication Implementation
20. Create `web/lib/supabase.ts` browser client factory
21. Create `web/lib/supabase-server.ts` server-side client factory
22. Create `web/app/login/page.tsx` with GitHub OAuth button
23. Create `web/app/auth/callback/route.ts` for OAuth code exchange
24. Create `web/app/auth/logout/route.ts` for sign out
25. Create `web/middleware.ts` to protect authenticated routes
26. Refactor `web/context/AuthContext.tsx` to use Supabase session
27. Add subscription data fetching to AuthContext (integrate with backend)
28. Update `web/components/Navigation.tsx` with sign in/out UI and tier badge

### Web UI Implementation
29. Create `web/app/dashboard/page.tsx` with user profile section
30. Add subscription status display to dashboard
31. Add API keys section to dashboard (list, copy functionality)
32. Add "Manage Billing" link to dashboard (calls portal endpoint)
33. Create `web/app/pricing/page.tsx` with tier comparison table
34. Add upgrade CTAs to pricing page (route to checkout endpoint)
35. Display "Current Plan" badge on pricing page for authenticated users
36. Add upgrade prompts to dashboard for free tier users

### Integration Testing
37. Configure Stripe test mode products: `stripe products create --name="Solo Plan"`
38. Configure Stripe test mode prices: `stripe prices create --product=<product_id> --amount=1000 --currency=usd --recurring[interval]=month`
39. Set environment variables for test mode (test keys, test webhook secret)
40. Test OAuth login flow: visit `/login`, authorize GitHub, verify redirect to dashboard
41. Test session persistence: reload page, verify user remains authenticated
42. Test Stripe Checkout: click upgrade CTA, complete test payment (card: 4242 4242 4242 4242)
43. Start Stripe webhook listener: `stripe listen --forward-to localhost:3000/webhooks/stripe`
44. Trigger `invoice.paid` event via test payment, verify tier updates in database
45. Test billing portal: click "Manage Billing", verify redirect to Stripe portal
46. Test subscription cancellation: cancel in portal, verify tier downgrade after period end
47. Test protected routes: log out, attempt to access dashboard, verify redirect to login
48. Test rate limit updates: verify X-RateLimit-Limit header changes after tier upgrade

### Documentation & Cleanup
49. Update `docs/deployment.md` with Stripe webhook configuration steps
50. Document Stripe environment variables in README
51. Add Supabase Auth configuration steps to setup guide
52. Create troubleshooting guide for webhook signature verification failures

### Final Validation
53. Run type-check: `cd app && bunx tsc --noEmit`
54. Run linter: `cd app && bun run lint`
55. Run backend tests: `cd app && bun test`
56. Run web type-check: `cd web && bunx tsc --noEmit`
57. Run web linter: `cd web && bun run lint`
58. Validate migration sync: `cd app && bun run test:validate-migrations`
59. Re-run full integration test suite (OAuth + Stripe + webhook flow)
60. Push branch: `git push -u origin feat/223-273-stripe-oauth-web-frontend`

## Risks & Mitigations

### Risk: Webhook Event Ordering Issues
**Problem**: Stripe events may arrive out of order (e.g., `subscription.updated` before `invoice.paid`)
**Mitigation**: Use `subscription.status` field as source of truth, not event sequence. Handle idempotent updates.

### Risk: Session Cookie Size Limits
**Problem**: Supabase session tokens can exceed 4KB cookie limit with metadata
**Mitigation**: Supabase Auth SDK stores minimal session data in cookies, full user object fetched on demand. Monitor cookie size in production.

### Risk: Stripe Webhook Signature Verification Failures
**Problem**: Clock skew or incorrect secret causes webhook validation to fail
**Mitigation**: Log signature verification failures with timestamp diff. Use Stripe CLI for local testing. Document webhook secret rotation process.

### Risk: Tier Downgrade Timing on Cancellation
**Problem**: User cancels subscription mid-period, unclear when to revoke access
**Mitigation**: Respect `cancel_at_period_end` flag. Maintain tier access until `current_period_end` timestamp. Webhook `subscription.deleted` triggers tier downgrade.

### Risk: API Key Tier Sync Race Conditions
**Problem**: Multiple webhook events update `api_keys.tier` concurrently
**Mitigation**: Use database transactions for tier updates. Last-write-wins semantics acceptable (Stripe is source of truth).

### Risk: GitHub OAuth Requires Public Callback URL
**Problem**: Local development uses `localhost:3001`, GitHub OAuth requires HTTPS in production
**Mitigation**: Supabase handles OAuth redirect URLs. Use ngrok for local HTTPS testing if needed. Document production callback URL configuration.

### Risk: Free Tier Users Creating Multiple Accounts
**Problem**: Users abuse free tier by creating unlimited GitHub accounts
**Mitigation**: Out of scope for MVP. Future: add email verification, CAPTCHA, or rate limit account creation per IP.

## Validation Strategy

### Automated Tests (Integration/E2E with Real Services)
All tests follow antimocking philosophy using real Supabase Local and Stripe test mode.

**Backend Integration Tests** (`app/tests/api/subscriptions.test.ts`):
- Test `POST /api/subscriptions/create-checkout-session` returns valid Stripe session URL
- Test `POST /api/subscriptions/create-portal-session` requires active subscription
- Test `POST /webhooks/stripe` signature verification rejects invalid signatures
- Test `invoice.paid` webhook handler creates subscription record and updates tier
- Test `customer.subscription.updated` webhook handler syncs tier changes
- Test `customer.subscription.deleted` webhook handler downgrades tier to free
- Test `GET /api/subscriptions/current` returns subscription data for authenticated user

**Web E2E Tests** (`web/tests/e2e/auth-flow.spec.ts`):
- Test GitHub OAuth login flow redirects to dashboard after authentication
- Test protected routes redirect unauthenticated users to login page
- Test session persists across page reloads (no re-login required)
- Test logout clears session and redirects to landing page
- Test dashboard displays user profile and subscription status
- Test pricing page shows current tier badge for authenticated users

**Web E2E Tests** (`web/tests/e2e/subscription-flow.spec.ts`):
- Test upgrade CTA redirects to Stripe Checkout with correct price ID
- Test billing portal link redirects to Stripe customer portal
- Test subscription tier badge updates after webhook event (use Stripe CLI trigger)

### Manual Checks (Real Stripe Test Mode)
- Seed test user in Supabase Auth via SQL script
- Generate API key for test user with free tier
- Complete Stripe Checkout flow with test card `4242 4242 4242 4242`
- Verify `subscriptions` table record created with correct Stripe IDs
- Verify `api_keys.tier` updated from `free` to `solo`
- Use Stripe CLI to trigger test events: `stripe trigger customer.subscription.deleted`
- Verify tier downgrade occurs after subscription deletion event
- Test payment failure scenario with test card `4000 0000 0000 0341` (requires authentication)
- Verify `past_due` status reflected in dashboard UI

### Release Guardrails (Monitoring, Alerting, Rollback)
**Monitoring**:
- Track webhook processing latency (p95 < 500ms)
- Alert on webhook signature verification failures (>5% error rate)
- Monitor subscription creation success rate (target: >95%)
- Track tier synchronization delays (webhook → database update < 5s)

**Alerting**:
- Stripe webhook endpoint returning 5xx errors
- Database transaction failures during tier updates
- Supabase Auth session creation failures (>1% error rate)

**Rollback Strategy**:
- Feature flag for Stripe integration: `ENABLE_STRIPE_SUBSCRIPTIONS=false` disables all Stripe endpoints
- Feature flag for OAuth: `ENABLE_GITHUB_OAUTH=false` falls back to API key-only auth
- Database rollback: retain `002_subscriptions.sql` down migration script
- Stripe webhook pause: disable webhook endpoint in Stripe dashboard during incidents

## Validation Commands

**Backend Validation**:
```bash
cd app
bun run lint                          # ESLint validation
bunx tsc --noEmit                     # Type-check without emit
bun test                              # Full test suite (133+ tests)
bun test --filter subscriptions       # Subscription-specific tests
bun run test:validate-migrations      # Migration sync check
bun run test:validate-env             # Environment variable check
```

**Web Validation**:
```bash
cd web
bun run lint                          # Next.js ESLint validation
bunx tsc --noEmit                     # Type-check without emit
bun run build                         # Next.js production build
bun run test:e2e                      # Playwright E2E tests
```

**Stripe CLI Testing**:
```bash
stripe login                          # Authenticate Stripe CLI
stripe listen --forward-to localhost:3000/webhooks/stripe  # Local webhook listener
stripe trigger invoice.paid           # Test invoice.paid event
stripe trigger customer.subscription.deleted  # Test subscription.deleted event
```

**Manual Integration Testing**:
```bash
# 1. Start Supabase Local
cd app && ./scripts/dev-start.sh

# 2. Start web app
cd web && bun run dev

# 3. Start Stripe webhook listener (separate terminal)
stripe listen --forward-to localhost:3000/webhooks/stripe

# 4. Visit http://localhost:3001
# 5. Click "Sign In" → authorize GitHub
# 6. Visit pricing page → click "Upgrade to Solo"
# 7. Complete checkout with test card 4242 4242 4242 4242
# 8. Verify tier badge updates to "solo"
# 9. Check Stripe webhook listener logs for invoice.paid event
# 10. Verify api_keys.tier = 'solo' in database
```

## Issue Metadata

**Combined Issues**:
- Issue #223: feat: implement Stripe subscription payment infrastructure for web app
- Issue #273: feat: build web app frontend for GitHub OAuth authentication with Stripe integration

**Labels** (Issue #223):
- component:backend
- component:api
- component:database
- priority:medium
- effort:large
- status:needs-investigation

**Labels** (Issue #273):
- component:backend
- priority:high
- effort:medium
- status:needs-investigation

**Dependencies**:
- Issue #204: chore: reset production and staging Supabase instances to match current schema (COMPLETED - assumed per user instruction)
- Issue #271: feat: implement GitHub OAuth authentication flow for web application (parent epic - #273 is frontend subset)

**Related To**:
- Issue #25: API key generation (shares tier management logic)
- Issue #26: Rate limiting (rate limits sync with subscription tier changes)
- Issue #150: Next.js web app (web UI foundation for payment integration)
- Issue #190: Playwright E2E testing infrastructure (E2E tests for OAuth and checkout flows)
- Issue #186: Deployment documentation (deployment docs for Stripe webhooks)

**Blocks**:
- Pricing page implementation (requires auth + subscription context)
- Production dogfooding workflow (requires user signup capability)

## Open Questions

### Pricing Model
**Question**: What are the monthly prices for Solo and Team tiers?
**Recommendation**: Research competitor pricing (e.g., Algolia, Pinecone). Suggested: Solo=$20/mo, Team=$100/mo.

### Team Tier Billing
**Question**: Per-seat pricing or flat rate for Team tier?
**Decision**: Flat rate for MVP (simplifies implementation). Add per-seat in future iteration.

### Free Tier Signup
**Question**: Email verification required or instant API key generation?
**Decision**: Instant API key generation on first login (no email verification). GitHub OAuth provides verified email.

### Subscription Lifecycle
**Question**: Grace period for `past_due` status before tier downgrade?
**Decision**: 7-day grace period. Stripe retries failed payments automatically (4 attempts over 2 weeks).

### Multiple API Keys
**Question**: Can one user have multiple API keys? How do subscriptions map?
**Decision**: One subscription per user. Multiple API keys allowed, all inherit tier from subscription.

### Stripe Test/Production
**Question**: Separate Supabase projects or shared database with `livemode` flag?
**Decision**: Use Stripe test mode keys for development. Production uses live mode keys. Same Supabase project, no `livemode` flag needed (Stripe customer/subscription IDs differ by mode).

### Webhook Retry Strategy
**Question**: How to handle webhook delivery failures?
**Decision**: Stripe automatically retries webhooks with exponential backoff (3 days max). Log all webhook errors for manual reconciliation.

### Organization Creation
**Question**: Auto-create organization on first Team tier subscription?
**Decision**: Yes, auto-create organization with user as owner. Organization slug derived from GitHub username or email prefix.

## Constraints

- Must use Supabase Auth SDK (no custom JWT handling)
- Session cookies must be httpOnly and secure (handled by SDK)
- Webhook signature verification required (reject unsigned requests)
- Protected routes must enforce both authentication AND subscription status
- Stripe customer ID must be unique per user (one subscription per user for MVP)
- Migration sync required: `app/src/db/migrations/` and `app/supabase/migrations/` must match
- Environment variables prefixed with `NEXT_PUBLIC_` for browser access (Next.js requirement)
- Stripe webhook endpoint must return 200 status within 5 seconds (Stripe timeout)
- All tests must use real services (no mocks per antimocking philosophy)

## References

**Codebase**:
- `app/src/db/migrations/001_initial_schema.sql:10-44` - api_keys table schema
- `app/src/auth/keys.ts:17-21` - TIER_RATE_LIMITS constants
- `web/context/AuthContext.tsx:1-78` - Current localStorage auth (to be replaced)
- `web/components/Navigation.tsx` - Navigation component (needs auth UI)
- `shared/types/auth.ts` - AuthContext type (needs subscription field)

**Documentation**:
- Stripe Node.js SDK: https://github.com/stripe/stripe-node
- Stripe.js for React: https://stripe.com/docs/stripe-js/react
- Stripe Checkout: https://stripe.com/docs/payments/checkout
- Stripe Webhooks: https://stripe.com/docs/webhooks
- Stripe CLI: https://stripe.com/docs/stripe-cli
- Supabase Auth with Next.js 14: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase OAuth (GitHub): https://supabase.com/docs/guides/auth/social-login/auth-github
- Next.js Middleware: https://nextjs.org/docs/app/building-your-application/routing/middleware
- Next.js Server Actions: https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations

**Related Specs**:
- Issue #223 (full description): Stripe subscription infrastructure details
- Issue #273 (full description): GitHub OAuth frontend implementation details
- Issue #204: Database reset prerequisite (COMPLETED)
