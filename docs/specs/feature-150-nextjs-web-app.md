# Feature Plan: Next.js Web Application with Shared TypeScript Types

## Overview

### Problem
KotaDB currently lacks a user-facing frontend interface for code search and repository indexing. Users must interact directly with REST API endpoints via curl or programmatic clients, creating friction in the developer experience and limiting adoption.

### Desired Outcome
Add a Next.js 14+ web application to the KotaDB monorepo that provides an intuitive UI for developers to search code, index repositories, and manage API keys. The frontend will share TypeScript types with the backend API, ensuring type safety across the entire stack and eliminating API contract drift.

### Non-Goals
- Mobile native applications (iOS/Android)
- GraphQL API layer (continue using REST endpoints)
- Real-time WebSocket features (not in Phase 1)
- User authentication beyond API key management (no OAuth, no user signup flows)
- Server-side rendering optimization (SSR) - use Next.js client-side features initially
- Advanced code editor features (syntax highlighting, inline diffs)

## Technical Approach

### Architecture Notes
The implementation follows a monorepo pattern where `web/` is a sibling to `app/` and `automation/`, consuming the existing REST API and sharing types via the `shared/` package. This architecture provides:

1. **Type-Safe API Integration**: Frontend imports backend types directly from `@shared/types`, eliminating runtime type errors
2. **Unified Developer Experience**: Single repository for backend and frontend with consistent tooling (Bun, TypeScript, Docker)
3. **Atomic Changes**: API and UI changes can be implemented in single PRs, reducing coordination overhead
4. **Anti-Mocking Compliance**: E2E tests use Playwright against real backend, no mocked API calls

### Key Modules to Touch

**New Modules (web/ directory):**
- `web/app/` - Next.js 14 App Router pages and components
- `web/app/api/` - Next.js API routes for server-side API key handling
- `web/components/` - Reusable React components (SearchBar, FileList, RateLimitStatus)
- `web/lib/` - API client wrappers with type-safe fetch
- `web/types/` - Frontend-specific types (UI state, component props)

**Existing Modules (modifications):**
- `shared/types/` - May need to export additional types for frontend consumption
- `docker-compose.yml` - Add `web` service on port 3001
- `.github/workflows/` - Create `web-ci.yml` for frontend CI pipeline
- `.gitignore` - Add Next.js build artifacts (`.next/`, `out/`)

**No Changes Required:**
- `app/src/` - Backend API remains unchanged, frontend consumes existing endpoints
- `automation/` - ADW workflows unaffected (path filters prevent unnecessary runs)

### Data/API Impacts
No changes to API contracts or database schema. Frontend consumes existing endpoints:
- `GET /health` - Health check and API version
- `GET /search?term=<query>&limit=<n>` - Code search
- `POST /index` - Repository indexing
- `GET /files/recent?limit=<n>` - Recent indexed files
- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

API key storage: Frontend uses localStorage or secure cookies for client-side storage. Server-side API calls (via Next.js API routes) keep keys secure and prevent exposure in browser.

## Relevant Files

### Configuration Files
- `docker-compose.yml` - Add `web` service definition with port 3001, volume mounts for `web/` and `shared/`
- `.github/workflows/web-ci.yml` - NEW: CI workflow for Next.js type checking, build validation, and E2E tests
- `.gitignore` - Add Next.js artifacts: `.next/`, `out/`, `web/.env.local`
- `CLAUDE.md` - Document web app architecture, shared types strategy, and development commands

### Shared Types Infrastructure
- `shared/types/api.ts` - API request/response types (already exists, may need exports)
- `shared/types/auth.ts` - Authentication and tier types (already exists)
- `shared/types/entities.ts` - Database entity types (already exists)
- `shared/types/rate-limit.ts` - Rate limiting types (already exists)
- `shared/README.md` - Document shared types usage patterns for frontend developers

### Backend Reference (no changes)
- `app/src/api/routes.ts` - Reference for endpoint signatures and response formats
- `app/src/auth/middleware.ts` - Reference for authentication flow and rate limit headers

### New Files

