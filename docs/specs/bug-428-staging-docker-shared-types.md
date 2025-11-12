# Bug Plan: Resolve Staging Deployment Module Resolution Failure

## Bug Summary
- **Observed behavior**: kotadb-staging Fly.io deployment crashes with module resolution error: `Cannot find module "@shared/types/rate-limit" from "/app/src/auth/rate-limit.ts"`. Application enters restart loop and eventually hits Fly's max restart count (10).
- **Expected behavior**: Staging deployment successfully starts and serves API requests without module resolution errors.
- **Suspected scope**: Docker build context configuration. The `app/Dockerfile` (at `app/Dockerfile:1-16`) copies files only from the `app/` directory but TypeScript path alias `@shared/*` references parent directory `../shared/*` (configured in `app/tsconfig.json:21`), which is outside the Docker build context.

## Root Cause Hypothesis
- **Leading theory**: The `shared/types/rate-limit.ts` file was moved to the `shared/` directory in PR #426 (implementing issue #423) to enable sharing between frontend and backend. However, the rate-limit types are **only used by the backend** (2 files in `app/src/`), not by the web frontend. The Docker build for Fly.io staging has its context rooted at `app/`, making the parent `../shared/` directory inaccessible during the `COPY . .` step in `app/Dockerfile:12`.
- **Supporting evidence**:
  1. Error message explicitly states module not found: `Cannot find module "@shared/types/rate-limit"`
  2. Grep search confirms `web/` has **zero imports** of `@shared/types/rate-limit`
  3. Only 2 backend files use these types: `app/src/auth/rate-limit.ts:13-17` and `app/src/api/routes.ts:2`
  4. `app/Dockerfile:12` uses `COPY . .` which only copies `app/` directory contents
  5. `fly.toml` is located at `app/fly.toml` (confirmed at `app/fly.toml:1-21`), defining build context as `app/`
  6. Previous fix attempt (commit 75e3e16) moved `fly.toml` to root but was reverted (commit b2fad47), confirming Docker context issues

## Fix Strategy
- **Code changes**: Move `shared/types/rate-limit.ts` back to `app/src/types/rate-limit.ts` since these types are backend-only. Update 2 import statements in `app/src/` from `@shared/types/rate-limit` to use internal path alias or relative imports.
- **Data/config updates**: None required (no database changes, no Fly.io configuration changes).
- **Guardrails**:
  1. Verify web frontend continues to build (shouldn't be affected since it doesn't import rate-limit types)
  2. Add validation step to catch future misuse of shared/ for backend-only types
  3. Test staging deployment end-to-end before merging

## Relevant Files
- `shared/types/rate-limit.ts` — Source file to be moved to `app/src/types/`
- `app/src/auth/rate-limit.ts` — Imports rate-limit types (line 13-17)
- `app/src/api/routes.ts` — Imports RateLimitResult type (line 2)
- `app/tsconfig.json` — May need new path alias for `@types/*` (line 16-26)
- `app/Dockerfile` — Context for understanding build limitations (no changes needed)
- `app/fly.toml` — Deployment config (no changes needed)

### New Files
- `app/src/types/rate-limit.ts` — Moved from `shared/types/rate-limit.ts` (backend-only types)

## Task Breakdown

### Verification
1. Confirm current staging failure state:
   ```bash
   fly logs -a kotadb-staging --region iad | grep -i "cannot find module"
   ```
2. Verify web frontend does NOT import rate-limit types:
   ```bash
   cd web && grep -r "@shared/types/rate-limit" src/
   # Expected: No matches
   ```
3. Identify all backend imports to update:
   ```bash
   cd app && grep -r "@shared/types/rate-limit" src/
   # Expected: app/src/auth/rate-limit.ts and app/src/api/routes.ts
   ```

### Implementation
1. Create `app/src/types/` directory if it doesn't exist:
   ```bash
   mkdir -p app/src/types
   ```
2. Move rate-limit types file:
   ```bash
   git mv shared/types/rate-limit.ts app/src/types/rate-limit.ts
   ```
3. Update TypeScript path alias in `app/tsconfig.json` (add to paths object at line 16-26):
   ```json
   "@types/*": ["src/types/*"]
   ```
4. Update import in `app/src/auth/rate-limit.ts` (line 13-17):
   ```typescript
   // OLD:
   import {
     DAILY_RATE_LIMITS,
     RATE_LIMITS,
     type RateLimitResult,
   } from "@shared/types/rate-limit";

   // NEW:
   import {
     DAILY_RATE_LIMITS,
     RATE_LIMITS,
     type RateLimitResult,
   } from "@types/rate-limit";
   ```
