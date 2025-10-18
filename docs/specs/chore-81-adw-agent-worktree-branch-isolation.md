# Chore Plan: Fix ADW Agent Worktree Branch Isolation

## Context

The ADW system's worktree isolation (#65) successfully prevents conflicts between concurrent agent runs and local development by executing workflows in isolated `trees/` directories. However, **Claude Code agents invoked within worktrees are switching branches in the root repository** instead of staying containerized.

This is critical because:
- Root repository branch gets polluted with worktree branch names (e.g., `chore/66-1fbbd7fc-unify-stdout-stderr-universally`)
- Local developers lose their working branch when ADW runs
- Multiple concurrent workflows can conflict at the git level despite worktree isolation
- The intended isolation architecture is violated

### Why This Matters Now

- **Blocking Development**: Developers must manually restore their branch after ADW execution
- **High Risk**: Concurrent workflows can create race conditions despite worktree architecture
- **Architecture Violation**: Worktree isolation guarantees are not enforced at the agent level
- **User Experience**: ADW should be invisible to local development workflows

### Constraints

- Must preserve agent autonomy (no restrictions on git commands)
- Must maintain backward compatibility with all ADW workflows (GitHub issue and home server)
- Must not break existing worktree lifecycle management
- Solution must work across all phase scripts (`adw_plan.py`, `adw_build.py`, etc.)

## Relevant Files

### Core Agent Execution
- `automation/adws/adw_modules/agent.py:67-89` - `get_claude_env()` function that builds environment for Claude CLI subprocess
- `automation/adws/adw_modules/agent.py:159-211` - `prompt_claude_code()` function that spawns Claude CLI with `cwd` parameter
- `automation/adws/adw_modules/agent.py:213-235` - `execute_template()` wrapper that passes `cwd` to agent execution

### Phase Scripts (Pass `cwd` to Agents)
- `automation/adws/adw_phases/adw_plan.py:141` - `build_plan()` call with `cwd=str(worktree_path)`
- `automation/adws/adw_phases/adw_plan.py:152` - `locate_plan_file()` call with `cwd`
- `automation/adws/adw_phases/adw_plan.py:194` - `create_commit_message()` call with `cwd`
- `automation/adws/adw_phases/adw_build.py:131` - `implement_plan()` call with `cwd=str(worktree_path)`
- `automation/adws/adw_phases/adw_build.py:177` - `create_commit_message()` call with `cwd`
- `automation/adws/adw_phases/adw_test.py:132` - `run_validation_commands()` call with `cwd=worktree_path`
- `automation/adws/adw_phases/adw_review.py` - Review agent execution
- `automation/adws/adw_phases/adw_document.py` - Documentation agent execution
- `automation/adws/adw_phases/adw_patch.py` - Patch agent execution

