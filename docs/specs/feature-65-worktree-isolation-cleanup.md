# Feature Plan: Comprehensive Worktree Isolation and Automatic Cleanup

## Overview

### Problem
The automation layer currently has inconsistent worktree isolation across workflows:
- Home server workflows (`adw_build_update_homeserver_task.py`, `adw_plan_implement_update_homeserver_task.py`) use worktree isolation with cleanup
- GitHub issue workflows (`adw_plan.py`, `adw_build.py`, etc.) operate directly on main repository, causing conflicts during:
  - Concurrent agent execution on different issues
  - Local development while agents are running
  - Failed agent execution leaving inconsistent state
- Cleanup logic is duplicated across two files (197 lines each)
- No centralized worktree management in `adw_modules/git_ops.py`

### Desired Outcome
- All ADW workflows (GitHub issue and home server) use isolated worktrees
- Centralized worktree management utilities in `adw_modules/git_ops.py`
- Automatic cleanup after successful PR creation (configurable)
- Preserve-on-failure option for debugging
- State tracking for worktree metadata
- Consistent cleanup behavior across all workflows

### Non-Goals
- Periodic cleanup job for stale worktrees (optional future enhancement)
- Signal handlers for cleanup on interruption (out of scope)
- Worktree-based parallel execution orchestration (separate feature)

## Issue Metadata
- **Issue Number**: #65
- **Title**: feat: implement comprehensive worktree isolation and automatic cleanup for agent workflows
- **Labels**: `component:ci-cd`, `priority:medium`, `effort:large`, `status:needs-investigation`
- **Related Issue**: #63 (automation directory consolidation)

## Technical Approach

### Architecture Notes
1. **Centralized Worktree Management**: Add worktree functions to `adw_modules/git_ops.py` using existing `_run_git()` helper
2. **Phase Script Integration**: Modify all GitHub issue phase scripts to create/use worktrees at start of execution
3. **State Tracking**: Store worktree metadata in `agents/<adw_id>/adw_state.json` for lifecycle management
4. **Cleanup Triggers**: Automatic cleanup after successful PR creation, configurable via environment variables
5. **Backward Compatibility**: Home server workflows continue to work, migrated to use centralized functions

### Key Modules to Touch
- `automation/adws/adw_modules/git_ops.py` - Add worktree management functions
- `automation/adws/adw_modules/workflow_ops.py` - Update state management for worktree tracking
- `automation/adws/adw_modules/data_types.py` - Add worktree metadata to state model
- `automation/adws/adw_phases/adw_plan.py` - Create worktree before agent execution
- `automation/adws/adw_phases/adw_build.py` - Work within existing worktree
- `automation/adws/adw_phases/adw_test.py` - Execute validation in worktree context
- `automation/adws/adw_phases/adw_review.py` - Review code in worktree context
- `automation/adws/adw_phases/adw_document.py` - Generate docs in worktree context
- `automation/adws/adw_phases/adw_patch.py` - Apply patches in worktree context
- `automation/adws/adw_build_update_homeserver_task.py` - Use centralized cleanup
- `automation/adws/adw_plan_implement_update_homeserver_task.py` - Use centralized cleanup

### Data/API Impacts
- **State Schema Extension**: Add `worktree_name`, `worktree_path`, `worktree_created_at` to ADW state
- **Environment Variables**: `ADW_CLEANUP_WORKTREES`, `ADW_CLEANUP_ON_FAILURE`, `ADW_WORKTREE_BASE_PATH`
- **CLI Flags**: `--skip-cleanup`, `--preserve-on-failure`, `--worktree-base-path`
- **Worktree Naming Convention**: `{issue_class}-{issue_number}-{adw_id[:8]}` for GitHub workflows

## Relevant Files

### Core Modules
- `automation/adws/adw_modules/git_ops.py` - Git command helpers, needs worktree functions
- `automation/adws/adw_modules/workflow_ops.py` - Workflow state management, needs worktree state tracking
- `automation/adws/adw_modules/data_types.py` - Pydantic models, needs worktree fields
- `automation/adws/adw_modules/utils.py` - Environment loading, may need worktree path helpers

