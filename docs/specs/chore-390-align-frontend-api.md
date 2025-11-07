# Chore Plan: Align Frontend API Integration with Production-Ready Backend

## Context

The staging backend API at `https://kotadb-staging.fly.dev` is production-ready with all core functionality working correctly via direct API calls. However, the Next.js web frontend has integration issues that prevent it from providing the same clean user experience as direct API calls.

**Why this matters now:**
- Backend is production-ready; frontend quality gaps block deployment
- Generic error handling discards backend error details, making debugging impossible
- Logging standards violations need correction before production
- No request/response logging makes integration issues difficult to diagnose
- Silent API key generation failures during OAuth affect user experience

**Constraints:**
- Frontend-only changes (backend is production-ready)
- Must maintain backward compatibility with existing API contracts
- Must adhere to logging standards (`process.stdout/stderr.write()` only)
- Must leverage existing shared types from `shared/types/api.ts`

## Relevant Files

- `web/lib/api-client.ts` — Generic error handling, no request/response logging
- `web/context/AuthContext.tsx` — Logging standards violations (lines 61, 150)
- `web/app/dashboard/page.tsx` — Logging standards violations (lines 82, 84, 137)
- `web/app/login/page.tsx` — Logging standards violations (line 34)
- `web/app/auth/callback/route.ts` — Silent API key generation failures, logging violations (lines 14, 52, 57)
- `web/app/repository-index/page.tsx` — Aggressive job status polling (line 45)
- `shared/types/api.ts` — Shared type definitions to be leveraged

### New Files

- None (all changes are modifications to existing files)

## Work Items

### Preparation
1. Branch from `develop` using `chore/390-align-frontend-api`
2. Review existing shared types in `shared/types/api.ts` to ensure comprehensive coverage
3. Verify all frontend API calls are mapped to backend endpoints

### Execution

#### Critical Priority
1. **Improve Error Handling in API Client**
   - Parse error response body in `web/lib/api-client.ts:52-58`
   - Display full backend error details to users
   - Update `ApiError` class to accept error body
   - Ensure all error responses use shared types

2. **Add Request/Response Logging**
   - Add dev-mode logging in `web/lib/api-client.ts` before and after fetch calls
   - Log request method, endpoint, headers
   - Log response status and endpoint
   - Use `process.stdout.write()` for all logging

3. **Fix Logging Standards Violations**
   - Replace `console.log()` with `process.stdout.write()` in:
     - `web/context/AuthContext.tsx` (lines 61, 150)
     - `web/app/dashboard/page.tsx` (lines 82, 84, 137)
     - `web/app/login/page.tsx` (line 34)
     - `web/app/auth/callback/route.ts` (lines 14, 52, 57)
   - Replace `console.error()` with `process.stderr.write()`
   - Replace `console.warn()` with `process.stderr.write('[WARN] ')`

4. **Add OAuth API Key Generation Retry**
   - Implement retry logic in `web/app/auth/callback/route.ts:42-66`
   - 3 attempts with exponential backoff (1s, 2s, 4s)
   - Log retry attempts using `process.stderr.write()`
   - Redirect with detailed error message on final failure

#### Medium Priority
5. **Implement Exponential Backoff for Job Polling**
   - Replace fixed 3-second interval in `web/app/repository-index/page.tsx:45`
   - Exponential backoff: 3s, 4.5s, 6.75s, ... max 30s
   - Use multiplier of 1.5 to balance responsiveness and rate limiting

6. **Leverage Shared Types**
   - Audit all `fetch()` calls in `web/` to ensure use of shared types
   - Add type validation for API responses
   - Create shared error types if needed

#### Low Priority (Should Have)
7. **Add Request Configuration**
   - Configure timeout for all API requests (default: 30s)
   - Add explicit `Accept: application/json` header
   - Remove `Content-Type` header from GET requests

8. **Add Retry Logic**
   - Implement retry logic for 5xx errors with exponential backoff
   - Max 3 retries with 1s, 2s, 4s delays
   - Do not retry 4xx errors (client errors)

### Follow-up
1. Run validation commands to ensure no regressions
2. Test OAuth flow on Vercel preview deployment
3. Verify error messages display backend details
4. Verify job polling uses exponential backoff
5. Verify logging standards compliance
6. Update `.claude/commands/docs/conditional_docs/app.md` if new patterns emerge
7. Push branch and create PR

## Step by Step Tasks

### Git Setup
- Run `git checkout develop`
- Run `git pull origin develop`
- Run `git checkout -b chore/390-align-frontend-api`

### Critical: Error Handling and Logging
- Update `web/lib/api-client.ts` to parse error response body
- Add dev-mode request/response logging to `web/lib/api-client.ts`
- Update `ApiError` class to accept and store error body
- Replace all `console.log()` calls with `process.stdout.write()` in `web/context/AuthContext.tsx`
- Replace all `console.log()` calls with `process.stdout.write()` in `web/app/dashboard/page.tsx`
- Replace all `console.log()` calls with `process.stdout.write()` in `web/app/login/page.tsx`
- Replace all `console.*` calls with `process.std*.write()` in `web/app/auth/callback/route.ts`
- Implement retry logic for API key generation in `web/app/auth/callback/route.ts`

