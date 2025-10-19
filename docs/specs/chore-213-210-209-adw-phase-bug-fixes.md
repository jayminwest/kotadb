# Chore Plan: ADW Phase Bug Fixes (Issues 213, 210, 209)

## Context

Three critical ADW workflow bugs were discovered during deep dive testing (issue #208):

1. **Issue 213**: Build phase reports "Solution implemented" when no changes made (contradictory messaging)
2. **Issue 210**: Plan phase reports success despite git push failures (silent failure)
3. **Issue 209**: Workflow crashes when issue classified as out-of-scope ("0" classification)

All three issues are high priority, small effort, and affect ADW reliability. Fixing them together ensures consistent error handling and messaging patterns across all phases. This chore unblocks confident ADW usage and improves developer debugging experience.

**Constraints:**
- Must preserve existing resilience architecture (retry logic, checkpoints)
- Must maintain backward compatibility with existing ADW state files
- Changes must pass automation CI (63 pytest tests)

## Relevant Files

- `automation/adws/adw_phases/adw_build.py` — Build phase messaging logic (issue 213)
- `automation/adws/adw_phases/adw_plan.py` — Plan phase push failure handling (issue 210)
- `automation/adws/adw_modules/workflow_ops.py` — Issue classification handling (issue 209)
- `automation/adws/adw_modules/git_ops.py` — Git operations (push_branch return values)
- `automation/adws/adw_modules/github_ops.py` — GitHub commenting (format_issue_message)
- `automation/adw_tests/test_phases.py` — Phase execution tests
- `automation/adw_tests/test_workflow_ops.py` — Workflow operation tests
- `automation/adw_tests/test_git_ops.py` — Git operation tests

### New Files

- `automation/adw_tests/fixtures/out_of_scope_issue.json` — Test fixture for issue 209

## Work Items

### Preparation

1. Create branch `chore/213-210-209-adw-phase-bug-fixes` from `develop`
2. Verify local git configuration (email settings for push testing)
3. Review existing ADW test fixtures and helpers

### Execution

#### Issue 209: Out-of-Scope Classification Handling

1. Update `adw_modules/workflow_ops.py` to handle `"0"` classification:
   - Modify `classify_issue()` to detect `"0"` response
   - Add graceful skip logic with informative GitHub comment
   - Exit with code 0 (success - skipping is correct behavior)
2. Add test coverage for out-of-scope classification path
3. Document classification outcomes in ADW README

#### Issue 210: Plan Phase Push Failure Handling

1. Update `adw_phases/adw_plan.py` to check `push_branch()` return value:
   - Add conditional logic to detect push failures
   - Post error comment with troubleshooting guidance
   - Exit with code 1 (failure) when push fails
   - Do NOT post "Planning phase completed" on push failure
2. Enhance `adw_modules/git_ops.py` `push_branch()`:
   - Return structured error information (error type, message)
   - Detect error categories: email privacy (GH007), network, auth
3. Add retry logic for transient push failures (network issues only):
   - 3 attempts with exponential backoff (1s, 3s, 5s)
   - Non-retryable errors: email privacy, authentication
4. Update tests to cover push failure scenarios and retry logic

#### Issue 213: Build Phase Messaging Clarity

1. Update `adw_phases/adw_build.py` messaging logic:
   - Remove premature "Solution implemented" message
   - Detect whether changes were made via `git status --porcelain`
   - Post outcome-specific messages:
     - Changes made: "✅ Implementation complete (N files changed)"
     - No changes: "⏭️ No implementation needed (test issue or already complete)"
     - Failure: "❌ Implementation failed: [reason]"
2. Update final "Build phase completed" message to reflect outcome:
   - "Build phase completed (N files changed)"
   - "Build phase completed (no changes needed)"
3. Add file change count utility function
4. Update tests to verify correct messaging for both scenarios

### Follow-up

1. Run full automation test suite to validate all fixes
2. Test end-to-end ADW workflow with test issue (classification "0")
3. Test plan phase with push failure scenario (email privacy restriction)
4. Test build phase with no-changes scenario
5. Update ADW observability documentation with new messaging patterns
6. Push branch and validate CI passes

## Step by Step Tasks

### Issue 209: Out-of-Scope Classification

1. Read `automation/adws/adw_modules/workflow_ops.py` to understand classification logic
2. Modify `classify_issue()` to add `"0"` handling:
   ```python
   if classification == "0":
       make_issue_comment(issue_number, format_issue_message(
           adw_id, "ops",
           "⏭️ Issue classified as out-of-scope for automation (test/analysis work)"
       ))
       return None  # Signal graceful skip
   ```
3. Update caller code to handle `None` return value (graceful exit)
4. Add test case for out-of-scope classification
5. Run `pytest automation/adw_tests/test_workflow_ops.py -v`

### Issue 210: Push Failure Handling

1. Read `automation/adws/adw_modules/git_ops.py` to understand `push_branch()` implementation
2. Modify `push_branch()` to return structured error information:
   ```python
   def push_branch(branch_name: str, worktree_path: str) -> dict:
       """Returns: {"success": bool, "error_type": str, "error_message": str}"""
   ```
3. Add error type detection (regex patterns for GH007, network, auth errors)
4. Add retry logic wrapper for network errors (exponential backoff)
5. Update `automation/adws/adw_phases/adw_plan.py` to check push result:
   ```python
   push_result = push_branch(branch_name, worktree_path)
   if not push_result["success"]:
       make_issue_comment(issue_number, format_issue_message(
           adw_id, "ops",
           f"❌ Error pushing branch: {push_result['error_message']}\n\n" +
           get_push_troubleshooting_guidance(push_result["error_type"])
       ))
       sys.exit(1)  # Phase failure
   ```
6. Remove "Planning phase completed" message when push fails
7. Add test cases for push failure scenarios (email privacy, network, auth)
8. Run `pytest automation/adw_tests/test_git_ops.py -v`
9. Run `pytest automation/adw_tests/test_phases.py::test_plan_phase_push_failure -v`

### Issue 213: Build Phase Messaging

1. Read `automation/adws/adw_phases/adw_build.py` to understand messaging flow
2. Add utility function to count changed files:
   ```python
   def get_changed_files_count(worktree_path: str) -> int:
       """Run `git status --porcelain` and count modified files"""
   ```
3. Remove premature "Solution implemented" message (line ~140)
4. Add outcome detection logic before final message:
   ```python
   changed_count = get_changed_files_count(worktree_path)
   if changed_count > 0:
       make_issue_comment(issue_number, format_issue_message(
           adw_id, AGENT_IMPLEMENTOR,
           f"✅ Implementation complete ({changed_count} files changed)"
       ))
   else:
       make_issue_comment(issue_number, format_issue_message(
           adw_id, AGENT_IMPLEMENTOR,
           "⏭️ No implementation needed (test issue or already complete)"
       ))
   ```
5. Update "Build phase completed" message to include outcome
6. Add test cases for both scenarios (changes vs. no-changes)
7. Run `pytest automation/adw_tests/test_phases.py::test_build_phase_messaging -v`

### Validation and Push

1. Run full automation test suite: `cd automation && pytest -v`
2. Verify all 63+ tests pass (including new test cases)
3. Run Python syntax check: `python -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py`
4. Validate commit messages follow Conventional Commits format
5. Push branch: `git push -u origin chore/213-210-209-adw-phase-bug-fixes`
6. Verify Automation CI passes in GitHub Actions

## Risks

| Risk | Mitigation |
|------|-----------|
| Breaking existing ADW workflows in progress | Use feature flags for new messaging, test with non-production issues first |
| Retry logic introduces delays for non-retryable errors | Detect error types upfront, skip retry for known non-transient errors |
| Changed file count detection fails for edge cases (renames, submodules) | Use `git status --porcelain` with comprehensive parsing, add test coverage |
| Messaging changes break log parsing scripts | Update `automation/adws/scripts/analyze_logs.py` to handle new message formats |
| Push failure detection too aggressive (false positives) | Test against known failure scenarios, use explicit error pattern matching |

## Validation Commands

### Core Validation
- `cd automation && pytest -v` (full test suite)
- `cd automation && pytest adw_tests/test_workflow_ops.py -v` (classification tests)
- `cd automation && pytest adw_tests/test_git_ops.py -v` (push failure tests)
- `cd automation && pytest adw_tests/test_phases.py -v` (phase messaging tests)
- `python -m py_compile automation/adws/adw_modules/*.py automation/adws/adw_phases/*.py`

### Supplemental Checks (from /validate-implementation)
- **Error handling**: Test all three failure scenarios end-to-end
- **Message formats**: Verify GitHub comments render correctly in UI
- **State persistence**: Ensure ADW state files not corrupted by new logic
- **Retry behavior**: Validate exponential backoff timing (network errors only)
- **Classification edge cases**: Test malformed classifier output handling

### End-to-End Integration
1. Trigger ADW workflow with out-of-scope issue (classification "0")
2. Trigger ADW workflow with push failure scenario (email privacy restriction)
3. Trigger ADW workflow with no-changes scenario (test issue)
4. Verify all three scenarios produce clear, non-contradictory messaging

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(adw): handle out-of-scope classification gracefully` not `Based on the plan, the commit should handle out-of-scope issues`

**Example commit sequence:**
1. `fix(adw): handle out-of-scope classification without crash (#209)`
2. `fix(adw): fail plan phase when git push fails (#210)`
3. `fix(adw): clarify build phase messaging for no-changes scenarios (#213)`
4. `test(adw): add coverage for classification and push failure scenarios`
5. `docs(adw): update README with new messaging patterns`

## Deliverables

### Code Changes
- `automation/adws/adw_modules/workflow_ops.py` — Out-of-scope classification handling
- `automation/adws/adw_modules/git_ops.py` — Push failure detection and retry logic
- `automation/adws/adw_phases/adw_plan.py` — Push failure exit behavior
- `automation/adws/adw_phases/adw_build.py` — Outcome-specific messaging

### Test Coverage
- `automation/adw_tests/test_workflow_ops.py` — Classification "0" test cases
- `automation/adw_tests/test_git_ops.py` — Push failure and retry test cases
- `automation/adw_tests/test_phases.py` — Build phase messaging test cases
- `automation/adw_tests/fixtures/out_of_scope_issue.json` — Test fixture

### Documentation Updates
- `automation/adws/README.md` — Document new messaging patterns and error handling
- `automation/adws/README.md` — Update "Resilience & Recovery" section with push retry logic
- Update inline code comments for clarity

### Configuration
- No configuration changes required (no breaking changes to environment variables)
