# Surgical Fix Workflow Usage Guide

Complete guide for using the surgical fix workflow to rapidly deploy critical bug fixes.

## Overview

The surgical fix workflow automates critical bug fixes from issue identification through auto-merge, optimized for:
- **Speed**: Time-to-merge < 15 minutes
- **Reliability**: Level 2+ validation, CI monitoring, review approval required
- **Autonomy**: Minimal human intervention with automated retry logic

## Prerequisites

### Issue Requirements

The issue must have:
1. **`bug` label**: Identifies issue as a bug
2. **Priority label**: `priority:critical` or `priority:high`
3. **Reproduction steps**: Section in issue body (see format below)

Example issue body:
```markdown
## Description
Critical authentication bypass in rate limiter.

## Reproduction Steps
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
curl -X GET http://localhost:3000/api/protected -H "Authorization: Bearer <token>"
```

## Expected Behavior
Rate limiter should block requests after 5 attempts.

## Actual Behavior
Rate limiter allows unlimited requests.
```

### Environment Setup

Required tools:
- `uv` (Python package manager)
- `git` (version control)
- `gh` (GitHub CLI, authenticated)
- `claude` (Claude Code CLI)

Environment variables:
- `SURGICAL_FIX_CLEANUP_WORKTREES`: Cleanup worktrees on completion (default: `true`)

## Usage

### Start New Workflow

```bash
cd automation
uv run adws/surgical_fix.py --issue 123
```

This will:
1. Fetch issue metadata from GitHub
2. Validate labels and extract reproduction steps
3. Create isolated worktree at `automation/trees/bug-123-fix`
4. Execute reproduction steps to confirm bug
5. Generate fix plan using `/bug 123` slash command
6. Implement fix using `/implement <plan_file>` slash command
7. Create PR with validation evidence
8. Monitor CI and attempt auto-merge

### Resume from Checkpoint

If the workflow fails mid-execution, resume using the surgical fix ID:

```bash
cd automation
uv run adws/surgical_fix.py --resume fix-123-20251029120000
```

The workflow will skip completed phases and resume from the last checkpoint.

### Dry-Run Validation

Validate preconditions without executing the workflow:

```bash
cd automation
uv run adws/surgical_fix.py --issue 123 --dry-run
```

This checks:
- Issue exists and has required labels
- Reproduction steps are present in issue body
- GitHub CLI is authenticated
- Claude Code CLI is available

### Skip Worktree Cleanup

Preserve worktree for debugging:

```bash
cd automation
uv run adws/surgical_fix.py --issue 123 --skip-cleanup
```

The worktree will remain at `automation/trees/bug-123-fix` after completion.

## Workflow Phases

### Phase 1: Bug Reproduction

**Purpose**: Validate bug existence before attempting fix.

**Actions**:
1. Extract reproduction steps from issue body (## Reproduction Steps section)
2. Create isolated worktree with branch `bug/<issue>-surgical-fix`
3. Execute reproduction commands with 60-second timeout per command
4. Capture stdout/stderr to `automation/agents/<surgical_fix_id>/logs/reproduction.log`
5. Save checkpoint on success

**Failure Modes**:
- No reproduction steps in issue body → Exit code 4 (blocker: missing spec)
- Reproduction timeout → Exit code 20 (execution: agent failed)
- Worktree creation failed → Exit code 30 (resource: git error)

### Phase 2: Plan Generation

**Purpose**: Generate targeted fix plan using existing slash commands.

**Actions**:
1. Spawn planning agent with `/bug <issue_number>` command
2. Extract plan file path from agent output (with fallback to filesystem glob)
3. Validate plan file contains "## Root Cause" and "## Fix Strategy" sections
4. Save checkpoint on success

**Failure Modes**:
- Planning agent timeout (5 minutes) → Exit code 20
- Plan file not found → Exit code 22 (execution: parse error)
- Invalid plan file → Exit code 4 (blocker: missing spec)

### Phase 3: Implementation

**Purpose**: Implement fix with Level 2+ validation.

**Actions**:
1. Spawn implementation agent with `/implement <plan_file>` command
2. Extract validation results (lint, typecheck, integration tests)
3. Require lint and typecheck to pass
4. Save checkpoint on success

**Failure Modes**:
- Implementation agent timeout (10 minutes) → Exit code 20
- Validation failures (lint/typecheck fail) → Exit code 20
- Parse error extracting validation → Exit code 22

### Phase 4: PR Creation

**Purpose**: Push branch and create pull request.

**Actions**:
1. Push branch to remote with `git push -u origin <branch>`
2. Spawn PR creation agent with `/pull_request` command
3. Extract PR number and URL from agent output (with fallback to `gh pr list`)
4. Save checkpoint on success

**Failure Modes**:
- Git push failed → Exit code 30 (resource: git error)
- PR creation timeout (5 minutes) → Exit code 20
- PR metadata extraction failed → Exit code 22

### Phase 5: CI Monitoring

**Purpose**: Monitor CI checks and wait for completion.

**Actions**:
1. Poll `gh pr checks <pr_number>` every 30 seconds
2. Wait up to 10 minutes for all checks to complete
3. Identify failing checks if any
4. Save checkpoint on success

**Failure Modes**:
- CI timeout (10 minutes) → Exit code 20
- CI checks failing → Exit code 20

### Phase 6: Auto-Merge

**Purpose**: Merge PR when eligible.

**Actions**:
1. Check auto-merge eligibility:
   - All CI checks passed (conclusion: SUCCESS)
   - Review approved (reviewDecision: APPROVED)
2. Attempt auto-merge with `gh pr merge --squash --auto`
3. Close linked issue with closing comment
4. Save checkpoint on success

**Failure Modes**:
- Not eligible (CI failing or review not approved) → Warning, exit 0
- Merge API error → Exit code 32 (resource: network error)

## State Management

Surgical fix state is persisted to `automation/agents/<surgical_fix_id>/surgical_fix_state.json`:

```json
{
  "surgical_fix_id": "fix-123-20251029120000",
  "issue_number": "123",
  "issue_title": "Critical auth bypass in rate limiter",
  "worktree_path": "/path/to/automation/trees/bug-123-fix",
  "branch_name": "bug/123-surgical-fix",
  "created_at": "2025-10-29T12:00:00Z",
  "phase_status": {
    "reproduction": "completed",
    "plan": "completed",
    "implementation": "in_progress"
  },
  "reproduction": {
    "steps_executed": ["curl -X POST /api/auth/login"],
    "evidence_files": ["/path/to/logs/reproduction.log"],
    "confirmed_at": "2025-10-29T12:05:00Z",
    "success": true
  },
  "plan_file": "docs/specs/bug-123-auth-bypass.md",
  "validation": {
    "level": 2,
    "lint": "pass",
    "typecheck": "pass",
    "integration_tests": "45/45"
  },
  "checkpoints": [
    {
      "timestamp": "2025-10-29T12:05:00Z",
      "step": "reproduction_complete"
    }
  ]
}
```

## Troubleshooting

### Issue Validation Failed

**Error**: `Error: Issue must have 'bug' label`

**Solution**: Add `bug` label and `priority:critical` or `priority:high` label to issue.

### Reproduction Steps Not Found

**Error**: `Error: No reproduction steps found in issue body`

**Solution**: Add ## Reproduction Steps section to issue body with bash commands.

### Planning Agent Timeout

**Error**: `Error: Planning agent timed out after 5 minutes`

**Solution**:
1. Check Claude Code CLI is responsive: `claude --version`
2. Increase timeout in `surgical_fix.py` if needed
3. Simplify issue description to reduce planning complexity

### Implementation Validation Failed

**Error**: `Error: Validation failed`

**Solution**:
1. Check validation logs in agent output
2. Ensure tests pass locally: `cd app && bun test`
3. Fix validation issues and resume: `uv run adws/surgical_fix.py --resume <fix_id>`

### CI Checks Failing

**Error**: `Error: CI checks failed: test-integration`

**Solution**:
1. Check CI logs on GitHub PR
2. Fix failing tests locally
3. Push fix to branch
4. Workflow will continue monitoring CI

### Auto-Merge Not Eligible

**Warning**: `Warning: PR not eligible for auto-merge: Review not approved`

**Solution**:
1. Approve PR review on GitHub
2. Workflow will attempt auto-merge once approved
3. Or manually merge PR

### Worktree Cleanup Failed

**Error**: `Failed to remove worktree: worktree is locked`

**Solution**:
1. Manually remove worktree: `git worktree remove automation/trees/bug-123-fix --force`
2. Clean up git references: `git worktree prune`

## Exit Codes

Surgical fix uses standardized exit codes from `adw_modules/exit_codes.py`:

**Success**:
- 0: Workflow completed successfully

**Blockers (1-9)**:
- 4: Plan/spec file not found
- 5: Invalid command-line arguments
- 7: Required resource unavailable (GitHub API, etc.)

**Execution Failures (20-29)**:
- 20: Agent execution failed
- 22: Failed to parse agent output

**Resource Failures (30-39)**:
- 30: Git operation failed
- 32: Network/API error

## Best Practices

### Issue Body Format

Use consistent format for reproduction steps:
```markdown
## Reproduction Steps
```bash
# Step 1: Setup
command1

# Step 2: Trigger bug
command2

# Step 3: Verify bug
command3
```
```

### Reproduction Commands

- Use absolute paths or cd to correct directory
- Include setup commands (start dev server, seed database)
- Keep commands idempotent (can run multiple times)
- Add timeouts for long-running commands
- Use curl with explicit error handling: `curl -f http://... || echo "Failed"`