5. Update import in `app/src/api/routes.ts` (line 2):
   ```typescript
   // OLD:
   import type { RateLimitResult } from "@shared/types/rate-limit";

   // NEW:
   import type { RateLimitResult } from "@types/rate-limit";
   ```

### Validation
1. Verify type-checking passes for backend:
   ```bash
   cd app && bunx tsc --noEmit
   ```
2. Verify web frontend still builds (should be unaffected):
   ```bash
   cd web && npm run build
   ```
3. Run backend unit tests:
   ```bash
   cd app && bun test
   ```
4. Run integration tests (rate-limit specific):
   ```bash
   cd app && bun test --filter "rate-limit"
   ```
5. Test staging deployment:
   ```bash
   cd app && fly deploy --app kotadb-staging
   # Wait for deployment to complete
   fly logs -a kotadb-staging --region iad
   # Expected: No module resolution errors, successful startup
   ```
6. Smoke test staging API endpoints:
   ```bash
   # Test health endpoint
   curl https://kotadb-staging.fly.dev/health

   # Test rate-limited endpoint (requires valid API key from staging)
   curl -H "Authorization: Bearer sk_test_..." https://kotadb-staging.fly.dev/v1/search/code?term=test
   ```
7. Verify rate-limiting headers in response:
   ```bash
   curl -I -H "Authorization: Bearer sk_test_..." https://kotadb-staging.fly.dev/v1/search/code?term=test | grep -i ratelimit
   # Expected: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
   ```

## Step by Step Tasks

### Pre-Implementation Verification
- Confirm staging is currently failing with module resolution error
- Verify web/ has zero imports of rate-limit types (already confirmed in investigation)
- Document all backend files importing rate-limit types (2 files: auth/rate-limit.ts, api/routes.ts)

### Move Rate-Limit Types to Backend
- Create `app/src/types/` directory if needed
- Move `shared/types/rate-limit.ts` to `app/src/types/rate-limit.ts` using git mv
- Add `@types/*` path alias to `app/tsconfig.json`
- Update import in `app/src/auth/rate-limit.ts`
- Update import in `app/src/api/routes.ts`

### Local Validation
- Run `bun run typecheck` in app/ to verify TypeScript compilation
- Run `npm run build` in web/ to ensure frontend unaffected
- Run `bun test` in app/ to verify all tests pass
- Run `bun test --filter "rate-limit"` for targeted rate-limit tests

### Staging Deployment and Verification
- Deploy to staging: `cd app && fly deploy --app kotadb-staging`
- Monitor deployment logs for successful startup (no module resolution errors)
- Smoke test staging health endpoint
- Test rate-limited API endpoint with valid staging API key
- Verify rate-limit response headers are present and correct

### Finalize and Push
- Run all validation commands to ensure no regressions
- Stage all changes: `git add -A`
- Commit with conventional format: `fix: move rate-limit types to backend for Docker build context (#428)`
- Push branch: `git push -u origin bug/428-staging-docker-shared-types`

## Regression Risks
- **Adjacent features to watch**:
  1. Web frontend pricing page (may hardcode rate limits instead of importing them) - Low risk since web/ doesn't import rate-limit types
  2. Rate-limiting enforcement logic - Medium risk, mitigated by existing integration tests
  3. Other shared types in `shared/types/` (api.ts, auth.ts) - No risk, only moving rate-limit.ts
- **Follow-up work if risk materializes**:
  1. If web frontend needs to display rate limits dynamically in future, export RATE_LIMITS and DAILY_RATE_LIMITS constants from `@shared/types/api` (but keep types/interfaces in backend)
  2. If other backend-only types are mistakenly added to `shared/`, document guidelines in `shared/README.md` about when to use shared/ vs app/src/types/

## Validation Commands
```bash
# Linting
bun run lint

# Type-checking (backend)
cd app && bunx tsc --noEmit

# Type-checking (frontend - ensure no regressions)
cd web && npm run typecheck

# Unit and integration tests
cd app && bun test

# Build verification
cd app && bun run build

# Staging deployment (Level 3 validation - critical bug affecting production path)
cd app && fly deploy --app kotadb-staging
fly logs -a kotadb-staging --region iad

# API smoke tests (manual - requires staging API key)
curl https://kotadb-staging.fly.dev/health
curl -H "Authorization: Bearer sk_test_..." https://kotadb-staging.fly.dev/v1/search/code?term=test
```

## Commit Message Validation
All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix: move rate-limit types to backend for Docker build context` not `Looking at the changes, this commit moves the rate-limit types to fix Docker build context`

**Example valid commit message:**
```
fix: move rate-limit types to backend for Docker build context (#428)
```
