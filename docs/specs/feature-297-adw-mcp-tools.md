# Feature Plan: ADW Workflow Orchestration Tools for MCP Server

## Overview

### Problem
The KotaDB MCP server provides code intelligence tools (`search_code`, `index_repository`, `list_recent_files`, `search_dependencies`) but lacks programmatic access to ADW (AI Developer Workflow) orchestration. External systems (Claude Desktop, custom dashboards, automation scripts) cannot trigger or monitor ADW workflows via MCP, forcing reliance on manual slash commands (`/orchestrator`) or direct Python script execution.

### Desired Outcome
Extend the MCP server with 4 new ADW orchestration tools:
1. `trigger_adw_workflow` - Start full 3-phase workflow (plan → build → review)
2. `trigger_adw_phase` - Execute individual phase (plan, build, or review)
3. `get_adw_state` - Query workflow execution state
4. `list_adw_workflows` - List all workflow executions with filtering

This enables external MCP clients to automate issue-to-PR workflows programmatically while maintaining KotaDB's authentication, rate limiting, and observability infrastructure.

### Non-Goals
- **Real-time workflow streaming**: Workflows execute asynchronously; clients poll `get_adw_state` for status
- **Webhook callbacks**: Completion notifications deferred to future enhancement
- **Atomic agent exposure**: Issue #217 covers exposing individual atomic agents as separate MCP tools
- **Web dashboard**: MCP tools provide API foundation; UI implementation is separate effort
- **Multi-issue batch execution**: Single-issue workflows only (concurrent execution via multiple MCP calls)

## Technical Approach

### Architecture Notes

**1. Subprocess Execution for Python Workflows**
- MCP tools spawn non-blocking Node.js child processes (`spawn` from `node:child_process`)
- Execute `uv run automation/adws/adw_sdlc.py {issue_number} {adw_id}` for full workflows
- Execute `uv run automation/adws/adw_phases/adw_{phase}.py {issue_number} {adw_id}` for individual phases
- Subprocess inherits environment variables for model selection (`ADW_MODEL`) and cleanup control (`ADW_CLEANUP_WORKTREES`)
- Return immediate response with `status: "pending"` (workflows run async)

**2. State Query via Python Bridge**
- Create `automation/adws/adw_modules/mcp_bridge.py` module for state queries
- Bridge exposes CLI interface: `uv run mcp_bridge.py get_state <adw_id>`
- Bridge reads `automation/agents/{adw_id}/adw_state.json` and outputs JSON to stdout
- MCP tool executes bridge subprocess and parses stdout for structured state data
- Enables MCP to access ADW state without TypeScript→Python IPC complexity

**3. Integration with Existing MCP Infrastructure**
- Reuse `createMcpServer()` factory pattern in `app/src/mcp/server.ts`
- Add tool definitions to `app/src/mcp/tools.ts` alongside existing code intelligence tools
- Leverage existing authentication middleware (API key validation via `authenticateRequest()`)
- Enforce tier-based permissions: team tier required for workflow triggers, all tiers for state queries

**4. Permission Model**
- **Free/Solo Tiers**: Read-only access to `get_adw_state` and `list_adw_workflows`
- **Team/Enterprise Tiers**: Full access to workflow triggers (`trigger_adw_workflow`, `trigger_adw_phase`)
- Trigger tools consume rate limit quota (10,000 req/hr for team tier)
- State query tools consume minimal quota (treated as lightweight reads)

**5. Observability Integration**
- Subprocess execution logs captured to `automation/logs/kota-db-ts/{env}/{adw_id}/adw_sdlc/execution.log`
- MCP-triggered workflows tagged with `triggered_by: "mcp"` in `adw_state.json`
- Existing ADW metrics analysis (`automation/adws/scripts/analyze_logs.py`) automatically tracks MCP-triggered workflows
- Future: Separate `mcp_invocations` table for audit trail (Phase 3)

### Key Modules to Touch

**Backend (app/src/mcp/)**
- `tools.ts`: Add 4 new tool definitions and execution handlers
- `server.ts`: Register new tools in `ListToolsRequestSchema` handler
- `utils/python.ts` (new): Subprocess execution utilities for Python bridge

