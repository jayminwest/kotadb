# Chore Plan: Fix COMMANDS_ROOT path calculation in ADW agent module

## Context
The ADW planning phase fails during issue classification with a file not found error. The root cause is an incorrect path calculation in `automation/adws/adw_modules/agent.py:29` that navigates UP from the repository root instead of staying at the repository root.

**Error Message:**
```
Classification failed: [Errno 2] No such file or directory: '/Users/jayminwest/Projects/.claude/commands'
```

**Expected Path:** `/Users/jayminwest/Projects/kota-db-ts/.claude/commands`
**Actual Path (incorrect):** `/Users/jayminwest/Projects/.claude/commands`

**Impact:**
- **Severity:** Critical - blocks ALL ADW workflows from running
- **Scope:** Affects all three phases (plan, build, review) since they use `execute_template()` from `agent.py`
- **Detection:** Caught during manual ADW testing on issue #181

This is a one-line fix that removes the incorrect `.parent` call in the path construction. The bug prevents slash command template loading, which is required for the `/classify_issue` command during the planning phase.

**Why this chore matters now:**
- ADW automation is completely non-functional without this fix
- Blocks all downstream ADW development and testing
- Simple fix with high impact (unblocks critical automation infrastructure)

**Constraints:**
- Must maintain backward compatibility with existing ADW workflows
- Must not affect other path resolution logic in the automation layer
- Must validate fix works in both local development and CI environments

## Relevant Files
- `automation/adws/adw_modules/agent.py` — Contains COMMANDS_ROOT path calculation bug (line 29)
- `automation/adws/adw_modules/utils.py` — Provides `project_root()` function used in path calculation
- `automation/adws/adw_phases/adw_plan.py` — Calls `execute_template()` which uses COMMANDS_ROOT (line 154)
- `.claude/commands/` — Target directory that should be resolved correctly

### New Files
- `automation/adws/adw_tests/test_commands_root.py` — Unit test to validate COMMANDS_ROOT path resolution

## Work Items

### Preparation
- Verify `.claude/commands/` directory exists at repository root
- Confirm current working directory is the worktree root
- Review existing ADW tests to understand test structure and patterns

### Execution
1. **Fix COMMANDS_ROOT path calculation in agent.py**
   - Remove `.parent` from line 29: `COMMANDS_ROOT = project_root().parent / ".claude" / "commands"`
   - Change to: `COMMANDS_ROOT = project_root() / ".claude" / "commands"`
   - Verify path resolves to `<repo_root>/.claude/commands`

2. **Add unit test for COMMANDS_ROOT path resolution**
   - Create `automation/adws/adw_tests/test_commands_root.py`
   - Test that `COMMANDS_ROOT` resolves to correct absolute path
   - Test that `.claude/commands` directory exists at resolved path
   - Test that `command_template_path()` can find existing command templates
   - Follow existing test patterns from `automation/adws/adw_tests/`

3. **Validate fix with manual ADW run**
   - Run ADW workflow on a test issue: `cd automation && uv run adws/adw_sdlc.py <test-issue-number>`
   - Verify classification phase completes successfully
   - Check execution logs for successful `/classify_issue` command execution

### Follow-up
- Monitor ADW workflow execution logs for any path-related errors
- Update ADW documentation if path resolution behavior needs clarification
- Run full ADW test suite to ensure no regressions: `cd automation && uv run pytest adws/adw_tests/`

## Step by Step Tasks

### Preparation
1. Verify `.claude/commands/` exists at repository root: `ls -la .claude/commands/`
2. Confirm working directory is worktree root: `pwd`
3. Read existing test structure: review `automation/adws/adw_tests/test_git_ops.py` for patterns

### Execution
4. Fix COMMANDS_ROOT path calculation in `automation/adws/adw_modules/agent.py:29`
5. Create unit test file `automation/adws/adw_tests/test_commands_root.py`
6. Implement test cases for path resolution validation
7. Run new test: `cd automation && uv run pytest adws/adw_tests/test_commands_root.py -v`
8. Run full ADW test suite: `cd automation && uv run pytest adws/adw_tests/ -v`
9. Validate with manual ADW run on test issue
10. Verify classification phase completes successfully in logs

### Follow-up
11. Run validation commands (see Validation Commands section)
12. Stage changes: `git add automation/adws/adw_modules/agent.py automation/adws/adw_tests/test_commands_root.py`
13. Create commit with conventional format: `git commit -m "chore: fix COMMANDS_ROOT path calculation in agent.py (#250)"`
14. Push branch: `git push -u origin chore/250-fix-commands-root`

## Risks
- **Risk:** Fix might break existing workflows that depend on incorrect path
  - **Mitigation:** Review existing ADW logs and test suite to confirm no workflows depend on the broken path
- **Risk:** Path resolution might behave differently in CI environment
  - **Mitigation:** Add test coverage for `COMMANDS_ROOT` path validation; run CI tests before merging
- **Risk:** Other path calculations in automation layer might have similar bugs
  - **Mitigation:** Audit other uses of `project_root()` in automation modules (defer to follow-up issue if found)

## Validation Commands
- `cd automation && uv run pytest adws/adw_tests/test_commands_root.py -v` — Run new unit test
- `cd automation && uv run pytest adws/adw_tests/ -v` — Run full ADW test suite
- `cd automation && python -m py_compile adws/adw_modules/agent.py` — Python syntax check
- `cd automation && uv run adws/adw_sdlc.py <test-issue-number>` — Manual ADW workflow test
- `ls -la .claude/commands/` — Verify target directory exists

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: fix COMMANDS_ROOT path calculation in agent.py` not `Based on the plan, the commit should fix COMMANDS_ROOT`

Example valid commit message:
```
chore: fix COMMANDS_ROOT path calculation in agent.py (#250)
```

## Deliverables
- Code changes:
  - `automation/adws/adw_modules/agent.py:29` — Remove `.parent` from COMMANDS_ROOT path calculation
- Test coverage:
  - `automation/adws/adw_tests/test_commands_root.py` — Unit test for path resolution validation
- Validation:
  - All existing ADW tests pass
  - New unit test passes
  - Manual ADW workflow test completes successfully with classification phase working
