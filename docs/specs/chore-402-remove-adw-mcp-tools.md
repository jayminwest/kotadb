# Chore Plan: Remove Internal ADW MCP Tools

## Context

The MCP server currently exposes `get_adw_state` and `list_adw_workflows` tools, which were originally added in #297 to enable programmatic ADW orchestration. These tools are intended for internal automation use within the `automation/` directory but create a confusing API surface for external MCP clients (Claude Desktop, custom dashboards) who should focus on code intelligence tools (`search_code`, `index_repository`, `search_dependencies`, `list_recent_files`).

This chore removes the public-facing ADW tools from the MCP API while preserving the internal Python bridge infrastructure used by automation scripts. The goal is to simplify the external API surface and clarify the separation between public code intelligence tools and internal automation tooling.

**Timeline**: Target completion within 1 day (effort:small label)

**Constraints**:
- Must not break internal automation workflows that use `automation/adws/adw_modules/mcp_bridge.py`
- Must maintain all existing test infrastructure for remaining MCP tools
- All existing tests must pass after removal

## Relevant Files

### Modified Files
- `app/src/mcp/tools.ts` — Remove ADW tool definitions and execution functions
- `app/src/mcp/server.ts` — Remove ADW tool registrations from server handlers
- `app/tests/mcp/tools.test.ts` — Remove test expectations for ADW tools
- `app/tests/mcp/lifecycle.test.ts` — Remove test expectations for ADW tools
- `app/tests/mcp/concurrent.test.ts` — Remove test expectations for ADW tools

### Removed Files
- `app/tests/mcp/adw-tools.test.ts` — ADW-specific test file (entire file will be removed)
- `app/src/mcp/utils/python.ts` — Python subprocess utilities (only used by ADW tools, safe to remove)

### Preserved Files (No Changes)
- `automation/adws/adw_modules/mcp_bridge.py` — Internal Python bridge module for automation scripts
- `docs/specs/feature-297-adw-mcp-tools.md` — Historical spec documentation
- Any slash commands or CI workflows that call `mcp_bridge.py` directly

## Work Items

### Preparation
- Verify current git branch is based on `develop`
- Run full test suite to establish baseline (`cd app && bun test`)
- Confirm Python bridge usage is isolated to ADW tools only

### Execution

#### 1. Remove ADW Tool Definitions from tools.ts
Remove the following sections from `app/src/mcp/tools.ts`:
- Lines 155-201: `GET_ADW_STATE_TOOL` and `LIST_ADW_WORKFLOWS_TOOL` definitions
- Lines 586-670: `executeGetAdwState` and `executeListAdwWorkflows` functions
- Lines 212-213: Remove `GET_ADW_STATE_TOOL` and `LIST_ADW_WORKFLOWS_TOOL` from `getToolDefinitions()` array
- Lines 696-699: Remove `get_adw_state` and `list_adw_workflows` case statements from `handleToolCall()` switch
- Line 21: Remove `executeBridgeCommand` import from `"./utils/python"`

#### 2. Remove ADW Tool Registrations from server.ts
Remove the following sections from `app/src/mcp/server.ts`:
- Lines 21-22: Remove `GET_ADW_STATE_TOOL` and `LIST_ADW_WORKFLOWS_TOOL` imports
- Lines 27-28: Remove `executeGetAdwState` and `executeListAdwWorkflows` imports
- Lines 63-64: Remove ADW tools from `ListToolsRequestSchema` handler tools array
- Lines 108-122: Remove `get_adw_state` and `list_adw_workflows` case statements from `CallToolRequestSchema` handler switch

#### 3. Remove Python Subprocess Utilities
Delete the entire file:
- `app/src/mcp/utils/python.ts` — Only used by ADW tools, no other references exist

#### 4. Update Test Files

**Remove ADW-specific test file:**
- Delete `app/tests/mcp/adw-tools.test.ts` entirely

**Update existing test files:**
- `app/tests/mcp/tools.test.ts`: Remove assertions expecting ADW tools (lines ~68-69)
- `app/tests/mcp/lifecycle.test.ts`: Remove assertions expecting ADW tools (lines ~71-72)
- `app/tests/mcp/concurrent.test.ts`: Remove assertions expecting ADW tools (lines ~280-281)

### Follow-up
- Run full test suite to verify all tests pass: `cd app && bun test`
- Run type-check to ensure no TypeScript errors: `cd app && bunx tsc --noEmit`
- Run linter: `cd app && bun run lint`
- Verify MCP server exposes only 4 tools via manual curl test (validation commands below)
- Update `.claude/commands/docs/mcp-integration.md` if it explicitly mentions ADW tools in tool count or listings

## Step by Step Tasks

