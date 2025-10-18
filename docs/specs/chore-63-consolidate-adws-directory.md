# Chore Plan: Consolidate automation/adws Directory Structure

## Context

The `automation/adws/` directory currently contains 37 Python files with significant organizational issues:
- **Duplicate files**: 5 files exist in both root and `adw_modules/` subdirectory
- **Excessive composite orchestrators**: 5 scripts that simply chain single-phase scripts
- **Flat directory structure**: 23 files in root directory make it difficult to locate phase scripts and utilities

This refactor consolidates the structure by:
1. Creating `adw_phases/` subdirectory for single-phase execution scripts
2. Removing duplicate root-level files (keeping canonical versions in `adw_modules/`)
3. Removing composite orchestrators that add no unique value
4. Updating all import statements to reflect new structure

**Why this matters now**: The current flat structure makes it difficult to add new automation phases and creates confusion about which version of utilities to import. This blocks issue #44 which requires clean phase organization.

**Constraints**: Must maintain backward compatibility for trigger scripts and CI automation workflows.

## Relevant Files

### Root Files (to be moved or removed)
- `automation/adws/adw_plan.py` — Move to `adw_phases/` (single-phase script)
- `automation/adws/adw_build.py` — Move to `adw_phases/` (single-phase script)
- `automation/adws/adw_test.py` — Move to `adw_phases/` (single-phase script)
- `automation/adws/adw_review.py` — Move to `adw_phases/` (single-phase script)
- `automation/adws/adw_document.py` — Move to `adw_phases/` (single-phase script)
- `automation/adws/adw_patch.py` — Move to `adw_phases/` (single-phase script)
- `automation/adws/agent.py` — Remove (duplicate, use `adw_modules/agent.py`)
- `automation/adws/data_types.py` — Remove (duplicate, use `adw_modules/data_types.py`)
- `automation/adws/github.py` — Remove (duplicate, use `adw_modules/github.py`)
- `automation/adws/utils.py` — Remove (duplicate, use `adw_modules/utils.py`)
- `automation/adws/ts_helpers.py` — Remove (duplicate, use `adw_modules/ts_commands.py`)
- `automation/adws/adw_plan_build.py` — Remove (composite orchestrator)
- `automation/adws/adw_plan_build_document.py` — Remove (composite orchestrator)
- `automation/adws/adw_plan_build_review.py` — Remove (composite orchestrator)
- `automation/adws/adw_plan_build_test.py` — Remove (composite orchestrator)
- `automation/adws/adw_plan_build_test_review.py` — Remove (composite orchestrator)

### Orchestrator (requires import updates)
- `automation/adws/adw_sdlc.py` — Update imports to reference `adw_phases/` scripts
- `automation/adws/adw_modules/orchestrators.py` — Update `run_sequence()` to handle new phase paths

### Trigger Scripts (require import updates)
- `automation/adws/trigger_cron.py` — Verify no direct phase imports (uses orchestrators)
- `automation/adws/trigger_webhook.py` — Verify no direct phase imports (uses orchestrators)
- `automation/adws/adw_triggers/adw_trigger_cron_homeserver.py` — Update script paths for delegation

### Home Server Workflows (require import updates)
- `automation/adws/adw_build_update_homeserver_task.py` — Already imports from `adw_modules/` (verify)
- `automation/adws/adw_plan_implement_update_homeserver_task.py` — Update script paths if needed

### Documentation
- `automation/adws/README.md` — Update directory structure documentation
- `.claude/commands/docs/conditional_docs.md` — Add automation structure documentation condition

### New Files
- `automation/adws/adw_phases/__init__.py` — Python package marker
- `automation/adws/adw_phases/adw_plan.py` — Moved from root
- `automation/adws/adw_phases/adw_build.py` — Moved from root
- `automation/adws/adw_phases/adw_test.py` — Moved from root
- `automation/adws/adw_phases/adw_review.py` — Moved from root
- `automation/adws/adw_phases/adw_document.py` — Moved from root
- `automation/adws/adw_phases/adw_patch.py` — Moved from root

## Work Items

### Preparation
1. Create feature branch: `chore/63-consolidate-adws-directory` from `develop`
2. Verify no uncommitted changes in `automation/adws/`
3. Create backup of current directory state: `git stash` (if needed)
4. Verify automation tests pass before refactor: `uv run pytest automation/adws/adw_tests/`

