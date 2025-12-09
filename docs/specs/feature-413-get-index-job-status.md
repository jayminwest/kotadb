# Feature: Add MCP Tool to Query Index Job Status (Issue #413)

## User Story / Problem Statement

When agents interact with KotaDB through MCP tools to index repositories, they receive a `runId` from the `index_repository` tool but currently have no way to check the progress or status of that indexing job. The `index_repository` tool returns immediately with status "pending", but agents cannot query whether the job completed successfully, failed, or is still running.

This creates a poor developer experience for automation workflows and external agents (like Claude Code instances) that need to know when indexing is complete before searching the newly indexed code.

## Expert Analysis Summary

### Architecture Perspective

**Fit with existing patterns:** The proposal follows established MCP tool patterns:
- Tool definition object with `name`, `description`, `inputSchema` (tools.ts)
- Execution function signature: `(supabase, params, requestId, userId) => Promise<unknown>`
- Switch-case dispatch in `handleToolCall()` (tools.ts and server.ts)

**File organization:** Correct locations identified:
- `app/src/mcp/tools.ts` - Add tool definition and execution function
- `app/src/mcp/server.ts` - Add case to dispatch switch
- `app/src/api/queries.ts` - Add query function

**Recommendation:** Use direct query on `index_jobs` table (stats stored in JSONB column, no join needed). Return repository_id UUID for consistency with existing tools.

### Testing Strategy

**Required test cases:**
1. Happy path: Query existing job owned by user → returns full status with stats
2. Error paths: Non-existent runId, invalid UUID format, missing parameter
3. RLS enforcement: User A cannot query User B's jobs
4. Edge cases: NULL stats, NULL ref, job not yet started

**Antimocking approach:**
- Use real Supabase Local instance
- Use existing helpers: `createTestJob()`, `createTestRepository()`
- Test both MCP server and direct execution function
- Clean up test data in `afterEach` hook

### Security Considerations

**RLS enforcement:** `index_jobs` table has RLS enabled via repository ownership:
- Policy: users can only SELECT jobs where `repository_id IN (SELECT id FROM repositories WHERE user_id = auth.uid())`
- Use `.maybeSingle()` instead of `.single()` to avoid error on not found

**Input validation required:**
1. UUID format validation for runId
2. Required parameter check
3. Type validation (string)

**Information disclosure:** Return generic "Job not found" message - do not distinguish between "doesn't exist" vs "access denied" to prevent enumeration attacks.

### Integration Requirements

**Response schema matches existing REST API patterns:**
```typescript
interface JobStatusResponse {
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  repository_id: string;
  ref?: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  stats?: {
    files_indexed?: number;
    symbols_extracted?: number;
    references_extracted?: number;
  };
  retry_count?: number;
  created_at: string;
}
```

**Error format:** MCP SDK converts thrown errors to JSON-RPC error responses automatically.

**Backwards compatibility:** This is a new tool addition - no breaking changes.

### UX & Accessibility

**Polling guidance for agents:**
- Use 5-10 second polling interval
- Exponential backoff recommended
- Stop polling when status is 'completed', 'failed', or 'skipped'

**Tool description should include:**
- Typical indexing times for different repo sizes
- RLS enforcement notice
- Polling best practices

### Hook & Automation Considerations

No pre-commit hooks or automation changes required for this feature.

### Claude Configuration

**Documentation updates needed:**
1. Update `docs/guides/mcp-claude-code-integration.md` with new tool
2. Add usage example showing index → poll → search workflow
3. Document polling recommendations for agents

## Synthesized Recommendations

### Priority Actions
1. Add `GET_INDEX_JOB_STATUS_TOOL` definition to `app/src/mcp/tools.ts`
2. Add `executeGetIndexJobStatus()` function with UUID validation and RLS-aware query
3. Register tool in `app/src/mcp/server.ts` dispatch
4. Add `getIndexJobStatus()` query to `app/src/api/queries.ts`
5. Create tests in `app/tests/mcp/` directory
6. Update MCP integration documentation

### Risk Assessment
- **Low Risk:** Feature follows established patterns exactly
- **Security:** RLS already enforced by Supabase client context
- **Testing:** Antimocking pattern well-established in codebase

## Implementation Plan

### Phase 1: Query Function (app/src/api/queries.ts)

**File:** `app/src/api/queries.ts`
**Task:** Add `getIndexJobStatus()` function

