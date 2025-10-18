# Chore Plan: Fix ADW Workflow Reliability

## Context

The `adw_sdlc.py` automation pipeline is failing during git commit operations despite having worktree isolation and CWD parameters implemented. The issue manifests as "Plan commit failed: git commit failed" with no stderr output, preventing autonomous PR creation from issue numbers.

**Root Cause Analysis:**
1. **Agent file path confusion**: Claude Code agents receive absolute worktree paths as CWD, but may generate absolute file paths in tool calls, causing git staging mismatches
2. **Silent commit failures**: Git commit errors return empty stderr when no changes are staged, masking the real issue
3. **Incomplete error propagation**: Agent errors don't surface file creation vs git operation failures clearly
4. **Missing validation**: No pre-commit checks verify files were actually created in the worktree and tracked by git

**Why now:** This blocks all automated workflows. The partial fix in commit 0591519 added CWD parameters but didn't address file path handling in agent outputs.

**Constraints:** Must maintain worktree isolation, preserve all existing functionality, and ensure reliable autonomous operation from issue # → PR.

## Relevant Files

### Modified Files
- `automation/adws/adw_modules/agent.py` — Claude CLI wrapper, needs to enforce relative paths in agent context
- `automation/adws/adw_modules/git_ops.py` — Git operations, needs better error messages and pre-commit validation
- `automation/adws/adw_phases/adw_plan.py` — Planning phase, needs file existence validation before commit
- `automation/adws/adw_phases/adw_build.py` — Build phase, same validation needs
- `automation/adws/adw_phases/adw_test.py` — Test phase, same validation needs
- `automation/adws/adw_phases/adw_review.py` — Review phase, same validation needs
- `automation/adws/adw_phases/adw_document.py` — Documentation phase, same validation needs
- `.claude/commands/issues/chore.md` — Planning prompt, needs to instruct agents to use relative paths
- `.claude/commands/issues/feature.md` — Planning prompt, same instruction needed
- `.claude/commands/issues/bug.md` — Planning prompt, same instruction needed

### New Files
None. This is a pure bug fix with diagnostic improvements.

## Work Items

### Preparation
1. Verify current branch is `develop`
2. Create test worktree to reproduce the issue: `git worktree add automation/trees/test-fix develop`
3. Document current failure mode with minimal reproduction case

### Execution (ordered by dependency)

#### Phase 1: Improve Git Error Reporting
4. **git_ops.py enhancements**:
   - Update `commit()` to return detailed error when nothing to commit (currently returns empty stderr)
   - Add `has_changes()` helper function to check if working tree has modifications
   - Update `commit_all()` to check `has_changes()` before attempting commit
   - If no changes, return clear error: "No changes to commit in worktree"

#### Phase 2: Add Pre-Commit File Validation
5. **git_ops.py additions**:
   - Add `verify_file_in_index(file_path: str, cwd: Path | None)` function
   - Uses `git ls-files` to check if file is tracked
   - Returns `(bool, Optional[str])` tuple: (is_tracked, error_message)

6. **Phase script updates** (adw_plan.py, adw_build.py, etc.):
   - After agent creates plan/changes, verify file exists on disk
   - Call `git_ops.verify_file_in_index()` to confirm file is staged
   - If not staged, log detailed error with absolute path vs relative path info
   - Only attempt commit if files are verified

#### Phase 3: Agent Path Normalization
7. **Agent prompt updates** (chore.md, feature.md, bug.md):
   - Add CRITICAL instruction section at top of each prompt
   - Instruct agents: "You are running in a git worktree at {cwd}. ALL file paths in tool calls must be RELATIVE to this directory, never absolute paths."
   - Provide examples: ✅ `docs/specs/plan.md` ❌ `/full/path/to/worktree/docs/specs/plan.md`

8. **agent.py enhancements**:
   - Before executing Claude CLI, log CWD and verify it exists
   - After agent completes, scan output for any absolute paths containing worktree path
   - If found, log warning: "Agent used absolute paths - this may cause git staging issues"

#### Phase 4: Enhanced Logging
9. **workflow_ops.py logging improvements**:
   - `build_plan()`: Log "Plan generation complete, checking for created files..."
   - `locate_plan_file()`: Log full absolute path of plan file when found
   - `create_commit_message()`: Log "Preparing commit in worktree: {cwd}"

