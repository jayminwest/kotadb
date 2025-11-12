# Bug Plan: GitHub Installation Repository Lookup API Endpoint

## Bug Summary
- **Observed behaviour**: GitHub App installation lookup fails with "unknown" error when checking installation 94077685, causing private repository indexing to fall back to unauthenticated git clone which fails with exit code 128
- **Expected behaviour**: Installation lookup should successfully find repositories accessible to installation 94077685 and return the installation ID for authenticated git clone
- **Suspected scope**: `app/src/github/installation-lookup.ts:143-148` - incorrect GitHub API endpoint being used for repository enumeration

## Root Cause Hypothesis
- **Leading theory**: The code uses `GET /user/installations/{installation_id}/repositories` endpoint which requires a user access token, but is being called with a GitHub App JWT token that doesn't have user context
- **Supporting evidence**:
  - Production logs show error status "unknown" when calling the user-scoped endpoint
  - GitHub API documentation confirms `/user/installations/{installation_id}/repositories` is user-scoped
  - The correct endpoint for GitHub App context is `GET /installation/repositories` which works with installation access tokens
  - Code at `app/src/github/installation-lookup.ts:143-148` uses `app.octokit.request()` with App JWT, not an installation token

## Fix Strategy
- **Code changes**:
  - Replace `/user/installations/{installation_id}/repositories` with `/installation/repositories` endpoint
  - Generate installation access token before querying repositories using `getInstallationToken()` from `app/src/github/app-auth.ts`
  - Create authenticated Octokit instance using installation token via `getOctokitForInstallation()` from `app/src/github/client.ts`
  - Update response parsing to match the `/installation/repositories` response structure
- **Data/config updates**: None required
- **Guardrails**:
  - Add integration test to verify endpoint works with real GitHub API
  - Maintain existing error handling and cache logic
  - Ensure token generation errors propagate correctly

## Relevant Files
- `app/src/github/installation-lookup.ts` — contains incorrect API endpoint at lines 143-148
- `app/src/github/app-auth.ts` — provides `getInstallationToken()` for generating installation access tokens
- `app/src/github/client.ts` — provides `getOctokitForInstallation()` for authenticated Octokit clients
- `app/tests/github/installation-lookup.test.ts` — existing tests to update for new endpoint behavior

### New Files
None required

## Task Breakdown

### Verification
- Reproduce current failure by examining production logs showing error status "unknown" for installation 94077685
- Verify that `getInstallationToken()` and `getOctokitForInstallation()` exist and work correctly
- Confirm GitHub API documentation for `/installation/repositories` endpoint requirements

### Implementation
1. Update `getInstallationForRepository()` in `app/src/github/installation-lookup.ts`:
   - Import `getOctokitForInstallation` from `@github/client`
   - Inside the loop at line 140, generate installation token and create authenticated Octokit client:
     ```typescript
     const installationOctokit = await getOctokitForInstallation(installation.id);
     ```
   - Replace lines 143-148 with correct endpoint call:
     ```typescript
     const { data } = await installationOctokit.request("GET /installation/repositories");
     ```
   - Update repository parsing at line 151 to use `data.repositories` structure

2. Update error handling to account for token generation failures:
   - Wrap `getOctokitForInstallation()` in try-catch to handle `GitHubAppError`
   - Log token generation failures with installation ID context
   - Continue to next installation on token generation error

3. Update tests in `app/tests/github/installation-lookup.test.ts`:
   - Update integration test "finds installation ID for accessible repository" to verify correct endpoint is called
   - Add test case for token generation failure handling
   - Ensure cache behavior remains unchanged

### Validation
- **Tests to add/update**:
  - Integration test: Verify `/installation/repositories` endpoint returns repositories successfully
  - Integration test: Verify token generation failure is handled gracefully
  - Unit test: Mock `getOctokitForInstallation()` to verify correct Octokit instance is used
- **Manual checks to run**:
  - Deploy fix to production Fly.io app
  - Trigger indexing for `kotadb/kotadb` repository via POST to `/index` endpoint
  - Check logs for: `[Installation Lookup] Found installation 94077685 for kotadb/kotadb`
  - Verify git clone succeeds with authenticated URL (should see `https://x-access-token:ghs_***@github.com/kotadb/kotadb` in logs)
  - Confirm private repository indexing completes successfully with no exit code 128 errors

## Step by Step Tasks

### 1. Implement API Endpoint Fix
- Import `getOctokitForInstallation` from `@github/client` in `app/src/github/installation-lookup.ts`
- Update installation loop to generate installation token and create authenticated Octokit client
- Replace `/user/installations/{installation_id}/repositories` with `/installation/repositories` endpoint
- Update response parsing to match `/installation/repositories` structure
- Add error handling for token generation failures

### 2. Update Tests
- Update `app/tests/github/installation-lookup.test.ts` integration tests to verify new endpoint behavior
- Add test case for token generation failure scenarios
- Ensure cache behavior tests still pass

### 3. Local Validation
- Run `bun run lint` to verify code style
- Run `bun run typecheck` to verify TypeScript compilation
- Run `bun test tests/github/installation-lookup.test.ts` to verify tests pass
- Run full test suite with `bun test`

### 4. Manual Testing
- Deploy to staging or production environment
- Test installation lookup with `kotadb/kotadb` repository
- Verify logs show successful installation ID retrieval
- Verify git clone uses authenticated URL

### 5. Push Changes
- Stage all modified files: `git add app/src/github/installation-lookup.ts app/tests/github/installation-lookup.test.ts`
- Commit with message: `fix: use correct GitHub API endpoint for installation repository lookup (#430)`
- Push branch: `git push -u origin bug/430-github-installation-api-endpoint`

## Regression Risks
- **Adjacent features to watch**:
  - GitHub webhook processing (`app/src/github/webhook-processor.ts`) - relies on installation tokens
  - Manual repository indexing via `/index` API - primary consumer of `getInstallationForRepository()`
  - Git clone authentication in indexer (`app/src/indexer/git-clone.ts`) - receives installation ID from this lookup
- **Follow-up work if risk materialises**:
  - If token generation adds latency: Consider pre-warming token cache for known installations
  - If token caching causes stale data: Review cache eviction policy in `app/src/github/app-auth.ts`
  - If multiple installations per repository: Update logic to handle multiple installation IDs

## Validation Commands
- `bun run lint`
- `bun run typecheck`
- `bun test tests/github/installation-lookup.test.ts`
- `bun test`
- `bun run build`

## Commit Message Validation
All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix: use correct GitHub API endpoint for installation repository lookup` not `Looking at the changes, this commit fixes the GitHub API endpoint`