### Git Operations and Worktree Management
- `automation/adws/adw_modules/git_ops.py:212-329` - Worktree management functions (implemented in #65)
- `automation/adws/adw_modules/git_ops.py:31-40` - `_run_git()` helper that accepts `cwd` parameter

### Agent Prompt Templates (May Contain Git Commands)
- `.claude/commands/issues/chore.md` - Chore workflow prompt
- `.claude/commands/issues/feature.md` - Feature workflow prompt
- `.claude/commands/issues/bug.md` - Bug workflow prompt
- `.claude/commands/git/commit.md` - Commit message generation
- `.claude/commands/git/pull_request.md` - PR creation

### Documentation
- `automation/adws/README.md:265-304` - Worktree isolation documentation (updated in #65)
- `CLAUDE.md` - Project instructions for Claude Code (AI Developer Workflows section)
- `.claude/commands/docs/conditional_docs.md` - Documentation routing logic

### New Files
- `automation/adws/adw_tests/test_agent_worktree_isolation.py` - Integration test for worktree git isolation

## Work Items

### Preparation
1. Capture current root repository branch before testing: `git branch --show-current`
2. Review git worktree documentation for `GIT_DIR` and `GIT_WORK_TREE` environment variable behavior
3. Identify all locations where `get_claude_env()` is called (via `execute_template()`)
4. Review existing agent prompt templates for explicit git commands

### Execution
1. **Modify `get_claude_env()` to enforce worktree isolation**
   - Accept `cwd` parameter (currently not passed through)
   - When `cwd` is provided, set `GIT_DIR` and `GIT_WORK_TREE` environment variables
   - Validate that worktree path exists before setting env vars
   - Log environment variable injection for debugging

2. **Update `execute_template()` to pass `cwd` through**
   - Pass `cwd` from `AgentTemplateRequest` to `get_claude_env()`
   - Ensure `cwd` propagates through the call chain

3. **Update `prompt_claude_code()` to use worktree-aware environment**
   - Pass `cwd` from `AgentPromptRequest` to `get_claude_env()`
   - Ensure environment includes worktree isolation variables

4. **Add validation tests**
   - Create integration test that runs agent in worktree
   - Assert root repository branch unchanged after agent execution
   - Test concurrent agent execution scenarios
   - Verify git commands in worktree execute correctly

5. **Add logging and diagnostics**
   - Log when worktree isolation environment is activated
   - Log GIT_DIR and GIT_WORK_TREE values in debug mode
   - Add pre/post execution branch validation (optional safety check)

### Follow-up
1. Monitor ADW execution logs for worktree isolation warnings
2. Verify all phase scripts maintain root branch stability
3. Update troubleshooting documentation with new isolation mechanism
4. Consider adding pre-flight validation that fails fast if isolation is violated

## Step by Step Tasks

### 1. Investigation and Baseline Capture
- Capture current root branch: `git branch --show-current`
- Review git worktree environment variable documentation
- Identify test cases for validation (simple agent execution in worktree)

### 2. Modify Agent Environment Construction
- Read `automation/adws/adw_modules/agent.py:67-89` to understand current `get_claude_env()` implementation
- Update function signature: `get_claude_env(cwd: Optional[str] = None) -> Dict[str, str]`
- Add worktree isolation logic:
  ```python
  # If executing in worktree context, enforce git isolation
  if cwd:
      cwd_path = Path(cwd)
      if cwd_path.exists():
          # Force git operations to stay in worktree
          env["GIT_DIR"] = f"{cwd}/.git"
          env["GIT_WORK_TREE"] = cwd
          # Log for debugging
          print(f"Worktree isolation enabled: GIT_DIR={env['GIT_DIR']}, GIT_WORK_TREE={env['GIT_WORK_TREE']}")
  ```
- Handle edge cases (cwd doesn't exist, not a worktree)

### 3. Update Call Chain to Pass CWD
- Read `automation/adws/adw_modules/agent.py:159-211` (`prompt_claude_code()`)
- Update `get_claude_env()` call: `env = get_claude_env(cwd=request.cwd) or None`
- Verify `request.cwd` is available from `AgentPromptRequest`
- Read `automation/adws/adw_modules/agent.py:213-235` (`execute_template()`)
- Verify `cwd` is passed from `AgentTemplateRequest` to `AgentPromptRequest`

### 4. Add Data Type Support (If Needed)
- Read `automation/adws/adw_modules/data_types.py` to check if `AgentPromptRequest` includes `cwd` field
- Verify `AgentTemplateRequest` includes `cwd` field
- Update type annotations if necessary

### 5. Create Integration Test
- Create `automation/adws/adw_tests/test_agent_worktree_isolation.py`
- Test setup: Create temporary git repo with worktree
- Test case 1: Run agent in worktree, assert root branch unchanged
- Test case 2: Agent performs git operations, verify isolation
- Test case 3: Multiple concurrent agent executions in different worktrees
- Test teardown: Clean up temporary worktrees and branches

### 6. Add Logging and Diagnostics
- Add debug logging in `get_claude_env()` when worktree isolation is activated
- Add optional pre-flight check: Capture root branch before agent execution
- Add optional post-flight check: Verify root branch unchanged after execution
- Log warnings if worktree isolation cannot be enforced (cwd invalid)

### 7. Update Documentation
- Read `automation/adws/README.md:440-496` (Worktree Management Issues section)
- Add new troubleshooting entry for branch leakage
- Document GIT_DIR/GIT_WORK_TREE isolation mechanism
- Read `.claude/commands/docs/conditional_docs.md`
- Update `docs/specs/chore-81-adw-agent-worktree-branch-isolation.md` reference:
  ```markdown
  - docs/specs/chore-81-adw-agent-worktree-branch-isolation.md
    - Conditions:
      - When working on issue #81 or debugging ADW worktree branch isolation
      - When agents are switching branches in root repository
      - When investigating GIT_DIR/GIT_WORK_TREE environment variable behavior
      - When troubleshooting git operations executed by Claude Code agents
      - When modifying agent.py environment construction logic
  ```

### 8. Run Validation Tests
- Run new integration test: `uv run pytest automation/adws/adw_tests/test_agent_worktree_isolation.py -v`
- Run full automation test suite: `uv run pytest automation/adws/adw_tests/ -v`
- Manually test plan phase: `uv run automation/adws/adw_phases/adw_plan.py 81`
- Before execution: `BRANCH_BEFORE=$(git branch --show-current)`
- After execution: `BRANCH_AFTER=$(git branch --show-current)`
- Assert: `[ "$BRANCH_BEFORE" == "$BRANCH_AFTER" ]`
- Verify worktree operations succeeded: `git -C trees/chore-81-* log`

### 9. Test Home Server Workflows
- Test simple workflow: `uv run automation/adws/adw_build_update_homeserver_task.py --adw-id test-81 --worktree-name test-chore-81 --task "Test worktree isolation" --task-id task-81-test --task-title "Test"`
- Verify root branch unchanged: `git branch --show-current`
- Verify worktree git operations: `git -C trees/test-chore-81 log`

### 10. Test Concurrent Execution
- Start two workflows in parallel: `uv run automation/adws/adw_phases/adw_plan.py 81 & PARALLEL_PID=$!`
- Start another: `uv run automation/adws/adw_phases/adw_plan.py 65 &`
- Wait for completion: `wait`
- Verify no conflicts or lock errors in logs
- Verify root branch unchanged: `git branch --show-current`

### 11. Final Validation and Commit
- Run all validation commands (see below)
- Check git status: `git status`
- Verify no uncommitted changes in root: `git diff`
- Stage all changes: `git add automation/adws/adw_modules/agent.py automation/adws/adw_tests/test_agent_worktree_isolation.py automation/adws/README.md .claude/commands/docs/conditional_docs.md docs/specs/chore-81-adw-agent-worktree-branch-isolation.md`
- Commit with conventional format: `git commit -m "chore: fix ADW agent worktree branch isolation (#81)"`
- Push branch: `git push -u origin chore-81-adw-agent-worktree-branch-isolation`

### 12. Create Pull Request
- Run `/pull_request chore-81-adw-agent-worktree-branch-isolation {"number":81,"title":"bug: ADW agents switch root repository branch instead of staying in worktree"} docs/specs/chore-81-adw-agent-worktree-branch-isolation.md {adw_id}`

## Risks

### Risk: GIT_DIR/GIT_WORK_TREE may break legitimate git operations in agents
**Mitigation**:
- Test common git operations (status, diff, log, commit, push) in worktree context
- Validate that agents can still perform all necessary git workflows
- Worktrees already have proper `.git` file pointing to main repo, so env vars should be redundant safety
- If issues arise, investigate git's native worktree support vs explicit env vars

### Risk: Environment variable approach may not work across all git versions
**Mitigation**:
- Document minimum git version requirements
- Test on both macOS (developer machines) and Linux (CI)
- Git worktree feature requires git >= 2.5.0, which is widely available
- GIT_DIR/GIT_WORK_TREE are documented stable features

### Risk: Breaking changes to agent execution behavior
**Mitigation**:
- Environment variables are additive (don't remove existing behavior)
- Only applied when `cwd` is provided (worktree context)
- Non-worktree agent execution remains unchanged
- Comprehensive test coverage before merge

### Risk: Concurrent agent execution may still conflict at filesystem level
**Mitigation**:
- Worktree isolation already handles filesystem separation (#65)
- This fix addresses git metadata isolation only
- Test concurrent scenarios explicitly
- Existing worktree naming ensures uniqueness (ADW ID component)

### Risk: Subtle git behavior changes may only surface in production
**Mitigation**:
- Add extensive logging for debugging
- Preserve worktrees on failure for inspection (`ADW_CLEANUP_ON_FAILURE=false`)
- Monitor ADW execution logs after deployment
- Document rollback procedure (remove env var injection)

## Validation Commands

### Level 2 Validation (Minimum Required)
```bash
# Automation layer validation
cd automation/adws

# Lint Python code
uv run ruff check adw_modules/ adw_phases/ adw_tests/

# Type check Python code
uv run mypy adw_modules/agent.py --ignore-missing-imports

# Run new integration test
uv run pytest adw_tests/test_agent_worktree_isolation.py -v

# Run full automation test suite
uv run pytest adw_tests/ -v

# Health check
uv run health_check.py --json
```

### Domain-Specific Validation
```bash
# Capture baseline
BRANCH_BEFORE=$(git branch --show-current)
echo "Root branch before test: $BRANCH_BEFORE"

# Test GitHub issue workflow with worktree isolation
uv run automation/adws/adw_phases/adw_plan.py 81

# Verify root branch unchanged
BRANCH_AFTER=$(git branch --show-current)
echo "Root branch after test: $BRANCH_AFTER"
[ "$BRANCH_BEFORE" == "$BRANCH_AFTER" ] && echo "✅ Root branch isolation preserved" || echo "❌ Root branch changed!"

# Verify worktree operations succeeded
git worktree list
git -C trees/chore-81-* log --oneline | head -5

# Test home server workflow
uv run automation/adws/adw_build_update_homeserver_task.py \
  --adw-id test-isolation-81 \
  --worktree-name test-chore-81 \
  --task "Test worktree isolation fix" \
  --task-id task-81-test \
  --task-title "Test Isolation"

# Verify root branch still unchanged
BRANCH_FINAL=$(git branch --show-current)
[ "$BRANCH_BEFORE" == "$BRANCH_FINAL" ] && echo "✅ Root branch isolation preserved after home server workflow" || echo "❌ Root branch changed!"

# Test concurrent execution
echo "Testing concurrent workflows..."
uv run automation/adws/adw_phases/adw_plan.py 81 --skip-cleanup &
PID1=$!
uv run automation/adws/adw_phases/adw_plan.py 65 --skip-cleanup &
PID2=$!
wait $PID1 $PID2
echo "Concurrent execution completed"

# Verify root branch still unchanged after concurrent execution
BRANCH_CONCURRENT=$(git branch --show-current)
[ "$BRANCH_BEFORE" == "$BRANCH_CONCURRENT" ] && echo "✅ Root branch isolation preserved during concurrent execution" || echo "❌ Root branch changed during concurrent execution!"

# Cleanup test worktrees
git worktree list
git worktree remove trees/chore-81-* --force 2>/dev/null || true
git worktree remove trees/feat-65-* --force 2>/dev/null || true
git worktree remove trees/test-chore-81 --force 2>/dev/null || true
git worktree prune
```

### Regression Validation
```bash
# Verify non-worktree agent execution still works
cd automation/adws
uv run python3 -c "
from adw_modules.agent import get_claude_env
env = get_claude_env()
assert 'ANTHROPIC_API_KEY' in env
assert 'GIT_DIR' not in env  # Should not be set without cwd
print('✅ Non-worktree environment construction unchanged')
"

# Verify worktree environment includes isolation
uv run python3 -c "
from adw_modules.agent import get_claude_env
from pathlib import Path
import tempfile
with tempfile.TemporaryDirectory() as tmpdir:
    env = get_claude_env(cwd=tmpdir)
    assert env.get('GIT_DIR') == f'{tmpdir}/.git'
    assert env.get('GIT_WORK_TREE') == tmpdir
    print('✅ Worktree environment includes isolation variables')
"
```

## Deliverables

### Code Changes
- ✅ `automation/adws/adw_modules/agent.py` - Updated `get_claude_env()` to accept `cwd` and set worktree isolation env vars
- ✅ `automation/adws/adw_modules/agent.py` - Updated `prompt_claude_code()` to pass `cwd` to `get_claude_env()`
- ✅ `automation/adws/adw_tests/test_agent_worktree_isolation.py` - New integration test for worktree git isolation

### Documentation Updates
- ✅ `automation/adws/README.md` - Added worktree branch isolation troubleshooting entry
- ✅ `automation/adws/README.md` - Documented GIT_DIR/GIT_WORK_TREE mechanism
- ✅ `.claude/commands/docs/conditional_docs.md` - Added reference to chore-81 spec
- ✅ `docs/specs/chore-81-adw-agent-worktree-branch-isolation.md` - This comprehensive plan

### Validation Results
- ✅ All automation tests pass (pytest suite)
- ✅ New integration test passes
- ✅ Manual validation confirms root branch unchanged after agent execution
- ✅ Home server workflows preserve root branch
- ✅ Concurrent execution scenarios work without conflicts
- ✅ No regression in non-worktree agent execution
