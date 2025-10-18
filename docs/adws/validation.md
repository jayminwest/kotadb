# ADW Output Validation

This document describes the validation system that ensures ADW-generated outputs meet quality standards before entering git history or creating reviewer burden.

## Overview

The validation system was introduced in response to systemic quality issues observed in PR #90, including:
- Raw agent reasoning in commit messages instead of proper Conventional Commit format
- Spec files present in intermediate commits but missing from final commit
- PR descriptions missing validation evidence and command output

Validation provides systematic checkpoints between agent execution and git/GitHub operations to catch malformed outputs early.

## Validation Rules

### Commit Message Validation

**Module**: `adw_modules/validation.py::validate_commit_message()`

**Integration Point**: `adw_modules/workflow_ops.py::create_commit_message()`

**Rules**:
1. Must follow Conventional Commits format: `<type>(<scope>): <subject>`
2. Valid types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `style`
3. Scope is optional but must be in parentheses if present
4. Subject must be 1-72 characters
5. No meta-commentary patterns indicating agent reasoning leakage

**Meta-Commentary Patterns** (rejected):
- "based on"
- "the commit should"
- "here is"
- "this commit"
- "i can see"
- "looking at"
- "the changes"
- "let me"

**Examples**:

Valid commits:
```
feat: add user authentication
fix: resolve login redirect issue
chore: add output validation for ADW workflows
feat(auth): implement JWT token refresh
```

Invalid commits:
```
Based on the changes, the commit should add validation
Here is a commit message for the validation work
The commit should describe the addition of validation
I can see from the git status that files were added
add validation for commit messages  (missing type)
added: validation logic  (invalid type)
```

**Error Handling**:
- Validation failures return `(None, error_message)` tuple
- Error messages include specific pattern that failed
- Full invalid message logged for debugging
- Agent can retry with corrected message

### PR Description Validation

**Module**: `adw_modules/validation.py::validate_pr_description()`

**Integration Point**: `.claude/commands/git/pull_request.md` template

**Rules**:
1. Must contain "Validation Evidence" or "### Validation" section
2. File count in description must match staged files count (if provided)
3. Description cannot be empty

**Examples**:

Valid PR description:
```markdown
## Summary
Added validation for ADW outputs.

## Validation Evidence
### Validation Level: 2
**Justification**: Level 2 - feature with new modules

**Commands Run**:
- ✅ `bun run lint` - passed
- ✅ `bun run typecheck` - passed
- ✅ `bun test --filter integration` - 25 tests passed

4 files changed, 120 insertions(+), 15 deletions(-)
```

Invalid PR description:
```markdown
## Summary
Just some changes.

No validation section present.
```

**Error Handling**:
- Missing validation section: returns descriptive error
- File count mismatch: returns error with expected vs actual counts
- Empty description: returns error

### File Staging Verification

**Module**: `adw_modules/validation.py::verify_staged_files()`

**Integration Point**: Build/implementation phases (future enhancement)

**Rules**:
1. Extract file references from plan markdown using regex pattern
2. Compare mentioned files against `git diff --cached --name-only` output
3. Report files mentioned in plan but not staged for commit

**File Pattern**:
- Matches: `` `path/to/file.ext` `` in markdown
- Supported extensions: `py`, `ts`, `tsx`, `js`, `md`, `json`, `yaml`, `yml`

**Examples**:

Plan file mentions:
```markdown
# Plan
- Create `validation.py` module
- Update `workflow_ops.py` file
- Add tests in `test_validation.py`
```

Staged files check:
```bash
git diff --cached --name-only
# Output:
# validation.py
# workflow_ops.py
# test_validation.py
```

Result: All mentioned files are staged ✅

**Error Handling**:
- Missing files: returns list of unstaged files mentioned in plan
- Plan file not found: returns file not found error
- Git command failure: returns git error message

## Integration Points

### Automatic Validation

Validation is automatically applied at these points in ADW workflows:

1. **Commit Message Creation** (`adw_modules/workflow_ops.py`)
   - After agent generates commit message
   - Before git commit operation
   - Validation failure prevents commit and returns error to workflow

2. **PR Creation** (`.claude/commands/git/pull_request.md`)
   - Agent instructed to verify commit messages in checklist
   - Agent instructed to verify PR description completeness
   - Manual verification step before `gh pr create` command

### Validation Workflow

```
Agent Output → Validation Function → Result
                                      ├─ Valid → Proceed
                                      └─ Invalid → Return Error + Log
```

**Commit Message Flow**:
```python
# workflow_ops.py::create_commit_message()
response = execute_template(request)  # Agent generates message
message = response.output.strip()

# Validate before returning
is_valid, error = validate_commit_message(message)
if not is_valid:
    logger.error(f"Validation failed: {error}")
    logger.error(f"Invalid message: {message}")
    return None, error  # Workflow halts

return message, None  # Proceed with commit
```

