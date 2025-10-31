# ADW Architecture

AI Developer Workflows (ADW) architecture, phases, atomic agents, and resilience patterns.

## Overview

Python-based automation pipeline for autonomous GitHub issue workflows.

Location: `automation/adws/`

## 3-Phase Architecture

As of #136, the ADW system uses a simplified 3-phase flow:

1. **Plan phase** (`adw_plan.py`): Issue classification and implementation planning
2. **Build phase** (`adw_build.py`): Implementation and PR creation
3. **Review phase** (`adw_review.py`): Automated code review and reporting

**Recent Simplification** (PR #136): Simplified from 5-phase to 3-phase by removing broken test/document/patch phases (519 lines deleted). PR creation moved from plan to build phase to ensure PRs only open after successful implementation.

**Target completion rate**: >80%

## Atomic Agent Catalog

Chore #216, #255: Decomposed agents following "one agent, one task, one prompt" philosophy.

Location: `automation/adws/adw_agents/`

### Phase 3 Deliverables (Chore #255)

- Parallel execution infrastructure via ThreadPoolExecutor
- Thread-safe state management with global locking
- 7 new integration tests for concurrency and thread safety
- Configurable parallelism via `ADW_MAX_PARALLEL_AGENTS` (default: 2)
- **Current limitation**: Data dependency between classify_issue and generate_branch prevents parallel execution

### Feature Flag

- **`ADW_USE_ATOMIC_AGENTS`**: Enable atomic agents (default: false, legacy phase scripts)

### Phase 4 (Next)

Real-world validation on 10-20 test issues, success rate measurement (target: >80%).

See `automation/adws/adw_agents/README.md` for agent catalog and parallel execution architecture.

See `docs/specs/phase3-validation-results.md` for Phase 3 infrastructure completion summary.

## Shared Utilities

Location: `automation/adws/adw_modules/`

- Claude CLI wrapper
- Git operations with worktree isolation
- GitHub integration
- State management

## Test Suite

Location: `automation/adws/adw_tests/`

Pytest suite for workflow validation.

## Trigger Systems

- **Webhook trigger** (`trigger_webhook.py`): Webhook-based execution
- **Cron trigger** (`trigger_cron.py`): Polling-based execution

## Worktree Isolation

All workflows execute in isolated git worktrees (`trees/`) to prevent conflicts during concurrent agent execution and local development.

- Worktrees automatically created before agent execution
- Worktrees cleaned up after successful PR creation (configurable via `ADW_CLEANUP_WORKTREES`)

### Interactive Worktree Development

Added in PR #157: Use `/spawn_interactive` slash command to create isolated Claude Code development environments for:

- Working on multiple features concurrently without branch switching
- Inspecting ADW-generated code without affecting main working directory
- Testing experimental changes in complete isolation

See `.claude/commands/worktree/spawn_interactive.md` for detailed usage.

## Orchestrator Slash Command

Feature #187: Use `/orchestrator` to automate the full end-to-end issue-to-PR workflow with a single command:

- Automates all 3 phases: plan → build (with PR creation) → review
- Validates issue metadata and dependencies before execution
- Creates isolated worktree with conventional branch naming
- Implements checkpoint-based recovery for failure scenarios
- Supports dry-run validation, cleanup control, and manual resume
- Complements Python ADW layer with manual/interactive execution mode

See `.claude/commands/workflows/orchestrator.md` for detailed usage.

## Resilience Architecture

PR #157, issue #148: Hybrid resilience system with automatic retry logic and checkpoint-based recovery.

### Automatic Retry

- Exponential backoff (1s, 3s, 5s) for transient errors
- Retry codes classify error types:
  - `CLAUDE_CODE_ERROR`: Claude CLI execution errors
  - `TIMEOUT_ERROR`: Command timeouts
  - `EXECUTION_ERROR`: General execution failures

### Checkpoint System

- Saves progress at logical breakpoints for resume-after-failure capability
- Checkpoint storage: `agents/{adw_id}/{phase}/checkpoints.json`
- Atomic writes to prevent corruption

See `automation/adws/README.md` "Resilience & Recovery" section for usage examples.

## Related Documentation

- [ADW Observability](./.claude/commands/workflows/adw-observability.md)
- [Orchestrator Command](./.claude/commands/workflows/orchestrator.md)
- [Beads ADW Integration](./.claude/commands/docs/beads-adw-integration.md)
- Complete automation architecture: `automation/adws/README.md`
