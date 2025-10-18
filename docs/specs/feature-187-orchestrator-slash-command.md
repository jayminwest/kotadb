# Feature Plan: End-to-End Issue-to-PR Orchestrator Slash Command

**Issue**: #187
**Type**: Feature
**Component**: CI/CD, Documentation
**Priority**: Medium
**Effort**: Medium (1-3 days)

## Overview

### Problem
Current ADW workflow requires 5 manual orchestration steps to go from GitHub issue to reviewed PR:
1. Create worktree and branch (manual or `/spawn_interactive`)
2. Create implementation plan (`/chore`, `/feat`, `/bug`)
3. Implement plan (`/implement`)
4. Create pull request (`/pull_request`)
5. Review PR (`/pr-review`)

This manual orchestration is error-prone, requires understanding of workflow sequencing, and creates friction for both human developers and automation triggers.

### Desired Outcome
Single `/orchestrator <issue_number>` command that fully automates the end-to-end workflow:
- Validates issue metadata and dependencies
- Creates isolated worktree with conventional branch naming
- Spawns phase-specific sub-agents using existing slash commands
- Creates PR after successful implementation
- Runs automated code review and posts results
- Handles errors gracefully with checkpoint recovery
- Provides real-time status via MCP task queries

### Non-Goals
- Replacing individual phase slash commands (reuse existing commands)
- Implementing new MCP server endpoints (use existing Tasks API)
- Changing 3-phase ADW architecture (plan → build → review)
- Supporting multi-issue workflows (single issue at a time)
- Replacing Python ADW orchestration layer (complements existing automation)

## Technical Approach

### Architecture
**Template-Driven Sub-Agent Orchestration**: The `/orchestrator` slash command acts as a coordination layer that:
1. Validates issue readiness (metadata, dependencies, state)
2. Creates execution context (worktree, branch, ADW ID)
3. Delegates to existing slash commands for each phase
4. Tracks progress via kota-tasks MCP server
5. Handles errors and cleanup

**Integration Points**:
- **Slash Commands**: Reuses `/chore`, `/feat`, `/bug`, `/implement`, `/pull_request`, `/pr-review`
- **MCP Server**: Uses `kota-tasks` for task creation, status updates, and progress queries
- **Git Operations**: Calls `git_ops.py` functions via subprocess or direct integration
- **ADW State**: Persists workflow state to `automation/agents/{adw_id}/orchestrator/state.json`

**Execution Flow**:
```
┌─────────────────┐
│ /orchestrator N │
└────────┬────────┘
         │
         ├─ 1. Validate Issue (gh issue view)
         ├─ 2. Create Worktree (git worktree add)
         ├─ 3. Create Phase Tasks (MCP: tasks_create)
         │
         ├─ 4. Plan Phase
         │    ├─ Classify issue type → /chore|/feat|/bug
         │    ├─ Spawn agent in worktree context
         │    └─ Update task status (plan → completed)
         │
         ├─ 5. Build Phase
         │    ├─ Find plan file (from state or search)
         │    ├─ Spawn /implement agent
         │    └─ Update task status (build → completed)
         │
         ├─ 6. PR Creation
         │    ├─ Spawn /pull_request agent
         │    ├─ Extract PR number from output
         │    └─ Update task status (metadata)
         │
         ├─ 7. Review Phase
         │    ├─ Spawn /pr-review agent
         │    ├─ Parse review results
         │    └─ Update task status (review → completed)
         │
         └─ 8. Cleanup & Reporting
              ├─ Cleanup worktree (if configured)
              ├─ Generate workflow summary
              └─ Return execution report
```

### Key Modules

**New File**: `.claude/commands/workflows/orchestrator.md`
- Main slash command implementation
- Sub-agent spawning logic via subprocess calls to `claude` CLI
- Error handling and checkpoint management
- Workflow reporting and status updates

