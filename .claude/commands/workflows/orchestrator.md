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

## Subagent Delegation Pattern

The orchestrator coordinates work by delegating to phase-specific slash commands. This section documents how to invoke subagents programmatically, pass context, and extract results.

### Invocation Mechanism

**Preferred: SlashCommand Tool** (Claude Code native)
```typescript
// Use Claude Code's SlashCommand tool for seamless integration
SlashCommand({ command: "/feat 187" });
```

The SlashCommand tool provides:
- Native integration with Claude Code's command registry
- Automatic working directory context from current session
- Structured output capture for parsing
- Built-in error handling and timeout management

**Fallback: Subprocess Execution** (for Python automation layer)
```python
import subprocess
result = subprocess.run(
    ["claude", "/feat", "187"],
    cwd=worktree_path,
    capture_output=True,
    text=True,
    timeout=None  # Phase agents may require unbounded time for interactive work
)
```

Subprocess execution is used when:
- Running from Python ADW layer (automation/adws/)
- Need explicit control over working directory
- Require stdout/stderr separation for parsing
- Running in CI/CD environments without Claude Code CLI

### Working Directory Control

**Context Inheritance**:
- SlashCommand tool inherits working directory from the calling session
- Always change to worktree directory BEFORE invoking phase commands
- Subagents execute with worktree as their CWD, preventing root repository contamination

**Example: Correct Invocation Flow**
```typescript
// 1. Create worktree (Phase 2)
Bash({ command: "git worktree add automation/trees/feat-187-orch -b feat-187-orch develop" });

// 2. Change to worktree directory
process.chdir("automation/trees/feat-187-orch");

// 3. Invoke planning agent (executes in worktree context)
SlashCommand({ command: "/feat 187" });

// 4. Planning agent creates: docs/specs/feature-187-orchestrator-slash-command.md
// (Relative to worktree root, tracked by worktree's git context)
```

**Subprocess Alternative**:
```python
# Python automation layer sets cwd explicitly
subprocess.run(
    ["claude", "/feat", "187"],
    cwd="automation/trees/feat-187-orch",  # Explicit worktree path
    capture_output=True,
    text=True
)
```

### Phase-Specific Invocation Examples

**Plan Phase**:
```typescript
// Issue type determines which planning command to use
const issueType = extractTypeFromLabels(issueMetadata);  // "feat", "bug", or "chore"
const issueNumber = "187";

// Invoke appropriate planning command
SlashCommand({ command: `/${issueType} ${issueNumber}` });

// Expected output: docs/specs/feature-187-orchestrator-slash-command.md
```

**Build Phase**:
```typescript
// Pass plan file path from previous phase
const planFile = state.plan_file;  // From checkpoint

SlashCommand({ command: `/implement ${planFile}` });

// Expected output: Bullet list with validation results
```

**PR Creation Phase**:
```typescript
// Push branch first
Bash({ command: `git push -u origin ${state.branch_name}` });

// Invoke PR creation (may require passing metadata as arguments)
SlashCommand({ command: `/pull_request` });

// Expected output: https://github.com/user/repo/pull/123
```

**Review Phase**:
```typescript
// Extract PR number from previous phase
const prNumber = state.pr_number;

SlashCommand({ command: `/pr-review ${prNumber}` });

// Expected output: Human-readable review summary
```

### Error Propagation

**Detecting Subagent Failures**:
- SlashCommand tool: Check if command completes without throwing errors
- Subprocess execution: Check exit code (`result.returncode !== 0`)
- Output parsing: Look for error indicators in stdout/stderr

**Capturing Error Context**:
```python
result = subprocess.run(["claude", "/implement", plan_file], ...)

if result.returncode != 0:
    error_context = {
        "phase": "build",
        "command": "/implement",
        "exit_code": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "timestamp": datetime.utcnow().isoformat()
    }
    save_checkpoint(adw_id, "build", "failed", error_context)
    # Preserve worktree for debugging
    return
```

**Retry Logic** (when appropriate):
- Transient errors (network, API rate limits): Retry with exponential backoff
- Validation failures: Do NOT retry automatically (requires manual fix)
- Parse errors: Log output, preserve state, exit for manual recovery

## State File Integration

The orchestrator maintains workflow state in a JSON file to enable checkpoint recovery and cross-phase context passing. This section documents the state file schema, lifecycle, and usage patterns.

### State File Location

State is stored in: `automation/agents/<adw_id>/orchestrator/state.json`