**Automation (automation/adws/)**
- `adw_modules/mcp_bridge.py` (new): CLI for state queries and workflow listing
- `adw_sdlc.py`: Enhance to output machine-readable metadata (ADW_ID, WORKTREE_PATH, STATUS)
- `adw_modules/state.py`: Add `triggered_by` field to ADWState for tracking MCP vs manual execution

**Testing**
- `app/tests/mcp/adw-tools.test.ts` (new): Integration tests for ADW MCP tools
- `automation/adws/adw_tests/test_mcp_bridge.py` (new): Unit tests for Python bridge CLI

**Documentation**
- `automation/adws/README.md`: Document MCP tool usage and examples
- `docs/guides/mcp-adw-integration.md` (new): Claude Desktop configuration guide

### Data/API Impacts

**New ADWState Fields** (stored in `adw_state.json`):
- `triggered_by`: String indicating execution source (`"mcp"`, `"slash_command"`, `"manual"`, `"webhook"`, `"cron"`)
- `mcp_request_id`: Optional request ID from MCP tool call (for correlation)
- `mcp_user_id`: Optional user ID from authenticated MCP request (for multi-tenant tracking)

**MCP Tool Response Schemas**:
All tools return JSON-serialized content blocks (per MCP SDK conventions):
```typescript
{
  content: [
    {
      type: "text",
      text: JSON.stringify(result, null, 2)
    }
  ]
}
```

**No Database Schema Changes**:
- Phase 1-2 rely on file-based state (`adw_state.json`)
- Phase 3 may introduce `mcp_invocations` table for audit trail (stretch goal)

## Relevant Files

### Existing Files (to modify)
- `app/src/mcp/tools.ts` — Add 4 new ADW tool definitions and execution handlers
- `app/src/mcp/server.ts` — Register ADW tools in MCP server factory
- `automation/adws/adw_sdlc.py` — Enhance to output machine-readable metadata for MCP parsing
- `automation/adws/adw_modules/state.py` — Add `triggered_by`, `mcp_request_id`, `mcp_user_id` fields
- `automation/adws/README.md` — Document MCP tool usage, examples, and troubleshooting

### New Files
- `app/src/mcp/utils/python.ts` — Subprocess execution utilities (spawnPythonProcess, parsePythonOutput)
- `automation/adws/adw_modules/mcp_bridge.py` — CLI bridge for state queries and workflow listing
- `app/tests/mcp/adw-tools.test.ts` — Integration tests for ADW MCP tools
- `automation/adws/adw_tests/test_mcp_bridge.py` — Unit tests for Python bridge CLI
- `docs/guides/mcp-adw-integration.md` — Claude Desktop configuration guide with ADW tools

## Task Breakdown

### Phase 1: State Query Tools (Low Risk)
**Goal**: Enable read-only access to ADW workflow state via MCP tools

**Tasks**:
1. Create `automation/adws/adw_modules/mcp_bridge.py` with CLI interface
   - `get_state <adw_id>` command outputs JSON state from `adw_state.json`
   - `list_workflows [--status filter] [--limit N]` command lists all workflows in `automation/agents/`
   - Error handling for missing state files, invalid ADW IDs
2. Create `app/src/mcp/utils/python.ts` subprocess utilities
   - `spawnPythonProcess(script, args, env)`: Execute Python subprocess and capture stdout/stderr
   - `parsePythonOutput(stdout)`: Parse JSON from subprocess output
   - Error handling for subprocess failures, timeout after 30s for state queries
3. Add `get_adw_state` tool to `app/src/mcp/tools.ts`
   - Tool definition with `adw_id` parameter
   - Execution handler calls `spawnPythonProcess` for bridge CLI
   - Returns full ADWState JSON (issue_number, branch_name, plan_file, phase_status, etc.)
4. Add `list_adw_workflows` tool to `app/src/mcp/tools.ts`
   - Tool definition with optional `adw_id_filter`, `status_filter`, `limit` parameters
   - Execution handler calls bridge CLI with filters
   - Returns paginated list of workflows (adw_id, issue_number, issue_title, status, created_at)