### Phase 1: Remove Tool Definitions
- Remove `GET_ADW_STATE_TOOL` and `LIST_ADW_WORKFLOWS_TOOL` definitions from `app/src/mcp/tools.ts` (lines 155-201)
- Remove `executeGetAdwState` and `executeListAdwWorkflows` functions from `app/src/mcp/tools.ts` (lines 586-670)
- Remove ADW tools from `getToolDefinitions()` array in `app/src/mcp/tools.ts` (lines 212-213)
- Remove `get_adw_state` and `list_adw_workflows` case statements from `handleToolCall()` in `app/src/mcp/tools.ts` (lines 696-699)
- Remove `executeBridgeCommand` import from `app/src/mcp/tools.ts` (line 21)

### Phase 2: Remove Tool Registrations
- Remove `GET_ADW_STATE_TOOL`, `LIST_ADW_WORKFLOWS_TOOL` imports from `app/src/mcp/server.ts` (lines 21-22)
- Remove `executeGetAdwState`, `executeListAdwWorkflows` imports from `app/src/mcp/server.ts` (lines 27-28)
- Remove ADW tools from `ListToolsRequestSchema` handler in `app/src/mcp/server.ts` (lines 63-64)
- Remove `get_adw_state` and `list_adw_workflows` case statements from `CallToolRequestSchema` handler in `app/src/mcp/server.ts` (lines 108-122)

### Phase 3: Remove Python Utilities
- Delete `app/src/mcp/utils/python.ts` file entirely

### Phase 4: Update Tests
- Delete `app/tests/mcp/adw-tools.test.ts` file entirely
- Remove ADW tool assertions from `app/tests/mcp/tools.test.ts` (lines ~68-69)
- Remove ADW tool assertions from `app/tests/mcp/lifecycle.test.ts` (lines ~71-72)
- Remove ADW tool assertions from `app/tests/mcp/concurrent.test.ts` (lines ~280-281)

### Phase 5: Validation
- Run type-check: `cd app && bunx tsc --noEmit`
- Run linter: `cd app && bun run lint`
- Run full test suite: `cd app && bun test`
- Run MCP-specific tests: `cd app && bun test --filter mcp`
- Manually verify tool list via curl (see validation commands below)

### Phase 6: Final Cleanup and Commit
- Review all changes for completeness
- Stage all modified and deleted files: `git add -A`
- Commit changes with proper message format
- Push branch to remote: `git push -u origin chore/402-remove-adw-mcp-tools`

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking internal automation workflows that depend on Python bridge | **Mitigation**: Preserve `automation/adws/adw_modules/mcp_bridge.py` unchanged. The Python bridge is still usable directly via subprocess calls from automation scripts, just not exposed via public MCP API. |
| Test failures due to incomplete removal | **Mitigation**: Run full test suite after each phase. Use grep to verify no remaining references to removed tools exist in codebase. |
| External MCP clients currently using ADW tools | **Mitigation**: These tools were marked as internal-facing in their descriptions. External clients should transition to querying ADW state via automation scripts or alternative APIs if needed. Document this change in changelog/release notes. |
| Python utility module used by other code | **Mitigation**: Verified via grep that `executeBridgeCommand` is only used in `app/src/mcp/tools.ts` for ADW tools. Safe to remove. |

## Validation Commands

```bash
# Type-check
cd app && bunx tsc --noEmit

# Lint
cd app && bun run lint

# Run MCP integration tests
cd app && bun test --filter mcp

# Full test suite
cd app && bun test

# Build (if applicable)
cd app && bun run build

# Manual verification: Start dev server and query tool list
cd app && ./scripts/dev-start.sh &
sleep 5

# Verify only 4 tools are exposed (search_code, index_repository, list_recent_files, search_dependencies)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer kota_team_..." \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }' | jq '.result.tools[].name'

# Expected output (4 tools only):
# "search_code"
# "index_repository"
# "list_recent_files"
# "search_dependencies"

# Stop dev server
pkill -f "bun.*server"
```

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(mcp): remove internal ADW tools from public API` not `Based on the plan, the commit should remove ADW tools`

**Example valid commit message:**
```
chore(mcp): remove internal ADW tools from public API

Remove get_adw_state and list_adw_workflows tools from MCP server.
These tools were intended for internal automation use and created
confusion for external MCP clients. The Python bridge module remains
available for internal automation scripts via direct subprocess calls.

Closes #402
```

## Deliverables

- **Code changes**: Removal of ADW tool definitions, execution functions, and server registrations from `app/src/mcp/` directory
- **Test updates**: Removal of ADW-specific test file and assertions from remaining MCP test files
- **File deletions**: `app/src/mcp/utils/python.ts` and `app/tests/mcp/adw-tools.test.ts`
- **Verification**: All existing tests pass, type-check succeeds, MCP server exposes only 4 tools
- **Documentation**: Update MCP integration docs if tool count or listings explicitly mentioned ADW tools
