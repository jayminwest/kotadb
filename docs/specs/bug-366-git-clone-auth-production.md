# Bug Plan: Git Clone Authentication Failing in Production After PR #364

## Bug Summary

**Observed behaviour**: Git clone operations fail with exit code 128 in production environment despite PR #364 implementing installation_id population fix for issue #363. Error message: `fatal: could not read Username for 'https://github.com': No such device or address`

**Expected behaviour**: GitHub App installation_id should be populated in `repositories.installation_id` column, enabling authenticated git clone via installation access tokens

**Suspected scope**: Environment configuration issue rather than code defect. PR #364 implementation is correct but requires `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` environment variables that may be missing or incorrectly configured in production.

## Root Cause Hypothesis

**Leading theory**: GitHub App credentials (`GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY`) are either missing or misconfigured in Fly.io production environment, causing `getInstallationForRepository()` to return `null` and fall back to unauthenticated clone attempts.

**Supporting evidence**:
1. **Implementation is defensive**: `installation-lookup.ts:24-43` returns `null` when environment variables are missing rather than throwing errors, allowing graceful fallback to unauthenticated clone
2. **Error logging confirms unauthenticated clone**: Exit code 128 with "could not read Username" indicates git attempted HTTPS clone without credentials
3. **Worker logs installation_id status**: `index-repo.ts:104-112` logs whether `installation_id` is present when processing jobs, providing visibility into whether population succeeded
4. **User reports immediate failure**: Issue filed immediately after PR #364 merge suggests environment configuration was not updated alongside code deployment
5. **No error logs from installation lookup**: Issue description does not mention `[Installation Lookup]` error messages that would appear if API calls failed (app/src/github/installation-lookup.ts:157-194)

**Alternative hypotheses** (lower probability):
- **GitHub App not installed**: User has not installed KotaDB GitHub App on their account/repositories
- **API rate limiting**: GitHub API rate limit exceeded, causing installation lookup to fail and be cached
- **Deployment issue**: PR #364 code not deployed to production or service not restarted after deployment

## Fix Strategy

**Code changes**: None required. PR #364 implementation is correct and handles missing credentials gracefully.

**Data/config updates**:
1. Verify GitHub App is created and configured (see `docs/github-app-setup.md`)
2. Set `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` environment variables in Fly.io production secrets
3. Verify GitHub App is installed on user's account/repositories
4. Clear failed lookup cache if repository was previously cached as failed

**Guardrails**:
1. Add enhanced logging to track installation_id population flow end-to-end
2. Add production environment validation script to verify GitHub App credentials are configured
3. Document troubleshooting steps for users experiencing authentication failures

## Relevant Files

- `app/src/github/installation-lookup.ts` — GitHub App installation lookup logic (already implemented correctly)
- `app/src/api/queries.ts:399-444` — `populateInstallationId()` function that calls installation lookup
- `app/src/queue/workers/index-repo.ts:86-112` — Worker that reads installation_id and passes to prepareRepository
- `app/src/indexer/repos.ts:15-78` — Repository cloning logic that uses installation_id for authentication
- `docs/github-app-setup.md` — GitHub App setup and configuration guide
- `.github/workflows/production-deploy.yml` — Production deployment workflow (if exists)

### New Files

- `app/scripts/validate-github-app-config.ts` — Script to validate GitHub App credentials are configured correctly
- `docs/troubleshooting/git-clone-authentication.md` — User-facing troubleshooting guide for authentication failures

## Task Breakdown

### Verification

