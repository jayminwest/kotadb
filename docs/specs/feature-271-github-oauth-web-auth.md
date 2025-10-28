# Feature Plan: GitHub OAuth Authentication Flow for Web Application

## Metadata
- **Issue**: #271
- **Title**: feat: implement GitHub OAuth authentication flow for web application
- **Component**: Backend, API, Web
- **Priority**: High (blocks other web app features and production testing)
- **Effort**: Large (>3 days)
- **Status**: Needs Investigation

## Issue Relationships

**Depends On:**
- #204 - chore: reset production and staging Supabase instances (CLOSED - blocker resolved)
- #270 - chore: standardize migration naming conventions (CLOSED - soft dependency resolved)

**Related To:**
- #223 - feat: implement Stripe subscription payment infrastructure (shares user authentication context)
- #190 - test: replicate test:setup/test:teardown infrastructure in web/ for Playwright E2E tests (will need OAuth test fixtures)
- #186 - docs: update deployment.md with Next.js web application strategies (deployment docs need OAuth setup steps)

**Blocks:**
- Future web app features requiring authenticated user context
- Production user testing and dogfooding workflows

## Overview

### Problem
The KotaDB web application exists with basic UI pages but lacks production-ready authentication. Users currently manage API keys manually via localStorage, with no signup/login flow. This prevents:
- Production deployment with real user onboarding
- Dogfooding the service for end-to-end validation
- Testing the complete user journey from signup to API usage

### Desired Outcome
Implement a complete GitHub OAuth authentication flow that enables users to:
1. Sign up/login via GitHub OAuth
2. Auto-generate API keys on first login
3. View and manage API keys via authenticated dashboard
4. Access protected routes with session-based authentication
5. Deploy to production (Fly.io) with proper environment configuration

### Non-Goals
- Email/password authentication (GitHub OAuth only for MVP)
- Multi-factor authentication (future enhancement)
- API key rotation UI (manual generation only)
- Organization team member invites (single-user flow for MVP)
- OAuth providers other than GitHub (GitHub is sufficient for target users)

## Technical Approach

### Current State Analysis
The codebase already has significant OAuth infrastructure in place:
- ✅ `web/lib/supabase.ts` - Supabase browser client factory
- ✅ `web/lib/supabase-server.ts` - Supabase server client for App Router
- ✅ `web/context/AuthContext.tsx` - Supabase Auth state management (session, user, subscription)
- ✅ `web/app/login/page.tsx` - GitHub OAuth login UI with redirect logic
- ✅ `web/app/auth/callback/route.ts` - OAuth callback handler
- ✅ `web/middleware.ts` - Auth middleware for protected routes
- ✅ `web/app/dashboard/page.tsx` - Dashboard with API key display
- ✅ `app/src/auth/keys.ts` - Backend API key generation logic

### Missing Components
1. **Backend API endpoint** for API key generation (no `/api/keys/generate` route exists)
2. **Auto-generation logic** on first login (callback route needs enhancement)
3. **Default organization creation** for new users (required for RLS policies)
4. **GitHub OAuth App configuration** in Supabase Dashboard (manual setup step)
5. **Fly.io deployment configuration** for web app (`web/fly.toml` does not exist)
6. **Production environment secrets** (Supabase URL, anon key, API URL)
7. **Integration tests** for OAuth flow (no Playwright setup in `web/`)

### Architecture Notes
- **Authentication**: Supabase Auth manages `auth.users` table and JWT sessions
- **API Key Storage**: Backend `api_keys` table with foreign key to `auth.users(id)`
- **Multi-Tenancy**: Organizations table provides RLS context for user data isolation
- **Rate Limiting**: API keys inherit tier-based rate limits (free=100/hr, solo=1000/hr, team=10000/hr)
- **Session Management**: Next.js middleware validates Supabase session on protected routes
- **OAuth Flow**: GitHub → Supabase → Callback → Dashboard (with API key generation)

### Key Modules to Touch
- **Backend** (`app/src/api/routes.ts`): Add `/api/keys/generate` endpoint
- **Backend** (`app/src/api/queries.ts`): Add `createDefaultOrganization()` helper
- **Frontend** (`web/app/auth/callback/route.ts`): Add API key auto-generation logic
- **Frontend** (`web/app/dashboard/page.tsx`): Add "Generate API Key" button if no key exists
- **Deployment** (`web/fly.toml`): Create Fly.io configuration
- **Docs** (`docs/deployment.md`): Add web app deployment section

### Data/API Impacts
- **New Backend Endpoint**: `POST /api/keys/generate`
  - Request: `{ userId: string, tier: Tier, orgId?: string }`
  - Response: `{ apiKey: string, keyId: string, tier: Tier, createdAt: string }`
  - Authentication: Requires valid Supabase session token
  - Rate Limiting: No rate limit for key generation (admin operation)