```typescript
export interface IndexJobStatus {
  id: string;
  repository_id: string;
  ref: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  stats: {
    files_indexed?: number;
    symbols_extracted?: number;
    references_extracted?: number;
  } | null;
  retry_count: number | null;
  created_at: string;
}

export async function getIndexJobStatus(
  client: SupabaseClient,
  jobId: string,
): Promise<IndexJobStatus | null> {
  const { data, error } = await client
    .from("index_jobs")
    .select("id, repository_id, ref, status, started_at, completed_at, error_message, stats, retry_count, created_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch job status: ${error.message}`);
  }

  return data;
}
```

**Dependencies:** None (independent)

### Phase 2: Tool Definition (app/src/mcp/tools.ts)

**File:** `app/src/mcp/tools.ts`
**Task:** Add `GET_INDEX_JOB_STATUS_TOOL` constant

```typescript
const GET_INDEX_JOB_STATUS_TOOL = {
  name: "get_index_job_status",
  description: `Query the status of an indexing job by runId. Returns current status, progress stats, and completion details.

Poll this tool every 5-10 seconds to track job progress. Stop polling when status is 'completed', 'failed', or 'skipped'.

Typical indexing times:
- Small repos (<100 files): 10-30 seconds
- Medium repos (100-1000 files): 30-120 seconds
- Large repos (>1000 files): 2-10 minutes

RLS enforced: You can only query jobs you created.`,
  inputSchema: {
    type: "object" as const,
    properties: {
      runId: {
        type: "string",
        description: "The UUID of the indexing job (returned by index_repository)",
      },
    },
    required: ["runId"],
  },
};
```

**Dependencies:** None (independent)

### Phase 3: Execution Function (app/src/mcp/tools.ts)

**File:** `app/src/mcp/tools.ts`
**Task:** Add `executeGetIndexJobStatus()` function

```typescript
async function executeGetIndexJobStatus(
  supabase: SupabaseClient,
  params: { runId?: string },
  requestId: string,
  userId: string,
): Promise<unknown> {
  // Validate required parameter
  if (!params.runId || typeof params.runId !== "string") {
    throw new Error("Parameter 'runId' is required and must be a string");
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(params.runId)) {
    throw new Error("Parameter 'runId' must be a valid UUID");
  }

  // Query job status (RLS enforced via supabase client)
  const job = await getIndexJobStatus(supabase, params.runId);

  if (!job) {
    throw new Error(`Job not found: ${params.runId}`);
  }

  return {
    runId: job.id,
    status: job.status,
    repository_id: job.repository_id,
    ref: job.ref,
    started_at: job.started_at,
    completed_at: job.completed_at,
    error_message: job.error_message,
    stats: job.stats,
    retry_count: job.retry_count,
    created_at: job.created_at,
  };
}
```

**Dependencies:** Phase 1 (query function must exist)

### Phase 4: Tool Registration (app/src/mcp/server.ts)

**File:** `app/src/mcp/server.ts`
**Task:** Add to tool definitions array and dispatch switch

1. Import or reference `GET_INDEX_JOB_STATUS_TOOL` in tool definitions
2. Add case to `handleToolCall()` switch statement

**Dependencies:** Phases 2 and 3 (tool definition and execution function must exist)

### Phase 5: Tests (app/tests/mcp/)

**File:** `app/tests/mcp/get-index-job-status.test.ts`
**Task:** Create test suite

Test cases:
1. Successfully query job owned by user
2. Query job with 'completed' status includes stats
3. Query job with 'failed' status includes error_message
4. Query non-existent runId returns error
5. Query with invalid UUID format returns validation error
6. Query with missing runId returns validation error
7. RLS: User cannot query another user's job

**Dependencies:** Phases 1-4 complete

### Phase 6: Documentation

**File:** `.claude/commands/docs/mcp-integration.md`
**Task:** Add new tool documentation

Add section:
- Tool name and description
- Parameters
- Response schema
- Usage example: index → poll → search workflow
- Polling recommendations

**Dependencies:** Phases 1-4 complete (feature implemented)

## Validation Requirements

- [x] Core gates: `cd app && bun run lint`, `cd app && bunx tsc --noEmit`
- [x] Tests: `cd app && bun test`
- [x] Build: `cd app && bun run build`
- [ ] Integration: Manual test of index → poll → search workflow

## Notes

### Files to Modify
1. `app/src/api/queries.ts` - Add `getIndexJobStatus()` function
2. `app/src/mcp/tools.ts` - Add tool definition and execution function
3. `app/src/mcp/server.ts` - Register tool in definitions and dispatch
4. `app/tests/mcp/get-index-job-status.test.ts` - Create test file
5. `.claude/commands/docs/mcp-integration.md` - Add documentation

### References
- Issue #413: https://github.com/jayminwest/kota-db-ts/issues/413
- Related: #313 (batch processing for large repos)
- Related: #234 (pg-boss job queue epic)
- MCP integration docs: `.claude/commands/docs/mcp-integration.md`

### Database Schema Reference
The `index_jobs` table contains:
- `id` (UUID): Primary key
- `repository_id` (UUID): Foreign key to repositories
- `ref` (text): Git ref being indexed
- `status` (text): 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
- `started_at` (timestamptz): When job started
- `completed_at` (timestamptz): When job finished
- `error_message` (text): Error details if failed
- `stats` (JSONB): Indexing statistics
- `retry_count` (integer): Number of retry attempts
- `created_at` (timestamptz): When job was created
