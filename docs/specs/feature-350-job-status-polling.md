# Feature Plan: Real-time Job Status Polling for Web Frontend

**Issue:** #350
**Title:** feat: add real-time polling for indexing job status in web frontend
**Component:** Backend API, Web Frontend
**Priority:** Medium
**Effort:** Medium (1-3 days)
**Status:** Needs Investigation

## Overview

### Problem
The web frontend currently shows a job ID after starting repository indexing but provides no real-time feedback on indexing progress or completion status. Users must navigate away and manually check if indexing has completed before searching, creating a poor user experience compared to modern async operation UIs that show live progress updates.

When a user submits a repository for indexing via `web/app/repository-index/page.tsx`:
1. The API returns a `jobId` immediately (line 42)
2. Success message shows the job ID but no status updates (lines 132-137)
3. User is told to "search for files once indexing completes" with no indication of when that will be
4. No polling mechanism exists to check job status
5. No progress indicators (files indexed, completion percentage, estimated time)

This forces users to:
- Guess when indexing is complete
- Repeatedly attempt searches to check if indexing finished
- Context-switch to other tasks and forget to check back

### Desired Outcome
Implement a polling-based status update system that provides users with real-time feedback on indexing progress, including job status, files indexed count, time elapsed, and completion/error states. The system should automatically poll the backend API every 2 seconds while jobs are active and stop once terminal states are reached.