Example path: `automation/agents/orch-187-20251020140000/orchestrator/state.json`

### State File Schema

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
  "updated_at": "2025-10-20T14:30:00Z",
  "phase_status": {
    "plan": "completed",
    "build": "in_progress",
    "pr": "pending",
    "review": "pending"
  },
  "plan_file": "docs/specs/feature-187-orchestrator-slash-command.md",
  "validation": {
    "level": 2,
    "lint": "pass",
    "typecheck": "pass",
    "integration_tests": "133/133",
    "evidence": "Supabase integration tests hit real database"
  },
  "pr_number": null,
  "pr_url": null,
  "review_status": null,
  "review_comments": null,
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
  "worktree_cleaned": false,
  "completed_at": null,
  "workflow_status": "in_progress"
}
```

**Required Fields**:
- `adw_id`: Unique orchestrator run identifier (format: `orch-<issue>-<timestamp>`)
- `issue_number`: GitHub issue number (string)
- `issue_title`: Full issue title from GitHub
- `issue_type`: Issue classification (`feat`, `bug`, `chore`)
- `worktree_name`, `worktree_path`, `branch_name`: Git context for isolated execution
- `created_at`, `updated_at`: ISO 8601 timestamps
- `phase_status`: Tracking object with keys: `plan`, `build`, `pr`, `review` (values: `pending`, `in_progress`, `completed`, `failed`)
- `checkpoints`: Array of checkpoint objects with `timestamp`, `phase`, `status`, `artifacts`, `next_action`

**Optional Fields** (populated as workflow progresses):
- `plan_file`: Relative path to generated spec file
- `validation`: Validation results from build phase
- `pr_number`, `pr_url`: Pull request metadata
- `review_status`, `review_comments`: Review phase results
- `worktree_cleaned`: Boolean indicating cleanup status
- `completed_at`: ISO timestamp when workflow finished
- `workflow_status`: Overall status (`in_progress`, `success`, `failed`)

### State File Lifecycle

**1. Initialization** (Phase 2: Worktree Setup)
```typescript
// After worktree creation, before first phase agent
const initialState = {
  adw_id: generateAdwId(issueNumber),
  issue_number: issueNumber,
  issue_title: issueMetadata.title,
  issue_type: extractType(issueMetadata),
  worktree_name: branchName,
  worktree_path: `trees/${branchName}`,
  branch_name: branchName,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  phase_status: {
    plan: "pending",
    build: "pending",
    pr: "pending",
    review: "pending"
  },
  checkpoints: []
};

writeStateFile(adwId, initialState);
```

**2. Phase Execution Updates** (before/after each subagent invocation)
```typescript
// Before invoking subagent
state.phase_status.plan = "in_progress";
state.updated_at = new Date().toISOString();
writeStateFile(adwId, state);

// After subagent completes successfully
state.phase_status.plan = "completed";
state.plan_file = extractPlanFilePath(subagentOutput);
state.checkpoints.push({
  timestamp: new Date().toISOString(),
  phase: "plan",
  status: "completed",
  artifacts: { plan_file: state.plan_file },
  next_action: "spawn_build_agent"
});
state.updated_at = new Date().toISOString();
writeStateFile(adwId, state);
```

**3. Error Capture** (on subagent failure)
```typescript
// If subagent fails
state.phase_status.build = "failed";
state.checkpoints.push({
  timestamp: new Date().toISOString(),
  phase: "build",
  status: "failed",
  artifacts: {
    error_message: result.stderr,
    exit_code: result.returncode
  },
  next_action: "manual_recovery_required"
});
state.updated_at = new Date().toISOString();
writeStateFile(adwId, state);
```

**4. Resume from Checkpoint** (--resume flag)
```typescript
// Load existing state
const state = readStateFile(adwId);

// Identify last completed phase
const lastCheckpoint = state.checkpoints[state.checkpoints.length - 1];
console.log(`Resuming from: ${lastCheckpoint.next_action}`);

// Skip completed phases, resume from next pending
if (state.phase_status.plan === "completed" && state.phase_status.build === "pending") {
  // Resume from build phase
  invokeBuildAgent(state.plan_file);
}
```

### Context Passing Between Phases

**Orchestrator → Subagent** (via state file):
- Subagents can optionally read state file for context (not required)
- Most subagents receive necessary context via command arguments
- State file acts as "contract" for orchestrator coordination, not subagent input

**Subagent → Orchestrator** (via output parsing):
- Orchestrator parses subagent stdout to extract artifacts (plan file paths, PR URLs)
- Orchestrator updates state file with parsed results
- See "Phase Output Extraction" section below for parsing strategies

**Example: Build Phase Context Flow**
```typescript
// Orchestrator reads plan file path from state (written by plan phase)
const planFile = state.plan_file;

