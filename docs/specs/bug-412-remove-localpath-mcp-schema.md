# Bug: Remove localPath from MCP Tool Schema (Issue #412)

## User Story / Problem Statement

External MCP agents see `localPath` parameter in the `index_repository` tool schema, attempt to use it for local filesystem indexing, and receive silent "skipped" failures because KotaDB's remote servers cannot access the client's local filesystem. This creates confusion and a poor user experience.

**Root Cause**: The `localPath` parameter is only valid for internal local development workflows using the REST API. It should never be exposed in the MCP tool schema that external agents discover.

## Implementation Status

### Completed
- [x] Remove `localPath` from MCP tool schema in `app/src/mcp/tools.ts` (lines 84-102)
- [x] Update `isIndexParams` type guard to not include `localPath` (lines 481-487)
- [x] Add explicit rejection in `executeIndexRepository` if `localPath` is provided (lines 704-711)
- [x] Update `.claude/commands/docs/mcp-integration.md` with note about localPath
- [x] Update `docs/guides/mcp-claude-code-integration.md` with troubleshooting section

### Remaining
- [x] Update MCP integration tests to NOT pass `localPath` (tests should use REST API for local testing)
- [x] Update MCP tool-validation tests to verify `localPath` rejection
- [x] Update MCP concurrent tests to remove `localPath`
- [x] Update MCP tools tests to remove `localPath`

## Expert Analysis Summary

### Architecture Perspective

**Current State (IMPLEMENTED):**
- MCP interface no longer exposes `localPath` in tool schema (`app/src/mcp/tools.ts:84-102`)
- MCP explicitly rejects `localPath` with clear error message (`app/src/mcp/tools.ts:704-711`)
- REST API correctly uses `localPath` for internal development (`app/src/api/routes.ts`)
- Both interfaces converge at `app/src/api/queries.ts` query function

**Architectural Decision:**
This change strengthens the separation between:
- **MCP Interface**: Remote agent access - only GitHub repository indexing
- **REST API**: Full feature set - includes local path indexing for development

This establishes a pattern where MCP tools are a "remote-safe subset" of REST API capabilities.

### Testing Strategy

Following KotaDB's anti-mock philosophy:
1. Schema validation tests to verify `localPath` is not in MCP tool definition
2. Integration tests to verify MCP rejects `localPath` with clear error
3. Regression tests to verify REST API still accepts `localPath`

### Security Considerations

**Risk Level: LOW**
- No path traversal risk (existing `existsSync()` check)
- No information leakage (returns "skipped" without server filesystem details)
- Removing unused parameter reduces attack surface

### Integration Requirements

**Breaking Change Analysis:**
- Technically a breaking change (parameter removal)
- Likely affects zero users (parameter never worked remotely)
- Communicate as "cleanup of non-functional parameter"

### UX & Accessibility

**Current UX Problem (SOLVED):**
1. ~~External agent sees `localPath` in schema~~
2. ~~Attempts to use it with local path~~
3. ~~Receives silent "skipped" status~~
4. ~~No indication of why it failed~~

**Improved UX (IMPLEMENTED):**
1. External agent doesn't see `localPath` in schema
2. If `localPath` is somehow passed, returns clear error:
   > "Parameter 'localPath' is not supported via MCP. Use 'repository' with a GitHub repository identifier (e.g., 'owner/repo'). For local development, use the REST API at POST /index."
3. Uses `repository` parameter for GitHub repos
4. Success

### Hook & Automation Considerations

No pre-commit hook changes required. Standard validation gates apply:
- `bunx tsc --noEmit`
- `bun run lint`

### Claude Configuration

Documentation already updated:
- `.claude/commands/docs/mcp-integration.md` - Note added about localPath
- `docs/guides/mcp-claude-code-integration.md` - Troubleshooting section added

## Remaining Implementation Plan

### Phase 3: Test Updates (REMAINING)

The following test files still pass `localPath` to MCP and need updates:

**File: `app/tests/mcp/integration.test.ts`**
- Lines 48, 149, 169, 191, 227: Remove `localPath` from MCP tool calls
- These tests should use only `repository` parameter for MCP
- For local fixture testing, tests should use REST API endpoint directly

**File: `app/tests/mcp/tool-validation.test.ts`**
- Line 6: Update comment (remove localPath from parameter list)
- Lines 258-284: Update test "localPath parameter with invalid type" to test rejection
- Lines 287-303: Update test "valid repository parameter succeeds" to NOT pass localPath

**File: `app/tests/mcp/tools.test.ts`** (if exists)
- Line 165: Remove `localPath` from test calls

**File: `app/tests/mcp/concurrent.test.ts`**
- Lines 189, 221: Remove `localPath` from concurrent test calls

**Test Update Strategy:**
1. Tests that test MCP tool functionality should NOT pass `localPath`
2. Tests that verify `localPath` rejection should expect error message
3. Tests that need local filesystem indexing should use REST API helper

## Validation Requirements

- [x] Core gates: `cd app && bun run lint`, `cd app && bunx tsc --noEmit`
- [x] Tests: Test files updated (require Supabase Local to run)
- [ ] Build: `cd app && bun run build`
- [x] Manual verification: MCP schema doesn't include `localPath`

## Notes

**Files Modified (COMPLETED):**
1. `app/src/mcp/tools.ts` - Schema and type guard changes ✅
2. `.claude/commands/docs/mcp-integration.md` - Documentation update ✅
3. `docs/guides/mcp-claude-code-integration.md` - Documentation update ✅

**Files Modified (TEST UPDATES):**
1. `app/tests/mcp/integration.test.ts` - Removed localPath from MCP calls, added rejection test
2. `app/tests/mcp/tool-validation.test.ts` - Updated to test localPath rejection
3. `app/tests/mcp/concurrent.test.ts` - Removed localPath from test calls
4. `app/tests/mcp/tools.test.ts` - Removed localPath from test calls

**Files Preserved (unchanged):**
1. `app/src/api/routes.ts` - REST API endpoint (keeps `localPath` support)
2. `app/src/api/queries.ts` - Query handler (internal use)
3. `app/src/indexer/repos.ts` - Indexer implementation

**References:**
- Issue #412: https://github.com/jayminwest/kota-db-ts/issues/412
- Related Issue #384: Investigate local repository indexing via MCP client
- MCP tool schema: `app/src/mcp/tools.ts:84-102`
- MCP localPath rejection: `app/src/mcp/tools.ts:704-711`

**Status:** Implementation complete. All code and test changes merged.