**Steps to reproduce current failure**:
1. Query production database to verify installation_id is NULL for failed repository:
   ```sql
   SELECT id, full_name, installation_id, created_at
   FROM repositories
   WHERE full_name = 'jayminwest/jayminwest.com'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
2. Check production logs for installation lookup messages:
   ```bash
   flyctl logs --app kotadb-production | grep -E "(Installation Lookup|git clone)"
   ```
3. Verify production environment variables are set:
   ```bash
   flyctl secrets list --app kotadb-production
   ```
4. Check failed jobs table for error details:
   ```sql
   SELECT id, status, error_message, stats
   FROM index_jobs
   WHERE repository_id IN (
     SELECT id FROM repositories WHERE full_name = 'jayminwest/jayminwest.com'
   )
   ORDER BY created_at DESC
   LIMIT 5;
   ```

**Logs/metrics to capture**:
- Production environment secrets list (verify GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY exist)
- Fly.io deployment status and git SHA (verify PR #364 is deployed)
- Installation lookup log messages showing why lookup failed or returned null
- Database query results showing installation_id value for affected repository

### Implementation

**Ordered steps to deliver the fix**:

1. **Audit production environment configuration**:
   - Check Fly.io secrets list for `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY`
   - If missing, create GitHub App following `docs/github-app-setup.md`
   - Set secrets: `flyctl secrets set GITHUB_APP_ID=<id> GITHUB_APP_PRIVATE_KEY="$(cat app.pem)" --app kotadb-production`

2. **Verify GitHub App installation**:
   - Navigate to https://github.com/settings/installations
   - Verify KotaDB GitHub App is installed on user's account
   - Verify app has access to `jayminwest/jayminwest.com` repository
   - Note installation_id from URL for manual verification

3. **Verify deployment status**:
   - Check deployed git SHA matches PR #364 commit
   - Restart Fly.io service to load new secrets: `flyctl restart --app kotadb-production`

4. **Clear failed lookup cache** (if applicable):
   - Add temporary endpoint or script to call `clearFailedLookupCache('jayminwest/jayminwest.com')`
   - Or wait 1 hour for automatic cache expiration (see `installation-lookup.ts:18`)

5. **Add enhanced logging** (production observability):
   - Enhance `installation-lookup.ts:100-112` to log environment variable presence
   - Enhance `queries.ts:399-444` to log installation_id before and after population
   - Deploy logging improvements to production

6. **Create validation script**:
   - Write `app/scripts/validate-github-app-config.ts` to check credentials and test API connectivity
   - Add to pre-deployment checklist or CI pipeline

7. **Create user troubleshooting documentation**:
   - Write `docs/troubleshooting/git-clone-authentication.md` with step-by-step debugging guide
   - Include common failure modes and resolution steps

### Validation

**Tests to add/update** (integration/e2e hitting Supabase per `/anti-mock`):
1. Integration test for `getInstallationForRepository()` with missing environment variables
2. Integration test for `populateInstallationId()` with mock GitHub API responses
3. E2E test for repository indexing workflow with installation_id population

**Manual checks to run** (record data seeded + failure cases):
1. **Submit test indexing job** for a repository with GitHub App installed:
   ```bash
   curl -X POST https://kotadb.io/api/index \
     -H "Authorization: Bearer <api-key>" \
     -H "Content-Type: application/json" \
     -d '{"repository": "jayminwest/jayminwest.com"}'
   ```
2. **Monitor production logs** in real-time for installation lookup messages:
   ```bash
   flyctl logs --app kotadb-production --timestamps
   ```
3. **Query database** to verify installation_id was populated:
   ```sql
   SELECT id, full_name, installation_id, created_at
   FROM repositories
   WHERE full_name = 'jayminwest/jayminwest.com'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
4. **Check job status** to verify indexing completed successfully:
   ```sql
   SELECT id, status, error_message, stats
   FROM index_jobs
   WHERE repository_id = (
     SELECT id FROM repositories WHERE full_name = 'jayminwest/jayminwest.com' ORDER BY created_at DESC LIMIT 1
   )
   ORDER BY created_at DESC
   LIMIT 1;
   ```
5. **Verify search works** for indexed repository files

## Step by Step Tasks

### Environment Audit
- Check Fly.io production secrets for `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` presence
- If missing, create GitHub App following `docs/github-app-setup.md` and generate credentials
- Set missing secrets in Fly.io: `flyctl secrets set GITHUB_APP_ID=<id> GITHUB_APP_PRIVATE_KEY="$(cat app.pem)" --app kotadb-production`
- Verify GitHub App is installed on user's account at https://github.com/settings/installations
- Verify app has access to affected repository (`jayminwest/jayminwest.com`)

### Deployment Verification
- Check deployed git SHA matches PR #364: `flyctl ssh console --app kotadb-production -C "git rev-parse HEAD"`
- Compare with expected SHA from PR #364 merge commit
- Restart Fly.io service to load new environment variables: `flyctl restart --app kotadb-production`
- Monitor service health after restart

### Production Logging
- Query production database for repository installation_id: `SELECT id, full_name, installation_id FROM repositories WHERE full_name = 'jayminwest/jayminwest.com' ORDER BY created_at DESC LIMIT 1`
- Check production logs for installation lookup messages: `flyctl logs --app kotadb-production | grep "Installation Lookup"`
- Check production logs for git clone errors: `flyctl logs --app kotadb-production | grep "git clone"`
- Query failed jobs for error details: `SELECT id, status, error_message FROM index_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10`

### Cache Management
- Clear failed lookup cache for affected repository if needed (wait 1 hour for automatic expiration or add temporary endpoint to call `clearFailedLookupCache()`)