5. Register state query tools in `app/src/mcp/server.ts`
   - Add to `ListToolsRequestSchema` handler response
   - Add cases to `CallToolRequestSchema` handler switch statement
6. Write unit tests for Python bridge (`automation/adws/adw_tests/test_mcp_bridge.py`)
   - Test `get_state` command with valid/invalid ADW IDs
   - Test `list_workflows` command with filters
   - Test error handling for malformed state files
7. Write integration tests for MCP state tools (`app/tests/mcp/adw-tools.test.ts`)
   - Test `get_adw_state` tool via MCP JSON-RPC requests
   - Test `list_adw_workflows` tool with filters and pagination
   - Test authentication (API key required, rate limiting applied)

### Phase 2: Workflow Trigger Tools (Higher Risk)
**Goal**: Enable programmatic workflow execution via MCP tools

**Tasks**:
1. Enhance `automation/adws/adw_sdlc.py` to output machine-readable metadata
   - Print `ADW_ID={adw_id}` at workflow start (for parsing by MCP)
   - Print `WORKTREE_PATH={path}` after worktree creation
   - Print `STATUS=completed|failed` at workflow end
   - Update `adw_phases/adw_plan.py`, `adw_build.py`, `adw_review.py` for phase-specific metadata
2. Update `automation/adws/adw_modules/state.py`
   - Add `triggered_by`, `mcp_request_id`, `mcp_user_id` fields to ADWState dataclass
   - Persist fields to `adw_state.json` via `save()` method
3. Add `trigger_adw_workflow` tool to `app/src/mcp/tools.ts`
   - Tool definition with `issue_number`, `model`, `skip_cleanup`, `adw_id` parameters
   - Execution handler spawns `adw_sdlc.py` subprocess
   - Parse ADW_ID and WORKTREE_PATH from subprocess stdout
   - Return immediate response with `status: "pending"` (non-blocking)
   - Set environment variables: `ADW_MODEL`, `ADW_CLEANUP_WORKTREES`, `ADW_TRIGGERED_BY=mcp`
4. Add `trigger_adw_phase` tool to `app/src/mcp/tools.ts`
   - Tool definition with `phase`, `issue_number`, `adw_id`, `model` parameters
   - Execution handler spawns `adw_phases/adw_{phase}.py` subprocess
   - Parse phase-specific metadata from subprocess output
   - Return immediate response with phase status
5. Implement tier-based permission enforcement in execution handlers
   - Check `authContext.tier` before executing trigger tools
   - Return error for free/solo tiers: `"Team tier required to trigger ADW workflows"`
   - Allow all tiers for state query tools
6. Register trigger tools in `app/src/mcp/server.ts`
   - Add to `ListToolsRequestSchema` handler response
   - Add cases to `CallToolRequestSchema` handler switch statement
7. Write integration tests for trigger tools (`app/tests/mcp/adw-tools.test.ts`)
   - Test `trigger_adw_workflow` tool spawns subprocess successfully
   - Test `trigger_adw_phase` tool for plan/build/review phases
   - Test permission enforcement (free tier blocked, team tier allowed)
   - Test ADW_ID parsing from subprocess output
   - Test concurrent workflow triggers (worktree isolation)
8. Enhance subprocess timeout handling
   - State queries: 30s timeout (fast reads)
   - Workflow triggers: 5s timeout for initial spawn (async execution continues in background)
   - Log timeout errors to `automation/logs/` for debugging

### Phase 3: Observability & Error Handling
**Goal**: Production-ready observability and resilience

**Tasks**:
1. Add structured logging for MCP-triggered workflows
   - Log MCP tool calls to `automation/logs/kota-db-ts/{env}/{adw_id}/mcp_trigger.log`
   - Include: timestamp, tool_name, issue_number, adw_id, user_id, tier
2. Enhance `automation/adws/scripts/analyze_logs.py` for MCP metrics
   - Track MCP-triggered vs manual workflow success rates
   - Identify common MCP trigger failure patterns
   - Output MCP-specific metrics in `--format json` mode
