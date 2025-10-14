# Feature Plan: Kota-Tasks MCP API Integration for Phase-Level ADWS Orchestration

## Metadata
- **Issue**: #110
- **Title**: feat: integrate kota-tasks MCP API for phase-level ADWS orchestration
- **Labels**: component:backend, component:ci-cd, priority:high, effort:large, status:needs-investigation
- **Branch**: feature-110-kota-tasks-mcp-integration

## Overview

### Problem
Current ADWS workflows execute as monolithic sequential pipelines (plan → build → test → review → document) with no ability to trigger individual phases or execute phases in parallel. This architecture creates inefficiencies:

1. **Sequential execution bottleneck**: All phases run sequentially even when independent (e.g., review and document phases could run concurrently)
2. **No selective phase retry**: Test failures force re-execution of plan and build phases, wasting 3-5 minutes per retry
3. **Poll-based trigger latency**: 15-second polling intervals add 10-30 seconds latency to event-driven workflows
4. **No phase-level granularity**: Cannot trigger specific phases (e.g., re-run test only after fixing flaky tests)

The kota-tasks MCP server (already configured in `.mcp.json`) provides a task queue API that can enable API-driven workflow orchestration with phase-level granularity.

### Desired Outcome
Implement Foundation (Phase 1) infrastructure to enable:
- Phase-level task creation via MCP API wrappers
- API-driven trigger system to route tasks to individual phases
- Slash commands for Claude agents to interact with task queue
- Single-phase execution validation (build phase triggered via API)
- Foundation for future parallel execution and dependency-aware DAG execution

### Non-Goals
- **NOT** implementing parallel execution (Phase 3 - future work)
- **NOT** modifying existing phase scripts for status updates (Phase 2 - follow-up issue)
- **NOT** implementing DAG executor or dependency tracking
- **NOT** disrupting existing GitHub issue or home server triggers