### Phase Scripts (GitHub Issue Workflows)
- `automation/adws/adw_phases/adw_plan.py` - Plan phase, must create worktree before execution
- `automation/adws/adw_phases/adw_build.py` - Build phase, must use existing worktree
- `automation/adws/adw_phases/adw_test.py` - Test phase, must execute in worktree
- `automation/adws/adw_phases/adw_review.py` - Review phase, must review worktree code
- `automation/adws/adw_phases/adw_document.py` - Documentation phase, must generate docs in worktree
- `automation/adws/adw_phases/adw_patch.py` - Patch phase, must apply patches to worktree

### Home Server Workflows
- `automation/adws/adw_build_update_homeserver_task.py:197-234` - Duplicate cleanup function
- `automation/adws/adw_plan_implement_update_homeserver_task.py:203-240` - Duplicate cleanup function

### Documentation
- `automation/adws/README.md:256-276` - Worktree management section, needs update
- `automation/adws/README.md:380-420` - Troubleshooting section, needs expansion
- `automation/adws/.env.sample:18-20` - Environment config, needs new variables

### New Files
- `automation/adws/adw_tests/test_git_ops_worktree.py` - Pytest tests for worktree functions

## Task Breakdown

### Phase 1: Centralize Worktree Management (Foundation)
1. Add `create_worktree()` function to `adw_modules/git_ops.py`
2. Add `cleanup_worktree()` function to `adw_modules/git_ops.py`
3. Add `list_worktrees()` function to `adw_modules/git_ops.py`
4. Add `worktree_exists()` function to `adw_modules/git_ops.py`
5. Update `__all__` export list in `adw_modules/git_ops.py`
6. Write pytest tests for worktree functions in `adw_tests/test_git_ops_worktree.py`

### Phase 2: State Management and Data Types
1. Add worktree fields to state model in `adw_modules/data_types.py`
2. Add helper functions for worktree name generation in `adw_modules/workflow_ops.py`
3. Add worktree path resolution helper in `adw_modules/utils.py`
4. Update state initialization to include worktree fields

### Phase 3: GitHub Issue Workflow Integration
1. Modify `adw_phases/adw_plan.py` to create worktree before agent execution
2. Modify `adw_phases/adw_build.py` to use existing worktree from state
3. Modify `adw_phases/adw_test.py` to execute validation in worktree context
4. Modify `adw_phases/adw_review.py` to review code in worktree context
5. Modify `adw_phases/adw_document.py` to generate docs in worktree context
6. Modify `adw_phases/adw_patch.py` to apply patches in worktree context
7. Add cleanup after successful PR creation in `adw_phases/adw_plan.py`

### Phase 4: Home Server Workflow Migration
1. Replace cleanup function in `adw_build_update_homeserver_task.py` with centralized version
2. Replace cleanup function in `adw_plan_implement_update_homeserver_task.py` with centralized version
3. Update imports to use `adw_modules.git_ops` functions
4. Remove duplicate cleanup code from both files

### Phase 5: Environment Configuration and CLI Flags
1. Add environment variables to `automation/adws/.env.sample`
2. Add CLI flags to phase scripts (`--skip-cleanup`, `--preserve-on-failure`, `--worktree-base-path`)
3. Implement cleanup configuration logic (respect env vars and CLI flags)
4. Update environment loading in `adw_modules/utils.py`

### Phase 6: Documentation and Testing
1. Update `automation/adws/README.md` worktree management section (lines 256-276)
2. Expand troubleshooting section with worktree-specific guidance (lines 380-420)
3. Add worktree workflow diagrams and examples
4. Document new environment variables and CLI flags
5. Run full automation test suite: `uv run pytest automation/adws/adw_tests/`
6. Test concurrent workflow execution
7. Test cleanup behavior (success and failure scenarios)
8. Update `.claude/commands/docs/conditional_docs.md` with worktree documentation reference

### Phase 7: Validation and PR Creation
1. Run validation commands (Level 2 minimum)
2. Verify home server workflows still work with centralized functions
3. Verify GitHub issue workflows create and clean up worktrees
4. Test concurrent workflows don't conflict
5. Push branch to remote: `git push -u origin feat-65-worktree-isolation-cleanup`
6. Run `/pull_request feat-65-worktree-isolation-cleanup {issue_json} docs/specs/feature-65-worktree-isolation-cleanup.md {adw_id}`

## Step by Step Tasks