3. Implement subprocess error recovery
   - Retry subprocess spawn failures (1 retry with 1s delay)
   - Parse stderr for actionable error messages (missing dependencies, git failures)
   - Return structured error responses: `{ error: "message", details: "stderr" }`
4. Add timeout configuration via environment variables
   - `ADW_MCP_STATE_TIMEOUT`: Default 30s (state query timeout)
   - `ADW_MCP_TRIGGER_TIMEOUT`: Default 5s (subprocess spawn timeout)
   - Document in `automation/adws/README.md`
5. Create `mcp_invocations` table for audit trail (optional)
   - Schema: `id`, `adw_id`, `tool_name`, `user_id`, `tier`, `params`, `created_at`, `completed_at`, `status`
   - Persist MCP tool calls for observability and billing
   - Query via Supabase admin panel for debugging
6. Test error scenarios
   - Invalid issue numbers (non-existent issues)
   - Missing Python dependencies (`uv` not installed)
   - Subprocess crashes mid-execution
   - Rate limit exhaustion during workflow trigger

### Phase 4: Documentation & Examples
**Goal**: Enable external developers to use ADW MCP tools

**Tasks**:
1. Document MCP tool catalog in `automation/adws/README.md`
   - Tool definitions with input/output schemas
   - Example JSON-RPC requests for each tool
   - Common use cases (trigger workflow from Claude Desktop, query state from dashboard)
2. Create Claude Desktop integration guide (`docs/guides/mcp-adw-integration.md`)
   - MCP server configuration in `claude_desktop_config.json`
   - Example: "Trigger ADW workflow for issue #123"
   - Example: "Check workflow status and PR URL"
   - Troubleshooting: subprocess failures, authentication errors
3. Add Raycast script example
   - TypeScript script using MCP HTTP transport
   - Trigger ADW workflow from macOS command palette
   - Display workflow status notification
4. Document permission requirements
   - Tier comparison table (free vs solo vs team)
   - Rate limit consumption for each tool
   - Upgrade paths for users needing workflow triggers
5. Add troubleshooting section
   - Common errors: "Team tier required", "Subprocess timeout", "ADW ID not found"
   - Debugging steps: check logs, verify Python environment, inspect state files
   - Contact support for persistent issues

## Step by Step Tasks

### Setup and Research
1. Review existing MCP tool patterns in `app/src/mcp/tools.ts`
2. Study ADW state management in `automation/adws/adw_modules/state.py`
3. Verify Python subprocess execution patterns in automation layer

### Phase 1 Implementation (State Query Tools)
4. Create `automation/adws/adw_modules/mcp_bridge.py` CLI with `get_state` and `list_workflows` commands
5. Create `app/src/mcp/utils/python.ts` subprocess utilities with error handling
6. Implement `get_adw_state` tool definition and execution handler
7. Implement `list_adw_workflows` tool definition and execution handler
8. Register state query tools in MCP server factory
9. Write Python bridge unit tests (`test_mcp_bridge.py`)
10. Write MCP integration tests for state tools (`adw-tools.test.ts`)

### Phase 2 Implementation (Workflow Trigger Tools)
11. Enhance `automation/adws/adw_sdlc.py` to output ADW_ID, WORKTREE_PATH, STATUS
12. Update phase scripts (`adw_plan.py`, `adw_build.py`, `adw_review.py`) for metadata output
13. Add `triggered_by`, `mcp_request_id`, `mcp_user_id` fields to ADWState
14. Implement `trigger_adw_workflow` tool definition and execution handler
15. Implement `trigger_adw_phase` tool definition and execution handler
16. Add tier-based permission enforcement to trigger tools
17. Register trigger tools in MCP server factory
18. Write integration tests for trigger tools with permission checks
19. Test concurrent workflow triggers for worktree isolation

### Phase 3 Implementation (Observability)
20. Add structured logging for MCP tool calls to `mcp_trigger.log`
21. Enhance `analyze_logs.py` to parse MCP-triggered workflow metrics
22. Implement subprocess error recovery with retry logic
23. Add timeout configuration via environment variables
24. Test error scenarios (invalid issue, missing dependencies, subprocess crash)

