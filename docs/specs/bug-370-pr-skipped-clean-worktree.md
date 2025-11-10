# Bug Plan: ADW Build Phase Skips PR Creation on Clean Worktree

## Bug Summary

- **Observed Behavior**: PRs are created prematurely (after plan commit, before implementation) or skipped entirely when worktree is clean
- **Expected Behavior**: Build phase should create PR after implementation is complete, when branch has diverged from base
- **Suspected Scope**:
  1. Logic error at `automation/adws/adw_phases/adw_build.py:199-218` conflates worktree cleanliness with branch readiness for PR
  2. `/implement` prompt (`.claude/commands/workflows/implement.md:60-61, 81`) instructs agents to push branch and create PR, conflicting with build phase's responsibility

## Root Cause Hypothesis

**Root Cause 1: Build Phase Logic Error** (`adw_build.py:199-218`)

The check at `adw_build.py:199` uses `git_ops.ensure_clean_worktree()` to determine whether to proceed with PR creation:

```python
has_changes = not git_ops.ensure_clean_worktree(cwd=worktree_path)

if not has_changes:
    logger.info("No changes detected...")
    # Exit early at line 218 - SKIPS PR CREATION!
    return
```

**Problem**: This conflates two distinct concepts:
1. **Worktree cleanliness**: "Does this worktree have uncommitted changes?" (what `ensure_clean_worktree()` checks)
2. **Branch divergence**: "Does this branch have work to PR?" (what should actually be checked)

**Evidence - ADW run `d70a13e5` for issue #215**:
- Branch `chore-215-d70a13e5` has 2 commits (`e845098`, `8048391`) with 760 lines changed (5 files)
- Worktree was clean (no uncommitted changes) after implementation
- Build phase detected clean worktree → exited early → no PR created
- Result: Valid implementation work was stranded without a PR

**Root Cause 2: Prompt Confusion** (`.claude/commands/workflows/implement.md`)

The `/implement` prompt instructs agents to push and create PR:
- Line 60: "Push the branch (`git push -u origin <branch>`)."
- Line 81: Example output shows "Created PR: https://github.com/user/repo/pull/123"

This conflicts with the architecture where **only `adw_build.py`** (lines 281-334) should create PRs.

**Evidence - PR #371**:
- Commit 1 (`1d52f70`): "chore: 215 - add plan spec for stale worktree cleanup" (only plan file)
- Commit 2 (`b68b586`): "chore: add automated cleanup for stale ADW worktrees" (actual implementation, 760 lines)
- PR title: "chore: add plan spec for stale worktree cleanup (#215)" (reflects first commit only)
- **Timeline**: PR created after plan commit, before implementation → PR title is wrong and workflow is broken

## Fix Strategy

**Fix 1: Build Phase Logic** - Replace worktree cleanliness check with branch divergence check

**Code Changes**:
1. Add `branch_differs_from_base(branch, base, cwd)` helper to `git_ops.py`
   - Uses `git rev-list --count <base>..<branch>` to count unique commits
   - Returns `True` if branch has diverged (has unique commits)
   - Returns `False` if branch is identical to base or behind base

2. Update `adw_build.py` early-exit logic (lines 199-218):
   - Check `state.pr_created` first (idempotency)
   - Check `branch_differs_from_base()` second (actual PR readiness)
   - Remove dependency on `ensure_clean_worktree()` for PR decision

**Fix 2: Prompt Clarification** - Remove PR creation instructions from `/implement`

**Prompt Changes**:
1. Update `.claude/commands/workflows/implement.md`:
   - **Remove** line 60: "Push the branch (`git push -u origin <branch>`)."
   - **Replace** with: "The build phase will commit your changes, push the branch, and create the PR."
   - **Remove** line 81 from example output: "Created PR: https://github.com/user/repo/pull/123"
   - **Add** clarification in "Final Steps" section (line 58):
     ```markdown
     ## Final Steps
     - After validation passes, confirm `git status --short` is clean apart from intended artifacts.
     - **DO NOT push the branch or create a PR** - the build phase handles all git operations.
     - The build phase will:
       1. Commit your implementation changes
       2. Push the branch to remote
       3. Create a PR with proper title and description
     ```