// Orchestrator passes plan file to build agent via argument
SlashCommand({ command: `/implement ${planFile}` });

// Build agent reads plan file directly (not from state file)
// Build agent produces validation results in stdout

// Orchestrator parses validation results from stdout
const validation = parseValidationResults(buildOutput);

// Orchestrator updates state with validation data
state.validation = validation;
state.phase_status.build = "completed";
writeStateFile(adwId, state);
```

### State File Best Practices

**Atomic Writes**:
```python
import json
import tempfile
import os

def write_state_file(adw_id: str, state: dict):
    state_dir = f"automation/agents/{adw_id}/orchestrator"
    os.makedirs(state_dir, exist_ok=True)

    # Write to temporary file first
    temp_fd, temp_path = tempfile.mkstemp(dir=state_dir, suffix=".json")
    with os.fdopen(temp_fd, 'w') as f:
        json.dump(state, f, indent=2)

    # Atomic rename to final path
    final_path = os.path.join(state_dir, "state.json")
    os.rename(temp_path, final_path)
```

**State Validation**:
```python
from pydantic import BaseModel, Field
from typing import Literal, Optional

class OrchestratorState(BaseModel):
    adw_id: str
    issue_number: str
    issue_type: Literal["feat", "bug", "chore"]
    phase_status: dict[str, Literal["pending", "in_progress", "completed", "failed"]]
    checkpoints: list[dict]
    # ... other fields

    @classmethod
    def load(cls, adw_id: str):
        with open(f"automation/agents/{adw_id}/orchestrator/state.json") as f:
            return cls.parse_obj(json.load(f))
```

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

**Primary Source: Beads** (local SQLite database, sub-50ms queries)
```typescript
// Try beads MCP tools first (Phase 2 integration)
const beadsIssue = mcp__plugin_beads_beads__show({
  issue_id: `kota-db-ts-${issueNumber}`,  // Map GitHub issue to beads ID
  workspace_root: "."
});

if (beadsIssue) {
  // Beads provides full metadata including dependencies
  issueMetadata = {
    number: beadsIssue.external_ref,  // GitHub issue number
    title: beadsIssue.title,
    status: beadsIssue.status,  // open, in_progress, blocked, closed
    priority: beadsIssue.priority,  // 1-5
    type: beadsIssue.issue_type,  // bug, feature, task, chore, epic
    dependencies: beadsIssue.dependencies,  // Array of beads issue IDs
    dependents: beadsIssue.dependents,  // Array of beads issue IDs blocking on this
    labels: beadsIssue.labels,
    assignee: beadsIssue.assignee,
  };
}
```

**Fallback Source: GitHub API** (if beads unavailable or issue not synced)
```bash
gh issue view $1 --json number,title,labels,body,state
```

### Validate Issue State
- **Open Status**: Issue must be in "open" state (warn and require `--force` if closed)
- **Beads-Aware Validation**:
  - If beads available: Check `beadsIssue.status === "open"` or `"in_progress"`
  - If GitHub API: Check `issueMetadata.state === "OPEN"`
- **Label Requirements** (GitHub API fallback only):
  - Component: `component:api`, `component:auth`, `component:db`, `component:ci`, etc.
  - Priority: `priority:critical`, `priority:high`, `priority:medium`, `priority:low`
  - Effort: `effort:small`, `effort:medium`, `effort:large`
  - Status: `status:ready`, `status:in-progress`, `status:blocked`, etc.
- **Type Extraction**:
  - Beads: Use `beadsIssue.issue_type` directly
  - GitHub API: Look for labels (`type:feature`, `type:bug`, `type:chore`) or extract from title prefix
  - Map to slash command: `feat` → `/feat`, `bug` → `/bug`, `chore` → `/chore`

### Check Dependencies

**Primary: Beads Dependency Graph** (local, instant queries)
```typescript
if (beadsIssue && beadsIssue.dependencies.length > 0) {
  // Beads provides dependency status directly
  for (const depId of beadsIssue.dependencies) {
    const dep = mcp__plugin_beads_beads__show({ issue_id: depId, workspace_root: "." });
    if (dep && dep.status !== "closed") {
      // Error: dependency unresolved
      console.error(`Issue depends on unresolved ${depId} (${dep.title})`);
      requireForceFlag = true;
    }
  }
}
```

**Fallback: Parse Issue Body** (GitHub API)
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

### Atomic Work Claim (Beads Only)
After dependency validation passes, atomically claim the work to prevent concurrent agent conflicts:
```typescript
if (beadsIssue) {
  // Update status to in_progress (prevents other agents from claiming)
  const claimed = mcp__plugin_beads_beads__update({
    issue_id: beadsIssue.id,
    status: "in_progress",
    assignee: "claude",  // Or dynamic assignee
    workspace_root: "."
  });

  if (!claimed) {
    console.error("Failed to claim work atomically - another agent may be working on this");
    process.exit(1);
  }
}

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
- **Worktree Path**: `automation/trees/<worktree_name>` (relative to project root)