### 1. Foundation - Centralized Worktree Functions
- Read `automation/adws/adw_modules/git_ops.py` to understand existing patterns
- Add `create_worktree(worktree_name: str, base_branch: str, base_path: str) -> Path` function
- Add `cleanup_worktree(worktree_name: str, base_path: str, delete_branch: bool) -> bool` function
- Add `list_worktrees() -> list[dict]` function
- Add `worktree_exists(worktree_name: str, base_path: str) -> bool` function
- Update `__all__` export list
- Create `automation/adws/adw_tests/test_git_ops_worktree.py` with comprehensive tests

### 2. Data Models and State Tracking
- Read `automation/adws/adw_modules/data_types.py` to understand state schema
- Add `worktree_name: Optional[str]` field to state model
- Add `worktree_path: Optional[str]` field to state model
- Add `worktree_created_at: Optional[str]` field to state model
- Add `generate_worktree_name(issue_class: str, issue_number: str, adw_id: str) -> str` to `workflow_ops.py`
- Add `resolve_worktree_path(worktree_name: str, base_path: str) -> Path` to `utils.py`

### 3. GitHub Issue Workflow - Plan Phase
- Read `automation/adws/adw_phases/adw_plan.py` to understand execution flow
- Import worktree functions from `git_ops`
- Generate worktree name after branch name generation
- Create worktree before agent execution
- Store worktree metadata in state
- Pass worktree path to agent execution context
- Add cleanup after successful PR creation (respect `ADW_CLEANUP_WORKTREES` env var)
- Add `--skip-cleanup` CLI flag

### 4. GitHub Issue Workflow - Build Phase
- Read `automation/adws/adw_phases/adw_build.py` to understand execution flow
- Import worktree functions from `git_ops`
- Load worktree path from state
- Verify worktree exists before execution
- Pass worktree path to agent execution context
- All git operations execute in worktree context

### 5. GitHub Issue Workflow - Test Phase
- Read `automation/adws/adw_phases/adw_test.py` to understand execution flow
- Load worktree path from state
- Execute validation commands in worktree context (`cwd=worktree_path`)
- Ensure lockfile detection works in worktree

### 6. GitHub Issue Workflow - Review, Document, Patch Phases
- Read `automation/adws/adw_phases/adw_review.py` to understand execution flow
- Load worktree path from state and execute in worktree context
- Read `automation/adws/adw_phases/adw_document.py` to understand execution flow
- Load worktree path from state and execute in worktree context
- Read `automation/adws/adw_phases/adw_patch.py` to understand execution flow
- Load worktree path from state and execute in worktree context

### 7. Home Server Workflow Migration
- Read `automation/adws/adw_build_update_homeserver_task.py:197-234`
- Replace `cleanup_worktree()` function with import from `git_ops`
- Update function calls to use centralized version
- Remove duplicate cleanup code (lines 197-234)
- Read `automation/adws/adw_plan_implement_update_homeserver_task.py:203-240`
- Replace `cleanup_worktree()` function with import from `git_ops`
- Update function calls to use centralized version
- Remove duplicate cleanup code (lines 203-240)

### 8. Environment Configuration
- Read `automation/adws/.env.sample` to understand current variables
- Add `ADW_CLEANUP_WORKTREES=true` (default: true)
- Add `ADW_CLEANUP_ON_FAILURE=false` (default: false)
- Add `ADW_WORKTREE_BASE_PATH=trees` (default: trees)
- Document variable behavior in comments
- Update `adw_modules/utils.py` to load new variables
- Add CLI flags to all phase scripts

### 9. Documentation Updates
- Read `automation/adws/README.md:256-276` (worktree section)
- Update with comprehensive worktree management guidance
- Add examples of worktree lifecycle
- Read `automation/adws/README.md:380-420` (troubleshooting section)
- Add worktree-specific troubleshooting entries
- Add manual cleanup instructions
- Add concurrent workflow conflict resolution
- Document environment variables and CLI flags with examples
- Read `.claude/commands/docs/conditional_docs.md`
- Add entry for feature-65 spec: "When working with worktree isolation or cleanup logic"

### 10. Testing and Validation
- Run worktree unit tests: `uv run pytest automation/adws/adw_tests/test_git_ops_worktree.py -v`
- Run full automation test suite: `uv run pytest automation/adws/adw_tests/ -v`
- Test GitHub issue workflow with worktree isolation: `uv run automation/adws/adw_phases/adw_plan.py 65`
- Verify worktree creation: `git worktree list`
- Test home server workflow with centralized cleanup: `uv run automation/adws/adw_build_update_homeserver_task.py --adw-id test123 --worktree-name test-worktree --task "Test task" --task-title "Test" --task-id task-001`
- Test cleanup behavior: Verify worktree removed after PR creation
- Test skip-cleanup flag: `uv run automation/adws/adw_phases/adw_plan.py 65 --skip-cleanup`
- Verify worktree preserved: `git worktree list`
- Test concurrent workflows: Start two plan phases in parallel for different issues
- Run automation health check: `uv run automation/adws/health_check.py --json`