**Guardrails**:
- Preserve existing commit logic for uncommitted changes (lines 199-260)
- Maintain idempotency: skip if `state.pr_created` is already `True`
- Keep existing logging for "no uncommitted changes" vs. "no branch divergence"
- Ensure `/implement` agents don't attempt git operations beyond local commits during development

## Relevant Files

- `automation/adws/adw_modules/git_ops.py` — Add `branch_differs_from_base()` function
- `automation/adws/adw_phases/adw_build.py:199-218` — Replace early-exit logic with branch divergence check
- `automation/adws/adw_phases/adw_build.py:281-334` — PR creation code (no changes needed, just context)
- `.claude/commands/workflows/implement.md:58-62` — Update "Final Steps" section to clarify build phase owns git operations
- `.claude/commands/workflows/implement.md:71-82` — Update example output to remove "Push branch" and "Created PR" lines

### New Files

- `automation/adws/adw_tests/test_git_ops_branch_divergence.py` — Test coverage for `branch_differs_from_base()`
- `docs/specs/bug-370-pr-skipped-clean-worktree.md` — This plan file

## Task Breakdown

### Verification

**Steps to Reproduce Current Failure**:
1. Create a test worktree with base branch `develop`
2. Make implementation changes (e.g., add a file)
3. Commit changes to worktree branch
4. Verify worktree is clean (`git status --porcelain` returns empty)
5. Run build phase logic with clean worktree
6. Observe: PR creation is skipped despite committed work

**Logs/Metrics to Capture**:
- `git status --porcelain` output (should be empty for clean worktree)
- `git rev-list --count develop..<branch>` output (should be >0 for diverged branch)
- Build phase logs showing early exit message: "No changes detected - implementation already complete or no modifications needed"

### Implementation

1. **Add `branch_differs_from_base()` to `git_ops.py`**:
   - Function signature: `branch_differs_from_base(branch: str, base: str = 'develop', cwd: Path | None = None) -> bool`
   - Implementation: Use `git rev-list --count <base>..<branch>` to count unique commits
   - Return `True` if count > 0, `False` otherwise
   - Handle errors gracefully (e.g., invalid branch names)
   - Add to `__all__` exports

2. **Update `adw_build.py` early-exit logic** (lines 199-218):
   - Replace `has_changes = not git_ops.ensure_clean_worktree(cwd=worktree_path)` check
   - Add PR creation idempotency check first:
     ```python
     if state.pr_created:
         logger.info("PR already exists, skipping")
         return
     ```
   - Add branch divergence check:
     ```python
     branch_has_commits = git_ops.branch_differs_from_base(
         branch=state.worktree_name,
         base='develop',
         cwd=worktree_path
     )

     if not branch_has_commits:
         logger.info("No commits on branch, nothing to PR")
         # Exit gracefully - no PR needed
         return
     ```
   - Keep existing uncommitted changes handling for commit logic (lines 199-260)
   - Update log messages to distinguish between:
     - "No uncommitted changes" (for commit stage)
     - "No commits on branch" (for PR stage)

3. **Preserve existing commit logic**:
   - Keep `has_changes = not git_ops.ensure_clean_worktree(cwd=worktree_path)` for determining whether to commit
   - This logic should run BEFORE PR creation check
   - If uncommitted changes exist: commit them
   - Then check branch divergence for PR creation

