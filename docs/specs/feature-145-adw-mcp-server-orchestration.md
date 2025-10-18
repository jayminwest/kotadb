# Feature Plan: ADW MCP Server for Agent Orchestration

## Issue Reference
- Issue #145: feat: implement ADW MCP server for agent-orchestrator communication
- Labels: component:backend, component:ci-cd, priority:high, effort:large, status:needs-investigation
- Strategic Context: Multi-agent framework foundation (docs/vision/2025-10-13-multi-agent-framework-investigation.md)

## Issue Relationships

- **Blocks**: #148 (hybrid ADW resilience) - Provides MCP infrastructure for orchestration layer
- **Related To**: #110 (kota-tasks MCP) - Shared MCP server patterns and tooling
- **Follow-Up**: #148 (retry logic and checkpoints) - Enhanced resilience after MCP foundation

## Overview

### Problem
The current ADW architecture operates agents as black boxes with limited visibility and control during execution. Key pain points include:

1. **Zero execution visibility**: Agents run with only input/output observable, no real-time progress tracking
2. **No incremental commits**: Only 2 commits per workflow (plan + implementation) despite template instructions for incremental commits
3. **Redundant agent invocations**: `/find_plan_file` agent deduces paths that orchestrator already knows
4. **Template instruction ambiguity**: Planning templates contain `/pull_request` instructions that agents execute prematurely (before implementation)
5. **Missing validation integration**: `bun run test:validate-migrations` exists but not integrated into ADW validation suite
6. **Brittle orchestration**: Test phase removed (PR #136) along with agent resolution retry logic

### Desired Outcome
Transform ADW from a brittle orchestration script into a production-grade multi-agent framework by:

1. Exposing workflow primitives as MCP tools (run_phase, get_state, git_commit, etc.)
2. Enabling real-time progress reporting via MCP tool invocations
3. Eliminating redundant agent searches by providing state via MCP
4. Integrating migration validation into workflow lifecycle
5. Restoring test phase with improved retry logic and MCP-based resilience

### Non-Goals
- Custom MCP protocol extensions (use SDK patterns only)
- Frontend dashboard for execution monitoring (future phase)
- Agent marketplace or registry (Phase 3 per vision doc)
- Cross-vendor agent collaboration (OpenAI, Gemini support deferred)

## Technical Approach

### Architecture Notes
Create a new MCP server (`automation/adws/mcp_server/`) that exposes ADW orchestration primitives as MCP tools. This server complements the existing code search MCP server (`app/src/mcp/`) and enables agents to interact with workflow state, git operations, validation commands, and phase execution.

**Dual MCP Server Architecture**:
- **kotadb**: Code search and indexing (existing, `app/src/mcp/`)
- **kotadb-adw**: Workflow orchestration and automation (new, `automation/adws/mcp_server/`)

Both servers configured in `.mcp.json` for unified agent access.

### Key Modules to Touch

**New Modules** (Python/TypeScript hybrid):
- `automation/adws/mcp_server/server.ts`: MCP server entry point using `@modelcontextprotocol/sdk`
- `automation/adws/mcp_server/tools/workflow.ts`: Phase execution tools (adw_run_phase, adw_get_state, adw_list_workflows)
- `automation/adws/mcp_server/tools/git.ts`: Git operation tools (git_create_worktree, git_commit, git_cleanup_worktree)
- `automation/adws/mcp_server/tools/validation.ts`: Validation tools (bun_validate, bun_validate_migrations)
- `automation/adws/mcp_server/tools/commands.ts`: Slash command execution tool (adw_execute_command)
- `automation/adws/mcp_server/routes.ts`: Express.js HTTP endpoint handler

**Modified Modules**:
- `automation/adws/adw_modules/ts_commands.py`: Add `bun_validate_migrations` to validation command sequence
- `.claude/commands/issues/chore.md`: Remove `/pull_request` instructions from planning templates
- `.claude/commands/issues/feature.md`: Remove `/pull_request` instructions, add state query examples
- `.claude/commands/issues/bug.md`: Remove `/pull_request` instructions
- `.claude/commands/workflows/implement.md`: Add `git_commit` tool usage instructions for incremental commits
- `.mcp.json`: Add `kotadb-adw` server configuration

**Restored Modules**:
- `automation/adws/adw_phases/adw_test.py`: Restore test phase with agent retry loop (deleted in #136, 367 lines)

### Data/API Impacts

**New MCP Tools** (kotadb-adw server):

```typescript
// Workflow orchestration
interface ADWRunPhaseArgs {
  phase: "plan" | "build" | "test" | "review";
  issue_number: string;
  adw_id?: string;
}

interface ADWGetStateArgs {
  adw_id: string;
}

interface ADWListWorkflowsArgs {
  adw_id?: string; // Optional filter
}

// Git operations
interface GitCommitArgs {
  adw_id: string;
  message: string;
  files?: string[]; // Optional file list, default: stage all
}

interface GitCreateWorktreeArgs {
  worktree_name: string;
  base_branch: string;
  base_path?: string; // Default: "trees"
}

interface GitCleanupWorktreeArgs {
  worktree_name: string;
  delete_branch?: boolean; // Default: true
}

// Validation
interface BunValidateArgs {
  cwd?: string; // Default: project root
}

interface BunValidateMigrationsArgs {
  adw_id: string;
  cwd?: string; // Default: app/
}

// Slash commands
interface ADWExecuteCommandArgs {
  command: string; // e.g., "/classify_issue"
  args: string[];
  adw_id?: string;
}
```

**Python Bridge Layer** (automation/adws/adw_modules/mcp_bridge.py):
- Python wrappers for calling ADW phase scripts from TypeScript MCP tools
- Subprocess execution with structured logging
- State synchronization between MCP tools and Python orchestrator

**State Changes**:
- No schema changes to `agents/{adw_id}/adw_state.json`
- New field tracking: `migration_drift_detected` (boolean), `incremental_commits` (array of commit hashes)

## Relevant Files

### Existing Files
- `app/src/mcp/server.ts:1-120` — Reference implementation for MCP SDK patterns (stateless mode, enableJsonResponse)
- `app/src/mcp/tools.ts:1-200` — Tool execution patterns, parameter validation, error handling
- `automation/adws/adw_modules/state.py:1-157` — State management API for workflow persistence
- `automation/adws/adw_modules/git_ops.py:212-351` — Worktree management (create_worktree, cleanup_worktree, list_worktrees)
- `automation/adws/adw_modules/ts_commands.py:1-100` — Validation command catalog (bun lint/typecheck/test/build)
- `automation/adws/adw_phases/adw_plan.py:1-150` — Plan phase execution pattern (state loading, agent invocation, worktree creation)
- `automation/adws/adw_phases/adw_build.py:1-200` — Build phase execution (implementation + PR creation)
- `.mcp.json:1-20` — Current MCP server configuration (kotadb only)
- `.claude/commands/workflows/implement.md:1-100` — Implementation template requiring incremental commit instructions

### New Files
- `automation/adws/mcp_server/server.ts` — MCP server factory with tool registrations
- `automation/adws/mcp_server/tools/workflow.ts` — Workflow orchestration tool handlers
- `automation/adws/mcp_server/tools/git.ts` — Git operation tool handlers
- `automation/adws/mcp_server/tools/validation.ts` — Validation tool handlers
- `automation/adws/mcp_server/tools/commands.ts` — Slash command execution tool handler
- `automation/adws/mcp_server/routes.ts` — Express.js HTTP endpoint with authentication
- `automation/adws/mcp_server/types.ts` — TypeScript type definitions for tool arguments
- `automation/adws/mcp_server/package.json` — Node.js dependencies (@modelcontextprotocol/sdk, express, etc.)
- `automation/adws/mcp_server/tsconfig.json` — TypeScript configuration
- `automation/adws/adw_modules/mcp_bridge.py` — Python-to-TypeScript bridge for phase execution
- `automation/adws/adw_phases/adw_test.py` — Restored test phase with MCP-based retry logic

## Task Breakdown

### Phase 1: Foundation (Days 1-3)
- Create `automation/adws/mcp_server/` directory structure
- Implement MCP server skeleton with Express.js transport
- Register 3 core tools: `adw_get_state`, `git_commit`, `bun_validate_migrations`
- Add Python bridge module for state queries
- Write integration tests for tool execution

### Phase 2: Git Operations (Days 4-5)
- Implement `git_create_worktree` tool with worktree creation logic
- Implement `git_cleanup_worktree` tool with branch deletion option
- Add worktree verification and error handling
- Update templates to remove redundant `/find_plan_file` agent usage
- Test worktree isolation across concurrent tool invocations

### Phase 3: Validation Integration (Days 6-7)
- Add `bun_validate` tool for full validation suite
- Enhance `bun_validate_migrations` to trigger re-review on drift
- Update `ts_commands.py` to include migration validation first
- Add migration drift tracking to state schema
- Test validation failure scenarios and retry logic

### Phase 4: Template Updates (Days 8-9)
- Remove `/pull_request` instructions from planning templates (chore.md, feature.md, bug.md)
- Add `git_commit` tool usage to implementation template
- Add state query examples to all phase templates
- Update documentation for template-MCP integration patterns
- Test full workflow with updated templates

### Phase 5: Test Phase Restoration (Days 10-12)
- Restore `adw_test.py` from git history (commit 704a328)
- Refactor test phase to use `bun_validate` MCP tool
- Implement agent retry loop (5 attempts with smart bailout)
- Add continue-on-error pattern (collect all failures before reporting)
- Test phase integration with plan → build → test → review flow

### Phase 6: Workflow Orchestration (Days 13-14)
- Implement `adw_run_phase` tool with phase routing logic
- Implement `adw_list_workflows` tool for status inspection
- Add `adw_execute_command` tool for slash command delegation
- Test multi-phase workflows triggered via MCP
- Document MCP-based workflow orchestration patterns

### Phase 7: Configuration & Documentation (Days 15-16)
- Update `.mcp.json` with kotadb-adw server configuration
- Add authentication layer to MCP server (API key validation)
- Write developer documentation for MCP tool usage
- Create migration guide for existing ADW workflows
- Final integration testing and validation

## Step by Step Tasks

### MCP Server Setup
1. Create `automation/adws/mcp_server/` directory
2. Initialize Node.js project with `package.json` and TypeScript configuration
3. Install dependencies: `@modelcontextprotocol/sdk`, `express`, `@types/express`
4. Create `server.ts` with MCP Server factory (pattern from app/src/mcp/server.ts)
5. Create `routes.ts` with Express HTTP endpoint handler
6. Add authentication middleware (API key validation for kotadb-adw server)

### Core Tool Implementation
7. Create `tools/workflow.ts` with `adw_get_state` tool handler
8. Implement Python bridge module (`adw_modules/mcp_bridge.py`) for state queries
9. Create `tools/git.ts` with `git_commit` tool handler
10. Add git operations using existing `git_ops.py` functions via subprocess
11. Create `tools/validation.ts` with `bun_validate_migrations` tool handler
12. Add migration drift detection and re-review trigger logic

### Git Worktree Tools
13. Implement `git_create_worktree` tool in `tools/git.ts`
14. Implement `git_cleanup_worktree` tool with branch deletion option
15. Add worktree existence verification before operations
16. Add error handling for duplicate worktree names
17. Test worktree isolation with concurrent tool calls

### Validation Integration
18. Implement `bun_validate` tool in `tools/validation.ts`
19. Update `ts_commands.py` to add `BUN_VALIDATE_MIGRATIONS` as first validation command
20. Add migration validation to `adw_build.py` before test execution
21. Implement re-review trigger on migration drift detection
22. Add migration drift tracking to ADWState extra fields

### Template Updates
23. Remove `/pull_request` instructions from `.claude/commands/issues/chore.md`
24. Remove `/pull_request` instructions from `.claude/commands/issues/feature.md`
25. Remove `/pull_request` instructions from `.claude/commands/issues/bug.md`
26. Add `git_commit` tool usage examples to `.claude/commands/workflows/implement.md`
27. Add state query examples using `adw_get_state` tool to planning templates
28. Update prompt-code-alignment documentation for MCP tool patterns

### Test Phase Restoration
29. Restore `automation/adws/adw_phases/adw_test.py` from commit 704a328
30. Refactor test phase to use `bun_validate` MCP tool instead of direct subprocess
31. Implement agent retry loop (5 attempts, up from 3)
32. Add smart bailout logic (stop if agent resolves 0 failures)
33. Implement continue-on-error pattern (collect all validation failures)
34. Add test phase to `adw_sdlc.py` orchestration sequence

### Workflow Orchestration Tools
35. Implement `adw_run_phase` tool in `tools/workflow.ts`
36. Add phase routing logic (plan/build/test/review → Python scripts)
37. Implement `adw_list_workflows` tool for workflow status inspection
38. Add workflow filtering by adw_id
39. Implement `adw_execute_command` tool in `tools/commands.ts`
40. Add slash command routing and argument passing

### Configuration & Integration
41. Update `.mcp.json` to add `kotadb-adw` server configuration
42. Configure server URL (http://localhost:4000/mcp) and authentication
43. Add MCP server startup script to `automation/adws/mcp_server/package.json`
44. Update `automation/adws/README.md` with MCP server documentation
45. Create developer guide for MCP tool usage in agent templates

### Testing & Validation
46. Write integration tests for all MCP tools
47. Test state queries across phase boundaries
48. Test incremental commits during implementation phase
49. Test migration validation and re-review triggers
50. Test worktree cleanup after PR creation
51. Run full ADW workflow (plan → build → test → review) with MCP tools
52. Validate template changes with real issue execution
53. Run `bun run lint` and fix any linting errors
54. Run `bun run typecheck` and fix any type errors
55. Run `bun test` and ensure all tests pass
56. Run `bun run build` and verify production build succeeds
57. Push feature branch to remote: `git push -u origin feat/145-adw-mcp-server-orchestration`

## Risks & Mitigations

### Risk: TypeScript/Python Integration Complexity
**Impact**: MCP server (TypeScript) needs to invoke Python phase scripts, creating language barrier
**Mitigation**:
- Use simple subprocess bridge pattern (mcp_bridge.py)
- Pass ADW ID and phase name as arguments, let Python handle orchestration
- Validate argument types in TypeScript before subprocess invocation
- Use structured logging for cross-language debugging

### Risk: State Synchronization Between MCP and Python
**Impact**: MCP tools modify state (git commits), Python orchestrator expects specific state structure
**Mitigation**:
- MCP tools use read-only state queries via Python bridge
- Write operations (commit, worktree creation) delegate to Python functions
- State updates always happen through Python state.py module
- Add state validation checks before phase transitions

### Risk: Agent Template Breaking Changes
**Impact**: Removing `/pull_request` instructions may break existing workflows if agents still expect to call it
**Mitigation**:
- Phase rollout: Update templates before deploying MCP server
- Add deprecation warnings to `/pull_request` command output
- Test updated templates with production issues before merging
- Document migration path in PR description

### Risk: Migration Validation False Positives
**Impact**: Migration drift detection may trigger re-review unnecessarily if file formatting differs
**Mitigation**:
- Use exact file content comparison (SHA-256 hash)
- Add whitespace normalization before comparison
- Log drift details for manual inspection
- Allow skipping validation via environment flag for debugging

### Risk: Test Phase Restoration Complexity
**Impact**: 367 lines of deleted code may have dependencies on removed infrastructure
**Mitigation**:
- Start with simple retry loop implementation, add features incrementally
- Use MCP tools for validation instead of direct subprocess calls
- Test phase runs as optional step (failures don't block PR creation)
- Comprehensive logging for debugging agent resolution attempts

### Risk: MCP Server Performance Bottleneck
**Impact**: Synchronous tool invocations may slow down agent execution
**Mitigation**:
- Use stateless MCP server design (no session management overhead)
- Keep tool handlers lightweight (delegate heavy work to Python)
- Add timeout configuration for subprocess calls
- Monitor tool invocation latency in production logs

## Validation Strategy

### Automated Tests (Integration/E2E)
All tests must hit real services (anti-mocking compliance):

**MCP Tool Tests** (`automation/adws/mcp_server/tests/`):
- Test `adw_get_state` tool returns correct state snapshot from real JSON files
- Test `git_commit` tool creates commits in real git worktrees
- Test `git_create_worktree` creates isolated worktrees with correct branch names
- Test `git_cleanup_worktree` removes worktrees and deletes branches
- Test `bun_validate` tool executes real Bun validation commands
- Test `bun_validate_migrations` detects real migration drift scenarios
- Test `adw_run_phase` tool invokes real Python phase scripts

**Python Bridge Tests** (`automation/adws/adw_tests/`):
- Test `mcp_bridge.py` state queries return valid ADWState objects
- Test subprocess invocation of phase scripts with real ADW IDs
- Test error handling when phase scripts fail
- Test argument validation before subprocess calls

**Template Integration Tests**:
- Test full workflow with updated templates creates incremental commits
- Test planning templates no longer invoke `/pull_request` prematurely
- Test implementation template uses `git_commit` tool for commits
- Test state queries replace `/find_plan_file` agent invocations

### Manual Checks
Document the following scenarios and verify with real data:

**Migration Drift Detection**:
1. Modify file in `app/src/db/migrations/` without updating `app/supabase/migrations/`
2. Run `bun_validate_migrations` tool via MCP
3. Verify tool returns `drift_detected: true`
4. Verify re-review phase triggered automatically
5. Verify drift details logged for manual inspection

**Incremental Commit Workflow**:
1. Run full ADW workflow for test issue
2. Verify multiple commits created during implementation phase (expect 5-10 commits)
3. Verify commit messages follow conventional commits format
4. Verify each commit represents logical unit of work
5. Verify no premature PR creation in plan phase

**Worktree Isolation**:
1. Start two concurrent workflows with different ADW IDs
2. Verify each creates isolated worktree in `trees/` directory
3. Verify git operations in one worktree don't affect the other
4. Verify cleanup removes worktrees after PR creation
5. Verify no stale worktrees remain after workflow completion

**Test Phase Retry Logic**:
1. Introduce failing test in codebase
2. Run test phase via `adw_run_phase` tool
3. Verify agent attempts retry (up to 5 attempts)
4. Verify smart bailout if agent resolves 0 failures
5. Verify continue-on-error collects all validation failures

### Release Guardrails
**Monitoring**:
- Add MCP tool invocation metrics (count, latency, errors)
- Track migration drift detection frequency
- Monitor worktree cleanup success rate
- Track incremental commit count per workflow

**Alerting**:
- Alert if MCP server returns >10% error rate
- Alert if migration drift detected in >20% of workflows
- Alert if worktree cleanup fails (stale worktrees accumulating)
- Alert if test phase retry exhausted without resolution

**Rollback Plan**:
- Keep existing orchestration scripts functional (no destructive changes)
- Feature flag for MCP-based orchestration vs traditional Python-only
- Revert template changes if agent behavior degrades
- Document rollback procedure in PR description

### Real-Service Evidence
All validation must demonstrate interaction with real services:

**Supabase Integration** (if applicable):
- Not directly used by MCP server, but Python bridge may query database
- Test with real Supabase Local instance (per anti-mocking guidance)

**Git Operations**:
- All git tests use real git commands in temporary directories
- No mocked git subprocess calls
- Verify commits appear in `git log` output
- Verify worktrees appear in `git worktree list` output

**Bun Validation**:
- Run real Bun commands (lint, typecheck, test, build)
- Capture stdout/stderr from actual execution
- No stubbed validation results

**Failure Injection**:
- Introduce intentional failures (syntax errors, failing tests)
- Verify MCP tools detect failures correctly
- Verify retry logic activates as expected
- Verify error messages propagate to orchestrator

## Validation Commands

Run these commands before creating PR (Level 2 validation per `/validate-implementation`):

```bash
# Lint check (TypeScript + Python)
cd automation/adws/mcp_server && bun run lint
cd automation && python3 -m py_compile adws/adw_modules/mcp_bridge.py

# Type checking (TypeScript only)
cd automation/adws/mcp_server && bunx tsc --noEmit

# Integration tests (TypeScript MCP server)
cd automation/adws/mcp_server && bun test --filter integration

# Full test suite (TypeScript + Python)
cd automation/adws/mcp_server && bun test
cd automation && uv run pytest adws/adw_tests/ -v

# Production build (TypeScript only)
cd automation/adws/mcp_server && bun run build

# Migration validation (application layer)
cd app && bun run test:validate-migrations

# Full application tests (ensure no regressions)
cd app && bun test
```

**Domain-Specific Validations**:
```bash
# MCP server startup check
cd automation/adws/mcp_server && bun run dev &
curl -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq

# ADW workflow integration test (manual execution)
uv run automation/adws/adw_sdlc.py <test_issue_number>

# Verify incremental commits created
git log --oneline --graph feat/<branch-name>

# Verify worktree cleanup
git worktree list | grep feat/<branch-name> || echo "Cleanup successful"
```

## Commit Message Validation
All commits for this feature will follow Conventional Commits format:

**Valid Examples**:
- `feat: add MCP server skeleton with Express transport`
- `feat: implement git_commit tool for incremental commits`
- `refactor: extract state query logic to mcp_bridge module`
- `test: add integration tests for worktree isolation`
- `docs: update README with MCP server configuration`

**Invalid Patterns to Avoid**:
- `feat: based on the plan, this commit adds the MCP server` (meta-commentary)
- `test: the commit should add tests for git operations` (indirect language)
- `docs: looking at the code, I can see we need documentation` (conversational tone)

Use direct, imperative statements describing what the commit does.

## Notes on MCP SDK Integration

Follow patterns from `app/src/mcp/server.ts`:

**Server Configuration**:
```typescript
const server = new Server(
  {
    name: "kotadb-adw",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);
```

**Transport Configuration**:
```typescript
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // Stateless mode
  enableJsonResponse: true, // JSON mode (not SSE)
});
```

**Tool Registration**:
```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [GIT_COMMIT_TOOL, ADW_GET_STATE_TOOL, /* ... */],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: toolArgs } = request.params;

  let result: unknown;

  switch (name) {
    case "git_commit":
      result = await executeGitCommit(toolArgs);
      break;
    // ... other tools
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});
```

**Express.js Integration**:
```typescript
app.post("/mcp", async (req: Request, res: Response) => {
  // Authentication middleware (validate API key)
  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) {
    return res.status(401).json({ error: "Missing API key" });
  }

  // SDK transport handles request/response
  await transport.handleRequest(req, res);
});
```

Refer to existing MCP server implementation for error handling patterns, content block formatting, and HTTP status code mapping.