### Execution
1. Create new `automation/adws/adw_phases/` directory
2. Create `automation/adws/adw_phases/__init__.py` package marker
3. Move 6 phase scripts from root to `adw_phases/`:
   - `adw_plan.py`, `adw_build.py`, `adw_test.py`, `adw_review.py`, `adw_document.py`, `adw_patch.py`
4. Update imports in moved phase scripts (verify they already use `adw_modules/` imports)
5. Update `automation/adws/adw_sdlc.py` to reference `adw_phases/` scripts in `run_sequence()` call
6. Update `automation/adws/adw_modules/orchestrators.py` if needed to handle new phase script paths
7. Update `automation/adws/adw_triggers/adw_trigger_cron_homeserver.py` to use new phase script paths (lines 405-407, 409)
8. Update `automation/adws/adw_plan_implement_update_homeserver_task.py` if it references phase scripts directly
9. Remove 5 duplicate files from root:
   - `agent.py`, `data_types.py`, `github.py`, `utils.py`, `ts_helpers.py`
10. Remove 5 composite orchestrators from root:
    - `adw_plan_build.py`, `adw_plan_build_document.py`, `adw_plan_build_review.py`, `adw_plan_build_test.py`, `adw_plan_build_test_review.py`
11. Update `automation/adws/README.md` with new directory structure and usage examples
12. Verify file count reduced from 37 to 28 Python files

### Follow-up
1. Run automation test suite: `uv run pytest automation/adws/adw_tests/`
2. Verify health check passes: `uv run automation/adws/health_check.py --json`
3. Test single-phase execution: `uv run automation/adws/adw_phases/adw_plan.py --help`
4. Verify trigger scripts parse correctly: `uv run automation/adws/adw_triggers/adw_trigger_cron_homeserver.py --help`
5. Check no broken imports: `python -m py_compile automation/adws/**/*.py`
6. Update `.claude/commands/docs/conditional_docs.md` with automation structure documentation condition
7. Commit changes with descriptive message
8. Push branch and create PR

## Step by Step Tasks

### 1. Preparation and Environment Setup
- Verify working directory is project root
- Create feature branch: `git checkout develop && git pull && git checkout -b chore/63-consolidate-adws-directory`
- Run baseline tests: `cd automation/adws && uv run pytest adw_tests/`
- Verify file count: `find automation/adws -type f -name "*.py" | wc -l` (expect 37)

### 2. Create New Phase Directory Structure
- Create directory: `mkdir -p automation/adws/adw_phases`
- Create package marker: `touch automation/adws/adw_phases/__init__.py`

### 3. Move Phase Scripts to New Directory
- Move 6 phase scripts: `git mv automation/adws/adw_plan.py automation/adws/adw_phases/`
- Move: `git mv automation/adws/adw_build.py automation/adws/adw_phases/`
- Move: `git mv automation/adws/adw_test.py automation/adws/adw_phases/`
- Move: `git mv automation/adws/adw_review.py automation/adws/adw_phases/`
- Move: `git mv automation/adws/adw_document.py automation/adws/adw_phases/`
- Move: `git mv automation/adws/adw_patch.py automation/adws/adw_phases/`

### 4. Update Orchestrator Import References
- Update `automation/adws/adw_sdlc.py`: Change `run_sequence()` step paths from `"adw_plan.py"` to `"adw_phases/adw_plan.py"` (and same for other 5 phases)
- Update `automation/adws/adw_modules/orchestrators.py`: Verify `run_sequence()` handles subdirectory paths correctly

### 5. Update Trigger Script References
- Update `automation/adws/adw_triggers/adw_trigger_cron_homeserver.py`: Change script path resolution (lines 405-410) to use `Path(__file__).parent.parent / "adw_phases" / script_name`

### 6. Update Home Server Workflow References
- Review `automation/adws/adw_plan_implement_update_homeserver_task.py`: Check if it references phase scripts directly (update if needed)
- Verify `automation/adws/adw_build_update_homeserver_task.py`: Confirm it uses `adw_modules/` imports only (no changes needed)

### 7. Remove Duplicate Root Files
- Remove duplicates: `git rm automation/adws/agent.py automation/adws/data_types.py automation/adws/github.py automation/adws/utils.py automation/adws/ts_helpers.py`

### 8. Remove Composite Orchestrators
- Remove orchestrators: `git rm automation/adws/adw_plan_build.py automation/adws/adw_plan_build_document.py automation/adws/adw_plan_build_review.py automation/adws/adw_plan_build_test.py automation/adws/adw_plan_build_test_review.py`