4. **Update `/implement` prompt** (`.claude/commands/workflows/implement.md`):
   - **Line 58-62**: Replace "Final Steps" section content:
     - Remove "Push the branch (`git push -u origin <branch>`)."
     - Add explicit statement: "DO NOT push the branch or create a PR - the build phase handles all git operations."
     - Add explanation of build phase responsibilities (commit, push, PR creation)

   - **Line 71-82**: Update "Correct output" example:
     - Remove: `- Pushed branch feat/26-abc12345-rate-limiting`
     - Remove: `- Created PR: https://github.com/user/repo/pull/123`
     - Add: `- Implementation complete, ready for build phase to commit/push/PR`

   - **Line 84-97**: Update "INCORRECT output" example to show what happens if agent tries to create PR

5. **Verify no other prompts reference PR creation**:
   - Search for other slash commands that might instruct PR creation
   - Ensure only `adw_build.py` creates PRs in the ADW workflow

### Validation

**Tests to Add**:

1. **Unit test**: `test_branch_differs_from_base_with_commits()` in `test_git_ops_branch_divergence.py`
   - Create worktree with base branch
   - Add and commit changes to worktree branch
   - Assert `branch_differs_from_base()` returns `True`

2. **Unit test**: `test_branch_differs_from_base_without_commits()` in `test_git_ops_branch_divergence.py`
   - Create worktree with base branch
   - Make no changes (branch identical to base)
   - Assert `branch_differs_from_base()` returns `False`

3. **Unit test**: `test_branch_differs_from_base_behind_base()` in `test_git_ops_branch_divergence.py`
   - Create worktree from older commit
   - Advance base branch ahead
   - Assert `branch_differs_from_base()` returns `False` (branch is behind, not diverged)

4. **Integration test**: `test_build_phase_creates_pr_with_clean_worktree()` in new file `test_adw_build_pr_logic.py`
   - Create worktree
   - Add and commit implementation changes
   - Ensure worktree is clean (no uncommitted changes)
   - Run build phase logic
   - Assert PR creation is attempted (mock `create_pull_request`)

**Manual Checks**:
- Seed data: Create test branch with committed work, clean worktree
- Run build phase on test branch
- Verify PR is created
- Verify idempotency: re-run build phase, verify no duplicate PR attempts

## Step by Step Tasks

### Add Branch Divergence Helper
- Add `branch_differs_from_base()` function to `automation/adws/adw_modules/git_ops.py`
- Implement using `git rev-list --count <base>..<branch>`
- Return `True` if commit count > 0, `False` otherwise
- Add error handling for invalid branches
- Export in `__all__` list

### Update Build Phase Logic
- Move to `automation/adws/adw_phases/adw_build.py:199-218`
- Add PR idempotency check: `if state.pr_created: return`
- Replace worktree cleanliness check with `branch_differs_from_base()` check
- Update log messages to distinguish "no uncommitted changes" from "no branch divergence"
- Ensure uncommitted changes are still committed before PR check

### Update /implement Prompt
- Open `.claude/commands/workflows/implement.md`
- **Update "Final Steps" section** (lines 58-62):
  - Remove instruction to push branch
  - Add "DO NOT push the branch or create a PR" directive
  - Explain that build phase handles commit/push/PR
- **Update "Correct output" example** (lines 71-82):
  - Remove "Pushed branch" line
  - Remove "Created PR" line
  - Add "ready for build phase" indicator
- **Update "INCORRECT output" example** (lines 84-97):
  - Show example of agent incorrectly trying to create PR
- Search for any other prompts that might instruct PR creation
- Verify alignment with architecture where only `adw_build.py` creates PRs

### Add Test Coverage
- Create `automation/adws/adw_tests/test_git_ops_branch_divergence.py`
- Add unit tests for `branch_differs_from_base()`:
  - Test with diverged branch (has unique commits)
  - Test with identical branch (no divergence)
  - Test with branch behind base
  - Test with invalid branch name
- Add integration test in `test_adw_build_pr_logic.py` (or extend existing test file)
- Verify build phase creates PR when worktree is clean but branch has commits

