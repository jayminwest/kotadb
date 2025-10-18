# ADW MCP Server - Implementation Status

**Feature**: Issue #145 - ADW MCP Server for Agent Orchestration
**Status**: Partial Implementation (Foundation Complete)
**Scope**: 16-day plan, 57 tasks (Phase 1-2 completed, ~20 tasks)

## What Has Been Implemented

### Phase 1: Foundation (Complete)
- ✅ Created `automation/adws/mcp_server/` directory structure
- ✅ Configured TypeScript project with `tsconfig.json`
- ✅ Installed MCP SDK dependencies (`@modelcontextprotocol/sdk@^1.20.0`, `express`)
- ✅ Implemented Python bridge module (`adw_modules/mcp_bridge.py`) for TypeScript-Python communication
- ✅ Defined TypeScript types for all tool arguments (`src/types.ts`)
- ✅ Created MCP server factory with stateless transport (`src/server.ts`)
- ✅ Created Express HTTP entry point (`src/index.ts`)

### Phase 2: Git Operations (Complete)
- ✅ Implemented `git_commit` tool with file staging support
- ✅ Implemented `git_create_worktree` tool for isolated worktree creation
- ✅ Implemented `git_cleanup_worktree` tool with branch deletion option
- ✅ Created TypeScript tool handlers (`src/tools/git.ts`)
- ✅ Added Python bridge wrappers for git operations

### Additional Tools Implemented
- ✅ Implemented `adw_get_state` tool for workflow state queries
- ✅ Implemented `adw_list_workflows` tool for workflow listing
- ✅ Implemented `adw_run_phase` tool for phase execution
- ✅ Implemented `bun_validate` tool for lint/typecheck validation
- ✅ Implemented `bun_validate_migrations` tool for migration drift detection

## What Remains To Be Implemented

This is a partial implementation focusing on the core MCP server foundation and essential tools. The following work remains from the original 57-task plan:

### Template Updates (Tasks 23-27)
- ❌ Remove `/pull_request` instructions from `.claude/commands/issues/chore.md`
- ❌ Remove `/pull_request` instructions from `.claude/commands/issues/feature.md`
- ❌ Remove `/pull_request` instructions from `.claude/commands/issues/bug.md`
- ❌ Add `git_commit` tool usage examples to `.claude/commands/workflows/implement.md`
- ❌ Add state query examples using `adw_get_state` to planning templates

### Test Phase Restoration (Tasks 29-34)
- ❌ Restore `automation/adws/adw_phases/adw_test.py` from commit 704a328 (367 lines)
- ❌ Refactor test phase to use `bun_validate` MCP tool instead of subprocess
- ❌ Implement agent retry loop (5 attempts, up from 3)
- ❌ Add smart bailout logic (stop if agent resolves 0 failures)
- ❌ Implement continue-on-error pattern (collect all validation failures)
- ❌ Add test phase to `adw_sdlc.py` orchestration sequence

### Slash Command Tool (Tasks 39-40)
- ❌ Implement `adw_execute_command` tool in `src/tools/commands.ts`
- ❌ Add slash command routing and argument passing