### 11. Final Validation and PR Submission
- Re-run all validation commands to ensure no regressions
- Run automation test suite: `uv run pytest automation/adws/adw_tests/ -v`
- Check git status: `git status`
- Stage all changes: `git add .`
- Commit changes: `git commit -m "feat: implement comprehensive worktree isolation and automatic cleanup (#65)"`
- Push branch to remote: `git push -u origin feat-65-worktree-isolation-cleanup`
- Create pull request: `/pull_request feat-65-worktree-isolation-cleanup {"number":65,"title":"feat: implement comprehensive worktree isolation and automatic cleanup for agent workflows"} docs/specs/feature-65-worktree-isolation-cleanup.md {adw_id}`

## Risks & Mitigations

### Risk: Worktree creation fails due to existing worktree with same name
**Mitigation**:
- Check worktree existence before creation using `worktree_exists()`
- Include ADW ID in worktree name to ensure uniqueness: `{issue_class}-{issue_number}-{adw_id[:8]}`
- Provide clear error messages with cleanup instructions

### Risk: Cleanup fails, leaving stale worktrees accumulating on disk
**Mitigation**:
- Implement robust error handling in `cleanup_worktree()`
- Use `--force` flag for worktree removal to handle uncommitted changes
- Prune stale worktree metadata after removal
- Return success/failure status from cleanup function
- Log cleanup failures for investigation
- Document manual cleanup procedures in troubleshooting section

### Risk: Agent execution fails midway, leaving worktree in inconsistent state
**Mitigation**:
- Implement `--preserve-on-failure` flag for debugging
- Default to cleanup on failure via `ADW_CLEANUP_ON_FAILURE` env var (default: false)
- Store worktree metadata in state for manual recovery
- Document recovery procedures in README

### Risk: Concurrent workflows create race conditions in worktree management
**Mitigation**:
- Use unique worktree names with ADW ID component
- Git worktree operations are atomic at filesystem level
- Each phase script loads its own state independently
- Test concurrent execution scenarios during validation

### Risk: Breaking changes to home server workflows during migration
**Mitigation**:
- Preserve function signatures and behavior during centralization
- Test home server workflows explicitly before PR creation
- Review cleanup logic carefully to ensure consistency
- Keep error handling and logging behavior identical

### Risk: Worktree path resolution issues across different execution contexts
**Mitigation**:
- Use absolute paths for worktree directories
- Store both worktree name and full path in state
- Validate worktree existence before execution
- Provide clear error messages when worktree not found

## Validation Strategy

### Automated Tests
1. **Worktree Management Unit Tests** (`test_git_ops_worktree.py`)
   - Test worktree creation with valid and invalid names
   - Test worktree cleanup (success and failure cases)
   - Test worktree listing and existence checks
   - Test error handling for duplicate worktrees
   - Use temporary git repositories for isolation

2. **State Management Integration Tests** (`test_workflow_ops.py`)
   - Test worktree name generation with various issue types
   - Test state persistence with worktree metadata
   - Test state loading and worktree path resolution

3. **Full Automation Test Suite** (`adw_tests/`)
   - Run existing tests to ensure no regressions
   - Verify workflow state management still works
   - Verify git operations helpers still work

### Manual Validation
1. **GitHub Issue Workflow End-to-End**
   - Run plan phase for issue #65: `uv run automation/adws/adw_phases/adw_plan.py 65`
   - Verify worktree created: `git worktree list` should show `feat-65-worktree-isolation-cleanup-{adw_id[:8]}`
   - Verify state persisted: Check `agents/{adw_id}/adw_state.json` for worktree fields
   - Verify PR creation includes cleanup trigger
   - Verify worktree removed after successful PR: `git worktree list` should not show worktree

2. **Home Server Workflow Compatibility**
   - Run build workflow: `uv run automation/adws/adw_build_update_homeserver_task.py --adw-id test123 --worktree-name test-worktree --task "Test task" --task-title "Test" --task-id task-001`
   - Verify worktree created: `git worktree list` should show `test-worktree`
   - Verify cleanup runs after PR creation
   - Verify no regressions in status updates to home server