**PR Description Flow**:
```markdown
# .claude/commands/git/pull_request.md
## Preparation Checklist
5. Verify commit messages: Review with git log to ensure Conventional Commits format
6. Verify PR description: Ensure validation evidence section is complete
```

## Debugging Validation Failures

### Commit Message Validation Failed

**Symptoms**:
- Workflow halts after implementation phase
- Error message: "Commit message validation failed: ..."
- Agent logs show invalid commit message

**Diagnostics**:
1. Check agent logs: `logs/kota-db-ts/<env>/<adw_id>/<agent>/execution.log`
2. Look for validation error message with failed pattern
3. Review invalid message in logs

**Resolution**:
- Rerun agent with explicit instruction to use Conventional Commits format
- Verify `/commit` template is correctly structured
- Check for recent changes to commit generation logic

**Example Error**:
```
ERROR: Commit message validation failed: Commit message contains meta-commentary pattern 'based on'. Expected valid Conventional Commit format like: 'feat: add new feature'
ERROR: Invalid message was: Based on the git status, the commit should add validation
```

### PR Description Validation Failed

**Symptoms**:
- PR creation agent reports missing validation section
- GitHub PR has incomplete description

**Diagnostics**:
1. Check PR body template in `/pull_request` command
2. Verify validation evidence section is present
3. Check file count matches staged files

**Resolution**:
- Ensure agent includes validation evidence section
- Run validation commands and capture output
- Update PR description with complete evidence

### File Staging Verification Failed

**Symptoms**:
- Build phase reports missing files
- Git commit fails with "no changes to commit"

**Diagnostics**:
1. Run `git status --porcelain` in worktree
2. Check which files are tracked vs untracked
3. Compare plan file mentions to git status

**Resolution**:
- Stage missing files: `git add <file>`
- Verify agent used relative paths (not absolute)
- Check file creation logs for path issues

**Example Error**:
```
ERROR: Plan mentions files that are not staged for commit:
  - workflow_ops.py
  - test_validation.py
These files should be staged with 'git add' before committing.
```

## Testing Validation

### Unit Tests

Run validation unit tests:
```bash
cd automation
uv run pytest adws/adw_tests/test_validation.py -v
```

Test coverage includes:
- Valid commit messages (all types, with/without scopes)
- Invalid commit messages (meta-commentary, wrong format)
- Valid PR descriptions (with validation evidence)
- Invalid PR descriptions (missing sections, count mismatch)
- File staging verification (matched, missing, no files)

### Integration Testing

Test validation in real workflow:
```bash
# Trigger workflow with intentionally bad commit message
cd automation
ADW_TEST_MODE=validation uv run python -m adws.adw_build --issue 92
```

### Historical Validation

Verify bad commits from PR #90 are now rejected:
```bash
# Extract commit message from bad commit
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

## Override Mechanisms

### Temporary Bypass

For exceptional cases where validation needs to be bypassed:

**Not Currently Implemented**: Validation is enforced without override to ensure quality standards. If legitimate use case arises, add feature with:
- Environment variable: `ADW_SKIP_VALIDATION=true`
- CLI flag: `--skip-validation`
- Logging requirement: document why validation was skipped

### False Positive Reporting

If validation incorrectly rejects valid output:

1. File issue with example message and validation error
2. Add test case to `test_validation.py` with expected outcome
3. Adjust validation pattern to allow valid case
4. Verify no regression with historical bad examples

## Validation Metrics

Future enhancement: Track validation metrics in ADW state

Proposed metrics:
- `validation_checks_total`: Number of validation checks run
- `validation_failures_total`: Number of validation failures
- `validation_failures_by_type`: Breakdown by validation type
- `false_positives_reported`: User-reported false positives

## Configuration

Validation patterns are defined as constants in `adw_modules/validation.py`:

```python
# Conventional Commits pattern
COMMIT_MESSAGE_PATTERN = re.compile(
    r'^(feat|fix|chore|docs|test|refactor|perf|ci|build|style)(\(.+\))?: .{1,72}',
    re.MULTILINE
)

# Meta-commentary patterns
META_COMMENTARY_PATTERNS = [
    r'\bbased on\b',
    r'\bthe commit should\b',
    # ... more patterns
]
```

To adjust validation:
1. Edit patterns in `validation.py`
2. Add test cases to verify new behavior
3. Run full test suite to ensure no regressions
4. Document change in this file

## Related Documentation

- `/anti-mock` - Testing philosophy for validation tests
- `automation/adws/README.md` - ADW workflow architecture
- `.claude/commands/docs/prompt-code-alignment.md` - Template-code alignment principles
