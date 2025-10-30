# Feature Plan: Surgical Fix Workflow for Critical Bug Automation

## Overview

### Problem
KotaDB ADW currently lacks a specialized workflow for critical bug fixes that require rapid deployment with minimal human intervention. The existing orchestrator is designed for general-purpose issue-to-PR workflows but does not optimize for the speed, verification rigor, and autonomy required for critical production issues.

Critical bugs (priority:critical or priority:high) require:
- **Rapid deployment** with minimal latency between identification and merge
- **Built-in verification** at each step with test validation and CI monitoring
- **Autonomous progression** through auto-merge when all checks pass
- **Reproducibility** to confirm the bug exists before attempting fixes

### Desired Outcome
Create a specialized `surgical_fix.py` workflow automation file that orchestrates agents to perform targeted bug fixes from issue identification through auto-merge. This workflow will:

1. Validate and reproduce the bug in an isolated worktree
2. Generate a targeted fix plan using existing slash commands
3. Implement the fix with Level 2+ validation
4. Create PR and monitor CI with automated retry logic
5. Auto-merge when all checks pass
6. Track all steps via checkpoints for resume-after-failure

Success metrics:
- Time-to-merge < 15 minutes for critical bugs (from workflow start to merge)
- CI auto-fix success rate > 70% (failures resolved automatically without human intervention)
- End-to-end success rate > 80% (workflow completes without manual recovery)
- Zero false-positive merges (all merged fixes pass validation)

### Non-Goals
- General-purpose feature implementation (use existing orchestrator)
- Interactive debugging workflows (surgical fix is fully automated)
- Multi-issue batch processing (one bug at a time)
- Manual review approval (auto-merge based on CI results only)

## Technical Approach

### Architecture Notes
The surgical fix workflow extends the existing 3-phase ADW architecture (plan → build → review) with:
1. **Pre-plan reproduction phase**: Validates bug existence before attempting fix
2. **CI monitoring phase**: Polls GitHub Actions for results, attempts automated fixes on failure
3. **Auto-merge phase**: Merges PR when CI passes and review approved

The workflow reuses existing infrastructure:
- **Worktree isolation** via `adw_modules/git_ops.py`
- **State persistence** via `adw_modules/state.py`
- **Exit code standardization** via `adw_modules/exit_codes.py`
- **Slash command delegation** via `/bug`, `/implement`, `/pull_request`, `/pr-review`
- **MCP integration** for Beads issue metadata (fallback: GitHub API)

### Key Modules to Touch
**New files:**
- `automation/adws/surgical_fix.py` - Main workflow orchestrator
- `automation/adws/adw_tests/test_surgical_fix.py` - Unit tests
- `automation/adws/adw_tests/test_surgical_fix_e2e.py` - Agent E2E test
- `docs/specs/feature-354-surgical-fix-workflow.md` - This spec
- `automation/adws/docs/surgical-fix-usage.md` - Usage guide

**Modified files:**
- `.claude/commands/workflows/adw-architecture.md` - Document surgical fix as specialized orchestrator variant
- `automation/adws/README.md` - Add surgical fix workflow section
- `automation/adws/adw_modules/data_types.py` - Add SurgicalFixState model