**Reused Modules**:
- `automation/adws/adw_modules/tasks_api.py` - Task CRUD operations
- `automation/adws/adw_modules/git_ops.py` - Worktree management
- `automation/adws/adw_modules/state.py` - Workflow state persistence
- `automation/adws/adw_modules/github.py` - Issue metadata extraction
- Existing slash commands in `.claude/commands/` directory

**Integration Test**: `automation/adws/adw_tests/test_orchestrator_integration.py`
- End-to-end workflow validation
- Mock GitHub API and MCP server responses
- Verify task state transitions
- Test error recovery and cleanup

### Data Impacts

**New State Structure** (`automation/agents/{adw_id}/orchestrator/state.json`):
```json
{
  "adw_id": "orch-187-20251018143000",
  "issue_number": "187",
  "issue_title": "feat: implement /orchestrator slash command",
  "issue_type": "feat",
  "worktree_name": "feat-187-orchestrator-command",
  "worktree_path": "trees/feat-187-orchestrator-command",
  "branch_name": "feat-187-orchestrator-command",
  "plan_file": "docs/specs/feature-187-orchestrator-slash-command.md",
  "pr_number": "210",
  "pr_url": "https://github.com/user/repo/pull/210",
  "phase_tasks": {
    "plan": "550e8400-e29b-41d4-a716-446655440001",
    "build": "550e8400-e29b-41d4-a716-446655440002",
    "review": "550e8400-e29b-41d4-a716-446655440003"
  },
  "checkpoints": [
    {
      "timestamp": "2025-10-18T14:30:15",
      "phase": "plan",
      "status": "completed",
      "next_action": "spawn_build_agent"
    }
  ],
  "created_at": "2025-10-18T14:30:00",
  "updated_at": "2025-10-18T14:35:22"
}
```

**MCP Task Schema** (existing, no changes):
- Uses `kota-tasks` server `tasks_create`, `tasks_update`, `tasks_get` tools
- Tags: `phase`, `issue_number`, `parent_adw_id`, `worktree`
- Status lifecycle: `pending` → `claimed` → `in_progress` → `completed`/`failed`

## Relevant Files

### Existing Files to Reference
- `.claude/commands/issues/feature.md` - Template for feature planning structure
- `.claude/commands/workflows/implement.md` - Implementation workflow patterns
- `.claude/commands/git/pull_request.md` - PR creation logic
- `.claude/commands/tools/pr-review.md` - Automated review patterns
- `automation/adws/adw_modules/agent.py` - Claude CLI execution helpers
- `automation/adws/adw_modules/tasks_api.py` - MCP task API wrappers
- `automation/adws/adw_modules/git_ops.py` - Worktree management functions
- `automation/adws/adw_modules/state.py` - State persistence utilities
- `automation/adws/adw_phases/adw_plan.py` - Issue classification logic
- `automation/adws/README.md` - ADW architecture documentation
- `.claude/commands/docs/prompt-code-alignment.md` - Template output contracts

### New Files
- `.claude/commands/workflows/orchestrator.md` - Main slash command template
- `automation/adws/adw_tests/test_orchestrator_integration.py` - Integration tests

## Task Breakdown

### Phase 1: Foundation (2-4 hours)
- Read and understand existing slash command implementations
- Review MCP Tasks API contract and usage patterns
- Study worktree isolation patterns from `git_ops.py`
- Design orchestrator state schema and checkpoint structure
- Draft initial `/orchestrator` template with core workflow logic

### Phase 2: Implementation (4-6 hours)
- Implement `/orchestrator.md` slash command template:
  - Issue validation and metadata extraction
  - Worktree creation with conventional naming
  - Phase task creation via MCP Tasks API
  - Sub-agent spawning for each phase (plan, build, PR, review)
  - Error handling with checkpoint recovery
  - Workflow summary generation
- Implement state management for orchestrator context
- Add checkpoint save/load at phase boundaries
- Integrate with existing git operations and state utilities

### Phase 3: Testing & Documentation (2-3 hours)
- Create integration test suite:
  - Mock GitHub API responses for issue metadata
  - Mock MCP server responses for task operations
  - Verify correct slash command selection by issue type
  - Test checkpoint recovery after simulated failures
  - Validate worktree cleanup behavior
