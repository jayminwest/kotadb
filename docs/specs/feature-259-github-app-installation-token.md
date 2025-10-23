# Feature Plan: GitHub App Installation Token Generation

**Issue**: #259
**Title**: feat: implement GitHub App installation token generation
**Epic**: #257 (Epic 5 - GitHub App Integration)
**Labels**: component:backend, priority:high, effort:medium, status:blocked

## Overview

### Problem
KotaDB currently cannot access private repositories because it lacks a secure authentication mechanism for GitHub API operations. Users must manually provide personal access tokens, which poses security risks and lacks fine-grained permissions control.

GitHub Apps provide a more secure alternative through installation access tokens - short-lived credentials (1 hour expiry) that grant repository access based on user-granted permissions. This enables KotaDB to clone and index private repositories on behalf of users without handling long-lived credentials.

### Desired Outcome
- Generate GitHub App installation access tokens programmatically using JWT authentication
- Cache tokens in memory with automatic refresh before expiry (55-minute TTL)
- Support multiple installations (different users/organizations)
- Integrate token generation with repository indexing pipeline
- Provide Octokit client factory for authenticated GitHub API operations

### Non-Goals
- OAuth user authentication flow (out of scope for MVP)
- GitHub webhook signature verification (covered by issue #260)
- Repository permissions management UI (future enhancement)
- Token persistence to database (memory cache sufficient for MVP)

## Technical Approach

### Architecture Notes

**Token Generation Flow**:
1. Read GitHub App credentials from environment variables (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`)
2. Generate JWT using private key for GitHub App authentication
3. Use JWT to request installation access token from GitHub API
4. Cache token in memory with expiry timestamp
5. Return cached token if still valid (>5 minutes remaining), otherwise regenerate

**Integration Points**:
- `app/src/indexer/repos.ts`: Inject installation tokens into git clone URLs for private repos
- `app/src/queue/types.ts`: Pass `installation_id` through job payload for worker token lookup
- Database: Store `installation_id` in `repositories` table for token generation

**Error Handling Strategy**:
- Network failures: Retry with exponential backoff (1s, 3s, 5s) using existing retry patterns
- Invalid credentials: Log error and throw (configuration issue, fail fast)
- Rate limiting: Respect GitHub API rate limits using `X-RateLimit-*` headers
- Missing installation_id: Log warning and fall back to unauthenticated cloning (public repos only)

### Key Modules to Touch

**New Modules** (create):
- `app/src/github/app-auth.ts` - Core token generation and caching logic
- `app/src/github/client.ts` - Octokit client factory with installation auth
- `app/src/github/types.ts` - TypeScript types for GitHub integration
- `app/tests/github/app-auth.test.ts` - Unit tests for token caching and expiry
- `app/tests/github/integration.test.ts` - Integration tests with real GitHub API

**Existing Modules** (modify):
- `app/src/indexer/repos.ts` - Update `cloneRepository()` to inject installation tokens
- `app/src/db/migrations/` - Add migration for `installation_id` column
- `app/supabase/migrations/` - Mirror migration for Supabase CLI
- `docs/schema.md` - Document new `installation_id` column

### Data/API Impacts

**Database Schema Changes**:
```sql
-- Migration: 010_add_installation_id_to_repositories.sql
ALTER TABLE repositories
ADD COLUMN installation_id INTEGER;

CREATE INDEX idx_repositories_installation_id ON repositories(installation_id);

COMMENT ON COLUMN repositories.installation_id IS 'GitHub App installation ID for private repo access';
```

**Environment Variables** (new):
- `GITHUB_APP_ID` - GitHub App ID from app settings (required for token generation)
- `GITHUB_APP_PRIVATE_KEY` - RSA private key in PEM format (multiline string)

**API Surface Changes**: None (internal implementation only, no new endpoints)

**Type Contract Changes**:
- `repositories` table: Add optional `installation_id: number | null`
- Job payloads: Include `installation_id` for worker token lookup

## Relevant Files

### Existing Files to Modify
- `app/src/indexer/repos.ts:57-65` - Update `cloneRepository()` to inject auth tokens into git URLs
- `app/src/indexer/repos.ts:12-13` - Add `WORKSPACE_ROOT` and git credential helpers
- `docs/schema.md:145-179` - Document `installation_id` column in repositories table
- `app/.env.example` - Add `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` placeholders

### New Files to Create
- `app/src/github/app-auth.ts` - Token generation, caching, and JWT signing
- `app/src/github/client.ts` - Octokit factory with installation authentication
- `app/src/github/types.ts` - TypeScript interfaces for GitHub App integration
- `app/src/db/migrations/010_add_installation_id_to_repositories.sql` - Schema migration
- `app/supabase/migrations/010_add_installation_id_to_repositories.sql` - Mirror migration
- `app/tests/github/app-auth.test.ts` - Unit tests for token caching logic
- `app/tests/github/integration.test.ts` - Integration tests with GitHub API

## Task Breakdown

### Phase 1: Foundation and Schema Migration
**Goal**: Set up database schema and install dependencies

- Install required npm packages (`@octokit/app`, `@octokit/rest`)
- Create database migration for `installation_id` column
- Mirror migration to `app/supabase/migrations/` for test environment
- Validate migration sync using `bun run test:validate-migrations`
- Update `docs/schema.md` to document new column
- Add environment variable placeholders to `app/.env.example`

### Phase 2: Core Token Generation Implementation
**Goal**: Implement token generation, caching, and Octokit client factory

- Create `app/src/github/types.ts` with TypeScript interfaces
- Create `app/src/github/app-auth.ts` with:
  - `getInstallationToken(installationId)` - Token generation with caching
  - `clearTokenCache(installationId?)` - Cache invalidation for tests
  - JWT signing logic using `@octokit/app`
  - Exponential backoff retry logic for network failures
- Create `app/src/github/client.ts` with:
  - `getOctokitForInstallation(installationId)` - Authenticated client factory
  - Error handling for invalid credentials
- Write unit tests in `app/tests/github/app-auth.test.ts`:
  - Token caching behavior (first call generates, subsequent calls reuse)
  - Token refresh logic (regenerate when <5 minutes remaining)
  - Cache expiry (expired tokens regenerated)
  - Multiple installation support (separate cache entries)
  - Error handling (network failures, invalid credentials)

### Phase 3: Integration and Validation
**Goal**: Integrate token generation with indexer and validate end-to-end

- Update `app/src/indexer/repos.ts` to inject tokens into git clone URLs:
  - Modify `cloneRepository()` to accept optional `installationId` parameter
  - Generate token and inject into URL: `https://x-access-token:${token}@github.com/owner/repo.git`
  - Fall back to unauthenticated cloning if `installationId` is null
- Write integration tests in `app/tests/github/integration.test.ts`:
  - Token generation with real GitHub API (using test app credentials)
  - Octokit client can authenticate and fetch repo metadata
  - Private repository cloning with installation token
  - Failure scenarios: invalid installation ID, expired credentials
- Run full test suite to ensure no regressions
- Update conditional documentation in `.claude/commands/docs/conditional_docs/app.md`

## Step by Step Tasks

### Setup and Dependencies
1. Verify current working directory is worktree root
2. Install dependencies: `cd app && bun add @octokit/app @octokit/rest`
3. Create migration file: `app/src/db/migrations/010_add_installation_id_to_repositories.sql`
4. Mirror migration to: `app/supabase/migrations/010_add_installation_id_to_repositories.sql`
5. Validate migration sync: `cd app && bun run test:validate-migrations`

### Core Implementation
6. Create `app/src/github/types.ts` with type definitions
7. Create `app/src/github/app-auth.ts` with token generation logic
8. Create `app/src/github/client.ts` with Octokit factory
9. Update `app/src/indexer/repos.ts` to inject installation tokens
10. Update `docs/schema.md` to document `installation_id` column
11. Add environment variables to `app/.env.example`

### Testing and Validation
12. Create `app/tests/github/app-auth.test.ts` with unit tests
13. Create `app/tests/github/integration.test.ts` with integration tests
14. Start test database: `cd app && bun test:setup`
15. Run unit tests: `cd app && bun test --filter github/app-auth`
16. Run integration tests: `cd app && bun test --filter github/integration` (requires test app credentials)
17. Run full test suite: `cd app && bun test`

### Quality Assurance
18. Run type checking: `cd app && bunx tsc --noEmit`
19. Run linting: `cd app && bun run lint`
20. Validate migration sync again: `cd app && bun run test:validate-migrations`
21. Run full test suite: `cd app && bun test`

### Finalization
22. Update conditional docs: Add entry in `.claude/commands/docs/conditional_docs/app.md`
23. Stage all changes: `git add .`
24. Commit changes: `git commit -m "feat: implement GitHub App installation token generation (#259)"`
25. Push branch: `git push -u origin feat/259-github-app-installation-token`

## Risks & Mitigations

### Risk: Private key exposure in logs or error messages
**Mitigation**:
- Never log full private key, only first/last 20 characters for debugging
- Use environment variable validation at startup (fail fast if missing)
- Add `.env` to `.gitignore` (already present)
- Document secure key storage in `docs/supabase-setup.md`

### Risk: Token cache memory leaks with many installations
**Mitigation**:
- Implement cache size limit (e.g., max 1000 entries)
- Add cache eviction for tokens not accessed in 24 hours
- Monitor cache size in production logs
- Schedule follow-up issue for Redis-backed cache if needed

### Risk: GitHub API rate limiting during token generation
**Mitigation**:
- Respect `X-RateLimit-Remaining` header before making requests
- Implement exponential backoff for 429 responses
- Cache tokens for 55 minutes to minimize API calls
- Log rate limit status for monitoring

### Risk: Migration sync drift between `app/src/db/migrations/` and `app/supabase/migrations/`
**Mitigation**:
- Run `bun run test:validate-migrations` before commit
- Add validation to pre-commit hook (already configured)
- CI workflow validates migration sync in setup job

### Risk: Integration tests fail without GitHub App test credentials
**Mitigation**:
- Mark integration tests as `skip` if `GITHUB_APP_ID` is not set
- Document test setup in `docs/testing-setup.md`
- Add inline `TODO` comment referencing follow-up for test app setup
- Unit tests still provide coverage for token caching logic

## Validation Strategy

### Automated Tests
All tests use real Supabase Local database per antimocking philosophy:

**Unit Tests** (`app/tests/github/app-auth.test.ts`):
- Token generation creates valid JWT and requests installation token
- Token caching: First call generates, subsequent calls reuse cached token
- Token refresh: Tokens are regenerated when <5 minutes remaining
- Cache expiry: Expired tokens are removed and regenerated
- Multiple installations: Each installation has separate cache entry
- Error handling: Network failures trigger retry with exponential backoff
- Invalid credentials: Throw clear error with configuration guidance

**Integration Tests** (`app/tests/github/integration.test.ts`):
- Real GitHub API calls using test app credentials (requires `GITHUB_APP_ID` env var)
- Octokit client can authenticate and fetch repository metadata
- Private repository cloning succeeds with installation token
- Public repository cloning works without token (fallback)
- Invalid installation ID returns clear error
- Rate limiting is respected (verify `X-RateLimit-*` headers)

**Regression Coverage**:
- Existing indexer tests continue to pass (public repo cloning unaffected)
- Database migration tests validate schema changes
- API endpoint tests verify no auth/rate limit regressions

### Manual Checks

**Database Validation**:
- Seed test data: Create repository with `installation_id = 123456`
- Query: `SELECT id, full_name, installation_id FROM repositories;`
- Verify column exists and index is created

**Token Generation Flow**:
1. Set environment variables in `.env.test`:
   ```
   GITHUB_APP_ID=<test-app-id>
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
   ```
2. Generate token: `const token = await getInstallationToken(123456)`
3. Verify token format (starts with `ghs_` or `v1.` for app tokens)
4. Verify cache hit on second call (no API request)
5. Verify token refresh when approaching expiry

**Failure Scenarios**:
- Missing `GITHUB_APP_ID`: App throws clear error at startup
- Invalid private key: Token generation fails with authentication error
- Network timeout: Retry logic triggers with backoff (1s, 3s, 5s)
- Invalid installation ID: GitHub API returns 404, logged and propagated
- Expired token: Cache eviction and regeneration on next call

### Release Guardrails

**Monitoring** (post-deployment):
- Log token generation count (should be low due to caching)
- Alert on repeated token generation failures (credential issue)
- Track GitHub API rate limit consumption
- Monitor cache hit rate (should be >90%)

**Rollback Plan**:
- Feature is additive (does not break existing public repo indexing)
- Rollback: Set `installation_id = NULL` for affected repositories
- Repositories fall back to unauthenticated cloning (public repos only)
- Database migration can be rolled back with `ALTER TABLE repositories DROP COLUMN installation_id`

**Production Checklist**:
- [ ] Verify `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` set in production environment
- [ ] Run database migration on production Supabase project
- [ ] Test token generation with production app credentials
- [ ] Monitor logs for token generation errors in first 24 hours
- [ ] Verify private repository indexing succeeds for test user

## Validation Commands

### Level 2: Standard Validation (Required)
```bash
cd app && bun run lint              # ESLint validation
cd app && bunx tsc --noEmit         # TypeScript type checking
cd app && bun test --filter integration  # Integration test suite
cd app && bun test                  # Full test suite
cd app && bun run build || echo "No build step configured"  # Production build (if applicable)
```

### Domain-Specific Validation
```bash
cd app && bun run test:validate-migrations  # Ensure migration sync between directories
cd app && bun test --filter github          # Run all GitHub-related tests
cd app && bun test:setup                    # Start Supabase Local for integration tests
cd app && bun test:teardown                 # Clean up test containers
```

### Manual Testing Commands
```bash
# Verify database schema
cd app && bunx supabase db reset
cd app && psql "$SUPABASE_DB_URL" -c "\d repositories"  # Should show installation_id column

# Test token generation (requires test app credentials)
cd app && bun run src/github/app-auth.ts  # Add test script for manual verification
```

## Issue Relationships

### Child Of
- Issue #257: Epic 5 - GitHub App Integration (MVP Blocker)

### Depends On
- Issue #258: Document GitHub App setup (needs app credentials) - **BLOCKING**
- Issue #2: Supabase client initialization (closed, database access required) - **RESOLVED**

### Blocks
- Issue #14: Worker implementation (workers need tokens to clone private repos)
- Issue #261: Integrate webhooks with job queue (needs token generation for indexing)

### Related To
- Issue #260: Webhook receiver (webhooks trigger token usage)

## References

- [GitHub App Authentication Docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app)
- [Installation Access Tokens API](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token)
- [Octokit App SDK Documentation](https://github.com/octokit/app.js)
- Epic 5 Vision Doc: `docs/vision/epic-5-github-integration.md` (lines 73-138)
- Antimocking Philosophy: `.claude/commands/docs/anti-mock.md`
- Testing Setup Guide: `docs/testing-setup.md`
