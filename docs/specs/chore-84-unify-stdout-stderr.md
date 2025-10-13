# Chore Plan: Unify automation/ to use stdout/stderr universally

## Context
The `automation/` directory currently uses 142 `print()` calls across 16 Python files, creating output inconsistency that hinders:
- Log filtering and suppression during automated testing
- Structured logging implementation across both TypeScript and Python layers
- Uniform log level control
- Programmatic log parsing
- Cross-layer observability standards

This parallels #66, which standardized the `app/` TypeScript layer to use `process.stdout.write()` and `process.stderr.write()` instead of `console.*` methods. Standardizing Python output to `sys.stdout.write()` and `sys.stderr.write()` creates consistency across the entire codebase and unblocks future structured logging initiatives.

**Priority**: Medium
**Effort**: Medium (1-3 days)
**Component**: observability
**Status**: needs-investigation (becomes in-progress once plan approved)

## Constraints
- **No functional changes**: Output content and messages remain identical
- **Test compatibility**: All pytest tests must pass without modification
- **Human readability**: Preserve newline termination for CLI output
- **Structured logging preservation**: Existing `logger.*()` calls remain unchanged
- **Worktree execution**: Plan created in isolated worktree; all file paths relative to CWD

## Relevant Files
### Modified Files
- `automation/adws/adw_modules/agent.py` (7 print calls) — agent execution output
- `automation/adws/adw_modules/github.py` (7 print calls) — GitHub API interaction logs
- `automation/adws/trigger_webhook.py` (4 print calls) — webhook trigger logs
- `automation/adws/trigger_cron.py` (17 print calls) — cron trigger logs
- `automation/adws/health_check.py` (8 print calls) — health check output
- `automation/adws/adw_sdlc.py` (1 print call) — SDLC orchestrator output
- `automation/adws/adw_phases/adw_plan.py` (1 print call) — plan phase output
- `automation/adws/adw_phases/adw_build.py` (1 print call) — build phase output
- `automation/adws/adw_phases/adw_test.py` (1 print call) — test phase output
- `automation/adws/adw_phases/adw_review.py` (1 print call) — review phase output
- `automation/adws/adw_phases/adw_document.py` (1 print call) — document phase output
- `automation/adws/adw_phases/adw_patch.py` (1 print call) — patch phase output
- `automation/adws/adw_plan_implement_update_homeserver_task.py` (20 print calls) — home server workflow logs
- `automation/adws/adw_build_update_homeserver_task.py` (17 print calls) — home server workflow logs
- `automation/adws/adw_triggers/adw_trigger_cron_homeserver.py` (28 print calls) — home server trigger logs
- `automation/adws/scripts/validate-worktree-setup.py` (27 print calls) — validation script output

### New Files
None (output mechanism change only)

## Work Items

### Preparation
1. Verify current baseline: Run `uv run pytest automation/adws/adw_tests/` to establish passing test count
2. Confirm current `print()` usage: Run `grep -r "print(" automation/ --include="*.py" | wc -l` (should show ~142)
3. Verify Python `sys` module import patterns across affected files
4. Create safety checkpoint: Ensure git worktree is clean before modifications

### Execution
5. **Phase 1: Core modules (high-impact files)**
   - Replace `print()` in `agent.py` (7 occurrences) — agent execution, prompt saving, output parsing
   - Replace `print()` in `github.py` (7 occurrences) — API interaction logging
   - Add `import sys` if not already present in each file
   - Test pattern: `sys.stdout.write(str(message) + '\n')` for info, `sys.stderr.write(str(message) + '\n')` for errors

6. **Phase 2: Trigger systems (webhook/cron infrastructure)**
   - Replace `print()` in `trigger_webhook.py` (4 occurrences)
   - Replace `print()` in `trigger_cron.py` (17 occurrences)
   - Replace `print()` in `adw_triggers/adw_trigger_cron_homeserver.py` (28 occurrences)
   - Preserve FastAPI/uvicorn startup logs (framework-level output, not our code)