#### Next.js Application Structure
- `web/package.json` - Dependencies: `next@14+`, `react@18+`, `react-dom@18+`, `@kotadb/shared`, `tailwindcss`
- `web/tsconfig.json` - TypeScript config with path alias `@shared/*` pointing to `../shared/*`
- `web/next.config.js` - Next.js configuration (no special customization initially)
- `web/tailwind.config.ts` - TailwindCSS configuration (default Next.js setup)
- `web/.env.sample` - Environment variable template: `NEXT_PUBLIC_API_URL`, `API_KEY`
- `web/Dockerfile` - Multi-stage build: base (dev dependencies), production (optimized)

#### Pages and Components (App Router)
- `web/app/page.tsx` - Landing page with feature overview and search interface
- `web/app/search/page.tsx` - Code search interface with results display
- `web/app/index/page.tsx` - Repository indexing interface
- `web/app/files/page.tsx` - Recent files view
- `web/app/layout.tsx` - Root layout with nav, rate limit status, API key management
- `web/components/SearchBar.tsx` - Code search input with live validation
- `web/components/FileList.tsx` - File results display with syntax highlighting preview
- `web/components/RateLimitStatus.tsx` - Rate limit indicator with countdown timer
- `web/components/ApiKeyInput.tsx` - API key input and validation
- `web/lib/api-client.ts` - Type-safe fetch wrappers using `@shared/types`

#### Testing Infrastructure
- `web/playwright.config.ts` - Playwright E2E test configuration
- `web/tests/e2e/search.spec.ts` - E2E tests for search flow against real backend
- `web/tests/e2e/index.spec.ts` - E2E tests for repository indexing flow
- `web/tests/e2e/rate-limit.spec.ts` - E2E tests for rate limit handling and 429 responses

## Task Breakdown

### Phase 1: Foundation & Docker Integration (2-3 days)
- Initialize Next.js 14+ project structure in `web/` directory
- Configure `web/package.json` with Bun runtime and necessary dependencies
- Set up TypeScript with `@shared/*` path alias in `web/tsconfig.json`
- Create `web/.env.sample` with `NEXT_PUBLIC_API_URL` and `API_KEY` placeholders
- Add Docker Compose `web` service to `docker-compose.yml` (port 3001)
- Verify local development: `cd web && bun run dev` starts on port 3001
- Verify Docker development: `docker compose up web` runs containerized app
- Test API connectivity: Fetch `/health` from backend and display status

### Phase 2: Shared Types Integration (2-3 days) ⭐ CRITICAL
- Review existing types in `shared/types/` for frontend compatibility
- Extract or export any missing types needed for frontend (UI-facing API responses)
- Configure `web/tsconfig.json` with proper TypeScript path resolution
- Update `app/tsconfig.json` if needed (ensure no breaking changes)
- Create type-safe API client wrapper in `web/lib/api-client.ts` using `@shared/types`
- Verify type imports work in both `app/` and `web/` with no duplication
- Run `cd app && bunx tsc --noEmit` and `cd web && bunx tsc --noEmit` - both must pass
- Document shared types strategy in `shared/README.md` and `CLAUDE.md`

### Phase 3: Core UI Components (3-4 days)
- Implement landing page (`web/app/page.tsx`) with feature overview
- Build `SearchBar` component with real-time input validation
- Build `FileList` component for displaying search results with metadata
- Build `RateLimitStatus` component showing limit/remaining/reset values
- Build `ApiKeyInput` component with validation and secure storage
- Implement root layout (`web/app/layout.tsx`) with navigation and global state
- Add TailwindCSS styling for responsive design (mobile-first)
- Implement dark mode toggle (optional, nice-to-have)

### Phase 4: API Integration & Authentication (2-3 days)
- Implement API key management flow (localStorage with fallback to cookies)
- Create Next.js API route (`web/app/api/proxy/route.ts`) for server-side API calls
- Implement authentication state management (React Context or Zustand)
- Add rate limit header parsing and display in `RateLimitStatus` component
- Handle 429 responses gracefully with countdown timer and retry logic
- Implement error boundaries for API failures (network errors, 5xx responses)
- Add loading states and skeleton screens for async operations

### Phase 5: Search & Indexing Features (3-4 days)
- Implement code search page (`web/app/search/page.tsx`) consuming `/search` endpoint
- Display search results with file path, snippet preview, and metadata
- Implement repository indexing page (`web/app/index/page.tsx`) consuming `/index` endpoint
- Add form validation for repository URL and ref/branch inputs
- Implement recent files view (`web/app/files/page.tsx`) consuming `/files/recent` endpoint
- Add pagination or infinite scroll for large result sets
- Implement client-side caching for repeated searches (optional)