### Medium: Polling and Type Safety
- Implement exponential backoff for job status polling in `web/app/repository-index/page.tsx`
- Audit all `fetch()` calls to ensure use of shared types from `shared/types/api.ts`
- Add type validation for API responses

### Low: Request Configuration
- Add timeout configuration to API client
- Add explicit `Accept: application/json` header
- Remove `Content-Type` header from GET requests
- Implement retry logic for 5xx errors

### Validation and Deployment
- Run `cd web && bun run lint`
- Run `cd web && bun run typecheck`
- Run `cd web && bun test` (if tests exist)
- Run `cd web && bun run build`
- Test OAuth flow on local development server
- Test search functionality with error cases
- Test repository indexing with exponential backoff
- Verify logging standards compliance with `grep -r "console\\.log" web/`
- Verify no console.error with `grep -r "console\\.error" web/`
- Stage all changes with `git add .`
- Commit with message: `chore(web): align frontend API integration with production-ready backend (#390)`
- Push branch with `git push -u origin chore/390-align-frontend-api`

## Risks

| Risk | Mitigation |
|------|-----------|
| Error response body parsing fails for non-JSON responses | Add `.catch()` handler with fallback to `response.statusText` |
| Exponential backoff causes job status to appear stale | Cap maximum delay at 30 seconds to maintain responsiveness |
| Retry logic causes duplicate API key generation | Check for existing API key before retry attempts |
| Logging changes break existing functionality | Use conditional logging (`NODE_ENV === 'development'`) and test thoroughly |
| Type validation adds runtime overhead | Only validate in development mode, trust types in production |
| Request timeout breaks long-running indexing jobs | Set timeout high enough (30s) and only apply to non-polling requests |

## Validation Commands

```bash
# Lint checks
cd web && bun run lint

# Type checks
cd web && bun run typecheck

# Build verification
cd web && bun run build

# Logging standards compliance
grep -r "console\.log" web/ || echo "✓ No console.log found"
grep -r "console\.error" web/ || echo "✓ No console.error found"
grep -r "console\.warn" web/ || echo "✓ No console.warn found"

# Verify shared types usage
grep -r "fetch(" web/ | grep -v "shared/types/api"
```

### Manual Testing Checklist

```bash
# 1. Start local development server
cd web && bun run dev

# 2. Test OAuth flow
# - Sign in with GitHub at http://localhost:3001/login
# - Verify API key generated successfully (no error_key=true)
# - Check terminal logs for proper logging format (process.stdout.write)
# - Verify no console.log in browser DevTools

# 3. Test search functionality
# - Navigate to search page
# - Enter search term "function"
# - Verify results display correctly
# - Test error case with invalid API key
# - Verify error message shows backend detail (not generic "request failed")
# - Check Network tab for correct headers (Accept: application/json, no Content-Type on GET)

# 4. Test repository indexing
# - Navigate to repository index page
# - Index "chalk/chalk"
# - Verify polling intervals increase (check Network tab timestamps: 3s, 4.5s, 6.75s...)
# - Verify job completion shows stats
# - Test error handling by indexing invalid repo
# - Verify error message shows backend detail

# 5. Test OAuth retry logic
# - Temporarily break API key generation endpoint (if possible)
# - Sign in with GitHub
# - Verify retry attempts logged to terminal
# - Verify graceful failure with detailed error message

# 6. Verify logging standards
# - Check terminal logs use process.stdout.write() format
# - Verify no console.log() output in terminal
# - Verify browser console has no application logs (only framework logs)
```

### Playwright E2E Tests (Optional Enhancement)

Add E2E tests to verify frontend behavior:
- OAuth flow generates API key successfully
- Search request handles error responses correctly with backend details
- Job polling uses exponential backoff (verify timestamps)
- Error messages display backend error details

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(web): align frontend API integration` not `Based on the plan, this commit aligns frontend API integration`

Example commit messages:
- `chore(web): parse error response body in API client`
- `chore(web): add dev-mode request/response logging`
- `chore(web): replace console.log with process.stdout.write`
- `chore(web): implement OAuth API key generation retry`
- `chore(web): add exponential backoff for job polling`

## Deliverables

### Code Changes
- Updated error handling in `web/lib/api-client.ts` with response body parsing
- Dev-mode request/response logging in `web/lib/api-client.ts`
- Logging standards compliance across all `web/` files
- OAuth API key generation retry logic in `web/app/auth/callback/route.ts`
- Exponential backoff for job polling in `web/app/repository-index/page.tsx`
- Type safety improvements using shared types from `shared/types/api.ts`

### Config Updates
- Request timeout configuration in API client
- Explicit Accept headers on all requests
- Content-Type header removed from GET requests
- Retry logic for 5xx errors

### Documentation Updates
- Update `.claude/commands/docs/conditional_docs/app.md` if new patterns emerge for frontend API integration
- Document exponential backoff strategy for job polling
- Document error handling patterns for API responses
- Document logging standards enforcement in web/ directory
