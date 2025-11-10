# Bug Plan: Git Clone Authentication Failure in Production

## Bug Summary

**Observed Behavior**: In production, git clone operations fail during repository indexing with exit code 128:
```
fatal: could not read Username for 'https://github.com': No such device or address
```
The error is logged to `index_jobs` table with status `failed`, but users receive no indication that indexing failed. The web UI and API provide no feedback about job failures.

**Expected Behavior**:
1. Git clone operations should succeed using GitHub App installation tokens for authenticated access
2. Failed indexing jobs should surface actionable error messages to users via web UI and API
3. Users should be able to poll job status to track indexing progress

**Suspected Scope**:
- Backend indexing worker (authentication flow)
- API layer (job status surfacing)
- Web UI (error display)
- GitHub webhook processor (installation_id population)

## Root Cause Hypothesis

**Leading Theory**: The `installation_id` column in production repositories is NULL, causing fallback to unauthenticated HTTPS clone, which fails for private repositories with exit code 128.

**Supporting Evidence**:
1. Code analysis shows authentication flow exists (app/src/indexer/repos.ts:64-78, app/src/queue/workers/index-repo.ts:86-112)
2. Worker explicitly checks for `installation_id` and falls back to unauthenticated clone when NULL (app/src/indexer/repos.ts:71-73)
3. Webhook processor includes logic to store `installation_id` from push events (app/src/github/webhook-processor.ts:66-79)
4. User repository was likely created via manual `/index` API call, bypassing webhook flow
5. The `ensureRepository()` function in app/src/api/queries.ts:401-440 does NOT populate `installation_id` when creating repositories

**Secondary Issue**: Job status tracking exists (`GET /jobs/:jobId` endpoint at app/src/api/routes.ts:334-354) but is not integrated into the web UI, leaving users unaware of failures.

## Fix Strategy

### Primary Fix: Populate installation_id for Manual Repository Creation

**Option A - GitHub API Lookup (Recommended)**:
When a repository is created via `/index` API:
1. Query GitHub App installations API to find installation ID for the repository owner
2. Store installation_id in repositories table during creation
3. Fallback gracefully to NULL for users without GitHub App installed

**Option B - Require GitHub App Installation**:
Block manual indexing for private repositories without GitHub App installation:
1. Add validation in `/index` endpoint to check if repository is private
2. Return error with GitHub App installation link if no installation_id available
3. Guide users to install GitHub App before indexing

### Secondary Fix: Surface Job Status in Web UI

1. Add polling mechanism in web UI to query `GET /jobs/:jobId` endpoint
2. Display job status (pending, processing, completed, failed) with progress indicators
3. Show actionable error messages for common failures:
   - Authentication failures → "Unable to access repository. Please install the GitHub App."
   - Repository not found → "Repository not found. Verify the repository name."
   - Git errors → "Failed to clone repository. Contact support with job ID: {jobId}"

## Relevant Files

### Existing Files (To Modify)
- app/src/api/queries.ts:401-440 — `ensureRepository()` function needs installation_id lookup
- app/src/api/routes.ts:263-331 — `/index` endpoint needs to handle installation_id population
- app/src/github/app-auth.ts — May need new function to query installations by owner
- app/src/queue/workers/index-repo.ts:86-112 — Worker already handles installation_id correctly
- app/src/github/webhook-processor.ts:66-79 — Webhook processor already stores installation_id

### Files to Investigate
- web/app/index/page.tsx — Web UI index page (needs job status polling)
- web/components/ — UI components for job status display
- app/src/github/types.ts — May need new types for GitHub API responses

### New Files
- app/src/github/installation-lookup.ts — New module for querying GitHub App installations by repository

## Task Breakdown

### Phase 1: Diagnosis and Verification

**Verify Production State**:
1. Query production `repositories` table to confirm `installation_id` is NULL:
   ```sql
   SELECT id, full_name, installation_id, user_id, created_at
   FROM repositories
   WHERE full_name = 'jayminwest/jayminwest.com'
   ORDER BY created_at DESC;
   ```