### Data/API Impacts
**New state schema** (`automation/agents/<surgical_fix_id>/surgical_fix_state.json`):
```json
{
  "surgical_fix_id": "fix-123-20251029120000",
  "issue_number": "123",
  "issue_title": "bug: critical auth bypass in rate limiter",
  "worktree_path": "trees/bug-123-auth-bypass",
  "branch_name": "bug-123-auth-bypass",
  "created_at": "2025-10-29T12:00:00Z",
  "phase_status": {
    "replication": "completed",
    "plan": "completed",
    "implementation": "completed",
    "pr_creation": "completed",
    "ci_monitoring": "in_progress",
    "auto_merge": "pending"
  },
  "reproduction": {
    "steps_executed": ["curl -X POST /api/auth/login", "..."],
    "evidence_files": ["logs/reproduction.log"],
    "confirmed_at": "2025-10-29T12:05:00Z"
  },
  "plan_file": "docs/specs/bug-123-auth-bypass-fix.md",
  "validation": {
    "level": 2,
    "lint": "pass",
    "typecheck": "pass",
    "integration_tests": "45/45"
  },
  "pr_number": "456",
  "pr_url": "https://github.com/user/kota-db-ts/pull/456",
  "ci_monitoring": {
    "checks_passed": false,
    "retry_count": 0,
    "last_check_at": "2025-10-29T12:35:00Z",
    "failing_checks": ["test-integration"]
  },
  "auto_merge": {
    "eligible": false,
    "merge_attempted": false,
    "merge_result": null
  },
  "checkpoints": []
}
```

**API usage:**
- **Beads MCP**: Issue metadata, status updates (fallback: GitHub API)
- **GitHub API** (via `gh` CLI): Issue body, PR creation, CI status, auto-merge
- **Supabase Local**: Integration tests run against real database per antimocking principle

## Relevant Files

- `automation/adws/README.md` - ADW architecture overview, worktree management, state persistence
- `automation/adws/adw_modules/state.py` - State save/load helpers
- `automation/adws/adw_modules/git_ops.py` - Worktree creation and cleanup
- `automation/adws/adw_modules/exit_codes.py` - Standardized exit codes
- `automation/adws/adw_modules/agent.py` - Claude CLI execution wrapper
- `automation/adws/docs/exit-codes.md` - Exit code documentation
- `.claude/commands/workflows/orchestrator.md` - Sub-agent delegation patterns
- `.claude/commands/issues/bug.md` - Bug plan generation slash command
- `.claude/commands/workflows/implement.md` - Implementation slash command
- `.claude/commands/workflows/pull_request.md` - PR creation slash command

### New Files

- `automation/adws/surgical_fix.py` - Main workflow orchestrator script
- `automation/adws/adw_modules/data_types.py` (extend) - Add SurgicalFixState, ReproductionResult, CIMonitoringResult models
- `automation/adws/adw_tests/test_surgical_fix.py` - Unit tests for helper functions
- `automation/adws/adw_tests/test_surgical_fix_e2e.py` - Agent-driven end-to-end test
- `docs/specs/feature-354-surgical-fix-workflow.md` - This specification file
- `automation/adws/docs/surgical-fix-usage.md` - User guide with CLI examples

## Task Breakdown

### Phase 1: Core Infrastructure
- Add SurgicalFixState, ReproductionResult, CIMonitoringResult models to `adw_modules/data_types.py`
- Implement state management helpers (load_surgical_fix_state, save_surgical_fix_state)
- Add surgical_fix_id generation function (format: `fix-<issue>-<timestamp>`)
- Write unit tests for state management in `test_surgical_fix.py`

### Phase 2: Bug Reproduction Phase
- Implement `fetch_issue_metadata()` function (Beads MCP with GitHub API fallback)
- Implement `validate_issue_labels()` to check for `bug` label and `priority:critical` or `priority:high`
- Implement `extract_reproduction_steps()` to parse issue body for reproduction instructions
- Implement `execute_reproduction_steps()` to run reproduction commands in worktree
- Add checkpoint saving after successful reproduction
- Write unit tests for reproduction logic

### Phase 3: Plan and Implementation Integration
- Implement `spawn_planning_agent()` to delegate to `/bug <issue_number>` slash command
- Implement `extract_plan_file_path()` to parse plan file from agent output (with fallbacks)
- Implement `validate_plan_file()` to ensure plan contains Root Cause, Fix Strategy, Validation Commands
- Implement `spawn_implementation_agent()` to delegate to `/implement <plan_file>` slash command
- Implement `extract_validation_results()` to parse Level 2+ validation from agent output
- Add checkpoint saving after plan and implementation phases
- Write unit tests for plan/implementation delegation