### Phase 4 Implementation (Documentation)
25. Document ADW MCP tool catalog in `automation/adws/README.md`
26. Create Claude Desktop integration guide (`mcp-adw-integration.md`)
27. Add Raycast script example for macOS workflow triggering
28. Document permission requirements and tier comparison
29. Add troubleshooting section with common errors

### Validation and Cleanup
30. Run `bun run lint` to validate TypeScript code style
31. Run `bunx tsc --noEmit` to check for type errors
32. Run `bun test --filter integration` for integration test suite
33. Run `bun test` for full test suite
34. Run `uv run pytest automation/adws/adw_tests/test_mcp_bridge.py` for Python tests
35. Manually test full workflow via Claude Desktop MCP integration
36. Push branch and create pull request

## Risks & Mitigations

### Risk: Long-running Python subprocesses block MCP server
**Mitigation**:
- Spawn non-blocking subprocesses with `spawn()` instead of `execSync()`
- Return immediate response with `status: "pending"` (clients poll for completion)
- Subprocess continues in background after MCP response sent
- Test with 5+ concurrent workflow triggers to verify non-blocking behavior

### Risk: Subprocess failures not surfaced to MCP clients
**Mitigation**:
- Parse stderr from subprocess output for error messages
- Return structured error responses: `{ error: "message", details: "stderr" }`
- Log all subprocess failures to `automation/logs/` for debugging
- Implement retry logic for transient failures (network issues, resource contention)

### Risk: Worktree conflicts during concurrent MCP triggers
**Mitigation**:
- Existing worktree isolation uses unique ADW IDs (e.g., `abc-123-def456`)
- Each workflow creates isolated worktree in `automation/trees/{branch_name}-{adw_id}/`
- Integration tests verify concurrent execution doesn't collide
- Document concurrency limits in README (recommend max 10 concurrent workflows)

### Risk: API key rate limit exhaustion from automated MCP triggers
**Mitigation**:
- Workflow triggers consume hourly rate limit quota (team tier: 10,000 req/hr)
- State queries consume minimal quota (lightweight reads)
- MCP clients must implement backoff when rate limit exceeded (429 response)
- Monitor rate limit consumption via Supabase admin panel
- Consider per-tool rate limits if abuse detected (future enhancement)

### Risk: Python environment dependencies missing in production
**Mitigation**:
- MCP server startup checks for `uv` binary in PATH
- Return clear error message if `uv` not found: "Python environment not configured"
- Document `uv` installation in `docs/guides/mcp-adw-integration.md`
- Add health check endpoint: GET `/mcp/health` returns Python environment status
- CI tests validate subprocess execution in containerized environment

### Risk: State file corruption during concurrent writes
**Mitigation**:
- ADWState uses atomic file writes (write to temp file, rename to `adw_state.json`)
- Python bridge acquires file lock before reading state files
- MCP state queries are read-only (no concurrent write risk)
- Workflow triggers create new state files (no update conflicts)
- Test concurrent state queries (10+ parallel reads) to verify thread safety

## Validation Strategy

### Automated Tests

**Integration Tests** (`app/tests/mcp/adw-tools.test.ts`):
- Real Supabase authentication (no mocks, per `/anti-mock` philosophy)
- Real subprocess execution (`uv run` calls actual Python scripts)
- Test authentication flow: API key validation, tier enforcement
- Test state query tools: `get_adw_state`, `list_adw_workflows` with valid/invalid ADW IDs
- Test workflow trigger tools: `trigger_adw_workflow`, `trigger_adw_phase` spawn subprocesses
- Test permission enforcement: free/solo tiers blocked from triggers
- Test concurrent execution: 5 workflows triggered in parallel (worktree isolation)
- Test error handling: invalid issue numbers, missing Python environment
- Test rate limiting: verify quota consumption, 429 response when limit exceeded