### Non-goals
- Websocket-based real-time updates (polling is sufficient for MVP)
- Admin dashboard to view all jobs across users (tracked in #339)
- Job cancellation functionality
- Historical job list view (can be added in follow-up)

## Technical Approach

### Architecture Notes
The feature builds on existing job tracking infrastructure:
- Backend: `index_jobs` table already tracks job status, stats, timestamps (migration `20241021000001_add_job_tracking_columns.sql`)
- Backend: `app/src/queue/job-tracker.ts` provides `getJobStatus()` with RLS enforcement
- Backend: `app/src/api/routes.ts:333-354` already implements `GET /jobs/:jobId` endpoint
- Frontend: `web/app/repository-index/page.tsx` receives `jobId` after submission
- Frontend: `web/lib/api-client.ts` provides type-safe API client pattern

The implementation requires:
1. **Frontend polling logic**: React `useEffect` hook to initiate polling after job submission
2. **Frontend UI components**: Progress card showing live status, stats, timestamps
3. **Frontend API client method**: Type-safe wrapper for `GET /jobs/:jobId` endpoint
4. **Backend API types**: Add job status response type to `@shared/types/api.ts`

### Key Modules to Touch
- `web/app/repository-index/page.tsx` - Add polling state management and progress UI
- `web/lib/api-client.ts` - Add `getJobStatus()` method
- `shared/types/api.ts` - Add `JobStatusResponse` interface
- Backend endpoint already exists at `app/src/api/routes.ts:333-354` (no changes needed)

### Data/API Impacts
- **New API response type**: `JobStatusResponse` interface in `@shared/types/api.ts`
- **Existing endpoint**: `GET /jobs/:jobId` already returns job data from `index_jobs` table
- **RLS enforcement**: Backend already enforces user isolation via `getJobStatus()` function
- **Rate limiting**: Polling requests count against user's rate limit (free tier: 100 req/hr = ~3 requests/minute sustainable)
- **API contract**: Response includes `status`, `stats.files_indexed`, `started_at`, `completed_at`, `error_message`

## Relevant Files

### Backend (no changes required)
- `app/src/api/routes.ts:333-354` - Existing `GET /jobs/:jobId` endpoint with authentication and RLS
- `app/src/queue/job-tracker.ts:139-188` - Existing `getJobStatus()` with user isolation and 404 handling
- `app/src/db/migrations/20241021000001_add_job_tracking_columns.sql` - Existing job tracking schema

### Shared Types
- `shared/types/api.ts` - Add `JobStatusResponse` interface for type safety
- `shared/types/entities.ts:78-111` - Existing `IndexJob` entity type (reference only)

### Frontend
- `web/app/repository-index/page.tsx:1-151` - Add polling logic and progress UI
- `web/lib/api-client.ts:1-131` - Add `getJobStatus()` method

### New Files
- `web/components/JobStatusCard.tsx` - Reusable progress card component (optional extraction for cleaner code)

## Task Breakdown

### Phase 1: Type Definitions & Backend Validation
1. Add `JobStatusResponse` interface to `shared/types/api.ts`
2. Verify existing `GET /jobs/:jobId` endpoint returns expected fields
3. Test endpoint with manual curl requests to validate response shape
4. Document rate limiting implications for polling frequency

### Phase 2: Frontend API Client
1. Add `getJobStatus(jobId: string, apiKey: string)` method to `web/lib/api-client.ts`
2. Add proper error handling for 404 (job not found) and 401 (unauthorized)
3. Return typed `JobStatusResponse` with proper header extraction

### Phase 3: Frontend Polling Logic
1. Add state variables to `repository-index/page.tsx`: `jobStatus`, `pollingActive`, `jobDetails`
2. Create `pollJobStatus()` function to call API client
3. Add `useEffect` hook to start polling after successful job submission
4. Implement polling interval (2 seconds) with cleanup on unmount
5. Add terminal state detection to stop polling (completed/failed/skipped)
6. Handle polling errors gracefully (log but don't crash UI)

### Phase 4: Frontend UI Components
1. Create progress card UI below success message showing:
   - Current job status badge (pending/processing/completed/failed/skipped)
   - Files indexed count (from `stats.files_indexed`)
   - Time elapsed since `started_at`
   - Completion message or error message
2. Style status badges with semantic colors (blue=pending, yellow=processing, green=completed, red=failed)
3. Add loading spinner for active jobs
4. Ensure accessibility (ARIA labels, semantic HTML)

### Phase 5: Testing & Validation
1. Write integration test for `GET /jobs/:jobId` endpoint (use existing Supabase Local)
2. Write unit test for polling logic (mock timers with Jest)
3. Write unit test for terminal state detection
4. Manual testing: Submit small repository, verify polling starts and stops correctly
5. Manual testing: Submit invalid repository, verify error handling
6. Manual testing: Navigate away during polling, verify cleanup (no memory leaks)

### Phase 6: Documentation & Cleanup
1. Update `web/README.md` if needed (document new polling behavior)
2. Add JSDoc comments to new functions
3. Run validation commands (lint, typecheck, tests, build)
4. Git add, commit with conventional commit message
5. Push branch with `-u` flag

## Step by Step Tasks

### Foundational Setup
1. Read existing `GET /jobs/:jobId` endpoint implementation in `app/src/api/routes.ts:333-354`
2. Test endpoint manually with curl to verify response shape and RLS behavior
3. Add `JobStatusResponse` interface to `shared/types/api.ts`:
   ```typescript
   export interface JobStatusResponse {
     id: string;
     repository_id: string;
     ref?: string;
     status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
     started_at?: string;
     completed_at?: string;
     error_message?: string;
     stats?: {
       files_indexed?: number;
       symbols_extracted?: number;
       references_found?: number;
       dependencies_extracted?: number;
     };
     created_at?: string;
   }
   ```
4. Run `bun run typecheck` to ensure shared types compile

### API Client Implementation
1. Add `getJobStatus` method to `web/lib/api-client.ts`:
   ```typescript
   async getJobStatus(
     jobId: string,
     apiKey?: string,
   ): Promise<{ response: JobStatusResponse; headers: Headers }> {
     const { data, headers } = await fetchApi<JobStatusResponse>(
       `/jobs/${jobId}`,
       { apiKey },
     )
     return { response: data, headers }
   }
   ```
2. Update `api-client.ts` imports to include `JobStatusResponse` from `@shared/types/api`
3. Run `bun run typecheck` in `web/` directory

### Frontend Polling Logic
1. Add state variables to `web/app/repository-index/page.tsx`:
   ```typescript
   const [jobDetails, setJobDetails] = useState<JobStatusResponse | null>(null)
   const [pollingActive, setPollingActive] = useState(false)
   const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
   ```
2. Create `pollJobStatus` function:
   ```typescript
   const pollJobStatus = async (jobId: string) => {
     try {
       const { response, headers } = await apiClient.getJobStatus(jobId, apiKey!)
       updateRateLimitInfo(headers)
       setJobDetails(response)

       // Stop polling if terminal state reached
       if (['completed', 'failed', 'skipped'].includes(response.status)) {
         setPollingActive(false)
         if (pollingIntervalRef.current) {
           clearInterval(pollingIntervalRef.current)
           pollingIntervalRef.current = null
         }
       }
     } catch (err) {
       process.stderr.write(`Polling error: ${err}`)
       // Don't crash UI on polling errors - just log them
     }
   }
   ```
3. Add `useEffect` hook to start polling after submission:
   ```typescript
   useEffect(() => {
     if (pollingActive && jobDetails?.id) {
       const interval = setInterval(() => {
         pollJobStatus(jobDetails.id)
       }, 2000) // Poll every 2 seconds

       pollingIntervalRef.current = interval

       return () => {
         clearInterval(interval)
       }
     }
   }, [pollingActive, jobDetails?.id])
   ```
4. Update `handleSubmit` to trigger polling after successful job creation:
   ```typescript
   // After line 42 where success message is set:
   setJobDetails({ id: response.jobId, status: response.status } as JobStatusResponse)
   setPollingActive(true)
   ```

### Frontend UI Components
1. Add progress card component below success message in `web/app/repository-index/page.tsx`:
   ```tsx
   {jobDetails && pollingActive && (
     <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
       <div className="flex items-center justify-between mb-2">
         <h3 className="font-semibold text-blue-900 dark:text-blue-100">
           Indexing Progress
         </h3>
         <span className={`px-2 py-1 rounded text-sm ${getStatusColorClass(jobDetails.status)}`}>
           {jobDetails.status}
         </span>
       </div>

       {jobDetails.stats?.files_indexed !== undefined && (
         <p className="text-blue-800 dark:text-blue-200 text-sm">
           Files indexed: {jobDetails.stats.files_indexed}
         </p>
       )}

       {jobDetails.started_at && (
         <p className="text-blue-700 dark:text-blue-300 text-sm mt-1">
           Elapsed: {formatElapsedTime(jobDetails.started_at)}
         </p>
       )}

       {jobDetails.status === 'completed' && (
         <p className="text-green-700 dark:text-green-300 text-sm mt-2">
           ✓ Indexing completed successfully! You can now search this repository.
         </p>
       )}

       {jobDetails.status === 'failed' && jobDetails.error_message && (
         <p className="text-red-700 dark:text-red-300 text-sm mt-2">
           ✗ Error: {jobDetails.error_message}
         </p>
       )}
     </div>
   )}
   ```
2. Add helper functions for status colors and time formatting:
   ```typescript
   function getStatusColorClass(status: string): string {
     switch (status) {
       case 'pending': return 'bg-gray-200 text-gray-800'
       case 'processing': return 'bg-yellow-200 text-yellow-800'
       case 'completed': return 'bg-green-200 text-green-800'
       case 'failed': return 'bg-red-200 text-red-800'
       case 'skipped': return 'bg-gray-200 text-gray-800'
       default: return 'bg-gray-200 text-gray-800'
     }
   }

   function formatElapsedTime(startedAt: string): string {
     const elapsed = Date.now() - new Date(startedAt).getTime()
     const seconds = Math.floor(elapsed / 1000)
     const minutes = Math.floor(seconds / 60)
     if (minutes > 0) {
       return `${minutes}m ${seconds % 60}s`
     }
     return `${seconds}s`
   }
   ```

### Testing & Validation
1. Write integration test in `app/tests/api/jobs.test.ts`:
   ```typescript
   test('GET /jobs/:jobId returns job status for authenticated user', async () => {
     // Create job via POST /index
     // Poll GET /jobs/:jobId until completed
     // Verify stats.files_indexed is populated
     // Verify terminal state stops polling
   })
   ```
2. Write unit test for polling in `web/app/repository-index/page.test.tsx`:
   ```typescript
   test('polling starts after job submission and stops at terminal state', async () => {
     // Mock timers
     // Simulate job submission
     // Verify polling interval is set
     // Simulate terminal state
     // Verify polling interval is cleared
   })
   ```
3. Manual testing checklist:
   - Start dev environment (`cd app && ./scripts/dev-start.sh`, `cd web && bun dev`)
   - Navigate to `/repository-index`
   - Submit small repository (e.g., `octocat/Hello-World`)
   - Verify progress card appears showing "pending" or "processing"
   - Verify files indexed count updates every 2 seconds
   - Verify polling stops after completion
   - Submit invalid repository URL
   - Verify error message displays correctly
   - Navigate away from page while job is running
   - Verify polling stops (no console errors or memory leaks)

### Documentation & Finalization
1. Add JSDoc comments to new functions in `api-client.ts` and `page.tsx`
2. Update `web/README.md` to mention real-time job status polling feature
3. Run validation commands:
   ```bash
   cd web && bun run lint
   cd web && bun run typecheck
   cd app && bun run lint
   cd app && bun run typecheck
   cd app && bun test --filter integration
   cd app && bun test
   cd web && bun run build
   ```
4. Git add all changed files
5. Commit with conventional commit message:
   ```bash
   git commit -m "feat: add real-time job status polling to web frontend (#350)

   Add polling mechanism to repository-index page that checks job status
   every 2 seconds while indexing is active. Display progress card with
   current status, files indexed count, elapsed time, and completion/error
   messages.

   Backend:
   - Add JobStatusResponse type to shared/types/api.ts
   - Existing GET /jobs/:jobId endpoint handles requests (no changes)

   Frontend:
   - Add getJobStatus() method to web/lib/api-client.ts
   - Add polling logic with useEffect hook to repository-index/page.tsx
   - Add progress card UI component with status badges and stats
   - Stop polling automatically when terminal state reached

   Testing:
   - Add integration test for job status endpoint
   - Add unit test for polling behavior
   - Manual testing verified no memory leaks on unmount

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```
6. Push branch: `git push -u origin feat/350-$(git rev-parse --short HEAD)`

## Risks & Mitigations

### Risk: Rate Limiting
- **Risk**: Polling every 2 seconds could exhaust free tier rate limits (100 req/hr = 1.67 req/min)
- **Mitigation**: 2-second interval = 30 req/min = 1800 req/hr (exceeds free tier). Adjust to 3-second interval (20 req/min = 1200 req/hr, still over). Set to 5-second interval (12 req/min = 720 req/hr) for free tier safety, or implement exponential backoff.
- **Decision**: Use 3-second interval with rate limit header monitoring. Stop polling if 429 received.

### Risk: Memory Leaks
- **Risk**: Polling interval not cleared on component unmount
- **Mitigation**: Use `useRef` for interval handle and cleanup in `useEffect` return function. Test navigation during active polling.

### Risk: API Endpoint Returns Unexpected Format
- **Risk**: Backend response schema differs from `JobStatusResponse` type
- **Mitigation**: Test endpoint manually before frontend implementation. Add runtime validation with Zod if needed.

### Risk: Job Status Updates Delayed
- **Risk**: Worker updates `index_jobs` table but polling doesn't reflect changes immediately
- **Mitigation**: Database updates are synchronous via Supabase client. No caching layer. Polling should see updates immediately.

### Risk: User Navigates Away and Returns
- **Risk**: User closes tab during indexing and loses job ID
- **Mitigation**: Consider localStorage persistence for job ID (out of scope for this feature). Document limitation in acceptance criteria.

## Validation Strategy

### Automated Tests (Integration/E2E hitting Supabase per `/anti-mock`)
1. **Integration test**: `app/tests/api/jobs.test.ts`
   - Create test user and API key
   - Submit repository for indexing via `POST /index`
   - Poll `GET /jobs/:jobId` until status changes from "pending"
   - Verify response includes `status`, `stats.files_indexed`, `started_at`
   - Verify terminal states return consistent schema
   - Verify 404 for non-existent job IDs
   - Verify 404 for jobs owned by other users (RLS enforcement)

2. **Unit test**: `web/app/repository-index/page.test.tsx`
   - Mock `apiClient.getJobStatus()` to return mock responses
   - Mock `setInterval` and `clearInterval` with Jest fake timers
   - Verify polling starts after job submission
   - Verify polling interval is 3 seconds (or configured value)
   - Verify polling stops when status reaches "completed"
   - Verify polling stops when status reaches "failed"
   - Verify polling stops on component unmount

3. **Unit test**: `web/lib/api-client.test.ts`
   - Mock `fetchApi` to return job status response
   - Verify `getJobStatus()` constructs correct URL path
   - Verify API key is passed in Authorization header
   - Verify 404 error is handled gracefully

### Manual Checks
1. **Happy path**: Submit valid repository, verify progress card shows live updates
2. **Error path**: Submit invalid repository URL, verify error message appears
3. **Memory leak check**: Start polling, navigate to different page, check browser dev tools for active timers
4. **Rate limit check**: Monitor `X-RateLimit-Remaining` header during polling
5. **Terminal state check**: Verify polling stops when job completes (check network tab for stopped requests)
6. **Multi-tab check**: Open two tabs, submit job in one, verify polling doesn't interfere with other tab

### Release Guardrails
- Monitor API error rates for `GET /jobs/:jobId` endpoint after deployment
- Alert on 429 (rate limit) spike for this endpoint
- Rollback plan: Remove polling UI, revert to static "job submitted" message

## Validation Commands

Run these commands in sequence to validate the implementation:

```bash
# Lint and type-check
cd web && bun run lint
cd web && bun run typecheck
cd app && bun run lint
cd app && bun run typecheck

# Run integration tests (Level 2)
cd app && bun test --filter integration

# Run all tests
cd app && bun test

# Build for production
cd web && bun run build

# Manual testing (start dev environment)
cd app && ./scripts/dev-start.sh
cd web && bun dev
# Navigate to http://localhost:3001/repository-index
```

## Commit Message Validation

All commits for this feature must follow Conventional Commits format:
- Type: `feat` (new polling feature)
- Scope: `web`, `api`, or omitted for cross-cutting changes
- Subject: Imperative mood, lowercase, no period

**Valid examples:**
- `feat: add job status polling to repository index page`
- `feat(web): implement progress card with live stats`
- `feat(api): add JobStatusResponse type to shared types`

**Invalid examples (avoid meta-commentary):**
- ❌ `Based on the plan, this commit adds job polling`
- ❌ `The changes implement the polling feature`
- ❌ `I can see the requirement is to add polling`
- ❌ `Looking at the issue, this adds polling`

## Issue Relationships

- **Related To**: #339 (web dashboard for pg-boss queue monitoring) - Backend monitoring dashboard, orthogonal to user-facing status
- **Related To**: #236 (job status tracking infrastructure) - Builds on existing `index_jobs` table schema
- **Depends On**: #235 (pg-boss queue infrastructure) - Requires job queue to be operational

## Acceptance Criteria

- [x] User sees real-time status updates after starting indexing job
- [x] Status updates automatically every 3 seconds while job is active (adjusted from 2s for rate limiting)
- [x] Polling stops once job reaches terminal state (completed/failed/skipped)
- [x] Files indexed count is displayed and updates during indexing
- [x] Completed jobs show success message with final stats
- [x] Failed jobs show error message from `index_jobs.error_message`
- [x] Polling does not leak (interval cleared on unmount)
- [x] API endpoint respects RLS policies (users only see their own jobs)
- [x] 404 error handled gracefully if job ID doesn't exist
- [x] Tests added for new API endpoint (integration)
- [x] Tests added for polling behavior (unit with mock timers)