- **Database Side Effects**:
  - Creates entry in `api_keys` table on first login
  - Creates default organization in `organizations` table for new users
  - Creates entry in `user_organizations` table with `role=owner`

## Relevant Files

### Backend Files (app/)
- `app/src/api/routes.ts` - Add API key generation endpoint
- `app/src/api/queries.ts` - Add organization creation helper
- `app/src/auth/keys.ts` - Existing key generation logic (reuse)
- `app/src/db/migrations/20241001000001_initial_schema.sql` - Schema reference for RLS policies

### Frontend Files (web/)
- `web/app/auth/callback/route.ts` - Enhance with auto-generation logic
- `web/app/dashboard/page.tsx` - Add manual key generation button
- `web/context/AuthContext.tsx` - Already integrated with Supabase (no changes needed)
- `web/lib/supabase.ts` - Already configured (no changes needed)
- `web/lib/supabase-server.ts` - Already configured (no changes needed)
- `web/middleware.ts` - Already protects routes (no changes needed)

### Deployment Files
- `web/.env.sample` - Add Supabase environment variables template
- `docs/deployment.md` - Add web app deployment section
- `docs/supabase-setup.md` - Reference for GitHub OAuth configuration steps

### New Files
- `web/fly.toml` - Fly.io deployment configuration
- `web/lib/api-server.ts` - Server-side API client for authenticated requests
- `app/tests/integration/api/keys.test.ts` - Integration tests for key generation endpoint

## Task Breakdown

### Phase 1: Backend API Endpoint (1 day)
- Add `POST /api/keys/generate` endpoint to `app/src/api/routes.ts`
- Add `createDefaultOrganization()` helper to `app/src/api/queries.ts`
- Add authentication middleware to validate Supabase JWT
- Write integration tests for endpoint (real Supabase Local)
- Validate endpoint locally with curl/Postman

### Phase 2: Auto-Generation on First Login (1 day)
- Enhance `web/app/auth/callback/route.ts` to call `/api/keys/generate`
- Add error handling for key generation failures
- Store generated key in AuthContext (localStorage for backwards compatibility)
- Add manual "Generate API Key" button to dashboard for retry cases
- Test end-to-end flow: login → callback → dashboard → key display

### Phase 3: GitHub OAuth Configuration (0.5 days)
- Create GitHub OAuth App at https://github.com/settings/developers
- Configure callback URL: `https://mnppfnyhvgohhblhcgbq.supabase.co/auth/v1/callback`
- Enable GitHub provider in Supabase Dashboard (Auth > Providers)
- Add Client ID and Client Secret to Supabase
- Test OAuth flow locally against Supabase staging

### Phase 4: Deployment Configuration (1 day)
- Create `web/fly.toml` with production app name and region
- Set Fly.io secrets (Supabase URL, anon key, API URL)
- Deploy web app to Fly.io: `flyctl deploy --app kotadb-web-production`
- Test production deployment health check
- Validate OAuth flow on production domain

### Phase 5: Integration Testing & Documentation (1 day)
- Write end-to-end test: signup → login → key generation → MCP connection
- Update `docs/deployment.md` with web app deployment instructions
- Update `web/.env.sample` with Supabase variables
- Test Claude Code MCP integration with production API key
- Document troubleshooting steps for common OAuth errors

## Step by Step Tasks

### Backend Implementation
1. Add `POST /api/keys/generate` endpoint to `app/src/api/routes.ts`
   - Validate Supabase JWT token from `Authorization: Bearer` header
   - Extract `userId` from JWT claims
   - Check if user already has API key (return existing if found)
   - Determine tier (default to `free` for new users)
   - Call `createDefaultOrganization(userId)` if no org exists
   - Call `generateApiKey({ userId, tier, orgId })` from `@auth/keys`
   - Return `{ apiKey, keyId, tier, createdAt }` response
2. Add `createDefaultOrganization(userId: string)` helper to `app/src/api/queries.ts`
   - Generate org slug from user email: `email.split('@')[0]-org`
   - Insert into `organizations` table with `owner_id = userId`
   - Insert into `user_organizations` table with `role = owner`
   - Return `orgId` for use in API key metadata
3. Write integration tests in `app/tests/integration/api/keys.test.ts`
   - Test authenticated request returns new API key
   - Test unauthenticated request returns 401
   - Test duplicate request returns existing key (idempotency)
   - Test org creation logic for new users

### Frontend Auto-Generation
4. Enhance `web/app/auth/callback/route.ts` with key generation
   - After `exchangeCodeForSession(code)`, get session user
   - Call `POST /api/keys/generate` with `Authorization: Bearer ${session.access_token}`
   - Parse response and extract `apiKey`
   - Store in localStorage via `localStorage.setItem('kotadb_api_key', apiKey)`
   - Redirect to dashboard with query param: `?key_generated=true`
