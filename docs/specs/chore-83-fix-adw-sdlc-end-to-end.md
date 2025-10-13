# Chore Plan: Fix ADW SDLC End-to-End Workflow Execution

## Context

The `adw_sdlc.py` orchestrator chains together multiple phase scripts (plan → build → test → review → document) to automate the full SDLC workflow for GitHub issues. However, the end-to-end execution currently fails to complete successfully, preventing PRs from being automatically opened.

Recent fixes (#81, #82) addressed worktree branch isolation issues, but the workflow still encounters failures during execution. The current failure point is during the plan phase commit step, where git operations fail despite files being created and staged in the worktree.

**Critical Issue**: The plan file is created by the agent in the worktree directory, appears to be staged via `git add`, but `git status --porcelain` returns empty output before the commit attempt, causing a "No changes to commit in worktree" error.

**Why This Matters Now**: This is a high-priority blocker for the ADW automation pipeline. Without reliable end-to-end execution, the entire workflow cannot function, preventing automated PR creation for any issue type.

**Constraints**:
- Must preserve root branch isolation (root repository branch must remain unchanged)
- Must support concurrent workflow execution without conflicts
- Must maintain worktree isolation architecture
- Changes must be backward compatible with existing phase scripts

## Relevant Files

### Core Workflow Files
- `automation/adws/adw_sdlc.py` — Orchestrator that chains all phases together
- `automation/adws/adw_phases/adw_plan.py` — Plan phase (current failure point at line 204-214)
- `automation/adws/adw_modules/orchestrators.py` — Phase execution runner
- `automation/adws/adw_modules/git_ops.py` — Git operations (commit_all, has_changes, verify_file_in_index)
- `automation/adws/adw_modules/agent.py` — Claude CLI wrapper (get_claude_env, prompt execution)

### Supporting Files
- `automation/adws/adw_modules/workflow_ops.py` — Workflow utilities (state management, file location)
- `automation/adws/adw_modules/utils.py` — Common utilities (path resolution, environment loading)
- `.claude/commands/issues/chore.md` — Chore issue template used by plan phase
- `automation/adws/README.md` — ADW architecture documentation

### New Files
- `automation/adws/adw_tests/test_worktree_git_ops.py` — Integration test for worktree git operations
- `automation/adws/adw_tests/test_sdlc_e2e.py` — End-to-end validation test

## Work Items

### Preparation
1. **Environment Setup**
   - Ensure clean working directory (no uncommitted changes in root)
   - Verify `.env` has required variables: `ANTHROPIC_API_KEY`, `CLAUDE_CODE_PATH`, `GITHUB_PAT`
   - Backup current worktrees directory if any exist: `cp -r trees trees.backup` (if exists)

2. **Create Test Issue** (optional for isolated testing)
   - Create a minimal test issue or use existing issue #66 for validation
   - Label appropriately for chore workflow testing

### Execution

#### Phase 1: Diagnostic Investigation
1. **Add verbose git diagnostics to plan phase**
   - Enhance logging in `adw_plan.py` around lines 168-214
   - Log full file paths (both relative and absolute) before staging
   - Log `git status` output after agent execution, after staging, and before commit
   - Log git environment variables in agent execution context

2. **Create worktree git operations test**
   - Write integration test in `automation/adws/adw_tests/test_worktree_git_ops.py`
   - Test file creation → staging → commit cycle in worktree context
   - Verify `cwd` parameter is respected in all git operations
   - Validate that `has_changes()` and `verify_file_in_index()` work correctly in worktrees

3. **Run diagnostic execution**
   - Execute: `uv run adws/adw_phases/adw_plan.py 66` (or test issue number)
   - Analyze verbose output to identify root cause
   - Check if issue is path-related, environment-related, or git state-related

#### Phase 2: Root Cause Fix
Based on diagnostic findings, apply targeted fix:

**Hypothesis 1: Path resolution mismatch** (agent uses absolute paths, git expects relative)
   - Fix: Ensure agent Write tool calls use worktree-relative paths
   - Update: `adw_modules/workflow_ops.py` `locate_plan_file()` to normalize paths
   - Validate: File paths in git index match file paths from agent

**Hypothesis 2: Git environment interference** (GIT_DIR/GIT_WORK_TREE issues despite cleanup)
   - Fix: Verify `agent.py` lines 94-102 correctly avoids setting git env vars for worktrees
   - Validate: `subprocess.run()` calls in `git_ops.py` use `cwd` parameter consistently
   - Test: Git operations work identically inside and outside worktrees

**Hypothesis 3: Agent staging race condition** (file not fully written before staging)
   - Fix: Add explicit file sync/flush after agent execution in `adw_plan.py`
   - Add delay or verification loop after plan file creation
   - Validate: File is fully written to disk before git operations

**Hypothesis 4: Git index state corruption** (worktree git state becomes inconsistent)
   - Fix: Add `git reset --mixed HEAD` or `git status` refresh before staging
   - Clear git index cache before staging operations
   - Validate: `git status --porcelain` returns expected output after staging

#### Phase 3: Validation & Testing
1. **Phase isolation tests**
   ```bash
   # Test plan phase in isolation
   uv run adws/adw_phases/adw_plan.py 66

   # Manually verify worktree state
   cd trees/<worktree-name>
   git status
   git log
   git branch
   cd ../..
   ```

2. **End-to-end test**
   ```bash
   # Capture root branch
   ROOT_BRANCH=$(git branch --show-current)

   # Run full workflow
   uv run adws/adw_sdlc.py 66

   # Verify root branch unchanged
   [ "$(git branch --show-current)" == "$ROOT_BRANCH" ] && echo "✅ Root isolated" || echo "❌ Branch switched"

   # Verify PR created
   gh pr list --head chore-66-* --state open
   ```

3. **Create automated test suite**
   - Write `automation/adws/adw_tests/test_sdlc_e2e.py`
   - Mock GitHub API calls or use test repository
   - Validate full workflow completes without errors
   - Assert worktree cleanup occurs (if enabled)

### Follow-up
1. **Documentation updates**
   - Update `automation/adws/README.md` with troubleshooting section
   - Document common failure modes and diagnostic steps
   - Add worktree git operations best practices

2. **Error message improvements**
   - Enhance error messages in `git_ops.py` to include diagnostic info
   - Add suggestions for common failures (e.g., "Check file paths are relative")
   - Include git state dump in error logs for debugging

3. **Monitoring & observability**
   - Add success/failure metrics logging to orchestrator
   - Log execution duration for each phase
   - Add phase boundary validation (state file exists, required fields present)

## Step by Step Tasks

### Diagnostic Phase
1. Add verbose logging to `adw_plan.py` lines 168-214:
   - Log absolute and relative file paths for plan file
   - Log `git status --porcelain` after agent execution
   - Log `git ls-files` output for plan file verification
   - Log environment variables passed to agent

2. Create worktree git operations test file:
   - Create `automation/adws/adw_tests/test_worktree_git_ops.py`
   - Test file creation, staging, and commit in worktree context
   - Validate `has_changes()` returns True after file creation
   - Validate `verify_file_in_index()` returns True after staging

3. Run diagnostic plan phase execution:
   - Execute: `uv run adws/adw_phases/adw_plan.py 66`
   - Analyze output logs to identify root cause
   - Document findings in issue comments

### Fix Implementation Phase
4. Implement root cause fix based on diagnostic findings:
   - Apply targeted fix to identified component (path resolution, env vars, staging, or git state)
   - Add inline comments explaining the fix
   - Ensure fix is minimal and focused on root cause

5. Update error handling and diagnostics:
   - Improve error messages in `git_ops.py` `commit_all()` function
   - Add pre-commit validation that checks `has_changes()` returns True
   - Include git state dump in error logs

6. Add phase boundary validation to orchestrator:
   - Update `adw_modules/orchestrators.py` to validate state between phases
   - Check state file exists and has required fields before executing next phase
   - Log clear errors if prerequisites missing

### Testing & Validation Phase
7. Run worktree git operations test:
   - Execute: `cd automation && uv run pytest adws/adw_tests/test_worktree_git_ops.py -v`
   - Verify all git operations work in worktree context
   - Fix any test failures

8. Test plan phase in isolation:
   - Execute: `uv run adws/adw_phases/adw_plan.py 66`
   - Verify plan file created and committed successfully
   - Verify branch pushed to remote
   - Verify PR created

9. Run full end-to-end workflow:
   - Capture root branch: `ROOT_BRANCH=$(git branch --show-current)`
   - Execute: `uv run adws/adw_sdlc.py 66`
   - Verify all phases complete successfully
   - Verify PR created and ready for review
   - Verify root branch unchanged: `git branch --show-current`

10. Create end-to-end test suite:
    - Create `automation/adws/adw_tests/test_sdlc_e2e.py`
    - Mock GitHub API or use test fixtures
    - Test full workflow from classification through PR creation
    - Add to CI if feasible

### Documentation & Cleanup Phase
11. Update ADW README with troubleshooting section:
    - Document common failure modes
    - Add diagnostic commands for debugging
    - Include worktree best practices

12. Clean up temporary worktrees and test branches:
    - Remove any test worktrees: `git worktree prune`
    - Delete test branches: `git branch -D chore-66-* chore-83-*` (if test branches exist)
    - Verify clean state: `git worktree list`

13. Stage and commit all changes:
    - Review changes: `git status`
    - Stage changes: `git add automation/adws/ docs/specs/`
    - Verify no unintended changes included

14. Push branch and create PR:
    - Push branch: `git push -u origin <branch-name>`
    - Run: `/pull_request <branch> <issue_json> docs/specs/chore-83-fix-adw-sdlc-end-to-end.md <adw_id>`

## Risks

### Risk: Fix addresses symptom but not root cause
**Impact**: Workflow failures continue under different conditions
**Mitigation**: Comprehensive diagnostic logging before implementing fix; create integration tests that validate git operations in worktree context

### Risk: Changes break concurrent workflow execution
**Impact**: Multiple workflows running simultaneously interfere with each other
**Mitigation**: Test concurrent execution explicitly; ensure worktree isolation is preserved; validate state file locking if needed

### Risk: Root branch gets switched during debugging
**Impact**: Development work gets committed to worktree branches
**Mitigation**: Always verify current branch before and after workflow execution; add branch guards to prevent commits outside worktrees

### Risk: Agent path handling differs between local and worktree contexts
**Impact**: Fix works in worktrees but breaks non-worktree workflows
**Mitigation**: Maintain backward compatibility; test both worktree and non-worktree execution paths

### Risk: Git environment variables from shell interfere with worktree isolation
**Impact**: User's local git config or environment affects workflow behavior
**Mitigation**: Document required environment state; consider explicit environment cleanup in agent execution

## Validation Commands

### Pre-fix Validation
```bash
# Verify clean state
git status
git worktree list

# Verify environment
echo $ANTHROPIC_API_KEY | wc -c  # Should be >0
which claude  # Or $CLAUDE_CODE_PATH
gh auth status
```

### Post-fix Validation
```bash
# Unit tests
cd automation
uv run pytest adws/adw_tests/test_worktree_git_ops.py -v

# Integration tests
uv run pytest adws/adw_tests/test_sdlc_e2e.py -v

# Manual phase test
ROOT_BRANCH=$(git branch --show-current)
uv run adws/adw_phases/adw_plan.py 66
[ "$(git branch --show-current)" == "$ROOT_BRANCH" ] && echo "✅ Root isolated" || echo "❌ Branch switched"

# Full workflow test
ROOT_BRANCH=$(git branch --show-current)
uv run adws/adw_sdlc.py 66
[ "$(git branch --show-current)" == "$ROOT_BRANCH" ] && echo "✅ Root isolated" || echo "❌ Branch switched"
gh pr list --head chore-66-* --state open

# Verify worktree cleanup
ls trees/  # Should be empty if ADW_CLEANUP_WORKTREES=true and PR created
git worktree list  # Should only show main worktree

# Python linting (from automation directory)
cd automation && uv run ruff check adws/
cd automation && uv run mypy adws/ --ignore-missing-imports
```

### Supplemental Checks (Medium Impact)
```bash
# Application layer validation (ensure automation changes don't break app)
cd app && bun run test
cd app && bunx tsc --noEmit

# Documentation consistency
grep -r "adw_sdlc" automation/adws/README.md  # Should reference updated behavior
```

## Deliverables

1. **Code Changes**
   - Fixed git operations in worktree context (likely in `git_ops.py` or `adw_plan.py`)
   - Enhanced logging and error messages for diagnostics
   - Phase boundary validation in orchestrator

2. **Test Suite**
   - Worktree git operations integration test (`test_worktree_git_ops.py`)
   - End-to-end workflow test (`test_sdlc_e2e.py`)
   - Validation commands documented in README

3. **Documentation Updates**
   - Troubleshooting section in `automation/adws/README.md`
   - Worktree best practices documented
   - Common failure modes and diagnostic steps

4. **Pull Request**
   - All changes committed and pushed to feature branch
   - PR created via `/pull_request` command
   - PR title: `chore: validate and fix adw_sdlc.py end-to-end workflow execution (#83)`