### CI Monitoring

- Configure GitHub Actions to run on all PRs
- Use branch protection to require CI checks before merge
- Set reasonable timeouts (< 10 minutes for test suite)
- Enable auto-merge only for approved PRs

### Worktree Management

- Enable cleanup by default: `export SURGICAL_FIX_CLEANUP_WORKTREES=true`
- Use `--skip-cleanup` only for debugging
- Manually clean up old worktrees: `git worktree prune`

## Success Metrics

Track workflow effectiveness:

- **Time-to-merge**: Target < 15 minutes from workflow start to merge
- **CI auto-fix success rate**: Target > 70% (failures resolved automatically)
- **End-to-end success rate**: Target > 80% (workflow completes without manual recovery)
- **False-positive merges**: Target 0 (all merged fixes pass validation)

Metrics can be extracted from surgical fix state files:
```bash
# Calculate time-to-merge
cat automation/agents/fix-*/surgical_fix_state.json | \
  jq -r '[.created_at, .checkpoints[-1].timestamp] | @csv'

# Count successful workflows
ls automation/agents/fix-*/surgical_fix_state.json | \
  xargs -I {} jq -r '.phase_status.auto_merge' {} | \
  grep -c completed
```

## Related Documentation

- [ADW Architecture](./.claude/commands/workflows/adw-architecture.md) - Architecture overview
- [Exit Codes](./automation/adws/docs/exit-codes.md) - Exit code reference
- [Spec File](./docs/specs/feature-354-surgical-fix-workflow.md) - Feature specification