### Phase 6: CI/CD Integration (1-2 days)
- Create `.github/workflows/web-ci.yml` following `app-ci.yml` pattern
- Add type checking step: `cd web && bunx tsc --noEmit`
- Add build validation step: `cd web && bun run build`
- Add Playwright E2E tests running against containerized backend
- Configure path filters: trigger on `web/**` or `shared/**` changes only
- Update `.gitignore` with Next.js build artifacts (`.next/`, `out/`)
- Document CI workflow in `CLAUDE.md` and `README.md`

### Phase 7: Testing & Documentation (2-3 days)
- Write Playwright E2E tests for search flow (`tests/e2e/search.spec.ts`)
- Write Playwright E2E tests for indexing flow (`tests/e2e/index.spec.ts`)
- Write Playwright E2E tests for rate limit handling (`tests/e2e/rate-limit.spec.ts`)
- Test against real Supabase backend (anti-mocking compliance)
- Add test fixtures for deterministic E2E scenarios
- Document deployment process in `docs/deployment.md`
- Update `README.md` with web app setup instructions
- Create `web/README.md` with frontend-specific development guide

### Phase 8: Deployment & Monitoring (1-2 days)
- Create `web/fly.toml` for Fly.io deployment configuration
- Configure Fly.io secrets: `API_URL`, environment-specific values
- Deploy to staging environment and validate functionality
- Set up health check endpoint for Fly.io monitoring (`/api/health`)
- Deploy to production environment
- Document rollback procedures and monitoring setup

## Step by Step Tasks

