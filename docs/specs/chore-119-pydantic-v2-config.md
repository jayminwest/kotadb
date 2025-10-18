# Chore Plan: Migrate Pydantic Models to V2 ConfigDict Pattern

## Context
The automation layer currently uses deprecated Pydantic V1 class-based `config` pattern in `automation/adws/adw_modules/data_types.py`. This causes deprecation warnings in all test runs and will break in Pydantic V3. Migration to the modern `ConfigDict` pattern is needed to maintain compatibility and eliminate warnings.

**Trigger**: Pre-existing technical debt identified during PR #118 review (kota-tasks MCP integration exposed these warnings).

**Constraints**:
- Must maintain backward compatibility with existing ADW workflows
- No changes to model validation behavior
- Pure refactoring (no new features)
- Zero Pydantic deprecation warnings after migration

## Relevant Files
- `automation/adws/adw_modules/data_types.py` — Contains deprecated models (lines 112, 126)
- `automation/adws/adw_modules/github.py` — Uses `GitHubIssue` and `GitHubIssueListItem` models for issue fetching
- `automation/adws/adw_modules/workflow_ops.py` — Uses both models in workflow orchestration (`minimal_issue_payload`, `classify_issue`, `generate_branch_name`, `build_plan`, `create_commit_message`, `create_pull_request`, `document_changes`, `persist_issue_snapshot`)
- `automation/adws/adw_tests/` — Test suite that validates model behavior

### New Files
None (pure refactoring)

## Work Items

### Preparation
1. Verify current deprecation warnings in test output
2. Document existing model configurations for validation
3. Confirm Pydantic version compatibility

### Execution
1. Update `GitHubIssueListItem` model (line 112)
   - Add `from pydantic import ConfigDict` to imports
   - Replace `class Config: populate_by_name = True` with `model_config = ConfigDict(populate_by_name=True)`
2. Update `GitHubIssue` model (line 126)
   - Replace `class Config: populate_by_name = True` with `model_config = ConfigDict(populate_by_name=True)`
3. Run full test suite to verify no behavioral changes
4. Verify zero Pydantic deprecation warnings in test output

### Follow-up
1. Validate all automation tests pass (63 tests)
2. Verify model serialization/deserialization works correctly
3. Confirm GitHub CLI integration still works with updated models

## Step by Step Tasks

### 1. Verify Baseline
- Run `cd automation && uv run pytest adws/adw_tests/ -v` to confirm deprecation warnings exist
- Document exact warning messages for validation

### 2. Update Imports
- Add `ConfigDict` to the import statement on line 10: `from pydantic import BaseModel, ConfigDict, Field`

### 3. Migrate GitHubIssueListItem Model
- Replace class-based config (lines 122-123) with:
  ```python
  model_config = ConfigDict(populate_by_name=True)
  ```

### 4. Migrate GitHubIssue Model
- Replace class-based config (lines 141-142) with:
  ```python
  model_config = ConfigDict(populate_by_name=True)
  ```

### 5. Run Full Test Suite
- Execute `cd automation && uv run pytest adws/adw_tests/ -v` to verify all tests pass
- Confirm zero Pydantic deprecation warnings in output
- Verify exit code is 0 (all tests passing)

### 6. Run Python Syntax Check
- Execute `cd automation && python3 -m py_compile adws/adw_modules/*.py` to verify syntax

### 7. Test Model Serialization
- Run quick validation: `cd automation && uv run python -c "from adws.adw_modules.data_types import GitHubIssue, GitHubIssueListItem; print('Import successful')"`
- Verify no import errors or warnings

### 8. Commit Changes
- Stage changes: `git add automation/adws/adw_modules/data_types.py`
- Create commit with message: `chore: migrate Pydantic models to V2 ConfigDict pattern (#119)`
- Verify commit message follows Conventional Commits format

### 9. Push Branch and Create PR
- Push branch: `git push -u origin chore/119-pydantic-v2-config`
- Run `/pull_request chore/119-pydantic-v2-config <issue_json> docs/specs/chore-119-pydantic-v2-config.md <adw_id>` to create PR

## Risks

**Risk**: Model serialization behavior changes subtly
**Mitigation**: Existing test suite validates all model usage; run full test suite before commit

**Risk**: Breaking changes in downstream workflows
**Mitigation**: Both models only use `populate_by_name=True` config, which has direct V2 equivalent; no complex config patterns to migrate

**Risk**: Import errors if ConfigDict not available
**Mitigation**: Project already uses Pydantic V2+ (warnings confirm V2 detection); ConfigDict is a core V2 feature

**Risk**: Field aliases stop working after migration
**Mitigation**: `populate_by_name=True` ensures both camelCase (GitHub API) and snake_case (Python) field names work; test suite validates this extensively via `by_alias=True` usage

## Validation Commands

Primary validation (must pass):
```bash
cd automation && uv run pytest adws/adw_tests/ -v
cd automation && python3 -m py_compile adws/adw_modules/*.py
```

Supplemental checks:
```bash
# Verify no deprecation warnings
cd automation && uv run pytest adws/adw_tests/ -v 2>&1 | grep -c "PydanticDeprecatedSince20"  # Should output 0

# Quick import check
cd automation && uv run python -c "from adws.adw_modules.data_types import GitHubIssue, GitHubIssueListItem; print('✓ Models imported successfully')"

# Verify model serialization still works
cd automation && uv run python -c "from adws.adw_modules.data_types import GitHubIssue; import json; model = GitHubIssue(**json.loads('{\"number\":1,\"title\":\"test\",\"body\":\"test\",\"state\":\"open\",\"author\":{\"login\":\"bot\"},\"createdAt\":\"2024-01-01T00:00:00Z\",\"updatedAt\":\"2024-01-01T00:00:00Z\",\"url\":\"https://github.com/test\"})); print('✓ Model deserialization works')"
```

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: migrate Pydantic models to V2 ConfigDict pattern` not `Based on the plan, the commit should migrate models`

## Deliverables
- Updated `automation/adws/adw_modules/data_types.py` with `ConfigDict` pattern
- All 63 automation tests passing
- Zero Pydantic deprecation warnings in test output
- Git commit following Conventional Commits format
- Pull request created with summary and validation results