## Technical Approach

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────┐
│                    Kota-Tasks MCP Server                     │
│               (https://...:ts.net/mcp/agents)                │
└────────────────────────┬────────────────────────────────────┘
                         │ MCP Tools (via Claude Code CLI)
                         │ - mcp__kota-tasks__tasks_create
                         │ - mcp__kota-tasks__tasks_update
                         │ - mcp__kota-tasks__tasks_list
                         │ - mcp__kota-tasks__tasks_get
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           automation/adws/adw_modules/tasks_api.py           │
│         Python wrappers for MCP task operations via          │
│         Claude Code CLI's --mcp flag execution               │
└────────────────────────┬────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────────┐
│       automation/adws/adw_triggers/adw_trigger_api_tasks.py  │
│       Polls task API, routes to phase scripts via tags.phase │
└───┬─────────────┬─────────────┬─────────────┬───────────────┘
    │             │             │             │
    ▼             ▼             ▼             ▼
┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
│  Plan  │   │ Build  │   │  Test  │   │ Review │
│ Phase  │   │ Phase  │   │ Phase  │   │ Phase  │
└────────┘   └────────┘   └────────┘   └────────┘
```

### Key Implementation Components

**1. Task API Module** (`automation/adws/adw_modules/tasks_api.py`)
- Python wrappers for MCP task CRUD operations
- Leverages Claude Code CLI's `--mcp` flag for MCP tool execution
- Phase-aware task creation with metadata tagging
- Status update helpers for phase lifecycle tracking

**2. Slash Commands** (`.claude/commands/tasks/`)
- `/tasks:create` - Create phase task with metadata (returns task_id)
- `/tasks:update_status` - Update task status (in_progress/completed/failed)
- `/tasks:query_phase` - Query tasks by phase filter

**3. API-Driven Trigger** (`automation/adws/adw_triggers/adw_trigger_api_tasks.py`)
- Poll kota-tasks API for `status=pending` tasks with `tags.phase`
- Route to appropriate phase script based on metadata
- Update task status throughout lifecycle (claimed → in_progress → completed/failed)
- Concurrent task execution with configurable limits
- Structured logging for observability

**4. Integration with Existing Infrastructure**
- Reuses existing worktree management (`git_ops.py`)
- Leverages existing phase scripts (`adw_phases/*.py`) without modification
- Compatible with existing GitHub issue and home server triggers
- Shares ADW state management (`adw_modules/state.py`)

### MCP Tool Execution Strategy
The implementation will use Claude Code CLI's `--mcp` flag to execute MCP tools from Python:
```python
# Example: Execute MCP tool via Claude Code CLI
subprocess.run([
    "claude", "--mcp", "kota-tasks__tasks_create",
    "--args", json.dumps({
        "project_id": "kotadb",
        "title": "Execute build phase for issue #123",
        "priority": "high",
        "tags": {"phase": "build", "issue_number": "123"}
    })
], capture_output=True, text=True)
```

This approach avoids implementing MCP client protocol directly and leverages existing Claude Code CLI infrastructure.

### Data Contracts

**Task Schema (kota-tasks MCP):**
```json
{
  "task_id": "string (UUID)",
  "project_id": "kotadb",
  "title": "string",
  "description": "string (optional)",
  "status": "pending | claimed | in_progress | completed | failed",
  "priority": "low | medium | high",
  "tags": {
    "phase": "plan | build | test | review | document",
    "issue_number": "string (GitHub issue #)",
    "parent_adw_id": "string (parent workflow ADW ID)",
    "worktree": "string (worktree name)"
  },
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "result": "object (optional, set on completion)",
  "error": "string (optional, set on failure)"
}
```

**API Trigger Configuration (Environment Variables):**
```bash
KOTA_TASKS_MCP_SERVER="kota-tasks"  # MCP server name from .mcp.json
KOTA_TASKS_PROJECT_ID="kotadb"      # Project identifier
API_TRIGGER_POLLING_INTERVAL=10     # Seconds between polls
API_TRIGGER_MAX_CONCURRENT=5        # Max parallel phase executions
```

## Relevant Files

### Existing Files to Reference
- `.mcp.json:4-9` — kota-tasks MCP server configuration (HTTP endpoint + auth)
- `automation/adws/adw_modules/data_types.py:15-21` — TaskStatus enum (reusable for phase tasks)
- `automation/adws/adw_modules/agent.py:50-120` — Claude CLI execution patterns (reference for MCP tool calls)
- `automation/adws/adw_triggers/adw_trigger_cron_homeserver.py:220-335` — Task polling and delegation patterns
- `automation/adws/adw_modules/git_ops.py:1-150` — Worktree management utilities
- `automation/adws/adw_phases/adw_build.py:1-200` — Example phase script structure

### New Files to Create
- `automation/adws/adw_modules/tasks_api.py` — MCP task CRUD wrappers via Claude CLI
- `automation/adws/adw_triggers/adw_trigger_api_tasks.py` — API-driven trigger with phase routing
- `.claude/commands/tasks/create.md` — Slash command for task creation
- `.claude/commands/tasks/update_status.md` — Slash command for status updates
- `.claude/commands/tasks/query_phase.md` — Slash command for phase-filtered queries
- `automation/adws/adw_tests/test_tasks_api.py` — Unit tests for task API wrappers
- `automation/adws/adw_tests/test_trigger_api_tasks.py` — Integration tests for API trigger

## Task Breakdown

### Phase 1: Task API Infrastructure
**Objective**: Create Python wrappers for MCP task operations via Claude Code CLI

1. Create `automation/adws/adw_modules/tasks_api.py`:
   - `create_phase_task(phase, issue_number, adw_id, worktree)` → task_id
   - `update_task_status(task_id, status, result, error)` → bool
   - `get_task(task_id)` → Task dict
   - `list_tasks(filters)` → List[Task dict]
   - MCP tool execution via Claude CLI `--mcp` flag
   - Error handling for MCP server connectivity

2. Add unit tests in `automation/adws/adw_tests/test_tasks_api.py`:
   - Test MCP tool command construction
   - Test response parsing from Claude CLI output
   - Mock subprocess calls for isolated testing
   - Test error handling (server unavailable, invalid params)

### Phase 2: Slash Commands
**Objective**: Create Claude agent interfaces for task queue operations

3. Create `.claude/commands/tasks/create.md`:
   - Input: phase, issue_number, description, priority
   - Output: JSON with task_id and metadata
   - Error handling: invalid phase, MCP server errors
   - Example usage in template

4. Create `.claude/commands/tasks/update_status.md`:
   - Input: task_id, status, optional result/error data
   - Output: success confirmation or error message
   - Status validation: only valid transitions

5. Create `.claude/commands/tasks/query_phase.md`:
   - Input: phase filter, status filter
   - Output: JSON array of matching tasks
   - Used by trigger to discover phase tasks

### Phase 3: API-Driven Trigger
**Objective**: Poll task API and route tasks to phase scripts

6. Create `automation/adws/adw_triggers/adw_trigger_api_tasks.py`:
   - Poll kota-tasks API for pending tasks (configurable interval)
   - Filter tasks by `tags.phase` existence
   - Route to phase scripts via subprocess (reuse delegation pattern from homeserver trigger)
   - Update task status lifecycle (claimed → in_progress → completed/failed)
   - Concurrent execution limits (max 5 parallel phase tasks)
   - Structured logging (JSON events to file)
   - Graceful shutdown handling (SIGINT/SIGTERM)

7. Add CLI interface with click:
   - `--polling-interval` - seconds between polls (default: 10)
   - `--max-concurrent` - max parallel tasks (default: 5)
   - `--dry-run` - show tasks without executing
   - `--once` - run single check and exit
   - `--verbose` - detailed output

8. Integration tests in `automation/adws/adw_tests/test_trigger_api_tasks.py`:
   - Mock task API responses
   - Test phase routing logic
   - Test status update flow
   - Test concurrent task limits

### Phase 4: End-to-End Validation
**Objective**: Validate single-phase execution via API

9. Manual validation workflow:
   - Start kota-tasks MCP server (verify `.mcp.json` config)
   - Create build phase task via `/tasks:create`
   - Start API trigger: `uv run adws/adw_triggers/adw_trigger_api_tasks.py --verbose --once`
   - Verify task routing to `adw_phases/adw_build.py`
   - Verify status updates in kota-tasks API
   - Check structured logs for lifecycle events

10. Documentation updates:
    - Add "API-Driven Phase Execution" section to `automation/adws/README.md`
    - Document task schema and CLI flags
    - Add troubleshooting guide for MCP connectivity
    - Update `.claude/commands/docs/conditional_docs.md` (add automation/workflows entry)

### Phase 5: Final Integration & Cleanup
**Objective**: Ensure CI compatibility and production readiness

11. CI validation:
    - Ensure unit tests pass in GitHub Actions (automation-ci.yml)
    - Add Python syntax check for new files
    - Verify no external service dependencies required

12. Code review checklist:
    - Type hints on all public functions
    - Docstrings with usage examples
    - Error handling with structured logging
    - No hardcoded credentials (use environment variables)

13. Create PR and merge:
    - Push branch: `git push -u origin feature-110-kota-tasks-mcp-integration`
    - Run `/pull_request feature-110-kota-tasks-mcp-integration {issue_json} docs/specs/feature-110-kota-tasks-mcp-integration.md {adw_id}`
    - PR title: "feat: add kota-tasks MCP API integration for phase-level orchestration (#110)"

## Step by Step Tasks

### Task Group 1: Core Infrastructure Setup
1. Create `automation/adws/adw_modules/tasks_api.py` with MCP tool wrappers
2. Implement `create_phase_task()` function with proper metadata tagging
3. Implement `update_task_status()` function with lifecycle validation
4. Implement `get_task()` and `list_tasks()` query functions
5. Add error handling for MCP server connectivity issues
6. Add type hints and comprehensive docstrings

### Task Group 2: Testing Infrastructure
7. Create `automation/adws/adw_tests/test_tasks_api.py` test file
8. Write unit tests for MCP command construction
9. Write unit tests for response parsing
10. Write unit tests for error handling scenarios
11. Verify tests pass locally: `cd automation && uv run pytest adws/adw_tests/test_tasks_api.py -v`

### Task Group 3: Slash Command Templates
12. Create `.claude/commands/tasks/` directory
13. Write `/tasks:create` template with input validation
14. Write `/tasks:update_status` template with status transitions
15. Write `/tasks:query_phase` template with filtering logic
16. Add usage examples to each template

### Task Group 4: API Trigger Implementation
17. Create `automation/adws/adw_triggers/adw_trigger_api_tasks.py` with basic structure
18. Implement task polling loop with configurable interval
19. Implement phase routing logic (read `tags.phase` and delegate)
20. Implement task status updates throughout lifecycle
21. Add concurrent task execution limits
22. Add CLI interface with click decorators
23. Add structured JSON logging

### Task Group 5: Integration Testing
24. Create `automation/adws/adw_tests/test_trigger_api_tasks.py`
25. Write integration tests for task polling
26. Write tests for phase routing logic
27. Write tests for concurrent task limits
28. Verify integration tests pass locally

### Task Group 6: End-to-End Validation
29. Manually test task creation via `/tasks:create` slash command
30. Manually test API trigger in `--dry-run` mode
31. Manually test single-phase execution (build phase)
32. Verify task status updates in kota-tasks MCP server
33. Review structured logs for correctness

### Task Group 7: Documentation & Finalization
34. Add "API-Driven Phase Execution" section to `automation/adws/README.md`
35. Document task schema, CLI flags, and configuration
36. Add troubleshooting section for MCP connectivity
37. Update `.claude/commands/docs/conditional_docs.md` with automation/workflows entry
38. Update `CLAUDE.md` with new trigger information (if needed)

### Task Group 8: CI Validation & PR Creation
39. Run Python syntax check: `cd automation && python3 -m py_compile adws/adw_modules/tasks_api.py adws/adw_triggers/adw_trigger_api_tasks.py`
40. Run full test suite: `cd automation && uv run pytest adws/adw_tests/ -v`
41. Verify no hardcoded credentials or external dependencies
42. Stage all changes: `git add .`
43. Commit with validated message: `git commit -m "feat: add kota-tasks MCP API integration for phase-level orchestration"`
44. Push branch to remote: `git push -u origin feature-110-kota-tasks-mcp-integration`
45. Create pull request: `/pull_request feature-110-kota-tasks-mcp-integration {issue_json} docs/specs/feature-110-kota-tasks-mcp-integration.md {adw_id}`

## Risks & Mitigations

### Risk: MCP server availability
**Impact**: Task operations fail if kota-tasks server is unreachable
**Mitigation**:
- Add retry logic with exponential backoff (3 retries, max 30s total)
- Graceful degradation: log errors and continue polling
- Health check before starting trigger (`--health-check` flag)

### Risk: Claude CLI MCP execution overhead
**Impact**: Each MCP tool call spawns subprocess, adding 200-500ms latency
**Mitigation**:
- Batch operations where possible (list_tasks returns multiple)
- Cache task metadata to reduce query frequency
- Future: implement direct MCP client (Phase 3 optimization)

### Risk: Concurrent task conflicts
**Impact**: Multiple API trigger instances could claim same task
**Mitigation**:
- Task claim operation is atomic on server (POST `/tasks/{id}/claim`)
- Client-side deduplication: track claimed task IDs in memory
- Configurable max_concurrent limits per trigger instance

### Risk: Phase script compatibility
**Impact**: Existing phase scripts not designed for API invocation
**Mitigation**:
- Phase scripts already support CLI invocation (no changes needed)
- Pass ADW ID via command line args (existing pattern)
- Task ID stored in ADW state for status update continuity

### Risk: Breaking existing workflows
**Impact**: GitHub issue and home server triggers might break
**Mitigation**:
- API trigger is additive (parallel deployment)
- Existing triggers unchanged (no shared state)
- Feature flag: `API_TRIGGER_ENABLED=false` to disable
- Backward compatibility test: run existing workflows after deployment

## Validation Strategy

### Automated Tests
**Unit Tests** (`automation/adws/adw_tests/test_tasks_api.py`):
- Test MCP tool command construction with various parameters
- Test JSON response parsing from Claude CLI stdout
- Mock subprocess calls for isolated execution
- Test error handling (invalid phase, missing task_id, server timeout)
- Coverage target: >90% for `tasks_api.py`

**Integration Tests** (`automation/adws/adw_tests/test_trigger_api_tasks.py`):
- Mock kota-tasks API responses (pending → claimed → completed flow)
- Test phase routing logic with different `tags.phase` values
- Test concurrent task limit enforcement (spawn 10 tasks, verify max 5 active)
- Test status update propagation
- Coverage target: >80% for `adw_trigger_api_tasks.py`

**CI Integration** (`.github/workflows/automation-ci.yml`):
- Syntax check: `python3 -m py_compile adws/adw_modules/tasks_api.py adws/adw_triggers/adw_trigger_api_tasks.py`
- Test execution: `uv run pytest adws/adw_tests/ -v --tb=short`
- Verify no external service dependencies (MCP server mocked)
- Target runtime: CI suite remains < 2 minutes

### Manual Validation Checks
**MCP Server Connectivity**:
1. Verify `.mcp.json` configuration: `cat .mcp.json | jq '.mcpServers."kota-tasks"'`
2. Test MCP tool access via Claude CLI: `claude --mcp kota-tasks__tasks_list --args '{"project_id":"kotadb"}'`
3. Expected: JSON array response (may be empty)

**Single-Phase Execution**:
1. Create test task: `/tasks:create plan "Test plan phase" issue-110 test-adw-id test-worktree`
2. Start trigger in verbose mode: `uv run adws/adw_triggers/adw_trigger_api_tasks.py --verbose --once`
3. Expected: Task claimed, phase script executed, status updated to completed
4. Verify logs: `cat .adw_logs/api_trigger/YYYYMMDD.log | jq '.event'`

**Status Update Flow**:
1. Create task and note task_id
2. Monitor task status: `watch -n 1 '/tasks:query_phase plan pending'`
3. Start API trigger
4. Verify status transitions: pending → claimed → in_progress → completed
5. Expected timeline: < 2 minutes for simple build phase

**Error Handling**:
1. Stop kota-tasks MCP server
2. Start API trigger: `uv run adws/adw_triggers/adw_trigger_api_tasks.py --verbose --once`
3. Expected: Error logged, trigger continues (no crash)
4. Restart MCP server
5. Expected: Next poll cycle succeeds

### Release Guardrails
**Deployment Checklist**:
- [ ] All tests pass in CI (automation-ci.yml)
- [ ] Manual validation completed (documented results)
- [ ] No hardcoded credentials in code
- [ ] Environment variables documented
- [ ] Backward compatibility verified (existing triggers work)
- [ ] Logs reviewed for sensitive data exposure
- [ ] Feature flag defaults to disabled (`API_TRIGGER_ENABLED=false`)

**Monitoring (Post-Deployment)**:
- Track API trigger execution count (structured logs)
- Monitor MCP server response times (add `duration_ms` to logs)
- Alert on error rate > 10% (future integration with log analysis)
- Weekly review: check for orphaned tasks (status=claimed, no activity >24h)

**Rollback Plan**:
- Feature flag: `API_TRIGGER_ENABLED=false` disables API trigger
- Remove trigger from systemd/cron if deployed
- No database migrations (purely code changes)
- No impact on existing workflows (they remain unchanged)

## Validation Commands

### Pre-Commit Validation
```bash
# Syntax check (Python compilation)
cd automation && python3 -m py_compile adws/adw_modules/tasks_api.py adws/adw_triggers/adw_trigger_api_tasks.py

# Type checking (if mypy configured)
cd automation && mypy adws/adw_modules/tasks_api.py adws/adw_triggers/adw_trigger_api_tasks.py

# Unit tests
cd automation && uv run pytest adws/adw_tests/test_tasks_api.py -v

# Integration tests
cd automation && uv run pytest adws/adw_tests/test_trigger_api_tasks.py -v

# Full test suite
cd automation && uv run pytest adws/adw_tests/ -v --tb=short
```

### Manual Validation
```bash
# Health check MCP server connectivity
claude --mcp kota-tasks__tasks_list --args '{"project_id":"kotadb"}'

# Create test task
/tasks:create build "Test build phase execution" issue-110 test-adw-id test-worktree

# Run API trigger in dry-run mode
uv run automation/adws/adw_triggers/adw_trigger_api_tasks.py --dry-run --verbose --once

# Run API trigger for real (single cycle)
uv run automation/adws/adw_triggers/adw_trigger_api_tasks.py --verbose --once

# Monitor structured logs
tail -f .adw_logs/api_trigger/$(date +%Y%m%d).log | jq .

# Query task status
/tasks:query_phase build all
```

### CI Validation
```bash
# Replicate GitHub Actions checks locally
cd automation && python3 -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py adws/adw_triggers/*.py
cd automation && uv sync
cd automation && uv run pytest adws/adw_tests/ -v --tb=short
```

## Performance Expectations

### Latency Improvements
- **Selective phase retry**: 3-5 minutes saved per retry (no re-planning/rebuilding)
- **Event-driven triggers**: 10-30 seconds saved vs polling (future webhook integration)
- **Task creation overhead**: ~200-500ms per MCP tool call via Claude CLI

### Resource Utilization
- **API trigger memory**: ~50-100MB (Python process + subprocess monitoring)
- **MCP server load**: ~10 requests/minute per trigger instance (polling + status updates)
- **Concurrent execution**: Max 5 phase tasks per trigger (configurable via `--max-concurrent`)

### Scalability Considerations
- **Horizontal scaling**: Multiple API trigger instances supported (atomic task claims)
- **Task backlog**: Kota-tasks server handles queue depth (tested to 1000+ pending tasks)
- **Network latency**: MCP server on Tailscale (~10-50ms RTT within same network)

## Future Work (Out of Scope)

### Phase 2: Phase Script Integration (Follow-Up Issue)
- Modify all phase scripts to call `update_task_status()` at phase boundaries
- Store task_id in ADW state for continuity across phases
- Add worktree metadata to task tags
- Test selective phase retry (trigger test phase without re-planning)

### Phase 3: Parallel Execution & DAG Orchestration (Follow-Up Issue)
- Implement DAG executor (`adw_dag_executor.py`) with dependency tracking
- Enable parallel execution for independent phases (review + document concurrently)
- Add task dependency graph visualization
- Performance benchmarking: measure 40% speedup target

### Phase 4: Advanced Features (Future)
- Direct MCP client implementation (avoid Claude CLI subprocess overhead)
- Task priority-based scheduling (high-priority tasks jump queue)
- Webhook-based triggers (replace polling with event-driven push)
- Task result aggregation for multi-phase workflows
- Monitoring dashboard (query task API for execution metrics)