### Foundation Tasks
1. Run `cd web && bun create next-app . --typescript --tailwind --app --no-src-dir` to initialize Next.js project
2. Install dependencies: `cd web && bun add @kotadb/shared` (local workspace link)
3. Configure `web/tsconfig.json` with `@shared/*` path alias pointing to `../shared/*`
4. Create `web/.env.sample` with environment variable templates
5. Add `web` service to `docker-compose.yml` with proper volume mounts and port 3001
6. Verify Docker build: `docker compose build web`
7. Verify local dev server: `cd web && bun run dev` (accessible on http://localhost:3001)
8. Create basic landing page with "Hello KotaDB" and API health check display
9. Test API connectivity: Fetch `http://localhost:3000/health` and display response

### Shared Types Tasks ⭐ CRITICAL
10. Review `shared/types/api.ts` and ensure all API response types are exported
11. Create `web/lib/api-client.ts` with type-safe fetch wrapper using `@shared/types`
12. Example: `searchCode(term: string): Promise<SearchResponse>` using imported types
13. Verify type imports: `cd web && bunx tsc --noEmit` must pass
14. Verify backend types still valid: `cd app && bunx tsc --noEmit` must pass
15. Update `shared/README.md` with frontend usage examples
16. Update `CLAUDE.md` "Shared Types Infrastructure" section with web app guidance

### UI Component Tasks
17. Create `web/components/SearchBar.tsx` with controlled input and validation
18. Create `web/components/FileList.tsx` for rendering search result arrays
19. Create `web/components/RateLimitStatus.tsx` parsing `X-RateLimit-*` headers
20. Create `web/components/ApiKeyInput.tsx` with secure localStorage handling
21. Implement `web/app/layout.tsx` with navigation, API key input, rate limit status
22. Add TailwindCSS responsive utilities for mobile/tablet/desktop breakpoints
23. Test components in isolation with hardcoded props before API integration

### API Integration Tasks
24. Create `web/app/api/proxy/route.ts` for server-side API calls (keeps API key secure)
25. Implement React Context for auth state management (`web/context/AuthContext.tsx`)
26. Add rate limit header extraction logic in API client
27. Implement 429 response handler with exponential backoff or countdown timer
28. Add error boundaries for network failures and 5xx errors
29. Test authentication flow end-to-end with test API keys from `shared/`

### Feature Implementation Tasks
30. Implement `web/app/search/page.tsx` with search form and results display
31. Connect search page to `GET /search` endpoint via type-safe client
32. Display search results with file path, snippet, and match highlights
33. Implement `web/app/index/page.tsx` with repository URL and ref inputs
34. Connect indexing page to `POST /index` endpoint via type-safe client
35. Display indexing job status and handle async job completion
36. Implement `web/app/files/page.tsx` consuming `GET /files/recent` endpoint
37. Add pagination controls or infinite scroll for large datasets
38. Test all features against local backend running on port 3000

### CI/CD Tasks
39. Create `.github/workflows/web-ci.yml` based on `app-ci.yml` structure
40. Add Bun installation step: `uses: oven-sh/setup-bun@v1`
41. Add type checking step: `cd web && bunx tsc --noEmit`
42. Add build validation step: `cd web && bun run build` (must succeed)
43. Add Playwright E2E test step running against Docker Compose backend
44. Configure path filters: `web/**`, `shared/**`, `.github/workflows/web-ci.yml`
45. Update `.gitignore`: Add `.next/`, `out/`, `web/.env.local`, `web/node_modules/`
46. Test CI workflow by pushing to feature branch and verifying all checks pass

### Testing Tasks
47. Install Playwright: `cd web && bun add -D @playwright/test`
48. Create `web/playwright.config.ts` pointing to `http://localhost:3000` (backend)
49. Write `tests/e2e/search.spec.ts` testing search flow with real API calls
50. Write `tests/e2e/index.spec.ts` testing indexing flow with test repository
51. Write `tests/e2e/rate-limit.spec.ts` testing 429 handling and retry logic
52. Add test fixtures for deterministic data (test API keys, sample repos)
53. Run E2E tests locally: `cd web && bun run test:e2e`
54. Ensure tests follow anti-mocking philosophy (real Supabase backend, no stubs)

### Documentation Tasks
55. Create `web/README.md` with setup instructions, development commands, architecture
56. Update root `README.md` with web app section and link to `web/README.md`
57. Update `CLAUDE.md` with web app development commands and architecture notes
58. Document shared types usage in `shared/README.md` with frontend examples
59. Create `docs/deployment.md` section for web app deployment to Fly.io
60. Document environment variables in `web/.env.sample` with descriptions

### Deployment Tasks
61. Create `web/fly.toml` with app name, region, and service configuration
62. Configure Fly.io secrets: `flyctl secrets set NEXT_PUBLIC_API_URL=https://api.kotadb.com`
63. Deploy to staging: `flyctl deploy --config web/fly.toml --app kotadb-web-staging`
64. Validate staging deployment: Test search, indexing, rate limiting
65. Deploy to production: `flyctl deploy --config web/fly.toml --app kotadb-web`
66. Set up health checks: Configure Fly.io to ping `/api/health` endpoint
67. Document rollback process: `flyctl releases rollback --app kotadb-web`

### Final Validation Tasks
68. Run full validation suite: `cd web && bun run lint && bunx tsc --noEmit && bun run build`
69. Run E2E tests against staging environment: `cd web && bun run test:e2e:staging`
70. Verify shared types work in both `app/` and `web/`: Run `bunx tsc --noEmit` in both dirs
71. Test Docker Compose full stack: `docker compose up dev web` (both services running)
72. Verify CI workflow passes on feature branch
73. Push feature branch: `git push -u origin feat/150-nextjs-web-app`
74. Open pull request with title format: `feat: add Next.js web app with shared types (#150)`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Build time increases** | Use Bun's fast transpiler instead of webpack. Enable Next.js turbopack (experimental). Cache Docker layers aggressively. Target <30s production build. |
| **Port conflicts in Docker Compose** | Use port 3001 for web (3000 already allocated to API). Document port mappings in docker-compose.yml comments. Add port conflict checks to setup scripts. |
| **Type sharing maintenance burden** | Document shared types strategy in CLAUDE.md. Enforce TypeScript strict mode in both projects. CI fails if type checks fail in either app/ or web/. |
| **CI/CD complexity** | Copy app-ci.yml pattern verbatim. Run workflows in parallel with path filters (web/** triggers web-ci.yml only). Ensure <2min total CI runtime. |
| **Shared types breaking changes** | Use semantic versioning in shared/package.json. Breaking changes require major version bump. TypeScript compiler errors identify all affected consumers. |
| **E2E test flakiness** | Use Playwright's auto-wait and retry mechanisms. Seed deterministic test data. Run tests against real Supabase backend (anti-mocking). Add CI test retries (max 2). |
| **API key exposure in frontend** | Store keys in localStorage (acceptable for demo). Use Next.js API routes for server-side calls in production. Document security best practices in README. |
| **Rate limit confusion** | Display clear countdown timers for 429 responses. Show remaining quota prominently. Link to docs explaining tier limits. |
| **Stale dependencies** | Pin Bun version in CI (matches local). Lock Next.js to 14.x major version. Use `--frozen-lockfile` in CI installs. |
| **ADW automation confusion** | Use path filters in CI workflows. ADW agents recognize web/** changes. Add web-specific slash commands if needed (not required initially). |

## Validation Strategy

### Automated Tests (Anti-Mocking Compliance)
All tests must exercise real integrations per anti-mocking philosophy:

**E2E Tests (Playwright):**
- Run against real backend API on http://localhost:3000
- Use real Supabase database (seeded test data)
- No mocked fetch calls, no stubbed API responses
- Test failure scenarios by sending invalid requests (real 4xx/5xx responses)
- Seed deterministic test data (test API keys, sample repositories)
- Evidence: Playwright test output showing real HTTP requests and responses

**Integration Tests (Next.js API Routes):**
- Next.js API routes call real backend endpoints
- Use test API keys from shared/types for authentication
- Verify rate limit headers from real responses
- Test 429 handling by exhausting rate limits in test environment
- Evidence: API route test logs showing real Supabase queries

**Type Checking (Compile-Time Validation):**
- `cd app && bunx tsc --noEmit` must pass (backend types valid)
- `cd web && bunx tsc --noEmit` must pass (frontend types valid)
- `cd shared && bunx tsc --noEmit` must pass (shared types valid)
- Evidence: TypeScript compiler output with zero errors

### Manual Checks
Document these manual validation steps in PR description:

**Docker Compose Full Stack:**
1. Run `docker compose up dev web` to start both services
2. Access web app at http://localhost:3001
3. Access backend API at http://localhost:3000
4. Verify web app successfully calls backend API
5. Check Docker logs show no errors

**API Connectivity:**
1. Navigate to web app landing page
2. Verify `/health` endpoint returns 200 and displays API version
3. Test search with valid API key (should return results)
4. Test search without API key (should show 401 error)
5. Test indexing with GitHub repository URL (should queue job)

**Rate Limiting:**
1. Use `free` tier API key (100 requests/hour limit)
2. Send 100+ search requests rapidly
3. Verify 429 response after limit exceeded
4. Verify `Retry-After` header displays countdown timer
5. Wait for rate limit reset and verify quota restored

**Shared Types:**
1. Modify a type in `shared/types/api.ts` (e.g., add optional field)
2. Run `cd app && bunx tsc --noEmit` - should pass (no errors)
3. Run `cd web && bunx tsc --noEmit` - should pass (no errors)
4. Verify IDE autocomplete shows updated type in both projects
5. Revert change after validation

### Release Guardrails
Pre-deployment checklist before merging to `develop`:

**CI Checks (All Must Pass):**
- ✅ App CI: Type check, lint, build, 133 tests pass
- ✅ Web CI: Type check, lint, build, E2E tests pass
- ✅ Shared types CI: Type check passes
- ✅ Migration sync validation passes
- ✅ No Docker build failures

**Manual QA:**
- ✅ Test search flow with 3 different API key tiers (free, solo, team)
- ✅ Test indexing flow with GitHub repository (public repo)
- ✅ Test rate limiting behavior (exhaust quota, verify countdown)
- ✅ Test responsive design on mobile/tablet/desktop viewports
- ✅ Test error handling (network failures, invalid API keys, 5xx errors)

**Monitoring (Post-Deployment):**
- Set up Fly.io health checks pinging `/api/health` every 30s
- Configure alerting for >5% error rate or >3s p99 latency
- Monitor Docker logs for frontend errors (Next.js SSR errors)
- Track backend API error rates (should not increase post-launch)

**Rollback Plan:**
If critical issues discovered post-deployment:
1. Run `flyctl releases rollback --app kotadb-web` to revert to previous version
2. Disable web service in Docker Compose: `docker compose stop web`
3. Investigate root cause in logs: `flyctl logs --app kotadb-web`
4. Fix issue in feature branch, re-validate, re-deploy

## Validation Commands

### Level 1: Basic Checks (Required for all commits)
```bash
cd web && bun run lint                   # Lint check (ESLint + Prettier)
cd web && bunx tsc --noEmit             # Type check without emitting files
```

### Level 2: Integration Validation (Required before PR)
```bash
cd app && bunx tsc --noEmit             # Verify backend types still valid
cd web && bunx tsc --noEmit             # Verify frontend types valid
cd shared && bunx tsc --noEmit          # Verify shared types valid
cd web && bun run build                 # Validate Next.js production build
cd web && bun test                      # Run unit tests (if any)
```

### Level 3: E2E Validation (Required before merge)
```bash
docker compose up -d dev                # Start backend API
cd web && bun run test:e2e              # Run Playwright E2E tests against real backend
docker compose down                     # Stop services
```

### Level 4: Full Stack Validation (Required before deploy)
```bash
docker compose build web                # Build web service container
docker compose up dev web               # Start full stack (backend + frontend)
# Manual testing: Open http://localhost:3001 and test all features
docker compose down                     # Stop all services
```

### Domain-Specific Scripts
```bash
cd web && bun run dev                   # Start Next.js dev server (port 3001)
cd web && bun run start                 # Start Next.js production server
cd web && bun run analyze               # Analyze bundle size (optional)
cd web && bun run test:e2e:ui           # Run Playwright with UI (optional)
```

## Issue Metadata

**Issue**: #150
**Title**: feat: add Next.js web application with shared TypeScript types to monorepo
**Labels**: `component:backend`, `component:api`, `component:ci-cd`, `priority:medium`, `effort:large`, `status:needs-investigation`
**Estimate**: 6-10 days (Large)

## Issue Relationships

### Depends On
None - no blocking dependencies

### Related To
- #25 (API Key Generation) - Frontend will consume API key validation endpoints
- #26 (Tier-Based Rate Limiting) - Frontend will display rate limit status and handle 429 responses
- #31 (Anti-Mocking Tests) - E2E tests must follow anti-mocking philosophy with real Supabase

### Blocks
None initially - this is foundational work for future UI features

### Follow-Up
- Future: Advanced search filters (file type, date range, repository scope)
- Future: Syntax highlighting in search result previews
- Future: Real-time indexing progress via WebSocket
- Future: User authentication with OAuth (GitHub login)
- Future: Team collaboration features (shared workspaces)

### Child Of
None - standalone feature

## Notes

### Shared Types: The Killer Feature
The monorepo structure provides massive value through shared TypeScript types. Without this, frontend and backend would inevitably drift, causing runtime errors and API contract violations. The shared types approach ensures:

- ✅ **Compile-time safety**: TypeScript catches type mismatches before runtime
- ✅ **Single source of truth**: API contracts defined once, used everywhere
- ✅ **Automatic propagation**: Change a type once, updates everywhere via compiler
- ✅ **Better refactoring**: IDE refactoring tools work across projects
- ✅ **Reduced bugs**: Entire class of integration bugs eliminated at compile time

### Bun Compatibility
Next.js 14+ has proven support for Bun runtime (as of Bun v1.2.9). No known blockers for:
- Development server (`bun run dev`)
- Production builds (`bun run build`)
- Production server (`bun run start`)
- Playwright test runner (`bun run test:e2e`)

### Anti-Mocking Compliance
All E2E tests will use Playwright against the real backend API running on Docker Compose. This follows KotaDB's anti-mocking philosophy:
- No mocked fetch calls or stubbed API responses
- Real Supabase database with seeded test data
- Real authentication flow with test API keys
- Real rate limiting behavior (exhaust quotas in tests)
- Failure injection via real backend errors (send invalid requests, check 4xx/5xx)

### Deployment Flexibility
Initial implementation targets Docker Compose for development. Production deployment can use:
- **Option 1**: Separate Fly.io apps (kotadb-api and kotadb-web) - simpler scaling
- **Option 2**: Single Fly.io app with multi-process (API + Next.js) - lower cost
- **Option 3**: Vercel for Next.js + Fly.io for API - leverages platform strengths

Decision deferred to Phase 8 based on performance testing and cost analysis.

### ADW Automation Impact
Minimal impact on existing ADW workflows:
- Path filters prevent unnecessary CI runs (web/** changes don't trigger app-ci.yml)
- ADW agents can recognize `component:frontend` label for web-specific issues
- May add web-specific slash commands in `.claude/commands/app/` (optional)
- TypeScript validation in `automation/adws/adw_modules/ts_commands.py` can extend to web/

No changes required to core ADW orchestration logic.