- Update `.claude/commands/README.md` with usage examples
- Update `automation/adws/README.md` with orchestrator integration section
- Update `CLAUDE.md` workflow examples to include `/orchestrator`
- Add entry to `conditional_docs.md` for orchestrator documentation

## Step by Step Tasks

### Setup & Research
- Review existing slash command structure in `.claude/commands/workflows/`
- Study issue classification logic in `adw_phases/adw_plan.py::classify_issue()`
- Examine task creation patterns in `tasks_api.py::create_phase_task()`
- Review worktree management in `git_ops.py::create_worktree()` and `cleanup_worktree()`
- Understand checkpoint patterns from `workflow_ops.py::save_checkpoint()`

### Template Development
- Create `.claude/commands/workflows/orchestrator.md` with header and usage documentation
- Implement issue validation section:
  - Execute `gh issue view <issue_number> --json title,labels,body,state`
  - Extract issue type from labels or title prefix
  - Check for blocking dependencies via "Depends On" relationships
  - Verify issue is open (warn if closed, allow override with `--force`)
- Implement worktree setup section:
  - Generate branch name: `{type}-{issue}-{slug}` (e.g., `feat-187-orchestrator-command`)
  - Create worktree via git operations or subprocess
  - Initialize ADW ID: `orch-{issue}-{timestamp}`
  - Persist initial state to `automation/agents/{adw_id}/orchestrator/state.json`
- Implement phase task creation:
  - Create plan task with priority `high`
  - Create build task with priority `high`, depends on plan
  - Create review task with priority `medium`, depends on build
  - Store task IDs in orchestrator state
- Implement phase execution logic:
  - **Plan Phase**:
    - Determine slash command (`/feat`, `/bug`, `/chore`) via issue classification
    - Spawn agent: `claude <slash_command> <issue_number>`
    - Set `cwd` to worktree path for isolated execution
    - Update task status: `plan` → `in_progress` → `completed`
    - Save checkpoint with plan file path
  - **Build Phase**:
    - Locate plan file from state or search `docs/specs/`
    - Spawn agent: `claude /implement <plan_file>`
    - Monitor for validation failures
    - Update task status: `build` → `in_progress` → `completed`
    - Save checkpoint with build artifacts
  - **PR Creation**:
    - Spawn agent: `claude /pull_request`
    - Extract PR number from agent output (parse URL or search response)
    - Update orchestrator state with PR metadata
    - Save checkpoint with PR URL
  - **Review Phase**:
    - Spawn agent: `claude /pr-review <pr_number>`
    - Parse review results (approved vs requested changes)
    - Update task status: `review` → `in_progress` → `completed`
    - Save checkpoint with review outcome
- Implement cleanup logic:
  - Check `--skip-cleanup` flag and `ADW_CLEANUP_WORKTREES` env var
  - If cleanup enabled and workflow succeeded:
    - Call git worktree remove via subprocess
    - Optionally delete branch if not merged
  - If workflow failed:
    - Preserve worktree for debugging
    - Log checkpoint data for manual recovery
- Implement workflow reporting:
  - Generate summary with issue details, branch/worktree names, PR URL, review status
  - Include task completion times and any errors/warnings
  - Format output per prompt-code alignment standards (plain text, no markdown)

### Error Handling & Resilience
- Add try-catch blocks around each phase execution
- Implement retry logic for transient failures (network errors, API rate limits)
- Save checkpoints after each successful phase
- Implement `--resume <adw_id>` flag to continue from last checkpoint
- Validate preconditions before each phase (e.g., plan file exists before build)
- Handle missing dependencies gracefully (clear error messages)

