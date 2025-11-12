# Chore Plan: Fix Staging Deployment - Move Rate Limit Types to Backend

## Context
The kotadb-staging Fly.io deployment is completely down due to a module resolution error introduced in PR #426 (issue #423). The application cannot find `@shared/types/rate-limit` at runtime, causing continuous restart loops and hitting Fly's max restart count.

**Root Cause:** PR #423 modified `shared/types/rate-limit.ts` to add daily rate limit constants. However, the `app/` backend Docker build context cannot access the parent `shared/` directory, breaking module resolution in the Fly.io container.

**Critical Discovery:** The `shared/` directory was created in issue #150 to share types between `app/` (backend) and `web/` (frontend). However, the web frontend does NOT use `@shared/types/rate-limit` - it only uses `@shared/types/api` and `@shared/types/auth`. The rate-limit types are backend-only.

**Why This Chore Matters:**
- **Critical Impact:** Staging environment is completely down, blocking all validation before production
- **Simple Solution:** Move backend-only types back to `app/src/types/` (follows single responsibility principle)
- **Zero Risk:** Web frontend will be unaffected (verified zero imports)
- **Fast Resolution:** Can be deployed within hours

**Constraints:**
- `fly.toml` MUST remain in `app/` directory (only backend deploys to Fly.io)
- `web/` frontend deploys separately to Vercel
- Solution must not break local development workflow
- No significant build time/size regression
- Must be tested in staging before merge

## Relevant Files
- `shared/types/rate-limit.ts` — Backend-only types to be moved
- `app/src/auth/rate-limit.ts` — Main consumer of rate-limit types
- `app/src/api/routes.ts` — Imports rate-limit types for middleware
- `app/tsconfig.json` — Path aliases for import resolution
- `app/Dockerfile` — Docker build configuration (context limitation)
- `app/fly.toml` — Fly.io deployment configuration
- `shared/README.md` — Documents purpose of shared/ directory
- `docs/specs/feature-423-increase-rate-limits-daily-quotas.md` — Introduced the issue
- `docs/specs/feature-152-shared-types-infrastructure.md` — Original shared/ infrastructure

### New Files
- `app/src/types/rate-limit.ts` — Relocated rate-limit types (backend-only)

## Work Items

### Preparation
1. Verify current import usage across codebase
2. Create feature branch `chore/428-fix-staging-docker-shared-types` from `develop`
3. Backup current staging configuration

### Execution
1. Move `shared/types/rate-limit.ts` to `app/src/types/rate-limit.ts`
2. Update all imports in `app/src/` from `@shared/types/rate-limit` to `@/types/rate-limit`
3. Update `shared/README.md` to clarify rate-limit types are backend-only
4. Type-check both `app/` and `web/` to ensure no breakage
5. Test local development environment
6. Deploy to staging and verify successful startup
7. Test API endpoints with rate limiting

### Follow-up
1. Monitor staging logs for 15 minutes post-deployment
2. Update documentation to reflect new location
3. Verify web frontend builds continue to work
4. Close issue #428 with resolution summary

## Step by Step Tasks

### Git Setup
- Create branch from develop: `git checkout develop && git pull && git checkout -b chore/428-fix-staging-docker-shared-types`

### Move Rate Limit Types
- Copy `shared/types/rate-limit.ts` to `app/src/types/rate-limit.ts`
- Delete `shared/types/rate-limit.ts`

### Update Imports in app/
- Update `app/src/auth/rate-limit.ts`: Change `@shared/types/rate-limit` to `@/types/rate-limit`
- Update `app/src/api/routes.ts`: Change `@shared/types/rate-limit` to `@/types/rate-limit`
- Search for any other files importing rate-limit: `grep -r "@shared/types/rate-limit" app/src/`

### Update Documentation
- Update `shared/README.md`: Add note that rate-limit types were moved to `app/src/types/` (backend-only)
- Update `docs/specs/feature-152-shared-types-infrastructure.md`: Document that rate-limit types were moved back to app/ in #428

### Validation
- Run type-check in app: `cd app && bunx tsc --noEmit`
- Run type-check in web: `cd web && bunx tsc --noEmit`
- Run tests: `cd app && bun test`
- Run linter: `cd app && bun run lint`
- Test local development: `cd app && ./scripts/dev-start.sh`

### Deployment
- Commit changes with conventional commit message
- Push branch: `git push -u origin chore/428-fix-staging-docker-shared-types`
- Deploy to staging via Fly.io (triggered automatically or manually)
- Monitor staging logs: `fly logs -a kotadb-staging`
- Verify successful startup (no module resolution errors)

### Testing
- Test rate-limited endpoint: `curl -X POST https://staging.kotadb.com/api/index -H "Authorization: Bearer <token>"`
- Verify rate-limit headers in response
- Test daily quota enforcement
- Verify web frontend still builds: `cd web && bun run build`

### Final Push
- Ensure all validation passes
- Push final changes: `git push`
- Create PR with title: `chore: fix staging deployment by moving rate-limit types to backend (#428)`

## Risks
- **Risk:** Breaking web frontend builds
  - **Mitigation:** Web has zero imports of rate-limit types (verified via grep). Type-check web/ before merging.
- **Risk:** Breaking local development workflow
  - **Mitigation:** Test `./scripts/dev-start.sh` locally before pushing. Path alias `@/types/*` already exists in `app/tsconfig.json`.
- **Risk:** Introducing different behavior in staging vs production
  - **Mitigation:** Same Docker image builds for both environments. Staging test will validate production path.
- **Risk:** Missing imports in other parts of codebase
  - **Mitigation:** Type-check catches all import errors. Run `bunx tsc --noEmit` before committing.

## Validation Commands
```bash
# Type-checking
cd app && bunx tsc --noEmit
cd web && bunx tsc --noEmit

# Tests
cd app && bun test

# Linting
cd app && bun run lint

# Build
cd app && bun run build
cd web && bun run build

# Local development
cd app && ./scripts/dev-start.sh

# Staging deployment verification
fly logs -a kotadb-staging --recent
curl -I https://staging.kotadb.com/health

# Rate limit testing
curl -X POST https://staging.kotadb.com/api/index \
  -H "Authorization: Bearer <test-token>" \
  -H "Content-Type: application/json" \
  -d '{"repository":"test/repo"}'
```

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: move rate-limit types to backend` not `Based on the plan, the commit should move rate-limit types`

**Example commit messages:**
- `chore: move rate-limit types from shared to app/src/types`
- `chore: update imports to use backend-only rate-limit types`
- `docs: clarify rate-limit types are backend-only in shared README`

## Deliverables
- Code changes:
  - `app/src/types/rate-limit.ts` (new file, moved from shared/)
  - `app/src/auth/rate-limit.ts` (updated imports)
  - `app/src/api/routes.ts` (updated imports)
- Documentation updates:
  - `shared/README.md` (clarify rate-limit scope)
  - `docs/specs/feature-152-shared-types-infrastructure.md` (document move)
- Verification:
  - Staging deployment logs showing successful startup
  - Type-check passing for both app/ and web/
  - Rate-limit API endpoints working correctly
  - Web frontend builds successfully