10. **Phase script logging**:
    - Before `git_ops.commit_all()`: Log `git status --porcelain` output
    - Log file existence check results (exists on disk? staged in git?)
    - After commit failure: Log full git status and ls-files output for debugging

#### Phase 5: Integration Testing
11. Create end-to-end test:
    - Manually create worktree: `git worktree add automation/trees/test-e2e develop`
    - Simulate agent file creation with absolute vs relative paths
    - Test git staging with both path types
    - Verify commit success/failure matches expectations
    - Document findings

12. Run full workflow test:
    - Pick a closed/resolved test issue (not #66)
    - Run `uv run adws/adw_sdlc.py <test-issue-number>`
    - Monitor logs for new diagnostic output
    - Verify worktree → commit → push → PR flow completes
    - If failures occur, use enhanced logging to identify exact failure point

### Follow-up
13. Update ADW documentation in `automation/adws/README.md`:
    - Document the relative path requirement for agents
    - Add troubleshooting section for "No changes to commit" errors
    - Include `git worktree` debugging commands

14. Create validation script `automation/adws/scripts/validate-worktree-setup.py`:
    - Checks worktree exists
    - Verifies CWD is set correctly
    - Tests file creation and git tracking
    - Can be run standalone to diagnose issues

## Step by Step Tasks

### Git Error Reporting Fix
- Edit `automation/adws/adw_modules/git_ops.py`:
  - Add `has_changes(cwd: Path | None = None) -> bool` function using `git status --porcelain`
  - Update `commit()` to check if `result.stderr` is empty and `returncode != 0`, return "No changes to commit"
  - Update `commit_all()` to call `has_changes()` first, return `(False, "No changes to commit in worktree")` if clean

### Pre-Commit Validation
- Edit `automation/adws/adw_modules/git_ops.py`:
  - Add `verify_file_in_index(file_path: str, cwd: Path | None = None) -> tuple[bool, Optional[str]]`
  - Implementation: `git ls-files --error-unmatch {file_path}` (relative path from cwd)
  - Return `(True, None)` if tracked, `(False, error_message)` if not

- Edit `automation/adws/adw_phases/adw_plan.py` (after line 167 where plan file existence is checked):
  - Add: `tracked, track_error = git_ops.verify_file_in_index(plan_file, cwd=worktree_path)`
  - If not tracked: Log error with plan_file path and track_error, call `git add {plan_file}` explicitly
  - Log: `git status --porcelain` output before commit attempt

- Repeat for `adw_build.py`, `adw_test.py`, `adw_review.py`, `adw_document.py` (same pattern)

### Agent Prompt Updates
- Edit `.claude/commands/issues/chore.md`, add at top after title:
  ```markdown
  **CRITICAL - Worktree Path Handling:**
  - You are executing in an isolated git worktree directory
  - Your CWD is the worktree root (e.g., `/project/automation/trees/chore-123-xyz`)
  - ALL file paths in Write, Edit, Read tools MUST be relative to CWD
  - ✅ Correct: `docs/specs/chore-123-plan.md`
  - ❌ Wrong: `/project/automation/trees/chore-123-xyz/docs/specs/chore-123-plan.md`
  - Using absolute paths will cause git staging failures and commit errors
  ```

- Repeat for `feature.md` and `bug.md` with appropriate examples

### Enhanced Logging
- Edit `automation/adws/adw_modules/workflow_ops.py`:
  - In `build_plan()` after line 203 (after execute_template): Add log "Plan generation complete, checking for created files..."
  - In `locate_plan_file()` after line 232: Add log f"Plan file located: {plan_path} (absolute: {worktree_path / plan_path})"
  - In `create_commit_message()` after line 276: Add log f"Preparing commit in worktree: {cwd}"

- Edit `automation/adws/adw_phases/adw_plan.py`:
  - Before line 184 (`commit_all` call): Add `git status --porcelain` log
  - After line 159 (plan file exists check): Add log f"Plan file exists on disk: {plan_file_full_path}"
  - Before line 184: Add explicit `git add {plan_file}` with error handling

### Testing & Validation
- Create test script `automation/adws/scripts/test-worktree-commit.sh`:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail

  WORKTREE_NAME="test-commit-$(date +%s)"
  WORKTREE_PATH="automation/trees/$WORKTREE_NAME"

  git worktree add "$WORKTREE_PATH" -b "$WORKTREE_NAME" develop
  cd "$WORKTREE_PATH"

  # Test relative path
  mkdir -p docs/specs
  echo "test" > docs/specs/test-plan.md
  git add docs/specs/test-plan.md
  git commit -m "test: relative path commit"

  # Test absolute path (should fail or require explicit add)
  ABSOLUTE_FILE="$PWD/docs/specs/test-plan-2.md"
  echo "test2" > "$ABSOLUTE_FILE"
  git add "$ABSOLUTE_FILE" 2>&1 || echo "Absolute path requires full path in git add"

  cd ../../../
  git worktree remove "$WORKTREE_PATH" --force
  git branch -D "$WORKTREE_NAME"
  ```

- Run test script and document behavior
- Run `uv run adws/adw_sdlc.py <test-issue-number>` with enhanced logging
- Capture logs and verify commit succeeds or fails with clear error messages

### Documentation & Deliverables
- Update `automation/adws/README.md` with new "Troubleshooting" section
- Create `automation/adws/scripts/validate-worktree-setup.py` diagnostic tool
- Document all findings in this plan's "Validation Results" section (added post-implementation)

## Risks

| Risk | Mitigation |
|------|------------|
| **Breaking existing workflows** | All changes are additive (new validation functions) or diagnostic (enhanced logging). No removal of existing functionality. |
| **False positive "no changes" errors** | `has_changes()` uses `git status --porcelain` which is reliable. Pre-commit file verification catches actual issues. |
| **Absolute vs relative path confusion** | Agent prompts explicitly instruct on relative paths. Post-execution scanning detects violations. Validation enforces correct behavior. |
| **Performance impact from extra git calls** | `verify_file_in_index()` and `has_changes()` are O(1) operations. Negligible overhead vs avoiding failed commits. |
| **Worktree-specific git behavior** | Tested worktree operations separately. Git behavior is identical in worktrees vs main repo for file tracking. |

## Validation Commands

**Git operations in worktree:**
```bash
# Create test worktree
git worktree add automation/trees/test-validation develop

# Test relative path commit
cd automation/trees/test-validation
mkdir -p docs/specs && echo "test" > docs/specs/test.md
git add docs/specs/test.md && git commit -m "test" && echo "SUCCESS" || echo "FAILED"

# Cleanup
cd ../../.. && git worktree remove automation/trees/test-validation --force
```

**Full ADW workflow:**
```bash
# Run planning phase only (faster iteration)
uv run adws/adw_phases/adw_plan.py <issue-number>

# Check for enhanced log output
tail -100 automation/logs/kota-db-ts/local/*/adw_plan/execution.log

# Full workflow test
uv run adws/adw_sdlc.py <issue-number>
```

**File tracking validation:**
```bash
# In worktree, check if file is tracked
cd automation/trees/<worktree-name>
git ls-files --error-unmatch docs/specs/plan.md && echo "TRACKED" || echo "NOT TRACKED"
```

**Diagnostic script:**
```bash
python3 automation/adws/scripts/validate-worktree-setup.py <worktree-name>
```

## Deliverables

1. **Code changes:**
   - Enhanced git error reporting in `git_ops.py` (3 functions modified/added)
   - Pre-commit file validation in all phase scripts (5 files)
   - Agent prompt updates for path handling (3 files)
   - Enhanced logging in `workflow_ops.py` and phase scripts (8 locations)

2. **Testing artifacts:**
   - Test script: `automation/adws/scripts/test-worktree-commit.sh`
   - Diagnostic tool: `automation/adws/scripts/validate-worktree-setup.py`
   - Test run logs demonstrating successful commit flow

3. **Documentation:**
   - Updated `automation/adws/README.md` with troubleshooting guide
   - This plan document with validation results appended
   - Inline code comments explaining path handling requirements

4. **Validation results:**
   - Successful commit in test worktree with relative paths
   - Failed commit with clear error message when absolute paths used
   - Full `adw_sdlc.py` run completing issue → PR flow
   - Log output showing diagnostic information at each failure point

## Next Steps (Post-Implementation)

1. Monitor first 3 automated workflow runs for new error patterns
2. Adjust validation thresholds if false positives occur
3. Consider adding pre-flight validation in `adw_sdlc.py` before starting workflow
4. Evaluate need for automatic path normalization (convert absolute → relative) vs current error-and-fix approach