### Validation and Push
- Run `cd automation && uv run pytest adws/adw_tests/test_git_ops_branch_divergence.py -v`
- Run `cd automation && uv run pytest adws/adw_tests/ -k "build" -v`
- Run `cd automation && uv run pytest adws/adw_tests/` (full test suite)
- Verify all tests pass
- Run `cd automation && uv run mypy adws/` (type checking)
- Push branch: `git push -u origin <branch-name>`

## Architecture Clarification

**Correct Workflow (Post-Fix)**:
1. **Plan Phase**: Creates worktree, generates plan file, commits plan, pushes branch (NO PR)
2. **Build Phase - Implementation**: Calls `/implement` agent → agent writes code, runs validation
3. **Build Phase - Git Operations**: Build phase commits implementation, pushes branch, creates PR
4. **Review Phase**: Validates PR quality, runs additional checks

**Problem (Current State)**:
- `/implement` prompt tells agents to push and create PR
- Agents create PRs prematurely (after plan, before implementation complete)
- Build phase's PR creation logic skips when worktree is clean (even if branch has commits)

**Solution**:
- Fix 1: Update `/implement` prompt to remove git operation instructions
- Fix 2: Update build phase to check branch divergence instead of worktree cleanliness
- Result: PRs only created after implementation is complete, with correct title reflecting full work

## Regression Risks

**Adjacent Features to Watch**:
1. **Commit logic** (lines 199-260): Ensure uncommitted changes are still committed before PR check
   - Risk: If we remove worktree cleanliness check entirely, might skip committing staged changes
   - Mitigation: Keep `has_changes` check for commit stage, separate from PR stage

2. **PR idempotency** (line 281 check `state.pr_created`): Ensure no duplicate PRs
   - Risk: If branch divergence check doesn't respect `state.pr_created`, might create duplicate PRs
   - Mitigation: Add explicit `state.pr_created` check BEFORE branch divergence check

3. **Empty issue handling** (lines 201-218): Test issues with no implementation needs
   - Risk: Might attempt PR creation for test issues or no-op issues
   - Mitigation: Branch divergence check will return `False` for branches with no commits, gracefully skipping PR

**Follow-up Work if Risk Materializes**:
- If commit logic breaks: Add separate `has_uncommitted_changes` check for commit stage
- If duplicate PRs occur: Add integration test for PR idempotency, strengthen state checks
- If test issues get PRs: Add explicit check for empty branches before PR creation

## Validation Commands

```bash
# Type checking
cd automation && uv run mypy adws/

# Linting
cd automation && uv run ruff check adws/

# Unit tests (new branch divergence tests)
cd automation && uv run pytest adws/adw_tests/test_git_ops_branch_divergence.py -v

# Integration tests (build phase logic)
cd automation && uv run pytest adws/adw_tests/ -k "build" -v

# Full test suite
cd automation && uv run pytest adws/adw_tests/

# Manual verification (if available)
# 1. Create test worktree: git worktree add trees/test-370 -b test-370 develop
# 2. Make changes: echo "test" > trees/test-370/test.txt
# 3. Commit: cd trees/test-370 && git add . && git commit -m "test: verify bug fix"
# 4. Verify clean: git status --porcelain (should be empty)
# 5. Verify divergence: git rev-list --count develop..test-370 (should be 1)
# 6. Run build phase and verify PR creation logic triggers
```

## Commit Message Validation

All commits for this bug fix must follow Conventional Commits format and avoid meta-commentary patterns.

**Valid commit messages**:
- `fix(adw): check branch divergence instead of worktree cleanliness for PR creation`
- `docs(adw): clarify /implement agent should not push or create PRs`
- `test(adw): add coverage for branch divergence detection`
- `refactor(git-ops): extract branch divergence helper from build phase`

**Invalid commit messages** (meta-commentary):
- ❌ "Looking at the changes, this commit fixes the PR creation bug"
- ❌ "Based on the issue, I can see this fixes worktree logic"
- ❌ "Here is the commit that adds branch divergence checks"
- ❌ "This commit should fix the build phase logic"
- ❌ "The commit updates the prompt to remove PR creation"