7. **Phase 3: Utilities and validation**
   - Replace `print()` in `health_check.py` (8 occurrences) — health check output
   - Replace `print()` in `scripts/validate-worktree-setup.py` (27 occurrences) — validation script output
   - Ensure JSON output mode (`--json` flag) uses `sys.stdout.write()` for structured output

8. **Phase 4: Phase scripts (SDLC automation)**
   - Replace `print()` in `adw_sdlc.py` (1 occurrence)
   - Replace `print()` in `adw_phases/adw_plan.py` (1 occurrence)
   - Replace `print()` in `adw_phases/adw_build.py` (1 occurrence)
   - Replace `print()` in `adw_phases/adw_test.py` (1 occurrence)
   - Replace `print()` in `adw_phases/adw_review.py` (1 occurrence)
   - Replace `print()` in `adw_phases/adw_document.py` (1 occurrence)
   - Replace `print()` in `adw_phases/adw_patch.py` (1 occurrence)

9. **Phase 5: Home server workflows**
   - Replace `print()` in `adw_plan_implement_update_homeserver_task.py` (20 occurrences)
   - Replace `print()` in `adw_build_update_homeserver_task.py` (17 occurrences)

### Follow-up
10. Run full test suite: `uv run pytest automation/adws/adw_tests/ -v` (must match baseline pass count)
11. Verify zero `print()` calls remain: `grep -r "print(" automation/ --include="*.py" | wc -l` (should return 0)
12. Manual smoke test: `uv run automation/adws/health_check.py --json` (verify JSON output format unchanged)
13. Manual smoke test: `uv run automation/adws/scripts/validate-worktree-setup.py` (verify human-readable output)
14. Commit changes with descriptive message
15. Push branch: `git push -u origin chore/84-unify-stdout-stderr`
16. Create pull request using `/pull_request` command

## Step by Step Tasks

### Preparation and Environment Validation
- Ensure working directory is clean: `git status`
- Record baseline test results: `uv run pytest automation/adws/adw_tests/ --tb=short`
- Count current `print()` usage: `grep -r "print(" automation/ --include="*.py" | wc -l`

### Phase 1: Core Modules (agent.py, github.py)
- Edit `automation/adws/adw_modules/agent.py`:
  - Verify `import sys` exists (already present at line 9)
  - Replace `print(f"Error parsing JSONL file: {exc}", file=sys.stderr)` at line 49 → already uses stderr correctly
  - Replace `print(f"Created JSON file: {json_file}")` at line 63 → `sys.stdout.write(f"Created JSON file: {json_file}\n")`
  - Replace `print(f"Saved prompt to: {prompt_file}")` at line 126 → `sys.stdout.write(f"Saved prompt to: {prompt_file}\n")`
  - Replace `print(error, file=sys.stderr)` at lines 203, 207, 212 → already uses stderr correctly
  - Replace `print(f"Output saved to: {output_path}")` at line 215 → `sys.stdout.write(f"Output saved to: {output_path}\n")`
  - Note: agent.py already follows stderr best practices for error messages; only stdout calls need conversion

- Edit `automation/adws/adw_modules/github.py`:
  - Add `import sys` if not present
  - Locate all 7 `print()` calls
  - Replace each with `sys.stdout.write(str(message) + '\n')` for info or `sys.stderr.write(str(message) + '\n')` for errors
  - Preserve error/warning semantics (use stderr for error messages)

- Run unit tests for modified modules: `uv run pytest automation/adws/adw_tests/test_agent_worktree_isolation.py automation/adws/adw_tests/test_utils.py -v`

### Phase 2: Trigger Systems (webhook, cron, home server trigger)
- Edit `automation/adws/trigger_webhook.py`:
  - Add `import sys` if not present (file already imports `os`, `subprocess`, `Path`)
  - Replace `print(f"Received webhook event=...")` at line 123 → `sys.stdout.write(f"Received webhook event=...\n")`
  - Replace `print(f"Launching background workflow...")` at line 191 → `sys.stdout.write(f"Launching background workflow...\n")`
  - Replace `print(f"Error handling webhook: {exc}")` at line 216 → `sys.stderr.write(f"Error handling webhook: {exc}\n")`
  - Replace `print(f"Starting webhook server...")` at line 253 → `sys.stdout.write(f"Starting webhook server...\n")`

