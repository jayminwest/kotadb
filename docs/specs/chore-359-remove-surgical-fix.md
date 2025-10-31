# Chore Plan: Remove Surgical Fix Workflow and Testing Infrastructure

## Context

The surgical fix workflow (`automation/adws/surgical_fix.py`) was implemented as an experimental end-to-end automation for critical bug fixes but has introduced unnecessary complexity and maintenance burden without clear production value.

**Evidence of bloat:**
- 1,652 total lines of code (1,143 in main module, 509 in tests)
- 3 failing tests blocking CI on develop and all feature branches
- Feature never used in production
- Overlaps with existing orchestrator command (#187)
- Adds 40+ references throughout automation layer

**CI impact:** Tests fail consistently across multiple runs, blocking the Automation CI workflow and creating noise in PR reviews.

**Rationale:** Remove experimental code to reduce maintenance burden, eliminate CI blockers, and improve codebase clarity.

## Relevant Files

- `automation/adws/surgical_fix.py` — Main surgical fix workflow module (1,143 lines)
- `automation/adws/adw_tests/test_surgical_fix.py` — Test suite (509 lines)
- `automation/adws/docs/surgical-fix-usage.md` — Usage documentation
- `docs/specs/feature-354-surgical-fix-workflow.md` — Feature specification
- `automation/adws/adw_modules/data_types.py:351-394` — SurgicalFixState, ReproductionResult, CIMonitoringResult, AutoMergeResult models
- `automation/adws/README.md:88-124` — Surgical fix workflow documentation section
- `.claude/commands/workflows/adw-architecture.md:99-132` — Surgical fix architecture documentation
- GitHub Issue #354 — Original feature issue requiring closure

### New Files

None (deletion only)

## Work Items

### Preparation
- Verify no active production usage of surgical fix workflow
- Review all identified file references
- Backup surgical_fix.py and tests to feature branch before deletion
- Confirm issue #354 exists and is open

### Execution
- Delete core files: `surgical_fix.py`, `test_surgical_fix.py`, usage docs, feature spec
- Remove surgical fix data models from `data_types.py` (lines 351-394)
- Update `data_types.py` `__all__` export list to remove deleted models
- Remove surgical fix section from `automation/adws/README.md` (lines 88-124)
- Remove surgical fix section from `.claude/commands/workflows/adw-architecture.md` (lines 99-132)
- Verify no remaining references using grep search
- Close issue #354 as "wontfix" with reference to this removal issue

### Follow-up
- Verify Automation CI passes after removal
- Confirm no import errors in automation layer
- Monitor CI health on develop after merge

## Step by Step Tasks

### 1. Pre-deletion verification
- Run `grep -r "from surgical_fix import" automation/adws/` to confirm no external imports
- Run `grep -r "import surgical_fix" automation/adws/` to confirm no external imports
- Run `gh issue view 354 --json state,title` to verify issue exists

### 2. Delete core files
- Delete `automation/adws/surgical_fix.py`
- Delete `automation/adws/adw_tests/test_surgical_fix.py`
- Delete `automation/adws/docs/surgical-fix-usage.md`
- Delete `docs/specs/feature-354-surgical-fix-workflow.md`

### 3. Remove data models from data_types.py
- Remove `ReproductionResult` class (lines 351-358)
- Remove `CIMonitoringResult` class (lines 360-366)
- Remove `AutoMergeResult` class (lines 368-373)
- Remove `SurgicalFixState` class (lines 375-394)
- Remove `"AutoMergeResult"`, `"CIMonitoringResult"`, `"ReproductionResult"`, `"SurgicalFixState"` from `__all__` list (lines 400, 405, 423, 427)

### 4. Remove documentation references
- Remove lines 88-124 from `automation/adws/README.md` (entire "Surgical Fix Workflow" section)
- Remove lines 99-132 from `.claude/commands/workflows/adw-architecture.md` (entire "Surgical Fix Workflow" section)

### 5. Verify no remaining references
- Run `grep -ri "surgical.fix" automation/` to find any remaining references
- Run `grep -ri "surgical.fix" .claude/` to find doc references
- Run `grep -ri "surgical.fix" docs/` to find spec references
- Manually verify no matches found

### 6. Close related issue
- Run `gh issue close 354 --reason "not planned" --comment "Closing as wontfix. The surgical fix workflow introduced unnecessary complexity without production usage. Removed in #359 to reduce maintenance burden and eliminate CI blockers. The existing orchestrator command (#187) provides sufficient automation coverage."`

### 7. Verify no import errors
- Run `cd automation && uv run python -c "from adws.adw_modules import data_types"` to verify data_types imports cleanly
- Run `cd automation && uv run python -c "import adws.adw_modules.data_types as dt; print(dt.__all__)"` to verify __all__ exports

### 8. Run full test suite
- Run `cd automation && uv run pytest adws/adw_tests/ -v` to verify all tests pass
- Confirm expected result: 221 passed, 10 skipped (3 fewer failures than before)

### 9. Stage, commit, and push
- Run `git add -A` to stage all changes
- Run validation commands (see section below)
- Create commit with message: `chore: remove surgical fix workflow and testing infrastructure (#359)`
- Run `git push -u origin chore/359-remove-surgical-fix` to push branch

## Risks

- **Import breakage in other modules** → Mitigated by grep search and import verification before deletion
- **Data model dependencies** → Mitigated by verifying models are only used in surgical_fix.py
- **Documentation drift** → Mitigated by searching all doc directories for references
- **CI configuration references** → Low risk, surgical fix not integrated into CI workflows

## Validation Commands

- `cd automation && uv run python -c "from adws.adw_modules import data_types"` — Verify clean imports
- `cd automation && uv run pytest adws/adw_tests/ -v` — Verify test suite passes
- `grep -ri "surgical.fix" automation/` — Verify no remaining code references
- `grep -ri "surgical.fix" .claude/` — Verify no remaining doc references
- `grep -ri "surgical.fix" docs/` — Verify no remaining spec references

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: remove surgical fix workflow and testing infrastructure` not `Based on the plan, the commit should remove surgical fix`

**Expected commit message:**
```
chore: remove surgical fix workflow and testing infrastructure (#359)
```

## Deliverables

- Deletion of 1,652 lines of code (surgical_fix.py + tests)
- Deletion of 44 lines of data models from data_types.py
- Removal of surgical fix documentation from README and architecture docs
- Closure of issue #354 as "wontfix"
- Clean Automation CI passing all 221 remaining tests
- No remaining references to surgical fix in codebase
