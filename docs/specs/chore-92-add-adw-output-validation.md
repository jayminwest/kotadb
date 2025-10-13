# Chore Plan: Add Output Validation for ADW Workflows

## Context
PR #90 revealed systemic quality issues in ADW-generated outputs:
- Commit `bb631a1` contained raw agent reasoning instead of proper Conventional Commit format
- Spec file present in one commit but missing from final commit
- PR descriptions missing validation evidence and command output

These issues stem from lack of validation checkpoints between agent execution and git/GitHub operations. This chore introduces systematic validation to catch malformed outputs before they pollute git history or create reviewer burden.

**Why now**: High priority issue blocking trust in ADW automation. Every ADW-generated PR risks similar quality problems until validation is in place.

**Constraints**: Must not break existing ADW workflows. Validation should provide clear, actionable feedback without introducing false positives.

## Relevant Files
- `automation/adws/adw_modules/workflow_ops.py` — Integration point for commit message validation
- `automation/adws/adw_modules/agent.py` — Agent execution context where validation hooks apply
- `automation/adws/adw_modules/data_types.py` — Data structures for validation results
- `.claude/commands/pull_request` — Integration point for PR description validation

### New Files
- `automation/adws/adw_modules/validation.py` — Core validation functions (commit messages, PR descriptions, file staging)
- `automation/adws/adw_tests/test_validation.py` — Test suite for validation logic
- `docs/adws/validation.md` — Documentation for validation rules and integration points

## Work Items

### Preparation
- Review historical bad commits from PR #90 to extract validation test cases
- Document Conventional Commits patterns used in existing good commits
- Identify integration points in `workflow_ops.py` and `/pull_request` template

### Execution
**Phase 1: Commit Message Validation (Highest Impact)**
- Create `validation.py` module with `validate_commit_message()` function
- Implement Conventional Commits format check with regex pattern
- Add meta-commentary detection (agent reasoning leakage patterns)
- Integrate validation into `workflow_ops.create_commit_message()`
- Add unit tests with good/bad examples from PR #90

**Phase 2: PR Description Validation (Medium Impact)**
- Implement `validate_pr_description()` function
- Check for "Validation Evidence" section presence
- Verify file count matches `git diff --stat` output
- Validate checklist items have status markers (✅/❌/N/A)
- Integrate into `/pull_request` template or `create_pull_request()` function

**Phase 3: File Inclusion Verification (Medium Impact)**
- Implement `verify_staged_files()` function
- Extract file references from plan using regex patterns
- Compare against `git diff --cached --name-only` output
- Detect discrepancies between plan and staged files
- Integrate into build/implementation phases

**Phase 4: Testing & Documentation**
- Add integration test forcing validation failures
- Validate against historical bad commits from PR #90
- Document validation rules in `docs/adws/validation.md`
- Update `.claude/commands/docs/conditional_docs.md` with validation doc conditions

### Follow-up
- Monitor first 3 ADW runs with validation enabled
- Collect false positive/negative feedback
- Tune validation patterns based on real-world usage
- Consider adding validation metrics to ADW state tracking

## Step by Step Tasks

### 1. Create Validation Module
- Create `automation/adws/adw_modules/validation.py` with module docstring
- Implement `validate_commit_message(message: str) -> Tuple[bool, Optional[str]]`
  - Regex pattern: `^(feat|fix|chore|docs|test|refactor|perf|ci|build|style)(\(.+\))?: .{1,72}`
  - Meta-commentary detection patterns: "based on", "the commit should", "here is", "this commit", "i can see", "looking at"
  - Return `(is_valid, error_message)` tuple
- Implement `validate_pr_description(description: str, staged_files: List[str]) -> Tuple[bool, Optional[str]]`
  - Check for "Validation Evidence" or "### Validation" section
  - Extract file count from description, compare to `len(staged_files)`
  - Return validation result with descriptive error
- Implement `verify_staged_files(plan_file_path: str, cwd: str) -> Tuple[bool, Optional[str]]`
  - Read plan file and extract file references via regex: `` `([a-zA-Z0-9_/.-]+\.(py|ts|tsx|js|md|json))` ``
  - Run `git diff --cached --name-only` to get staged files
  - Compare mentioned files vs staged files, report missing files

### 2. Integrate Commit Message Validation
- Edit `automation/adws/adw_modules/workflow_ops.py`
- Import `from adw_modules.validation import validate_commit_message`
- In `create_commit_message()` function, after receiving agent response:
  - Call `validate_commit_message(message)`
  - If validation fails, log error with full message and return `(None, error_msg)`
  - If validation passes, proceed with existing logic

### 3. Integrate PR Description Validation
- Edit `.claude/commands/pull_request`
- Add validation step before `gh pr create`:
  ```markdown
  ## Before Creating PR

  Run validation checks:
  - Validate commit messages follow Conventional Commits format
  - Verify PR description includes validation evidence with actual command output
  - Check staged files match plan file references
  ```