- Edit `automation/adws/trigger_cron.py`:
  - Add `import sys` if not present
  - Locate all 17 `print()` calls
  - Replace stdout messages with `sys.stdout.write(message + '\n')`
  - Replace stderr messages (if any) with `sys.stderr.write(message + '\n')`

- Edit `automation/adws/adw_triggers/adw_trigger_cron_homeserver.py`:
  - Add `import sys` if not present
  - Locate all 28 `print()` calls
  - Replace each with appropriate stdout/stderr call
  - Maintain error/info distinction

- Test trigger infrastructure (dry run): `uv run automation/adws/trigger_webhook.py --help` (if supported) or manual inspection

### Phase 3: Utilities (health_check.py, validate-worktree-setup.py)
- Edit `automation/adws/health_check.py`:
  - Add `import sys` at top of file (after standard library imports)
  - Replace `print(payload.model_dump_json(...))` at line 226 → `sys.stdout.write(payload.model_dump_json(...) + '\n')`
  - Replace `print(f"Overall status: {overall}...")` at line 229 → `sys.stdout.write(f"Overall status: {overall}...\n")`
  - Replace `print(f"[{status}] {name}")` at line 233 → `sys.stdout.write(f"[{status}] {name}\n")`
  - Replace `print(f"  - error: {result.error}")` at line 235 → `sys.stdout.write(f"  - error: {result.error}\n")`
  - Replace `print(f"  - warning: {result.warning}")` at line 237 → `sys.stdout.write(f"  - warning: {result.warning}\n")`
  - Replace `print(f"  - {key}: {value}")` at line 239 → `sys.stdout.write(f"  - {key}: {value}\n")`
  - Replace `print(f"Posted health check summary...")` at line 252 → `sys.stdout.write(f"Posted health check summary...\n")`
  - Replace `print(f"Failed to post health check comment: {exc}", file=sys.stderr)` at line 254 → already uses stderr correctly

- Edit `automation/adws/scripts/validate-worktree-setup.py`:
  - Add `import sys` if not present
  - Locate all 27 `print()` calls
  - Replace each with `sys.stdout.write(message + '\n')` or `sys.stderr.write(message + '\n')`
  - Maintain warning/error/success output semantics

- Test utilities: `uv run automation/adws/health_check.py --json` (verify JSON format)
- Test utilities: `uv run automation/adws/scripts/validate-worktree-setup.py` (verify human output)

### Phase 4: Phase Scripts (adw_sdlc.py, adw_phases/*.py)
- Edit `automation/adws/adw_sdlc.py`:
  - Add `import sys` if not present
  - Replace single `print()` call with `sys.stdout.write()` or `sys.stderr.write()`

- Edit each phase script in `automation/adws/adw_phases/`:
  - `adw_plan.py` (1 print call)
  - `adw_build.py` (1 print call)
  - `adw_test.py` (1 print call)
  - `adw_review.py` (1 print call)
  - `adw_document.py` (1 print call)
  - `adw_patch.py` (1 print call)
  - Add `import sys` if not present in each file
  - Replace each `print()` with appropriate `sys.stdout.write()` or `sys.stderr.write()`

- Run workflow module tests: `uv run pytest automation/adws/adw_tests/test_workflow_ops.py -v`

### Phase 5: Home Server Workflows
- Edit `automation/adws/adw_plan_implement_update_homeserver_task.py`:
  - Add `import sys` if not present
  - Locate all 20 `print()` calls
  - Replace each with `sys.stdout.write(message + '\n')` or `sys.stderr.write(message + '\n')`

- Edit `automation/adws/adw_build_update_homeserver_task.py`:
  - Add `import sys` if not present
  - Locate all 17 `print()` calls
  - Replace each with `sys.stdout.write(message + '\n')` or `sys.stderr.write(message + '\n')`