### Create Worktree
```bash
# Verify worktree doesn't already exist
git worktree list | grep <worktree_name>

# Create worktree from develop branch
git worktree add automation/trees/<worktree_name> -b <branch_name> develop
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
  "beads_issue_id": "kota-db-ts-187",
  "beads_sync": {
    "last_sync": "2025-10-20T14:00:00Z",
    "source": "beads",
    "beads_available": true
  },
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

## Phase Output Extraction

The orchestrator must parse phase agent output to extract key artifacts (plan file paths, PR URLs, validation results). This section documents parsing strategies for each phase with fallback mechanisms.

### General Parsing Principles

**Primary Strategy**: Parse structured output from agent stdout
**Fallback Strategy**: Use filesystem queries or GitHub API calls
**Error Strategy**: Prompt user for manual input or fail with clear recovery instructions

**Defensive Parsing**:
- Strip markdown formatting (code blocks, bold, headers)
- Handle both single-line and multi-line outputs
- Remove git status prefixes (`?? `, `M `, `A `)
- Validate extracted values before using them

### Plan Phase Output Parsing

**Expected Output**: Relative path to plan file (e.g., `docs/specs/feature-187-orchestrator-slash-command.md`)

**Primary Parsing Strategy**:
```typescript
function extractPlanFile(output: string): string | null {
  // Remove markdown code blocks
  let path = output.trim();

  // Extract from last code block if present (agents often show git output first)
  const codeBlocks = path.match(/```\s*([^\n`]+)\s*```/g);
  if (codeBlocks && codeBlocks.length > 0) {
    path = codeBlocks[codeBlocks.length - 1]
      .replace(/```/g, '')
      .trim();
  }

  // Strip git status prefixes
  path = path.replace(/^[?MAD!]{1,2}\s+/, '');

  // Validate path format
  if (!path.startsWith('docs/specs/') || !path.endsWith('.md')) {
    return null;
  }

  return path;
}
```

**Fallback Strategy 1**: Search for recently created files
```bash
# Find spec files created in last hour matching issue number
find docs/specs -name '*-<issue_number>-*.md' -mmin -60 -type f
```

**Fallback Strategy 2**: Parse git status for new files
```bash
git status --short docs/specs/ | grep '^??' | awk '{print $2}'
```

**Error Strategy**:
```
❌ Could not locate plan file from agent output.

Manual recovery:
1. List spec files: ls -t docs/specs/
2. Identify the plan file for issue #187
3. Resume with: /orchestrator --resume <adw_id> --plan-file <path>
```

### Build Phase Output Parsing

**Expected Output**: Bullet list with validation results

Example:
```
- Modified app/src/api/routes.ts: added rate limiting middleware (45 lines)
- Validation: Level 2 selected (feature with new endpoints)
- Commands executed: lint (pass), typecheck (pass), integration tests (pass, 133/133)
- git diff --stat: 4 files changed, 156 insertions(+), 12 deletions(-)
```

**Primary Parsing Strategy**:
```typescript
function parseValidationResults(output: string): ValidationResult {
  const result = {
    level: null,
    lint: 'unknown',
    typecheck: 'unknown',
    integration_tests: 'unknown',
    evidence: ''
  };

  // Extract validation level
  const levelMatch = output.match(/Level\s+(\d)/i);
  if (levelMatch) result.level = parseInt(levelMatch[1]);

  // Extract command results
  if (output.match(/lint.*pass/i)) result.lint = 'pass';
  if (output.match(/lint.*fail/i)) result.lint = 'fail';

  if (output.match(/typecheck.*pass/i)) result.typecheck = 'pass';
  if (output.match(/typecheck.*fail/i)) result.typecheck = 'fail';

  // Extract test counts
  const testMatch = output.match(/(\d+)\/(\d+)\s+tests?/i);
  if (testMatch) {
    result.integration_tests = `${testMatch[1]}/${testMatch[2]}`;
  }

  // Extract evidence mention
  if (output.match(/Supabase.*real/i)) {
    result.evidence = 'Supabase integration tests hit real database';
  }

  return result;
}
```

**Fallback Strategy**: Check exit code and git status
```typescript
// If parsing fails but agent succeeded, infer from context
if (agentExitCode === 0 && gitStatusClean()) {
  result.lint = 'pass';
  result.typecheck = 'pass';
  // Assume basic validation passed
}
```

**Error Strategy**:
```
❌ Validation results could not be extracted from implementation output.