### Enhanced Logging Implementation
- Add environment variable presence logging to `getInstallationForRepository()` function in `app/src/github/installation-lookup.ts:100-112`
- Add before/after installation_id logging to `populateInstallationId()` in `app/src/api/queries.ts:399-444`
- Add installation lookup cache status logging to help debug cached failures
- Deploy enhanced logging to production

### Validation Script Development
- Create `app/scripts/validate-github-app-config.ts` script that checks for required environment variables
- Add GitHub API connectivity test (list installations, verify credentials work)
- Add to production deployment checklist or CI pre-deployment step
- Test script locally with valid and invalid credentials

### User Documentation
- Create `docs/troubleshooting/git-clone-authentication.md` with user-facing troubleshooting steps
- Document common failure modes: missing credentials, app not installed, rate limits, deployment issues
- Include diagnostic SQL queries and Fly.io commands for user self-service debugging
- Add cross-references from `docs/github-app-setup.md` to troubleshooting guide

### Manual End-to-End Testing
- Submit test indexing job for `jayminwest/jayminwest.com` repository via API
- Monitor production logs for `[Installation Lookup]` messages showing successful installation_id retrieval
- Verify database shows populated installation_id after job submission
- Verify indexing job completes with status='completed'
- Test search functionality for indexed repository files

### Re-validation and Branch Push
- Run `bun run lint` to verify code quality
- Run `bun run typecheck` to verify type safety
- Run `bun test --filter integration` to verify integration tests pass
- Run `bun test` to verify all tests pass
- Run `bun run build` to verify production build succeeds
- Verify production environment is operational and serving requests
- Document findings and resolution steps in issue #366 comment
- Close issue #366 as resolved with summary of root cause and fix

## Regression Risks

**Adjacent features to watch**:
1. **Local repository indexing**: Ensure `localPath` indexing still works (should skip installation lookup per `queries.ts:475,498`)
2. **Public repository indexing**: Ensure unauthenticated clone fallback still works for public repos when installation_id is null
3. **Rate limiting**: Enhanced logging may increase log volume; monitor for log aggregation cost impacts
4. **Failed lookup cache**: Verify cache expiration works correctly to prevent indefinite caching of transient failures

**Follow-up work if risk materialises**:
1. If public repositories start failing: Review fallback logic in `repos.ts:42-62` to ensure null installation_id is handled correctly
2. If local indexing breaks: Add test coverage for `localPath` workflow to prevent regressions
3. If cache prevents recovery: Reduce cache TTL from 1 hour to 15 minutes or add manual cache clearing endpoint
4. If logs become too verbose: Add log level configuration to control installation lookup verbosity

## Validation Commands

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Integration tests
bun test --filter integration

# All tests
bun test

# Production build
bun run build

# Production environment validation
flyctl secrets list --app kotadb-production

# Production logs monitoring
flyctl logs --app kotadb-production --timestamps

# Deployment verification
flyctl ssh console --app kotadb-production -C "git rev-parse HEAD"
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix: add github app credentials validation` not `Looking at the changes, this commit adds validation for GitHub App credentials`

## Issue Relationships

**Blocks**:
- #355 (Production MVP launch) - Critical blocker preventing repository indexing in production

**Related To**:
- #363 (Git clone authentication for manual indexing) - Original issue addressed by PR #364
- #364 (PR implementing installation_id population) - Fix implemented correctly but requires environment configuration
- #337 (GitHub App installation tokens epic) - Parent epic for GitHub App authentication work
- #257 (GitHub Integration epic) - Overall GitHub App integration initiative

**Depends On**:
- GitHub App must be created following `docs/github-app-setup.md`
- GitHub App credentials (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`) must be configured in Fly.io production environment
- GitHub App must be installed on user's account/repositories

## References

- Issue #363: https://github.com/kotadb/kotadb/issues/363
- PR #364: https://github.com/kotadb/kotadb/pull/364
- Implementation: `app/src/github/installation-lookup.ts:1-228`
- Repository queries: `app/src/api/queries.ts:399-503`
- Indexing worker: `app/src/queue/workers/index-repo.ts:86-137`
- Repository cloning: `app/src/indexer/repos.ts:15-78`
- Setup guide: `docs/github-app-setup.md:132-161`

## Notes

- This is a **critical production blocker** that must be resolved before MVP launch (#355)
- The bug is an **environment configuration issue**, not a code defect
- PR #364 implementation is correct and handles missing credentials gracefully
- Priority is on **environment audit and configuration** before any code changes
- Enhanced logging will improve production observability for future authentication issues
- Consider adding **health check endpoint** to verify GitHub App credentials at deployment time