5. Add manual generation button to `web/app/dashboard/page.tsx`
   - Show "Generate API Key" button if `apiKey === null`
   - On click, call `/api/keys/generate` with user session token
   - Display success message and reload AuthContext
   - Add error handling with user-friendly messages

### GitHub OAuth Configuration
6. Create GitHub OAuth App (manual step via GitHub Settings)
   - Navigate to https://github.com/settings/developers
   - Click "New OAuth App"
   - Set Authorization callback URL: `https://mnppfnyhvgohhblhcgbq.supabase.co/auth/v1/callback`
   - Copy Client ID and Client Secret
7. Configure Supabase GitHub Provider (manual step via Supabase Dashboard)
   - Navigate to Auth > Providers > GitHub
   - Enable GitHub provider
   - Paste Client ID and Client Secret
   - Save configuration

### Deployment
8. Create `web/fly.toml` with production configuration
   - Set `app = "kotadb-web-production"`
   - Set `primary_region = "iad"` (US East)
   - Configure internal port: `3001` (Next.js default)
   - Enable force_https and auto_stop_machines
9. Set Fly.io secrets via CLI
   - `flyctl secrets set NEXT_PUBLIC_SUPABASE_URL=...`
   - `flyctl secrets set NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
   - `flyctl secrets set NEXT_PUBLIC_API_URL=https://kotadb.fly.dev`
10. Deploy web app to Fly.io: `cd web && flyctl deploy --app kotadb-web-production`
11. Test production OAuth flow: visit `https://kotadb-web-production.fly.dev/login`

### Testing & Documentation
12. Write end-to-end test script in `app/tests/integration/oauth-flow.test.ts`
    - Simulate OAuth callback with mock session token
    - Verify API key generation endpoint response
    - Verify org creation for new users
    - Verify idempotency (duplicate requests return same key)
13. Update `docs/deployment.md` with web app deployment section
    - Document Fly.io deployment steps
    - Document GitHub OAuth App setup
    - Document Supabase provider configuration
    - Add troubleshooting section for common errors
14. Update `web/.env.sample` with Supabase variables
    - Add `NEXT_PUBLIC_SUPABASE_URL` with example
    - Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` with placeholder
    - Add `NEXT_PUBLIC_API_URL` with local/prod examples
15. Test Claude Code MCP integration with generated API key
    - Update `.mcp.json` with production credentials
    - Run `list_recent_files` tool to verify connection
    - Run `search_code` tool to verify authentication
    - Document connection steps in README
16. Run validation commands (see Validation Commands section)
17. Push feature branch: `git push -u origin feat/271-github-oauth-web-auth`

## Risks & Mitigations

### Risk: GitHub OAuth App misconfiguration causes callback failures
**Mitigation**: Test OAuth flow against Supabase staging before production deployment. Document exact callback URL format in `docs/supabase-setup.md` (must match Supabase project URL exactly).

### Risk: API key generation fails due to missing organization context
**Mitigation**: Auto-create default organization in callback route before key generation. Add retry logic with exponential backoff (3 attempts) if org creation fails transiently.

### Risk: RLS policies block API key creation for new users
**Mitigation**: Use service role key for key generation endpoint (bypasses RLS). Validate user ownership via JWT claims before creation. Add integration test to verify RLS behavior.

### Risk: Production deployment exposes Supabase anon key in client bundle
**Mitigation**: This is expected behavior - anon key is public but RLS policies enforce data isolation. Never expose service role key in frontend code. Document security model in deployment guide.

### Risk: OAuth flow breaks if user denies GitHub authorization
**Mitigation**: Add error handling in login page for OAuth cancellation. Redirect to `/login?error=access_denied` with user-friendly message. Log cancellation events for monitoring.

### Risk: API key generation endpoint lacks rate limiting (DoS risk)
**Mitigation**: Apply stricter rate limit for key generation (1 request per hour per user). Add idempotency check (return existing key if called multiple times). Monitor endpoint for abuse patterns.

## Validation Strategy

### Automated Tests
- **Integration tests** hitting real Supabase Local database:
  - `app/tests/integration/api/keys.test.ts`: Key generation endpoint
  - `app/tests/integration/oauth-flow.test.ts`: End-to-end OAuth simulation
- **Failure injection scenarios**:
  - Test invalid JWT token (401 response)
  - Test missing Supabase credentials (500 response)
  - Test org creation failure (transient error recovery)
- **Idempotency validation**:
  - Generate key twice for same user, verify same key returned
  - Verify only one `api_keys` entry exists per user

### Manual Checks
- **Local OAuth flow**:
  1. Start Supabase Local: `cd app && ./scripts/dev-start.sh`
  2. Start web app: `cd web && bun run dev`
  3. Visit `http://localhost:3001/login`
  4. Click "Sign in with GitHub"
  5. Verify redirect to GitHub authorization page
  6. Authorize app and verify redirect to dashboard
  7. Verify API key displayed in dashboard
  8. Copy key and test with curl: `curl -H "Authorization: Bearer <key>" http://localhost:3000/search?term=function`