### Validation and Verification
- Run full pytest suite: `uv run pytest automation/adws/adw_tests/ -v --tb=short`
- Verify zero `print()` calls: `grep -r "print(" automation/ --include="*.py" | wc -l` (expect 0)
- Verify no accidental syntax errors: `uv run python -m py_compile automation/adws/**/*.py`
- Manual smoke tests:
  - `uv run automation/adws/health_check.py --json` (JSON output)
  - `uv run automation/adws/health_check.py` (human-readable output)
  - `uv run automation/adws/scripts/validate-worktree-setup.py` (validation script)

### Git Operations and PR Creation
- Stage changes: `git add automation/adws/`
- Commit with message:
  ```
  chore: unify automation/ to use sys.stdout/stderr universally

  Replace all 142 print() calls with sys.stdout.write() and
  sys.stderr.write() to create consistent output mechanisms across
  the codebase. Parallels #66 for TypeScript layer.

  - Converted 16 Python files across adw_modules, adw_phases,
    adw_triggers, and scripts
  - Preserved output semantics (info→stdout, errors→stderr)
  - Maintained human-readable newline termination
  - All pytest tests pass without modification
  - Unblocks future structured logging implementation

  Fixes #84
  ```
- Push branch: `git push -u origin chore/84-unify-stdout-stderr`
- Fetch issue JSON for PR creation: `gh issue view 84 --json number,title,body,labels > /tmp/issue-84.json`
- Create pull request: `/pull_request chore/84-unify-stdout-stderr /tmp/issue-84.json docs/specs/chore-84-unify-stdout-stderr.md <adw_id>` (replace `<adw_id>` with actual workflow ID if running in ADW context, otherwise omit)

## Risks

| Risk | Mitigation |
|------|------------|
| **Multi-argument print() calls with custom separators** | Manually join arguments with appropriate separator: `sys.stdout.write(' '.join(map(str, args)) + '\n')` |
| **print() calls with `end=` parameter** | Preserve custom `end` value: `sys.stdout.write(str(message) + custom_end)` |
| **print() calls with `file=` parameter** | Already using `file=sys.stderr`; convert to `sys.stderr.write()` |
| **Test output capture assumptions** | pytest captures stdout/stderr by default; no test changes needed |
| **Accidental syntax errors during bulk replacement** | Run `python -m py_compile` on each file before committing |
| **Breaking structured logging calls** | Only replace `print()` calls; leave `logger.*()` calls unchanged |

## Validation Commands

```bash
# Verify zero print() calls remain
grep -r "print(" automation/ --include="*.py" | wc -l

# Run full pytest suite
uv run pytest automation/adws/adw_tests/ -v

# Syntax validation (compile all Python files)
find automation/adws -name "*.py" -exec python -m py_compile {} \;

# Manual smoke tests
uv run automation/adws/health_check.py --json
uv run automation/adws/health_check.py
uv run automation/adws/scripts/validate-worktree-setup.py
```

## Deliverables

- **Code changes**: 16 Python files modified with `print()` → `sys.stdout.write()` / `sys.stderr.write()` replacements
- **Zero regressions**: All pytest tests pass (baseline: current test suite pass count)
- **Zero print() calls**: `grep -r "print(" automation/ --include="*.py"` returns 0 results
- **Documentation**: This plan document serves as implementation guide and audit trail
- **Pull request**: Created via `/pull_request` command with descriptive title ending in (#84)
- **Git commit**: Single atomic commit with comprehensive message explaining scope and impact

## Success Criteria

1. All 142 `print()` calls converted to `sys.stdout.write()` or `sys.stderr.write()`
2. All pytest tests in `automation/adws/adw_tests/` pass without modification
3. Output format remains human-readable (newline-terminated)
4. Error messages continue to use stderr, info messages use stdout
5. No accidental changes to structured logging (logger.* calls)
6. Manual smoke tests produce expected output format
7. Zero syntax errors introduced during conversion
8. Pull request created with proper title format (ending in #84)