Manual recovery:
1. Check worktree validation status: cd trees/<worktree> && git status
2. Rerun validation: cd trees/<worktree>/app && bun run lint && bunx tsc --noEmit
3. If validation passes, resume: /orchestrator --resume <adw_id>
4. If validation fails, fix issues in worktree and rerun /implement
```

### PR Creation Phase Output Parsing

**Expected Output**: GitHub PR URL (e.g., `https://github.com/user/kota-db-ts/pull/123`)

**Primary Parsing Strategy**:
```typescript
function extractPRInfo(output: string): { number: string; url: string } | null {
  // Match GitHub PR URL pattern
  const urlMatch = output.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);

  if (urlMatch) {
    return {
      number: urlMatch[3],
      url: urlMatch[0]
    };
  }

  return null;
}
```

**Fallback Strategy 1**: Query GitHub API for recent PRs on branch
```bash
# Find PR by branch name
gh pr list --head <branch_name> --json number,url --limit 1
```

**Fallback Strategy 2**: Check git remote for recent pushes
```bash
# Get commit SHA from recent push
git rev-parse HEAD

# Search for PR containing this commit
gh pr list --search "<commit_sha>" --json number,url
```

**Error Strategy**:
```
❌ PR URL could not be extracted from output.

Manual recovery:
1. Check if PR was created: gh pr list --head <branch_name>
2. If PR exists, extract number and resume: /orchestrator --resume <adw_id> --pr-number <num>
3. If no PR, create manually: gh pr create --base develop --title "..." --body "..."
4. Then resume with PR number: /orchestrator --resume <adw_id> --pr-number <num>
```

### Review Phase Output Parsing

**Expected Output**: Human-readable review summary with status

Example:
```
- Review decision: Approved
- Comments posted: 2 minor suggestions
- Validation: All checks passed
- Review URL: https://github.com/user/kota-db-ts/pull/123#pullrequestreview-456789
```

**Primary Parsing Strategy**:
```typescript
function parseReviewResults(output: string): ReviewResult {
  const result = {
    status: 'unknown',
    comments: 0,
    review_url: null
  };

  // Extract review decision
  if (output.match(/approved/i)) result.status = 'approved';
  if (output.match(/request.*changes/i)) result.status = 'changes_requested';
  if (output.match(/comment/i) && !result.status !== 'unknown') result.status = 'commented';

  // Extract comment count
  const commentMatch = output.match(/(\d+)\s+(comment|suggestion)/i);
  if (commentMatch) result.comments = parseInt(commentMatch[1]);

  // Extract review URL
  const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+pullrequestreview-\d+/);
  if (urlMatch) result.review_url = urlMatch[0];

  return result;
}
```

**Fallback Strategy**: Query GitHub API for PR reviews
```bash
gh pr view <pr_number> --json reviews | jq -r '.reviews[-1] | {state, body}'
```

**Error Strategy**:
```
❌ Review results could not be parsed from output.

Manual recovery:
1. Check PR review status: gh pr view <pr_number>
2. If review was posted, mark phase complete: /orchestrator --resume <adw_id>
3. If review failed, post manually: gh pr review <pr_number> --comment
4. Then resume: /orchestrator --resume <adw_id>
```

### Parsing Error Handling

**Graceful Degradation**:
- Partial parse: Use extracted data, mark missing fields as "unknown"
- No parse: Fall back to filesystem/API queries
- Complete failure: Preserve checkpoint, provide recovery instructions