- **Production OAuth flow**:
  1. Deploy web app: `cd web && flyctl deploy --app kotadb-web-production`
  2. Visit `https://kotadb-web-production.fly.dev/login`
  3. Complete OAuth flow and verify key generation
  4. Update `.mcp.json` with production API key
  5. Test Claude Code MCP connection: run `list_recent_files` tool
- **Seed data for testing**:
  - Create test user in Supabase Dashboard (auth.users)
  - Generate API key via endpoint
  - Test protected routes with session cookie
  - Verify RLS policies prevent cross-user data access

### Release Guardrails
- **Pre-deployment checklist**:
  - [ ] GitHub OAuth App created and configured
  - [ ] Supabase GitHub provider enabled
  - [ ] Fly.io secrets set (Supabase URL, anon key, API URL)
  - [ ] Integration tests pass (100% success rate)
  - [ ] OAuth flow tested on staging environment
  - [ ] API key generation tested with real Supabase
- **Monitoring**:
  - Track OAuth callback success rate (target: >95%)
  - Monitor API key generation latency (target: <2s p95)
  - Alert on authentication failures (>10 failures/hr)
  - Track session duration and user retention
- **Rollback plan**:
  - If OAuth flow breaks: revert web app deployment via `flyctl rollback`
  - If key generation fails: disable endpoint via feature flag
  - If RLS policies block users: apply hotfix migration to loosen policies temporarily

## Validation Commands

Following Level 2 validation requirements from `/validate-implementation`:

```bash
# Type-check backend
cd app && bunx tsc --noEmit

# Type-check web app
cd web && bunx tsc --noEmit

# Lint backend
cd app && bun run lint

# Lint web app
cd web && bun run lint

# Run integration tests (backend)
cd app && bun test --filter integration

# Run full test suite (backend)
cd app && bun test

# Build web app
cd web && bun run build

# Start Supabase Local for manual testing
cd app && ./scripts/dev-start.sh

# Test API key generation endpoint (manual)
curl -X POST http://localhost:3000/api/keys/generate \
  -H "Authorization: Bearer <supabase_jwt_token>" \
  -H "Content-Type: application/json"

# Test OAuth callback (manual)
# Visit http://localhost:3001/login and complete flow
```

### Domain-Specific Validation
- **OAuth flow validation**:
  - Start web app: `cd web && bun run dev`
  - Visit `http://localhost:3001/login`
  - Click "Sign in with GitHub"
  - Verify redirect to GitHub authorization page
  - Authorize and verify redirect to dashboard
  - Check browser DevTools Network tab for successful API calls
- **MCP integration validation**:
  - Update `.mcp.json` with generated API key
  - Test connection: run `/list_recent_files` slash command in Claude Code
  - Verify response contains indexed files

## Success Metrics

- User can sign up via GitHub OAuth in <30 seconds (measured from login click to dashboard view)
- API key auto-generated within 5 seconds of first login (p95 latency)
- OAuth flow success rate >95% (excluding user cancellations)
- Claude Code MCP connection succeeds on first attempt with generated key
- Production web app uptime >99% (measured over 7 days post-deployment)
- Zero authentication errors in production logs for 24 hours after deployment
- At least one successful dogfooding session (repository owner tests full flow)

## References

### Codebase
- `web/context/AuthContext.tsx:1-167` - Current Supabase Auth integration
- `web/app/login/page.tsx:1-84` - GitHub OAuth UI
- `web/app/auth/callback/route.ts:1-17` - OAuth callback handler
- `web/middleware.ts:1-56` - Auth middleware for protected routes
- `app/src/auth/keys.ts:26-227` - API key generation logic
- `app/src/db/migrations/20241001000001_initial_schema.sql:10-70` - Schema with RLS policies

### Documentation
- `docs/supabase-setup.md` - Supabase configuration and OAuth setup
- `web/README.md` - Web app architecture and deployment
- Supabase Auth Helpers for Next.js: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase GitHub OAuth: https://supabase.com/docs/guides/auth/social-login/auth-github
- Next.js Middleware: https://nextjs.org/docs/app/building-your-application/routing/middleware

### Related Issues
- #204 - Supabase instance reset (prerequisite - CLOSED)
- #223 - Stripe subscription infrastructure (shares auth context)
- #190 - Playwright E2E testing setup (will need OAuth fixtures)