**Unit Tests** (`automation/adws/adw_tests/test_mcp_bridge.py`):
- Test `mcp_bridge.py` CLI commands: `get_state`, `list_workflows`
- Test state file parsing: valid JSON, malformed JSON, missing files
- Test filter logic: status filter, ADW ID filter, pagination
- Test error handling: invalid ADW IDs, missing state directory
- Mock file I/O for isolated testing (acceptable for unit tests)

**End-to-End Tests** (manual validation):
- Trigger ADW workflow for real GitHub issue via Claude Desktop MCP
- Monitor workflow progress via `get_adw_state` tool
- Verify worktree creation, plan file generation, PR creation
- Check logs in `automation/logs/kota-db-ts/local/` for MCP metadata
- Confirm `triggered_by: "mcp"` field in `adw_state.json`

### Manual Checks

**Claude Desktop Integration**:
1. Configure MCP server in `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "kotadb": {
         "url": "http://localhost:3000/mcp",
         "headers": {
           "Authorization": "Bearer kota_team_..."
         }
       }
     }
   }
   ```
2. Trigger workflow: "Use kotadb MCP server to trigger ADW workflow for issue #123"
3. Check status: "Query ADW state for workflow abc-123"
4. Verify PR created in GitHub repository

**Raycast Script**:
1. Create TypeScript script using MCP HTTP transport
2. Trigger workflow from macOS command palette: "ADW: Trigger workflow for issue #123"
3. Display system notification with ADW_ID and status
4. Poll for completion, show PR URL when ready

**Failure Scenario Testing**:
- Trigger workflow with invalid issue number (should fail gracefully)
- Trigger workflow without `uv` installed (should return clear error)
- Trigger 20 concurrent workflows (verify worktree isolation holds)
- Exhaust rate limit quota (verify 429 response, Retry-After header)
- Kill subprocess mid-execution (verify state reflects failure)

### Release Guardrails

**Metrics & Monitoring**:
- Track MCP tool call volume via rate limit headers
- Monitor subprocess failure rate via `analyze_logs.py --agent-metrics`
- Alert if MCP-triggered workflow success rate < 80% (target parity with manual execution)
- Dashboard: MCP vs manual workflow success rates, avg execution time

**Rollback Plan**:
- Feature flag: `MCP_ADW_TOOLS_ENABLED` (default: true)
- If failure rate exceeds 20%, disable trigger tools via feature flag
- State query tools remain enabled (read-only, low risk)
- Communicate rollback to users via GitHub issue comment

**Gradual Rollout**:
1. Week 1: Enable for internal team only (team tier API keys)
2. Week 2: Enable for beta users (opt-in via GitHub issue comment)
3. Week 3: Enable for all team tier users (full production)
4. Monitor metrics at each stage, rollback if issues detected

## Validation Commands

Run these commands before pushing the branch:

```bash
# TypeScript linting and type-checking
bun run lint
bunx tsc --noEmit

# Integration tests (MCP + Supabase)
bun test --filter integration

# Full test suite
bun test

# Python tests (MCP bridge)
uv run pytest automation/adws/adw_tests/test_mcp_bridge.py -v

# Manual MCP endpoint test
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer kota_team_..." \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# Validate Python environment
which uv && uv --version

# Check for subprocess execution capability
node -e "const { spawn } = require('child_process'); const p = spawn('echo', ['test']); p.stdout.on('data', d => console.log(d.toString()));"
```

## Issue Relationships

- **Related To**: #217 (expose atomic agents as MCP tools) - Complementary approach (atomic vs orchestration)
- **Related To**: #145 (ADW MCP server implementation) - Extends existing MCP infrastructure with ADW capabilities
- **Related To**: #187 (/orchestrator slash command) - Similar functionality, different interface (slash command vs MCP tool)
- **Related To**: #153 (MCP-based ADW orchestration Phase 3) - Longer-term orchestration vision and roadmap
- **Related To**: #151 (issue relationship standards) - Ensures MCP tools discover issue context automatically
- **Follow-Up**: Web dashboard for ADW workflow management (uses MCP tools as backend API)
- **Follow-Up**: Raycast/Alfred extensions for triggering ADW from macOS (leverages MCP HTTP transport)
- **Follow-Up**: Webhook notification system for MCP-triggered workflows (async completion callbacks)