### 9. Update Documentation
- Update `automation/adws/README.md`: Document new `adw_phases/` subdirectory structure with updated examples
- Update `.claude/commands/docs/conditional_docs.md`: Add condition for when to read automation structure docs

### 10. Validation and Testing
- Verify file count: `find automation/adws -type f -name "*.py" | wc -l` (expect 28, reduced from 37)
- Run automation tests: `cd automation/adws && uv run pytest adw_tests/`
- Verify health check: `uv run automation/adws/health_check.py --json`
- Test single-phase script: `uv run automation/adws/adw_phases/adw_plan.py --help`
- Test trigger script parsing: `uv run automation/adws/adw_triggers/adw_trigger_cron_homeserver.py --help`
- Check imports compile: `python -m compileall automation/adws -q`

### 11. Commit and Push
- Stage all changes: `git add -A`
- Commit with message:
  ```
  chore: consolidate automation/adws directory structure with adw_phases subdirectory (#63)

  - Create adw_phases/ subdirectory for single-phase execution scripts
  - Move 6 phase scripts (plan, build, test, review, document, patch) into adw_phases/
  - Remove 5 duplicate files from root (agent, data_types, github, utils, ts_helpers)
  - Remove 5 composite orchestrators (plan_build variants)
  - Update orchestrator and trigger imports to reference new phase paths
  - Update README.md with new directory structure documentation
  - Reduce file count from 37 to 28 Python files (24% reduction)

  This refactor aligns with 12 atomic concepts of AI developer workflows:
  ADWS → templates → plans → architecture → tests → docs → types → stdout → tools → prompt → model → context

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```
- Push branch: `git push -u origin chore/63-consolidate-adws-directory`

### 12. Create Pull Request
- Get issue JSON: `gh issue view 63 --json number,title,body,labels > /tmp/issue-63.json`
- Store plan path: `plan_path="docs/specs/chore-63-consolidate-adws-directory.md"`
- Generate ADW ID: `adw_id=$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d'-' -f1)`
- Create PR: Run `/pull_request chore/63-consolidate-adws-directory /tmp/issue-63.json $plan_path $adw_id`

## Risks

| Risk | Mitigation |
|------|------------|
| Import paths break in CI automation | Test automation CI pipeline in PR before merging; verify `.github/workflows/automation-ci.yml` passes |
| Trigger scripts fail to locate phase scripts | Update path resolution in trigger scripts to use `adw_phases/` subdirectory; test with `--help` flags |
| Home server workflows break | Verify home server workflow scripts compile and parse correctly; check script path resolution logic |
| Tests reference old import paths | Run full test suite before and after refactor; update test imports if needed |
| `run_sequence()` orchestrator fails | Verify `orchestrators.py` handles subdirectory paths; may need to update path resolution logic |

## Validation Commands

Required validations:
```bash
# Automation tests (primary validation)
cd automation/adws && uv run pytest adw_tests/

# Health check (environment readiness)
uv run automation/adws/health_check.py --json

# Import compilation check
python -m compileall automation/adws -q

# File count verification
find automation/adws -type f -name "*.py" | wc -l  # expect 28

# Single-phase execution test
uv run automation/adws/adw_phases/adw_plan.py --help

# Trigger script parsing test
uv run automation/adws/adw_triggers/adw_trigger_cron_homeserver.py --help

# Orchestrator test
uv run automation/adws/adw_sdlc.py --help
```

CI validation (runs automatically in PR):
```bash
# Automation CI pipeline
.github/workflows/automation-ci.yml
```

## Deliverables

1. **Code changes**:
   - New `automation/adws/adw_phases/` subdirectory with 6 phase scripts
   - Updated `adw_sdlc.py` orchestrator with new import paths
   - Updated `adw_triggers/adw_trigger_cron_homeserver.py` with new script paths
   - Removed 10 files (5 duplicates + 5 composite orchestrators)
   - File count reduced from 37 to 28 Python files (24% reduction)

2. **Documentation updates**:
   - Updated `automation/adws/README.md` with new directory structure
   - Updated `.claude/commands/docs/conditional_docs.md` with automation structure condition
   - This plan document in `docs/specs/chore-63-consolidate-adws-directory.md`

3. **Validation evidence**:
   - All automation tests pass
   - Health check returns success
   - Import compilation succeeds
   - Single-phase and trigger scripts parse correctly
   - CI automation pipeline passes