3. **Cleanup Behavior Validation**
   - Test skip-cleanup flag: `uv run automation/adws/adw_phases/adw_plan.py 65 --skip-cleanup`
   - Verify worktree preserved: `git worktree list` should still show worktree
   - Test cleanup-on-failure: Set `ADW_CLEANUP_ON_FAILURE=true` and trigger failure
   - Verify worktree removed even on failure

4. **Concurrent Workflow Validation**
   - Start two plan phases in parallel: `uv run automation/adws/adw_phases/adw_plan.py 101 & uv run automation/adws/adw_phases/adw_plan.py 102 &`
   - Verify both complete without conflicts
   - Verify separate worktrees created: `git worktree list`
   - Verify no git lock errors or race conditions

5. **Manual Cleanup Testing**
   - Create stale worktree: `git worktree add trees/stale-test -b stale-test develop`
   - Follow manual cleanup procedure from documentation
   - Verify removal: `git worktree list` and `git branch -D stale-test`
   - Verify prune: `git worktree prune`

### Release Guardrails
1. **Monitoring**
   - Add logging for worktree lifecycle events (creation, cleanup, failures)
   - Track worktree creation/cleanup success rates in automation logs
   - Monitor `trees/` directory size for accumulation

2. **Alerting**
   - Alert on repeated worktree cleanup failures
   - Alert on excessive worktree count (potential leak)
   - Alert on disk space issues in `trees/` directory

3. **Rollback Plan**
   - Document rollback procedure to pre-worktree-isolation behavior
   - Keep environment variable defaults conservative (`ADW_CLEANUP_WORKTREES=true`)
   - Provide manual cleanup script for emergency situations
   - Test rollback scenario during validation

## Validation Commands

### Level 2 Validation (Minimum Required)
```bash
# Run from automation directory
cd automation/adws

# Lint Python code
uv run ruff check adw_modules/ adw_phases/ adw_tests/

# Type check Python code
uv run mypy adw_modules/ adw_phases/ --ignore-missing-imports

# Run automation test suite
uv run pytest adw_tests/ -v

# Run worktree-specific tests
uv run pytest adw_tests/test_git_ops_worktree.py -v

# Health check
uv run health_check.py --json
```

### Domain-Specific Validation
```bash
# Test GitHub issue workflow with worktree isolation
uv run adw_phases/adw_plan.py 65
git worktree list  # Should show new worktree

# Test home server workflow with centralized cleanup
uv run adw_build_update_homeserver_task.py \
  --adw-id test123 \
  --worktree-name test-worktree \
  --task "Test task" \
  --task-title "Test" \
  --task-id task-001

# Test concurrent workflows
uv run adw_phases/adw_plan.py 101 &
uv run adw_phases/adw_plan.py 102 &
wait
# Both should complete without conflicts

# Test cleanup flags
uv run adw_phases/adw_plan.py 103 --skip-cleanup
git worktree list  # Should still show worktree

# Test cleanup on failure
ADW_CLEANUP_ON_FAILURE=true uv run adw_phases/adw_plan.py 104
# If fails, worktree should be cleaned up

# Manual cleanup test
git worktree list
git worktree remove trees/stale-worktree --force
git worktree prune
git branch -D stale-worktree
```

### Application Layer Validation (if code changes affect app/)
```bash
# Run from app directory
cd ../../app

# Lint TypeScript
bun run lint

# Type-check TypeScript
bun run typecheck

# Run integration tests
bun test --filter integration

# Run full test suite
bun test

# Build application
bun run build
```

## References
- **Issue**: #65 - feat: implement comprehensive worktree isolation and automatic cleanup for agent workflows
- **Related Issue**: #63 - chore: consolidate automation/adws directory structure
- **Issue Body**: See issue description for detailed requirements and acceptance criteria
- **Current Implementation**:
  - `automation/adws/adw_build_update_homeserver_task.py:197-234` (cleanup function)
  - `automation/adws/adw_plan_implement_update_homeserver_task.py:203-240` (duplicate cleanup)
- **Documentation**:
  - `automation/adws/README.md:256-276` (worktree management)
  - `automation/adws/README.md:380-420` (troubleshooting)
- **Git Utilities**: `automation/adws/adw_modules/git_ops.py` (needs worktree functions)