2. Check production environment variables via Fly.io CLI:
   ```bash
   flyctl secrets list --app kotadb-production
   # Verify: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY
   ```
3. Query `index_jobs` table for recent failures:
   ```sql
   SELECT id, repository_id, status, error_message, created_at
   FROM index_jobs
   WHERE status = 'failed'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

**Identify Gap in Installation ID Population**:
1. Trace repository creation flow from `/index` API endpoint
2. Confirm `ensureRepository()` does not query GitHub API for installation_id
3. Document expected webhook flow vs manual API flow

### Phase 2: Implement Installation ID Lookup

**Create GitHub Installation Lookup Module** (app/src/github/installation-lookup.ts):
1. Add function `getInstallationForRepository(owner: string, repo: string): Promise<number | null>`
2. Use Octokit App SDK to list installations: `app.octokit.request("GET /app/installations")`
3. For each installation, check repository access: `GET /user/installations/{installation_id}/repositories`
4. Return installation_id if repository is accessible, null otherwise
5. Add error handling for:
   - GitHub API rate limits (return null, log warning)
   - Authentication failures (throw GitHubAppError)
   - Network timeouts (return null, log warning)

**Update ensureRepository() Function** (app/src/api/queries.ts:401-440):
1. After creating new repository, attempt to lookup installation_id
2. Parse repository full_name to extract owner and repo name
3. Call `getInstallationForRepository(owner, repo)`
4. If installation_id found, update repositories table:
   ```sql
   UPDATE repositories
   SET installation_id = ?
   WHERE id = ?
   ```
5. Log result (success with installation_id, or fallback to public clone)

**Add Installation ID Update for Existing Repositories**:
1. For existing repositories (when `ensureRepository()` finds a match), check if installation_id is NULL
2. If NULL, attempt lookup and update
3. Cache lookup failures in memory (Map<string, boolean>) to avoid repeated API calls

### Phase 3: Add Job Status Surfacing in Web UI

**Backend (No Changes Needed)**:
- Endpoint `GET /jobs/:jobId` already exists (app/src/api/routes.ts:334-354)
- Returns full job object with status, error_message, stats

**Frontend Implementation**:
1. Modify web UI index page to store job ID from `/index` response
2. Add polling mechanism (useEffect hook) to query `/jobs/:jobId` every 2 seconds
3. Display job status with visual indicators:
   - `pending` → Loading spinner + "Queued for indexing..."
   - `processing` → Progress bar + "Indexing... {files_indexed} files processed"
   - `completed` → Success checkmark + "Indexed {files_indexed} files, {symbols_extracted} symbols"
   - `failed` → Error icon + error_message from API
4. Add "View Details" button to show full job stats (modal or expanded section)
5. Stop polling when job reaches terminal state (completed or failed)

**User-Friendly Error Messages**:
Map technical error messages to actionable guidance:
- Error contains "could not read Username" → "Unable to access private repository. Please install the GitHub App at [link]"
- Error contains "Repository not found" → "Repository not found. Verify the repository name is correct."
- Error contains "exit code 128" → "Git clone failed. This may be a private repository requiring GitHub App installation."
- Default fallback → "Indexing failed: {error_message}. Contact support with job ID: {jobId}"

### Phase 4: Testing and Validation

**Local Testing**:
1. Test repository creation via `/index` API with valid GitHub App installation
2. Verify installation_id is populated correctly in repositories table
3. Test repository creation for user without GitHub App (should fallback to NULL gracefully)
4. Test indexing job succeeds for private repository with installation_id
5. Test indexing job fails gracefully for private repository without installation_id
6. Verify web UI displays job status correctly for all states

**Integration Tests** (app/tests/api/):
1. Test `ensureRepository()` with mocked GitHub API responses:
   - Installation found → installation_id populated
   - No installation → installation_id remains NULL
   - API error → graceful fallback, logging warning
2. Test `/index` endpoint creates job and enqueues to pg-boss
3. Test `GET /jobs/:jobId` returns correct status and error messages

**Staging Deployment**:
1. Deploy to staging environment (Vercel preview + Fly.io staging backend)
2. Install GitHub App on test repository
3. Trigger indexing via web UI
4. Verify git clone succeeds with installation token
5. Check staging logs for authentication flow
6. Test error path by removing GitHub App installation mid-indexing

### Phase 5: Production Deployment and Monitoring

**Pre-Deployment Checklist**:
- [ ] Verify `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` are configured in production
- [ ] Merge PR to `develop` branch
- [ ] Deploy to staging and validate end-to-end
- [ ] Monitor staging logs for 24 hours (no authentication errors)
- [ ] Create rollback plan (revert PR, manual installation_id updates)

**Production Deployment**:
1. Merge `develop` to `main` via release PR
2. Deploy backend changes to Fly.io production
3. Deploy frontend changes to Vercel production
4. Monitor deployment logs for errors

**Post-Deployment Verification**:
1. Test repository indexing with existing user account
2. Query production database to confirm installation_id is populated:
   ```sql
   SELECT id, full_name, installation_id
   FROM repositories
   WHERE user_id = '<test-user-id>'
   ORDER BY created_at DESC;
   ```
3. Trigger indexing job and monitor `index_jobs` table
4. Verify job completes successfully (status = 'completed')
5. Check web UI displays job status correctly

**Monitoring**:
1. Set up alert for git clone failures (error_message contains "exit code 128")
2. Track indexing job failure rate (status = 'failed') in Supabase dashboard
3. Monitor GitHub App API usage (rate limits, authentication failures)
4. Add log aggregation for installation_id lookup failures

## Step by Step Tasks

### Investigation and Diagnosis
1. Query production repositories table to verify installation_id is NULL for affected repositories
2. Check production environment variables for GitHub App credentials
3. Review recent failed index_jobs to identify patterns
4. Trace repository creation flow from `/index` API to identify missing installation_id population
5. Document expected webhook flow vs manual API flow

### Implementation - Installation ID Lookup
1. Create new module `app/src/github/installation-lookup.ts` for querying GitHub App installations
2. Implement `getInstallationForRepository(owner, repo)` function using Octokit App SDK
3. Add error handling for GitHub API failures (rate limits, auth errors, timeouts)
4. Write unit tests for installation lookup function with mocked GitHub API responses
5. Update `ensureRepository()` in `app/src/api/queries.ts` to call installation lookup after creating repository
6. Add installation_id update logic for existing repositories with NULL installation_id
7. Implement in-memory cache to avoid repeated API calls for lookup failures
8. Add logging for installation_id lookup successes and failures

### Implementation - Job Status Surfacing
1. Add polling mechanism in web UI to query `GET /jobs/:jobId` endpoint every 2 seconds
2. Create job status display component with visual indicators for pending/processing/completed/failed states
3. Map technical error messages to user-friendly actionable guidance
4. Add "View Details" modal/section to show full job stats
5. Stop polling when job reaches terminal state
6. Add error message display with contextual help links (GitHub App installation, support)

### Testing - Local and Integration
1. Test repository creation via `/index` API with GitHub App installation (installation_id populated)
2. Test repository creation without GitHub App (graceful fallback to NULL)
3. Test indexing job succeeds for private repository with installation_id
4. Test indexing job fails gracefully for private repository without installation_id
5. Write integration tests for `ensureRepository()` with mocked GitHub API
6. Write integration tests for job status polling in web UI
7. Test error message mapping for all failure scenarios

### Testing - Staging Validation
1. Deploy changes to staging environment (Vercel preview + Fly.io staging)
2. Install GitHub App on test repository
3. Trigger indexing via staging web UI
4. Verify git clone succeeds with installation token in logs
5. Monitor staging logs for 24 hours to catch edge cases
6. Test error path by removing GitHub App installation mid-indexing
7. Verify staging database shows correct installation_id values

### Deployment and Monitoring
1. Create PR from feature branch to `develop` with commit message: `fix: populate installation_id for manual repository indexing (#363)`
2. Merge PR after code review and CI passes
3. Promote `develop` to `main` via release PR (verify staging validation complete)
4. Deploy to production (Fly.io backend + Vercel frontend)
5. Monitor deployment logs for errors during rollout
6. Verify production environment variables are configured correctly
7. Test production indexing with real user account
8. Query production database to confirm installation_id populated for new repositories
9. Set up monitoring alerts for git clone failures and indexing job failure rate
10. Push final changes to remote: `git push -u origin bug/363-git-clone-auth-failure`

## Regression Risks

**Adjacent Features to Watch**:
1. **Public repository indexing**: Ensure NULL installation_id fallback still works for public repos
2. **Webhook-based indexing**: Verify webhook flow continues to populate installation_id (no regression)
3. **GitHub App token caching**: Monitor token cache for increased memory usage if lookup fails frequently
4. **Rate limiting**: GitHub API calls for installation lookup may hit rate limits under high load
5. **Existing repositories**: Ensure backfill logic for NULL installation_id doesn't cause performance issues

**Follow-Up Work If Risk Materializes**:
1. If rate limiting becomes an issue, add request throttling or batch lookup API
2. If public repo indexing breaks, add explicit check for repository privacy before lookup
3. If webhook flow regresses, add integration test covering webhook → installation_id flow
4. If performance degrades, add database migration to backfill installation_id offline
5. If token cache memory usage spikes, implement LRU eviction policy

## Validation Commands

Run these commands to validate the fix before deployment:

```bash
# Linting and type-checking
cd app && bun run lint
cd app && bunx tsc --noEmit

# Unit tests (all)
cd app && bun test

# Integration tests (database and API)
cd app && bun test --filter integration

# Specific test suites for modified code
cd app && bun test src/api/queries.test.ts
cd app && bun test src/github/installation-lookup.test.ts
cd app && bun test tests/queue/workers/index-repo.test.ts

# Build validation
cd app && bun run build

# Validate migration sync (ensure no drift)
cd app && bun run test:validate-migrations

# Manual API testing (local development)
# 1. Start Supabase Local and pg-boss worker
cd app && ./scripts/dev-start.sh

# 2. Create test repository via API (check installation_id populated)
curl -X POST http://localhost:3000/index \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"repository":"owner/repo"}'

# 3. Check job status (verify polling works)
curl http://localhost:3000/jobs/JOB_ID \
  -H "Authorization: Bearer YOUR_API_KEY"

# 4. Query repositories table (verify installation_id populated)
psql postgresql://postgres:postgres@localhost:54322/postgres \
  -c "SELECT id, full_name, installation_id FROM repositories ORDER BY created_at DESC LIMIT 5;"

# Production smoke test (after deployment)
curl https://kotadb.com/health
```

**Level 3 Validation** (High-impact backend change):
- Run full integration test suite with real Supabase Local database
- Test GitHub App authentication end-to-end with test installation
- Validate error handling for all failure modes (no installation, API errors, rate limits)
- Monitor staging for 24 hours before production deployment
- Perform production smoke test after deployment

## Commit Message Validation

All commits for this bug fix must follow Conventional Commits format:

**Valid commit messages**:
- `fix: populate installation_id during repository creation`
- `feat: add GitHub installation lookup module`
- `test: add integration tests for installation_id population`
- `refactor: extract installation lookup logic into separate module`
- `docs: update architecture docs for installation_id flow`

**INVALID commit messages** (avoid meta-commentary):
- ❌ `Looking at the changes, this commit fixes the authentication bug`
- ❌ `Based on the issue, I can see this adds installation lookup`
- ❌ `The commit should populate installation_id correctly`
- ❌ `Here is the fix for git clone authentication`
- ❌ `This commit resolves the private repository issue`

**Use direct, imperative statements**:
- ✅ `fix: query GitHub API for installation_id during repo creation`
- ✅ `feat: surface job status and errors in web UI`