**Logging for Debugging**:
```python
logger.debug(f"Raw agent output: {agent_output}")
logger.debug(f"Parsed result: {parsed_result}")
if parsed_result is None:
    logger.warning(f"Parsing failed for phase: {phase_name}")
    logger.warning(f"Falling back to: {fallback_strategy}")
```

**User Feedback**:
```
⚠️  Could not automatically extract plan file path.
Attempting fallback: searching for recently created spec files...

✅ Found via fallback: docs/specs/feature-187-orchestrator-slash-command.md
Continuing with build phase...
```

## Subagent Error Recovery

The orchestrator implements a checkpoint-based recovery system to enable resume-after-failure workflows. This section documents checkpoint structure, resume logic, and common failure scenarios.

### Checkpoint System

Checkpoints are saved after each phase completion to enable recovery:
- **Location**: `automation/agents/<adw_id>/orchestrator/state.json`
- **Format**: JSON with timestamp, phase, status, artifacts, next_action
- **Persistence**: Atomic writes with error handling (see State File Integration section)

**Checkpoint Structure**:
```json
{
  "timestamp": "2025-10-20T14:05:00Z",
  "phase": "plan",
  "status": "completed",
  "artifacts": {
    "plan_file": "docs/specs/feature-187-orchestrator-slash-command.md"
  },
  "next_action": "spawn_build_agent"
}
```

**When Checkpoints Are Saved**:
1. After each phase completes successfully
2. When a phase fails (with error details in artifacts)
3. Before and after long-running operations (optional for progress tracking)

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
- Check that dependencies from previous phases are still valid

**Example Resume Flow**:
```typescript
function resumeOrchestrator(adwId: string) {
  // 1. Load state
  const state = readStateFile(adwId);

  // 2. Validate prerequisites
  if (!worktreeExists(state.worktree_name)) {
    throw new Error(`Worktree ${state.worktree_name} no longer exists. Cannot resume.`);
  }

  // 3. Identify resume point
  const lastCheckpoint = state.checkpoints[state.checkpoints.length - 1];
  console.log(`Last completed phase: ${lastCheckpoint.phase}`);
  console.log(`Next action: ${lastCheckpoint.next_action}`);

  // 4. Resume from appropriate phase
  if (state.phase_status.plan === "completed" && state.phase_status.build === "pending") {
    console.log("Resuming from build phase...");
    invokeBuildAgent(state.plan_file);
  } else if (state.phase_status.build === "completed" && state.phase_status.pr === "pending") {
    console.log("Resuming from PR creation phase...");
    invokePRAgent(state);
  } else if (state.phase_status.pr === "completed" && state.phase_status.review === "pending") {
    console.log("Resuming from review phase...");
    invokeReviewAgent(state.pr_number);
  } else {
    throw new Error("Cannot determine resume point from state file");
  }
}
```

### Common Failure Scenarios

**Scenario 1: Planning Agent Fails**

**Symptoms**:
- Planning command exits with non-zero code
- No plan file created in `docs/specs/`
- Agent output contains error messages

**Checkpoint State**:
```json
{
  "phase_status": {
    "plan": "failed",
    "build": "pending",
    "pr": "pending",
    "review": "pending"
  },
  "checkpoints": [
    {
      "timestamp": "2025-10-20T14:05:00Z",
      "phase": "plan",
      "status": "failed",
      "artifacts": {
        "error_message": "Failed to fetch issue metadata from GitHub API",
        "exit_code": 1
      },
      "next_action": "manual_recovery_required"
    }
  ]
}
```

**Preservation**:
- Worktree remains intact for inspection
- State file preserved with error details

**Recovery Steps**:
1. Investigate error: `cat automation/agents/<adw_id>/orchestrator/state.json`
2. Fix root cause (e.g., GitHub API credentials, network issues)
3. Manually create plan if needed: `cd trees/<worktree> && claude /feat <issue>`
4. Update state file to mark plan as completed (if manual plan created)
5. Resume: `/orchestrator --resume <adw_id>`

**Scenario 2: Validation Fails During Build**

**Symptoms**:
- Implementation agent completes but validation commands fail
- Tests fail with compilation errors or test failures
- Lint or typecheck commands exit with non-zero code

