# /orchestrator

Automate the end-to-end workflow from GitHub issue to reviewed pull request through coordinated phase execution.

## Arguments
- `$1`: Issue number (required)
- `--dry-run`: Validate preconditions without executing workflow
- `--skip-cleanup`: Preserve worktree after completion (default: cleanup on success)
- `--force`: Allow execution on closed issues (requires override)
- `--resume <adw_id>`: Resume from last checkpoint after failure

## CRITICAL: Output Format Requirements

Return **ONLY** a plain text summary with workflow results.

**DO NOT include:**
- Markdown formatting (no **bold**, no ` ``` blocks`, no # headers)
- Explanatory preambles (e.g., "The orchestrator has completed successfully!")
- Multi-paragraph descriptions

**Correct output:**
```
- Issue #187: feat: implement /orchestrator slash command for end-to-end issue-to-PR automation
- ADW ID: orch-187-20251020140000
- Worktree: trees/feat-187-orchestrator-command (branch: feat-187-orchestrator-command)
- Plan phase: completed (docs/specs/feature-187-orchestrator-slash-command.md)
- Build phase: completed (validation: Level 2 passed, 133/133 tests)
- PR created: https://github.com/user/kota-db-ts/pull/210
- Review phase: completed (approved with 2 minor suggestions)
- Worktree cleanup: skipped (--skip-cleanup flag)
```

**INCORRECT output (do NOT do this):**
```
# Orchestrator Workflow Complete

The /orchestrator command has successfully completed all phases for issue #187!

**Summary:**
- Created worktree: `trees/feat-187-orchestrator-command`
- Generated plan: `docs/specs/feature-187-orchestrator-slash-command.md`

You can view the pull request at: https://github.com/user/kota-db-ts/pull/210
```

## Overview

The orchestrator automates multi-phase workflows by:
1. Validating issue readiness (metadata, dependencies, state)
2. Creating isolated worktree with conventional branch naming
3. Spawning phase-specific agents via existing slash commands
4. Tracking progress via checkpoint system
5. Creating PR and running automated review
6. Cleaning up worktree (configurable)

**Workflow Phases:**
- **Plan**: Issue classification → `/feat`, `/bug`, or `/chore` → spec file generation
- **Build**: Implementation → `/implement` → validation execution
- **PR Creation**: Branch push → `/pull_request` → PR number extraction
- **Review**: Code analysis → `/pr-review` → review posting

## Preconditions

Before execution:
1. **GitHub CLI**: `gh` must be authenticated and available
2. **Issue State**: Issue must be open (use `--force` to override)
3. **Issue Labels**: All four label categories required (component, priority, effort, status)
4. **Dependencies**: "Depends On" relationships must be resolved (closed issues)
5. **Clean Working Tree**: Root repository must have no uncommitted changes
6. **Branch Availability**: Target branch name must not already exist

## Phase 1: Issue Validation

### Extract Issue Metadata
```bash
gh issue view $1 --json number,title,labels,body,state
```

### Validate Issue State
- **Open Status**: Issue must be in "OPEN" state (warn and require `--force` if closed)
- **Label Requirements**: Must have labels from all categories:
  - Component: `component:api`, `component:auth`, `component:db`, `component:ci`, etc.
  - Priority: `priority:critical`, `priority:high`, `priority:medium`, `priority:low`
  - Effort: `effort:small`, `effort:medium`, `effort:large`
  - Status: `status:ready`, `status:in-progress`, `status:blocked`, etc.
- **Type Extraction**: Determine issue type from labels or title prefix:
  - Look for labels: `type:feature`, `type:bug`, `type:chore`
  - Fallback: extract from title (e.g., "feat:", "bug:", "chore:")
  - Map to slash command: `feat` → `/feat`, `bug` → `/bug`, `chore` → `/chore`

### Check Dependencies
Parse issue body for "Depends On" relationships:
```markdown
## Issue Relationships
- Depends On: #123, #456
```

For each dependency:
```bash
gh issue view <dep_number> --json state
```

If any dependency is still open:
- Error: "Issue #<issue> depends on unresolved issue #<dep> (<title>)"
- Require `--force` flag to continue

### Dry-Run Exit
If `--dry-run` flag is set:
- Display issue metadata (number, title, type, labels)
- Show proposed worktree name and branch name
- List dependencies and their status
- Exit without creating worktree or executing workflow

## Phase 2: Worktree Setup

### Generate Naming Conventions
- **ADW ID**: `orch-<issue>-<timestamp>` (e.g., `orch-187-20251020140000`)
  - Timestamp format: `YYYYMMDDHHMMSS` (UTC)
- **Branch Name**: `<type>-<issue>-<slug>` (e.g., `feat-187-orchestrator-command`)
  - Extract slug from issue title (3-6 words, lowercase, hyphenated)
  - Remove type prefixes ("feat:", "bug:", etc.)
  - Sanitize to alphanumeric + hyphens only
- **Worktree Name**: Same as branch name
- **Worktree Path**: `trees/<worktree_name>` (relative to project root)

### Create Worktree
```bash
# Verify worktree doesn't already exist
git worktree list | grep <worktree_name>

# Create worktree from develop branch
git worktree add trees/<worktree_name> -b <branch_name> develop
```

**Error Handling:**
- If worktree already exists: Error with cleanup instructions
- If branch already exists: Error suggesting different branch name or deletion
- If git operation fails: Capture stderr and provide actionable error message

### Initialize State
Create state directory: `automation/agents/<adw_id>/orchestrator/`

Write initial state to `state.json`:
```json
{
  "adw_id": "orch-187-20251020140000",
  "issue_number": "187",
  "issue_title": "feat: implement /orchestrator slash command",
  "issue_type": "feat",
  "worktree_name": "feat-187-orchestrator-command",
  "worktree_path": "trees/feat-187-orchestrator-command",
  "branch_name": "feat-187-orchestrator-command",
  "created_at": "2025-10-20T14:00:00Z",
  "updated_at": "2025-10-20T14:00:00Z",
  "phase_status": {
    "plan": "pending",
    "build": "pending",
    "pr": "pending",
    "review": "pending"
  },
  "checkpoints": []
}
```

## Phase 3: Plan Execution

### Spawn Planning Agent
Execute slash command based on issue type:
```bash
# Change to worktree directory
cd trees/<worktree_name>

# Spawn appropriate planning agent
claude /<issue_type> <issue_number>
```

**Command Selection:**
- `feat` → `claude /feat <issue_number>`
- `bug` → `claude /bug <issue_number>`
- `chore` → `claude /chore <issue_number>`

**Execution Context:**
- Working directory: Worktree root
- Environment variables: Inherit from parent shell
- Timeout: None (planning is interactive and unbounded)

### Capture Plan Output
Planning agent creates spec file: `docs/specs/<type>-<issue>-<slug>.md`

**Plan File Detection:**
1. Check state from planning agent (if agent updated state)
2. Search for recently created files: `find docs/specs -name '*-<issue>-*.md' -mmin -60`
3. Parse planning agent output for file path mention

### Update State
```json
{
  "plan_file": "docs/specs/feature-187-orchestrator-slash-command.md",
  "phase_status": {
    "plan": "completed"
  },
  "checkpoints": [
    {
      "timestamp": "2025-10-20T14:05:00Z",
      "phase": "plan",
      "status": "completed",
      "artifacts": {
        "plan_file": "docs/specs/feature-187-orchestrator-slash-command.md"
      },
      "next_action": "spawn_build_agent"
    }
  ],
  "updated_at": "2025-10-20T14:05:00Z"
}
```

**Error Handling:**
- If planning agent fails: Save checkpoint with error, preserve worktree, exit with status
- If plan file not found: Search worktree, prompt user for manual path, or fail with instructions

## Phase 4: Build Execution

### Spawn Implementation Agent
```bash
cd trees/<worktree_name>
claude /implement <plan_file>
```

**Implementation Agent:**
- Reads plan file from path
- Executes implementation tasks in order
- Runs validation commands (Level 2 minimum)
- Creates incremental commits during implementation

**Monitoring:**
- Capture agent stdout/stderr
- Parse for validation results and test output
- Detect validation failures (non-zero exit from validation commands)

### Validation Extraction
Parse implementation agent output for validation evidence:
- Lint status: `bun run lint` → PASS/FAIL
- Type-check status: `bunx tsc --noEmit` → PASS/FAIL
- Integration tests: `bun test --filter integration` → X/Y tests passed
- Full test suite (if Level 3): `bun test` → X/Y tests passed

### Update State
```json
{
  "phase_status": {
    "build": "completed"
  },
  "validation": {
    "level": 2,
    "lint": "pass",
    "typecheck": "pass",
    "integration_tests": "133/133",
    "evidence": "Supabase integration tests hit real database"
  },
  "checkpoints": [
    {
      "timestamp": "2025-10-20T14:30:00Z",
      "phase": "build",
      "status": "completed",
      "artifacts": {
        "validation_level": 2,
        "test_results": "133/133 passed"
      },
      "next_action": "create_pr"
    }
  ],
  "updated_at": "2025-10-20T14:30:00Z"
}
```

**Error Handling:**
- If validation fails: Save checkpoint, preserve worktree, report failure details
- If implementation incomplete: Save checkpoint, allow `--resume` recovery
- If agent crashes: Capture error, save state, exit with diagnostic info

## Phase 5: PR Creation

### Push Branch
```bash
cd trees/<worktree_name>
git push -u origin <branch_name>
```

### Spawn PR Agent
```bash
cd trees/<worktree_name>
claude /pull_request <branch_name> <issue_json> <plan_file> <adw_id>
```

**PR Agent Variables:**
- `branch_name`: Current branch (e.g., `feat-187-orchestrator-command`)
- `issue_json`: JSON string with issue metadata
- `plan_file`: Relative path to spec file
- `adw_id`: Orchestrator ADW ID

**PR Agent Output:**
```
https://github.com/user/kota-db-ts/pull/210
```

### Extract PR Number
Parse PR URL from agent output:
```regex
https://github\.com/[^/]+/[^/]+/pull/(\d+)
```

### Update State
```json
{
  "pr_number": "210",
  "pr_url": "https://github.com/user/kota-db-ts/pull/210",
  "phase_status": {
    "pr": "completed"
  },
  "checkpoints": [
    {
      "timestamp": "2025-10-20T14:35:00Z",
      "phase": "pr",
      "status": "completed",
      "artifacts": {
        "pr_number": "210",
        "pr_url": "https://github.com/user/kota-db-ts/pull/210"
      },
      "next_action": "run_review"
    }
  ],
  "updated_at": "2025-10-20T14:35:00Z"
}
```

**Error Handling:**
- If branch push fails: Check remote state, report error, preserve worktree
- If PR creation fails: Capture error, check for existing PR, provide manual recovery steps
- If PR number extraction fails: Parse alternative formats, prompt for manual input

## Phase 6: Review Execution

### Spawn Review Agent
```bash
cd trees/<worktree_name>
claude /pr-review <pr_number>
```

**Review Agent:**
- Fetches PR metadata and diffs
- Checks out PR branch
- Runs validation commands (Level 2+)
- Posts review comment to PR

**Review Outcomes:**
- Approved: Review posted with approval
- Changes Requested: Review posted with actionable feedback
- Comment Only: Observations posted without formal review status

### Parse Review Results
Extract review decision from agent output:
- Look for keywords: "Approve", "Request Changes", "Comment"
- Parse review comment URL: `gh pr view <pr_number> --json reviews`

### Update State
```json
{
  "phase_status": {
    "review": "completed"
  },
  "review_status": "approved",
  "review_comments": 2,
  "checkpoints": [
    {
      "timestamp": "2025-10-20T14:40:00Z",
      "phase": "review",
      "status": "completed",
      "artifacts": {
        "review_status": "approved",
        "comment_count": 2
      },
      "next_action": "cleanup"
    }
  ],
  "updated_at": "2025-10-20T14:40:00Z"
}
```

**Error Handling:**
- If review agent fails: Save checkpoint, preserve worktree, report error
- If review posting fails: Check GitHub API, provide manual posting instructions

## Phase 7: Cleanup

### Determine Cleanup Behavior
Check cleanup conditions:
1. `--skip-cleanup` flag: Always skip cleanup
2. `ADW_CLEANUP_WORKTREES` environment variable: Check if set to `false`
3. Workflow status: Only cleanup on full success (all phases completed)

### Execute Cleanup
If cleanup is enabled and workflow succeeded:
```bash
# Return to project root
cd <project_root>

# Remove worktree
git worktree remove trees/<worktree_name>

# Optionally delete local branch (if not merged)
git branch -d <branch_name>
```

**Cleanup Preservation:**
- On failure: Always preserve worktree for debugging
- On `--skip-cleanup`: Preserve worktree
- On partial completion: Preserve worktree for resume

### Final State Update
```json
{
  "worktree_cleaned": true,
  "completed_at": "2025-10-20T14:45:00Z",
  "workflow_status": "success",
  "updated_at": "2025-10-20T14:45:00Z"
}
```

## Phase 8: Reporting

### Generate Workflow Summary
Compile execution report with:
- Issue metadata (number, title, type)
- ADW ID
- Worktree and branch names
- Phase completion status (plan, build, PR, review)
- Plan file path
- Validation results (level, test counts)
- PR URL and number
- Review status
- Worktree cleanup status

### Output Format
Return plain text summary (no markdown):
```
- Issue #187: feat: implement /orchestrator slash command for end-to-end issue-to-PR automation
- ADW ID: orch-187-20251020140000
- Worktree: trees/feat-187-orchestrator-command (branch: feat-187-orchestrator-command)
- Plan phase: completed (docs/specs/feature-187-orchestrator-slash-command.md)
- Build phase: completed (validation: Level 2 passed, 133/133 tests)
- PR created: https://github.com/user/kota-db-ts/pull/210
- Review phase: completed (approved with 2 minor suggestions)
- Worktree cleanup: completed
```

## Error Recovery

### Checkpoint System
Checkpoints are saved after each phase completion to enable recovery:
- **Location**: `automation/agents/<adw_id>/orchestrator/state.json`
- **Format**: JSON with timestamp, phase, status, artifacts, next_action
- **Persistence**: Atomic writes with error handling

### Resume Workflow
To resume after failure:
```bash
/orchestrator --resume orch-187-20251020140000
```

**Resume Logic:**
1. Load state from `automation/agents/<adw_id>/orchestrator/state.json`
2. Check last completed phase from checkpoints
3. Skip completed phases (plan, build, PR, review)
4. Resume from next pending phase
5. Continue normal execution flow

**Resume Validation:**
- Verify worktree still exists: `git worktree list | grep <worktree_name>`
- Verify state file exists and is valid JSON
- Verify required artifacts exist (plan file, branch, PR number)

### Common Failure Scenarios

**Planning Agent Fails:**
- Checkpoint: `plan` phase marked as `failed`
- Preserve: Worktree remains for manual investigation
- Recovery: Fix issue manually, run `/orchestrator --resume <adw_id>`

**Validation Fails:**
- Checkpoint: `build` phase marked as `failed` with validation errors
- Preserve: Worktree + commits remain for debugging
- Recovery: Fix errors in worktree, rerun `/implement`, resume orchestrator

**PR Creation Fails:**
- Checkpoint: `build` phase completed, `pr` phase failed
- Preserve: Worktree + branch remain
- Recovery: Manual PR creation or fix git remote issues, resume

**Review Agent Fails:**
- Checkpoint: `pr` phase completed, `review` phase failed
- Preserve: Worktree + PR exist
- Recovery: Manual review or rerun `/pr-review`, update state manually

## Environment Variables

- `ADW_CLEANUP_WORKTREES`: Set to `false` to disable automatic cleanup (default: `true`)
- `ADW_CLEANUP_ON_FAILURE`: Set to `true` to cleanup even on failure (default: `false`)
- `GIT_DIR`: Git directory for worktree operations (set automatically)
- `GIT_WORK_TREE`: Working tree path (set automatically)

## Implementation Notes

### Worktree Isolation
All phase agents execute within the worktree directory to prevent root repository contamination:
- Set `cwd` to worktree path for all subprocess calls
- Git operations inherit worktree context automatically
- File paths are relative to worktree root

### State Persistence
State is saved after each phase and on errors:
- Atomic writes to prevent corruption
- JSON format for easy parsing
- Checkpoints enable incremental recovery

### Subprocess Execution
Phase agents are spawned via subprocess:
```python
subprocess.run(
    ["claude", "/implement", plan_file],
    cwd=worktree_path,
    capture_output=True,
    text=True,
    timeout=None  # No timeout for interactive agents
)
```

### Error Propagation
Errors bubble up with context:
- Phase name and checkpoint timestamp
- Agent stdout/stderr
- State at time of failure
- Recovery instructions

## Testing Strategy

Integration tests validate:
1. Issue validation with various label combinations
2. Worktree creation and naming conventions
3. Phase agent spawning with mocked subprocess calls
4. Checkpoint save/load and recovery
5. Worktree cleanup behavior (success and failure cases)
6. Flag handling (--dry-run, --skip-cleanup, --force, --resume)
7. Error scenarios (missing plan file, validation failures, API errors)

Test file: `automation/adws/adw_tests/test_orchestrator_integration.py`

## Usage Examples

**Basic execution:**
```bash
/orchestrator 187
```

**Dry-run validation:**
```bash
/orchestrator 187 --dry-run
```

**Skip cleanup for inspection:**
```bash
/orchestrator 187 --skip-cleanup
```

**Force execution on closed issue:**
```bash
/orchestrator 42 --force
```

**Resume after failure:**
```bash
/orchestrator --resume orch-187-20251020140000
```

## Limitations

- **Single Issue**: Orchestrates one issue at a time (no batch processing)
- **No Parallelization**: Phases execute sequentially (plan → build → PR → review)
- **No MCP Integration**: Uses subprocess for phase agents (not MCP Tasks API)
- **Manual Recovery**: Resume requires manual flag (not automatic retry)
- **Local Only**: Executes on local machine (not CI/CD environment)

## Future Enhancements

Deferred to follow-up issues:
- MCP Tasks API integration for progress tracking (#153)
- Automated retry logic for transient failures (#148)
- Parallel execution for independent phases
- CI/CD integration for remote orchestration
- Multi-issue batch processing