### Testing
- Create `automation/adws/adw_tests/test_orchestrator_integration.py`:
  - Test issue validation with various label configurations
  - Test worktree creation and naming conventions
  - Test task creation and status transitions
  - Test phase agent spawning with mocked subprocess calls
  - Test checkpoint save/load and recovery
  - Test worktree cleanup behavior (success and failure cases)
  - Test `--dry-run` flag (validation only, no execution)
  - Test `--skip-cleanup` flag
  - Test `--force` flag for closed issues
- Run integration test suite: `uv run pytest automation/adws/adw_tests/test_orchestrator_integration.py -v`
- Verify all tests pass with real subprocess isolation

### Documentation
- Update `.claude/commands/README.md`:
  - Add `/orchestrator` to command list
  - Document usage examples and flags
  - Link to automation integration documentation
- Update `automation/adws/README.md`:
  - Add "Orchestrator Integration" section
  - Explain how `/orchestrator` complements Python ADW layer
  - Document state schema and checkpoint format
  - Provide troubleshooting guidance
- Update `CLAUDE.md`:
  - Add `/orchestrator` to workflow examples
  - Update "AI Developer Workflows" section with orchestrator usage
  - Document relationship to existing automation triggers
- Update `.claude/commands/docs/conditional_docs.md`:
  - Add entry for orchestrator documentation
  - Conditions: when working on end-to-end workflow automation, when understanding orchestrator vs manual workflow trade-offs

### Validation & Deployment
- Run Level 2 validation (feature with new slash command):
  - `bun run lint` (N/A for markdown-only changes)
  - `bun run typecheck` (N/A for markdown-only changes)
  - `uv run pytest automation/adws/adw_tests/test_orchestrator_integration.py -v`
- Verify integration test passes with mocked GitHub and MCP responses
- Test manual execution of `/orchestrator` command with dry-run flag
- Review orchestrator.md template for prompt-code alignment compliance
- Commit changes with conventional commit message
- Push branch: `git push -u origin feat-187-orchestrator-command`
- Create PR with validation evidence and title: `feat: implement /orchestrator slash command for end-to-end issue-to-PR automation (#187)`

## Risks & Mitigations

### Risk: Sub-Agent Execution Failures
**Impact**: Phase agent fails mid-execution, leaving workflow in inconsistent state
**Mitigation**:
- Implement comprehensive checkpoint system to save progress after each phase
- Use `--resume <adw_id>` flag to continue from last successful checkpoint
- Preserve worktree on failures for debugging (configurable via `ADW_CLEANUP_ON_FAILURE`)
- Provide clear error messages with recovery instructions

### Risk: Slash Command Output Parsing Brittleness
**Impact**: Orchestrator fails to extract metadata (plan file path, PR number) from sub-agent output
**Mitigation**:
- Follow prompt-code alignment guidelines for all sub-agent templates
- Implement defensive parsing with regex and fallback strategies
- Log raw agent output for debugging parse failures
- Add integration tests that validate expected output formats

### Risk: Worktree Isolation Violations
**Impact**: Multiple concurrent orchestrator invocations conflict on git operations
**Mitigation**:
- Use unique ADW ID in worktree naming (`orch-{issue}-{timestamp}`)
- Verify worktree doesn't exist before creation
- Set `GIT_DIR` and `GIT_WORK_TREE` env vars for all git operations
- Test concurrent execution in integration suite

### Risk: MCP Server Unavailability
**Impact**: Task creation or status updates fail, breaking workflow tracking
**Mitigation**:
- Gracefully degrade if MCP server unreachable (continue workflow, log warning)
- Implement retry logic with exponential backoff for task operations
- Persist task IDs to state for manual recovery if needed
- Document manual task query commands for troubleshooting

### Risk: Issue Dependency Validation Gaps
**Impact**: Orchestrator starts work on blocked issues, wasting effort
**Mitigation**:
- Parse "Depends On" relationships from issue body before starting
- Query dependency status via `gh issue view` commands
- Provide clear warning and require `--force` override for blocked issues
- Document dependency checking in validation section

## Validation Strategy