### Phase 4: PR Creation and CI Monitoring
- Implement `push_branch()` to push worktree branch to remote
- Implement `create_pull_request()` to delegate to `/pull_request` slash command
- Implement `extract_pr_metadata()` to parse PR number and URL from agent output
- Implement `monitor_ci_status()` to poll `gh pr checks <pr_number>` with 30-second intervals
- Implement `parse_ci_failures()` to extract failure logs from CI checks
- Implement `attempt_ci_fix()` to spawn `/debug-ci <pr_number>` sub-agent on CI failures
- Add retry logic (max 2 attempts) for CI fix attempts
- Add checkpoint saving after PR creation and CI monitoring phases
- Write unit tests for CI monitoring and retry logic

### Phase 5: Auto-Merge Logic
- Implement `check_auto_merge_eligibility()` to verify all CI checks passed and review approved
- Implement `attempt_auto_merge()` using `gh pr merge <pr_number> --squash --auto`
- Implement `close_linked_issue()` to close GitHub issue with closing comment
- Implement `update_beads_status()` to mark Beads issue as closed (if Beads available)
- Add checkpoint saving after merge completion
- Write unit tests for auto-merge decision tree

### Phase 6: Workflow Orchestration
- Implement `main()` function to orchestrate all phases sequentially
- Add command-line argument parsing (`--issue <number>`, `--resume <surgical_fix_id>`, `--dry-run`)
- Implement resume logic to load state and skip completed phases
- Add error handling with exit code standardization (blockers: 1-9, validation: 10-19, execution: 20-29)
- Add logging configuration (structured logger output per phase)
- Implement worktree cleanup logic (configurable via `SURGICAL_FIX_CLEANUP_WORKTREES`)
- Write integration tests for full workflow in `test_surgical_fix.py`

### Phase 7: E2E Testing and Documentation
- Create dedicated test issue for agent E2E test (bug with reproduction steps)
- Implement `test_surgical_fix_e2e.py` to spawn agent and run full workflow
- Write `automation/adws/docs/surgical-fix-usage.md` with CLI examples and troubleshooting
- Update `.claude/commands/workflows/adw-architecture.md` to document surgical fix workflow
- Update `automation/adws/README.md` to add surgical fix section
- Run historical replay tests against 3 closed high-priority bug issues
- Validate workflow execution metrics (time-to-merge, retry count, success rate)

## Step by Step Tasks

### Core Infrastructure
1. Create `automation/adws/surgical_fix.py` with basic structure and imports
2. Add SurgicalFixState Pydantic model to `automation/adws/adw_modules/data_types.py`
3. Add ReproductionResult model with fields: steps_executed, evidence_files, confirmed_at
4. Add CIMonitoringResult model with fields: checks_passed, retry_count, last_check_at, failing_checks
5. Add AutoMergeResult model with fields: eligible, merge_attempted, merge_result
6. Implement generate_surgical_fix_id() function (format: `fix-<issue>-<timestamp>`)
7. Implement load_surgical_fix_state() function with JSON validation
8. Implement save_surgical_fix_state() function with atomic writes
9. Create `automation/adws/adw_tests/test_surgical_fix.py` with test structure
10. Write unit tests for state save/load functions

### Bug Reproduction Phase
11. Implement fetch_issue_metadata() with Beads MCP primary, GitHub API fallback
12. Implement validate_issue_labels() to check for `bug` and priority labels
13. Implement extract_reproduction_steps() to parse issue body (look for "## Reproduction Steps" section)
14. Implement execute_reproduction_steps() to run bash commands in worktree with timeout
15. Add reproduction evidence capture (stdout, stderr, exit codes) to ReproductionResult
16. Implement save_reproduction_evidence() to write logs to `logs/reproduction.log`
17. Add checkpoint creation after successful reproduction
18. Write unit tests for reproduction step parsing
19. Write unit tests for reproduction execution with mocked subprocess
20. Add error handling for reproduction failures (exit code: EXIT_EXEC_AGENT_FAILED)