**Checkpoint State**:
```json
{
  "phase_status": {
    "plan": "completed",
    "build": "failed",
    "pr": "pending",
    "review": "pending"
  },
  "checkpoints": [
    {
      "timestamp": "2025-10-20T14:30:00Z",
      "phase": "build",
      "status": "failed",
      "artifacts": {
        "validation_level": 2,
        "lint": "fail",
        "typecheck": "fail",
        "error_summary": "3 TypeScript errors in app/src/api/routes.ts"
      },
      "next_action": "fix_validation_errors"
    }
  ]
}
```

**Preservation**:
- Worktree + commits remain for debugging
- Implementation code preserved in worktree
- Validation command output logged for analysis

**Recovery Steps**:
1. Navigate to worktree: `cd trees/<worktree>`
2. Review validation errors: Check agent output or rerun validation commands
3. Fix errors in worktree files
4. Rerun validation: `cd app && bun run lint && bunx tsc --noEmit`
5. Once validation passes, resume: `/orchestrator --resume <adw_id>`

**Alternative**: If errors are extensive, rerun implementation:
```bash
cd trees/<worktree>
claude /implement docs/specs/<plan_file>
```

**Scenario 3: PR Creation Fails**

**Symptoms**:
- Git push succeeds but `gh pr create` fails
- PR creation times out or returns API error
- PR URL not extracted from output

**Checkpoint State**:
```json
{
  "phase_status": {
    "plan": "completed",
    "build": "completed",
    "pr": "failed",
    "review": "pending"
  },
  "checkpoints": [
    {
      "timestamp": "2025-10-20T14:35:00Z",
      "phase": "pr",
      "status": "failed",
      "artifacts": {
        "error_message": "GitHub API rate limit exceeded",
        "branch_pushed": true
      },
      "next_action": "retry_pr_creation_or_manual"
    }
  ]
}
```

**Preservation**:
- Worktree + branch remain
- Branch is pushed to remote (commits safe)

**Recovery Steps**:
1. Check if PR was actually created: `gh pr list --head <branch_name>`
2. If PR exists, extract number and update state:
   ```bash
   pr_number=$(gh pr list --head <branch_name> --json number --jq '.[0].number')
   # Manually edit state.json to add pr_number and pr_url
   ```
3. If no PR, create manually:
   ```bash
   cd trees/<worktree>
   gh pr create --base develop --title "<title>" --body "<body>"
   ```
4. Resume: `/orchestrator --resume <adw_id>`

**Scenario 4: Review Agent Fails**

**Symptoms**:
- Review command exits with error
- Review comment not posted to PR
- PR review API returns error

**Checkpoint State**:
```json
{
  "phase_status": {
    "plan": "completed",
    "build": "completed",
    "pr": "completed",
    "review": "failed"
  },
  "checkpoints": [
    {
      "timestamp": "2025-10-20T14:40:00Z",
      "phase": "review",
      "status": "failed",
      "artifacts": {
        "error_message": "Failed to post review comment",
        "pr_number": "123"
      },
      "next_action": "retry_review_or_skip"
    }
  ]
}
```

**Preservation**:
- Worktree + PR exist
- All implementation work is complete and pushed

**Recovery Steps**:
1. Check PR status: `gh pr view <pr_number>`
2. If review is optional, skip and complete workflow:
   ```bash
   # Manually mark review as completed in state.json
   # Or skip review and proceed to cleanup
   ```
3. If review is required, post manually:
   ```bash
   gh pr review <pr_number> --comment --body "Automated review pending manual inspection"
   ```
4. Resume: `/orchestrator --resume <adw_id>` (will skip to cleanup)

### Error Recovery Best Practices

**Always Preserve Context**:
- Save checkpoint before attempting risky operations
- Include actionable error messages in checkpoint artifacts
- Log full agent stdout/stderr for debugging

**Provide Clear Recovery Instructions**:
- Checkpoint `next_action` field should indicate recovery path
- State file should include all info needed for manual recovery
- Error messages should reference specific commands to run

**Enable Partial Resume**:
- Support resuming from any phase, not just failed phase
- Allow manual override of phase status via flags
- Validate prerequisites before resuming each phase

**Example Error Recovery Flags**:
```bash
# Resume from specific phase (skip completed phases)
/orchestrator --resume <adw_id> --from build

# Override phase status (mark as completed manually)
/orchestrator --resume <adw_id> --mark-complete plan

# Provide missing artifacts manually
/orchestrator --resume <adw_id> --plan-file docs/specs/custom-plan.md
/orchestrator --resume <adw_id> --pr-number 123
```

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