### Configuration & Integration (Tasks 41-45)
- ❌ Update `.mcp.json` to add `kotadb-adw` server configuration
- ❌ Configure server URL (http://localhost:4000/mcp) and authentication
- ❌ Add MCP server startup script to `package.json`
- ❌ Update `automation/adws/README.md` with MCP server documentation
- ❌ Create developer guide for MCP tool usage in agent templates

### Testing & Validation (Tasks 46-57)
- ❌ Write integration tests for all MCP tools (state, git, validation, workflow)
- ❌ Test state queries across phase boundaries
- ❌ Test incremental commits during implementation phase
- ❌ Test migration validation and re-review triggers
- ❌ Test worktree cleanup after PR creation
- ❌ Run full ADW workflow (plan → build → test → review) with MCP tools
- ❌ Validate template changes with real issue execution
- ❌ Run full validation suite (lint, typecheck, test, build)
- ❌ Production build verification
- ❌ Push feature branch and create PR

### Additional Work Not Started
- ❌ Authentication middleware for MCP endpoint (API key validation)
- ❌ Rate limiting for MCP tool invocations
- ❌ Monitoring and metrics (tool invocation counts, latency, errors)
- ❌ Alerting configuration (error rates, drift detection, cleanup failures)
- ❌ Migration validation integration into `ts_commands.py`

## Architecture

### Dual MCP Server Design
- **kotadb** (`app/src/mcp/`): Code search and indexing (existing)
- **kotadb-adw** (`automation/adws/mcp_server/`): Workflow orchestration (new)

Both servers use:
- `@modelcontextprotocol/sdk` v1.20+ for MCP protocol compliance
- Stateless mode (`sessionIdGenerator: undefined`)
- JSON-RPC transport (`enableJsonResponse: true`)
- Per-request server instances for user isolation

### Python Bridge Pattern
TypeScript MCP tools invoke Python functions via subprocess:
```typescript
// TypeScript tool handler
const result = await executePythonBridge("get_state", [adw_id]);

// Invokes Python CLI
// python3 -m adws.adw_modules.mcp_bridge get_state <adw_id>

// Returns JSON result
{ "adw_id": "...", "issue_number": "145", ... }
```

### Tool Catalog (8 tools implemented)
1. **Workflow**: `adw_get_state`, `adw_list_workflows`, `adw_run_phase`
2. **Git**: `git_commit`, `git_create_worktree`, `git_cleanup_worktree`
3. **Validation**: `bun_validate`, `bun_validate_migrations`

## Environment Configuration

### Python Path Setup

The MCP server spawns Python subprocesses to execute ADW operations via the Python bridge module. By default, it searches for `python3` in the system PATH, but you can configure an explicit Python executable path.

**Environment Variable:**
```bash
PYTHON_PATH=/path/to/python3
```

**Finding Your Python Path:**
```bash
which python3
# Example output: /usr/local/bin/python3
```

**Configuration File:**
Create `.env` file in `automation/adws/mcp_server/`:
```bash
# Copy template
cp .env.example .env

# Edit with your Python path
PYTHON_PATH=/usr/local/bin/python3
```

**Common Python Installation Paths:**
- System Python (macOS/Linux): `/usr/bin/python3`
- Homebrew (Intel Mac): `/usr/local/bin/python3`
- Homebrew (Apple Silicon): `/opt/homebrew/bin/python3`
- pyenv: `~/.pyenv/versions/3.12.0/bin/python3`
- uv: `~/.cache/uv/archive-v0/{hash}/bin/python3`

**Why Set PYTHON_PATH?**
- **Reliability**: Bun runtime may inherit minimal PATH without Python directory
- **Predictability**: Explicit paths prevent `ENOENT` spawn errors
- **Flexibility**: Support for virtualenvs, uv environments, and custom installations
- **Debugging**: Server logs resolved Python path on startup

**Server Startup Logs:**
```
ADW MCP server listening on port 4000
Using Python executable: /usr/local/bin/python3
```

If `PYTHON_PATH` is not set, the server logs a warning:
```
WARNING: PYTHON_PATH environment variable not set. Using default 'python3' from system PATH.
For production use, set PYTHON_PATH to absolute path of Python executable.
```

## Usage (Development)

```bash
# Start MCP server (runs on port 4000)
cd automation/adws/mcp_server && bun run dev

# Test MCP endpoint
curl -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Health check
curl http://localhost:4000/health
```

## Troubleshooting

### ENOENT: no such file or directory, posix_spawn 'python3'

**Symptom:** MCP server starts successfully but crashes when invoking tools with error:
```
ENOENT: no such file or directory, posix_spawn 'python3'
syscall: "spawn python3"
errno: -2
```

**Cause:** Bun runtime cannot find `python3` executable in inherited PATH.

**Solution:**
1. Find your Python path: `which python3`
2. Create `.env` file: `cp .env.example .env`
3. Set `PYTHON_PATH` to absolute path from step 1
4. Restart server and verify startup log shows correct path

**Verification:**
```bash
# Test Python bridge directly
cd automation && python3 -m adws.adw_modules.mcp_bridge list_workflows

# If this works but server fails, PATH discrepancy confirmed
# Set PYTHON_PATH environment variable to resolve
```

## Type Checking

```bash
cd automation/adws/mcp_server && bunx tsc --noEmit
```

**Status**: ✅ All implemented files pass type checking

## Next Steps for Completion

This foundation enables MCP-based workflow orchestration but is not production-ready. To complete the feature:

1. **Short-term** (1-2 days):
   - Update `.mcp.json` to register `kotadb-adw` server
   - Add authentication middleware to `/mcp` endpoint
   - Write basic integration tests for existing tools
   - Create developer documentation for MCP tool usage

2. **Medium-term** (3-5 days):
   - Restore and refactor test phase with MCP tools
   - Implement `adw_execute_command` tool
   - Update agent templates to remove `/pull_request` instructions
   - Add `git_commit` tool usage examples to templates

3. **Long-term** (5-7 days):
   - Full end-to-end testing with real ADW workflows
   - Monitoring and alerting infrastructure
   - Production deployment configuration
   - Performance optimization and error handling improvements

## Notes

This implementation provides a working foundation for MCP-based ADW orchestration but represents approximately 35% of the original 57-task plan. The server is functional for development and testing but should not be considered production-ready without completing the remaining tasks, particularly:

- Authentication and security
- Comprehensive testing
- Template integration
- Test phase restoration
- Documentation

The architecture and tool implementations follow the patterns specified in the feature plan and are compatible with the existing ADW infrastructure.