### Plan and Implementation Integration
21. Implement spawn_planning_agent() using subprocess.run with `/bug <issue_number>`
22. Implement extract_plan_file_path() with defensive parsing (strip markdown, git prefixes)
23. Add fallback plan file detection (search `docs/specs/bug-<issue>-*.md`)
24. Implement validate_plan_file() to check for required sections (Root Cause, Fix Strategy)
25. Add checkpoint creation after plan generation
26. Implement spawn_implementation_agent() using subprocess.run with `/implement <plan_file>`
27. Implement extract_validation_results() to parse Level 2+ validation output
28. Add validation result capture (lint, typecheck, integration_tests) to state
29. Add checkpoint creation after implementation
30. Write unit tests for plan file extraction with edge cases
31. Write unit tests for validation result parsing
32. Add error handling for plan/implementation failures (exit codes: EXIT_EXEC_AGENT_FAILED, EXIT_EXEC_PARSE_ERROR)

### PR Creation and CI Monitoring
33. Implement push_branch() using `git push -u origin <branch_name>` via subprocess
34. Implement create_pull_request() using subprocess.run with `/pull_request`
35. Implement extract_pr_metadata() to parse PR number and URL from output
36. Add fallback PR detection using `gh pr list --head <branch_name>`
37. Add checkpoint creation after PR creation
38. Implement get_pr_checks() using `gh pr checks <pr_number> --json`
39. Implement monitor_ci_status() with 30-second polling loop
40. Implement parse_ci_failures() to extract failure logs from CI JSON output
41. Implement attempt_ci_fix() using subprocess.run with `/debug-ci <pr_number>`
42. Add CI retry logic (max 2 attempts) with exponential backoff
43. Add checkpoint creation after each CI check iteration
44. Write unit tests for CI status parsing
45. Write unit tests for retry logic with mocked gh commands
46. Add error handling for PR creation failures (exit code: EXIT_RESOURCE_GIT_ERROR)

### Auto-Merge Logic
47. Implement check_auto_merge_eligibility() using `gh pr view <pr_number> --json`
48. Verify all CI checks passed (status: success)
49. Verify review approval (reviewDecision: APPROVED)
50. Implement attempt_auto_merge() using `gh pr merge <pr_number> --squash --auto`
51. Implement close_linked_issue() using `gh issue close <issue_number> --comment <msg>`
52. Implement update_beads_status() using Beads MCP update tool (if available)
53. Add checkpoint creation after merge completion
54. Write unit tests for auto-merge eligibility checks
55. Write unit tests for merge execution with mocked gh commands
56. Add error handling for merge failures (exit code: EXIT_RESOURCE_NETWORK_ERROR)

### Workflow Orchestration
57. Implement main() function with phase orchestration logic
58. Add argparse configuration (--issue, --resume, --dry-run, --skip-cleanup)
59. Implement resume logic to load state and skip completed phases
60. Add worktree creation at workflow start using `adw_modules.git_ops.create_worktree()`
61. Add structured logger configuration per phase (logs/<surgical_fix_id>/<phase>/execution.log)
62. Add exit code mapping for all error scenarios (use exit_codes.py constants)
63. Implement worktree cleanup logic (check SURGICAL_FIX_CLEANUP_WORKTREES env var)
64. Add execution metrics collection (time-to-merge, retry_count, validation_level)
65. Add execution report generation with metrics summary
66. Write integration tests for full workflow with mocked subprocesses
67. Write integration tests for resume logic with partial state files
68. Add dry-run mode to validate preconditions without execution