- Or integrate into `workflow_ops.create_pull_request()` function if it exists

### 4. Create Test Suite
- Create `automation/adws/adw_tests/test_validation.py`
- Add test fixtures for good/bad commit messages (use examples from PR #90)
  - Valid: `"chore: add output validation for ADW workflows"`
  - Invalid: `"Based on the changes, the commit should add validation"`
  - Invalid: `"Here is a commit message for the changes"`
- Add test fixtures for PR descriptions
  - Valid: includes "## Validation Evidence" with command output
  - Invalid: missing validation section
  - Invalid: file count mismatch (claims 5, staged 3)
- Add test fixtures for file staging verification
  - Valid: plan mentions `validation.py`, file is staged
  - Invalid: plan mentions `validation.py`, file not staged
- Test each validation function with all fixtures

### 5. Documentation
- Create `docs/adws/validation.md` documenting:
  - Validation rules and patterns
  - Integration points in workflow
  - How to debug validation failures
  - Override mechanisms for exceptional cases
- Edit `.claude/commands/docs/conditional_docs.md`
- Add condition: `"When working with ADW workflow quality, validation rules, or commit/PR output formatting → docs/adws/validation.md"`

### 6. Validation and Integration Testing
- Run linting: `cd automation && uv run ruff check adws/`
- Run type checking: `cd automation && uv run mypy adws/adw_modules/validation.py`
- Run unit tests: `cd automation && uv run pytest adws/adw_tests/test_validation.py -v`
- Run integration test: trigger ADW workflow with intentionally bad commit message to verify rejection
- Validate against historical bad commits from PR #90 (extract commit `bb631a1` message, should fail validation)

### 7. Branch Push and PR Creation
- Commit all changes with message: `chore: add output validation for ADW workflows`
- Push branch: `git push -u origin chore/92-add-adw-output-validation`
- Run: `/pull_request chore/92-add-adw-output-validation <issue_json> docs/specs/chore-92-add-adw-output-validation.md <adw_id>`

## Risks

**Risk**: Validation introduces false positives, blocking valid commits
**Mitigation**: Start with comprehensive test suite using real examples. Log all validation failures with full context for debugging. Provide clear error messages for quick diagnosis.

**Risk**: Integration points in `workflow_ops.py` break existing workflows
**Mitigation**: Add validation as optional check initially (warnings only). Graduate to errors after validation proves reliable in 3+ workflow runs.

**Risk**: Regex patterns too strict, rejecting valid commit messages
**Mitigation**: Use established Conventional Commits spec. Test against historical good commits. Make patterns configurable via constants for easy adjustment.

**Risk**: File verification has false positives due to auto-generated files
**Mitigation**: Focus on files explicitly mentioned in plan. Warn rather than error for file discrepancies. Allow override mechanism for exceptional cases.

**Risk**: Validation errors unclear to agents, causing confusion
**Mitigation**: Provide actionable error messages with examples of valid formats. Include specific pattern that failed. Log full context for debugging.

## Validation Commands

**Linting**:
```bash
cd automation && uv run ruff check adws/
```

**Type Checking**:
```bash
cd automation && uv run mypy adws/adw_modules/validation.py
```

**Unit Tests**:
```bash
cd automation && uv run pytest adws/adw_tests/test_validation.py -v
```

**Integration Test**:
```bash
# Trigger ADW workflow with forced validation failure
cd automation && ADW_TEST_MODE=validation uv run python -m adws.adw_build --issue 92
```

**Historical Validation**:
```bash
# Extract bad commit message from PR #90, verify it fails validation
git show bb631a1 --format=%B --no-patch | python -c "
from adws.adw_modules.validation import validate_commit_message
import sys
message = sys.stdin.read().strip()
is_valid, error = validate_commit_message(message)
print(f'Valid: {is_valid}')
if error:
    print(f'Error: {error}')
sys.exit(0 if not is_valid else 1)  # Should fail (exit 0)
"
```

## Deliverables

**Code Changes**:
- `automation/adws/adw_modules/validation.py` - Core validation functions
- `automation/adws/adw_modules/workflow_ops.py` - Integrated commit message validation
- `.claude/commands/pull_request` - Integrated PR description validation

**Test Coverage**:
- `automation/adws/adw_tests/test_validation.py` - Comprehensive test suite with good/bad examples

**Documentation**:
- `docs/adws/validation.md` - Validation rules and integration guide
- `.claude/commands/docs/conditional_docs.md` - Updated with validation doc conditions

**Verification Evidence**:
- All validation tests pass with 100% coverage of validation functions
- Integration test demonstrates validation catching bad outputs
- Historical bad commit from PR #90 correctly rejected by validation
- Linting, type checking, and unit tests all pass