### Automated Tests
**Integration Test Suite** (`test_orchestrator_integration.py`):
- Mock GitHub CLI responses for issue metadata extraction
- Mock subprocess calls to sub-agent slash commands
- Mock MCP server responses for task CRUD operations
- Verify correct state transitions across all phases
- Test checkpoint save/load and resume functionality
- Validate worktree creation, usage, and cleanup
- Test error scenarios (missing plan file, failed validation, API errors)
- Verify `--dry-run`, `--skip-cleanup`, `--force` flag behaviors

**Test Coverage Requirements**:
- Issue validation logic: 100% coverage (all label combinations, open/closed states)
- Phase execution logic: 100% coverage (all phase transitions, error paths)
- Checkpoint management: 100% coverage (save, load, recovery)
- Worktree lifecycle: 100% coverage (create, use, cleanup, failure preservation)
- Flag handling: 100% coverage (dry-run, skip-cleanup, force, resume)

### Manual Validation
**Dry-Run Testing**:
```bash
# Test with dry-run flag (validation only, no execution)
/orchestrator 187 --dry-run

# Expected output:
# - Issue metadata displayed
# - Worktree name generated: feat-187-orchestrator-command
# - Phase tasks shown (plan, build, review)
# - No worktree created
# - No tasks created in MCP server
```

**End-to-End Workflow Testing**:
```bash
# Test full workflow with a real test issue
/orchestrator <test_issue_number>

# Verify:
# 1. Worktree created under trees/
# 2. Plan file created in docs/specs/
# 3. Implementation completes with validation
# 4. PR created with correct title format
# 5. Review posted to PR
# 6. Worktree cleaned up (if configured)
# 7. Orchestrator state file created with complete metadata
```

**Checkpoint Recovery Testing**:
```bash
# Simulate failure after plan phase
# Manually kill orchestrator during build phase
# Resume from last checkpoint
/orchestrator --resume orch-187-20251018143000

# Verify:
# - State loaded from orchestrator/state.json
# - Skips completed plan phase
# - Resumes from build phase
# - Workflow completes successfully
```

### Evidence Collection
**Integration Test Results**:
- Pytest output showing all test cases passed
- Coverage report showing 100% for orchestrator logic
- Mock verification logs confirming correct MCP/GitHub API calls

**Manual Test Evidence**:
- Screenshots of dry-run output
- Full workflow execution logs from `automation/logs/`
- Orchestrator state file showing all phase checkpoints
- GitHub PR with automated review comment

## Validation Commands

**Python Test Suite**:
```bash
# Run orchestrator integration tests
cd automation
uv run pytest adws/adw_tests/test_orchestrator_integration.py -v

# Run with coverage report
uv run pytest adws/adw_tests/test_orchestrator_integration.py --cov=adws.adw_modules --cov-report=term
```

**Syntax Validation**:
```bash
# Python syntax check
cd automation
python3 -m py_compile adws/adw_modules/*.py

# Markdown linting (optional)
markdownlint .claude/commands/workflows/orchestrator.md
```

**Manual Testing**:
```bash
# Dry-run validation
/orchestrator 187 --dry-run

# Full workflow test
/orchestrator <test_issue_number>

# Checkpoint recovery test
/orchestrator --resume <adw_id>
```

**Documentation Validation**:
```bash
# Verify conditional_docs.md updated
grep -i "orchestrator" .claude/commands/docs/conditional_docs.md

# Verify README.md updated
grep -i "orchestrator" .claude/commands/README.md
grep -i "orchestrator" automation/adws/README.md
grep -i "orchestrator" CLAUDE.md
```

## Issue Relationships

- **Related To**: #153 (MCP-based ADW orchestration) - Shares orchestration patterns and MCP task integration
- **Related To**: #149 (kotadb-adw MCP server) - Uses same Tasks API for workflow tracking
- **Related To**: #146 (slash command overhaul) - Part of MCP-first workflow migration initiative
- **Related To**: #157 (worktree isolation) - Reuses worktree management utilities and isolation patterns
- **Related To**: #148 (hybrid resilience) - Implements checkpoint-based recovery for error handling