### E2E Testing and Documentation
69. Create test issue in GitHub with bug reproduction steps (issue #TBD)
70. Create `automation/adws/adw_tests/test_surgical_fix_e2e.py` with agent test structure
71. Implement agent spawn logic to run `uv run adws/surgical_fix.py --issue <test_issue>`
72. Add assertions for workflow completion, PR creation, and state file contents
73. Write `automation/adws/docs/surgical-fix-usage.md` with CLI examples
74. Add troubleshooting section to usage guide (common errors, recovery steps)
75. Update `.claude/commands/workflows/adw-architecture.md` to document surgical fix
76. Update `automation/adws/README.md` to add surgical fix workflow section
77. Select 3 closed high-priority bug issues for historical replay tests
78. Run surgical fix workflow in replay mode (mock issue state, execute workflow)
79. Validate workflow success metrics (target: >80% success rate)
80. Validate git operations (git push, git status, worktree cleanup)
81. Run full validation suite (bun run lint, bunx tsc --noEmit, bun test --filter integration, bun test, bun run build)
82. Push branch with `git push -u origin <branch_name>`

## Risks & Mitigations

### Risk: False-positive auto-merges (merging broken fixes)
**Impact**: Production regression from broken critical bug fix
**Mitigation**:
- Require Level 2+ validation (lint, typecheck, integration tests) before PR creation
- Require all CI checks to pass (not just subset)
- Require review approval before auto-merge (reviewDecision: APPROVED)
- Monitor auto-merge success rate via ADW metrics workflow (alert on <90% success)
- Add rollback capability (revert commit if issue reopened within 24 hours)

### Risk: CI auto-fix attempts introduce new bugs
**Impact**: CI retry logic makes situation worse instead of better
**Mitigation**:
- Limit CI retry attempts to max 2 (prevent infinite loops)
- Require `/debug-ci` agent to validate fix before re-pushing
- Save checkpoint before each retry attempt (enable rollback)
- Fallback to manual recovery if auto-fix fails twice
- Monitor CI auto-fix success rate (alert if <70%)

### Risk: Reproduction step execution is unsafe (arbitrary code)
**Impact**: Malicious issue body could execute harmful commands
**Mitigation**:
- Parse reproduction steps from structured markdown section only (## Reproduction Steps)
- Validate commands against whitelist (curl, bun, git, gh)
- Execute in isolated worktree (no access to production systems)
- Add timeout for reproduction commands (default: 60 seconds)
- Require manual review of reproduction steps in dry-run mode

### Risk: Time-to-merge target (<15 minutes) is unrealistic
**Impact**: Workflow design optimizes for speed over correctness
**Mitigation**:
- Measure baseline time-to-merge for manual critical bug fixes (expected: 30-60 minutes)
- Break down time budget: reproduction (3 min), plan (2 min), implementation (5 min), CI (5 min)
- Use parallelization where possible (CI monitoring + review phase)
- Add fast-path for simple fixes (single-file changes, no schema migrations)
- Adjust target based on historical metrics after 10 workflow runs

### Risk: Worktree cleanup race condition during concurrent workflows
**Impact**: Worktree deleted while another workflow is using it
**Mitigation**:
- Use ADW ID in worktree name for uniqueness (trees/bug-123-abc12345)
- Check worktree existence before cleanup using `git worktree list`
- Add file lock during cleanup (prevent concurrent cleanup)
- Preserve worktree on failure for debugging (SURGICAL_FIX_CLEANUP_WORKTREES=false)

## Validation Strategy

### Automated Tests
**Unit Tests** (`automation/adws/adw_tests/test_surgical_fix.py`):
- State save/load with atomic writes and validation
- Issue validation logic (bug label, priority labels)
- Reproduction step extraction from issue body markdown
- Plan file path parsing with defensive fallbacks
- Validation result extraction from agent output
- CI status parsing from GitHub API JSON
- Auto-merge decision tree with various CI/review states
- Checkpoint recovery scenarios (resume from each phase)

**Integration Tests** (`automation/adws/adw_tests/test_surgical_fix.py`):
- Full workflow execution with mocked subprocesses (all phases)
- Resume logic with partial state files (skip completed phases)
- Error handling with exit code validation (blockers, validation, execution)
- Worktree lifecycle (creation, usage, cleanup)

**Agent E2E Test** (`automation/adws/adw_tests/test_surgical_fix_e2e.py`):
- Spawn Claude Code agent to run full surgical fix workflow
- Validate PR creation, CI passing, auto-merge completion
- Check state file contents for correctness
- Validate execution metrics (time-to-merge, retry count)

**Historical Replay Tests**:
- Select 3 closed high-priority bug issues (different complexity levels)
- Run surgical fix workflow with mocked issue state
- Verify workflow would have auto-merged successfully
- Compare metrics to manual fix time-to-merge

### Manual Checks
- Verify bug reproduction correctly identifies issue (no false negatives)
- Check plan file contains Root Cause and Fix Strategy sections
- Validate Level 2 validation executes correctly (integration tests hit real Supabase)
- Confirm CI monitoring polls at 30-second intervals (not too aggressive)
- Verify auto-merge only triggers when reviewDecision: APPROVED
- Check worktree cleanup preserves worktree on failure
- Test resume logic by manually killing workflow mid-phase

### Release Guardrails
**Pre-merge validation**:
- All unit tests pass (pytest automation/adws/adw_tests/test_surgical_fix.py)
- Agent E2E test passes (creates PR, passes CI, merges)
- Historical replay tests show >80% success rate
- Documentation complete (usage guide, architecture doc)
- Manual execution on test issue completes without human intervention

**Post-merge monitoring**:
- Track surgical fix success rate via ADW metrics workflow
- Alert if time-to-merge exceeds 20 minutes (target: <15 minutes)
- Alert if CI auto-fix success rate <70%
- Alert if auto-merge failure rate >10%
- Monitor for false-positive merges (issues reopened after auto-merge)

## Validation Commands

**Linting**:
```bash
cd automation && uv run ruff check adws/surgical_fix.py adws/adw_modules/data_types.py
```

**Type Checking**:
```bash
cd automation && uv run mypy adws/surgical_fix.py adws/adw_modules/data_types.py
```

**Unit Tests**:
```bash
cd automation && uv run pytest adws/adw_tests/test_surgical_fix.py -v --tb=short
```

**Agent E2E Test**:
```bash
cd automation && uv run pytest adws/adw_tests/test_surgical_fix_e2e.py -v --tb=short
```

**Integration Tests**:
```bash
cd automation && uv run pytest adws/adw_tests/ -k surgical_fix -v --tb=short
```

**Application Validation** (ensure no breakage):
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test --filter integration
cd app && bun test
cd app && bun run build
```

**Manual Execution Test**:
```bash
cd automation && uv run adws/surgical_fix.py --issue <test_issue> --dry-run
cd automation && uv run adws/surgical_fix.py --issue <test_issue>
```

## Commit Message Validation
All commits for this feature will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- Use direct statements without meta-commentary patterns
- Examples:
  - ✅ `feat(adw): add surgical fix workflow orchestrator`
  - ✅ `feat(adw): implement bug reproduction phase with evidence capture`
  - ✅ `test(adw): add unit tests for CI monitoring and retry logic`
  - ❌ `Based on the plan, this commit adds surgical fix workflow`
  - ❌ `Here is the implementation of CI monitoring phase`

## Issue Relationships

- **Related To**: #187 (orchestrator command) - Shares sub-agent delegation patterns and state management
- **Related To**: #135 (3-phase ADW simplification) - Leverages simplified phase architecture
- **Related To**: #179 (exit code standardization) - Uses standardized exit codes for error handling
- **Related To**: #148 (hybrid resilience patterns) - Implements checkpoint-based recovery
- **Related To**: #155 (multi-agent coordination) - Coordinates multiple sub-agents in sequence
- **Child Of**: #300 (Beads integration epic) - Uses Beads MCP tools for issue metadata and status updates
- **Related To**: #305 (auto-merge for ADW PRs) - Extends auto-merge functionality for surgical fixes

## Report Format

Return ONLY the plan file path as plain text on a single line (no markdown, no explanatory text):

docs/specs/feature-354-surgical-fix-workflow.md
