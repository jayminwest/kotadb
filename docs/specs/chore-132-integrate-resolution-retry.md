# Chore Plan: Integrate Agent Resolution Retry Loop into Test Phase

## Context
Phase 2 of the agent-friendly resilience initiative. Phase 1 (PR #131) implemented the resolution retry loop infrastructure but left it opt-in. This chore integrates `run_validation_with_resolution()` into the test phase to achieve the target >30% ADW completion rate improvement.

**Current State**:
- ADW completion rate: 0% (0/56 runs successful per issue #130)
- Test phase uses `run_validation_commands()` at `automation/adws/adw_phases/adw_test.py:265`
- Resolution retry loop available via `run_validation_with_resolution()` but unused

**Constraints**:
- Must achieve >30% completion rate (from 0%)
- Requires 20+ ADW workflow runs for statistical validation
- Must maintain rollback safety (environment variable opt-out)

## Relevant Files
- `automation/adws/adw_phases/adw_test.py:265` — Test phase validation call site (integration point)
- `automation/adws/adw_phases/adw_test.py:266` — Validation result unpacking (update for new return signature)
- `automation/adws/adw_phases/adw_test.py:305-108` — Error reporting section (enhance with resolution details)
- `automation/adws/adw_modules/workflow_ops.py:549-624` — Resolution retry loop implementation (already exists)
- `automation/adws/adw_modules/agent_resolution.py` — Agent resolution coordination (already exists)
- `automation/adws/README.md:278` — Documentation status note (update integration status)

### New Files
None (all implementation artifacts already exist from Phase 1)

## Work Items
### Preparation
- Capture baseline ADW success rate via `analyze_logs.py --hours 168` before integration
- Review Phase 1 implementation to understand resolution retry loop behavior
- Verify test environment can run 20+ ADW workflows for validation

### Execution
- Update `adw_test.py:265` to call `run_validation_with_resolution()` instead of `run_validation_commands()`
- Update `adw_test.py:266` to unpack new return signature: `results, success = run_validation_with_resolution(...)`
- Remove duplicate success computation from `summarize_validation_results()` (now comes from function)
- Enhance error reporting at `adw_test.py:305-108` to include resolution attempt counts from ADWState
- Update `automation/adws/README.md:278` to reflect integration status
- Add environment variable `ADW_ENABLE_RESOLUTION` with default `true` for opt-out capability

### Follow-up
- Run 20+ ADW workflows across different issue types (feat/bug/chore)
- Monitor execution logs for resolution attempts and effectiveness
- Run `analyze_logs.py --format markdown --hours 168` to measure success rate improvement
- Document success rate in PR description with evidence
- Tune retry parameters if needed based on failure patterns

## Step by Step Tasks
### Phase 1: Code Integration
- Read current test phase implementation at `automation/adws/adw_phases/adw_test.py:250-280`
- Replace `run_validation_commands()` call with `run_validation_with_resolution()` at line 265
- Update function call to include required parameters: `worktree_path`, `adw_id`, `issue_number`, `logger`, `max_attempts=3`
- Update line 266 to unpack new return signature: `results, success = run_validation_with_resolution(...)`
- Remove `success` computation from `summarize_validation_results()` call (line 266)
- Add environment variable check at line 265 for `ADW_ENABLE_RESOLUTION` (default: true)

### Phase 2: Enhanced Observability
- Read error reporting section at `automation/adws/adw_phases/adw_test.py:305-108`
- Add resolution attempt count to error message from `state.get("validation_retry_count")`
- Add resolution history excerpt from `state.get("last_resolution_attempts")` (truncated to 500 chars)
- Enhance GitHub issue comment with resolution details section

### Phase 3: Documentation Updates
- Read `automation/adws/README.md:275-280`
- Update line 278 from "Future Integration" to "Integration Status: Enabled by default (as of #132)"
- Add opt-out instructions: `ADW_ENABLE_RESOLUTION=false` to disable
- Document rollback procedure for production issues

### Phase 4: Validation and Metrics
- Run `cd automation && uv run adws/scripts/analyze_logs.py --format json --hours 168` to capture baseline
- Trigger 20 ADW workflows using `uv run adws/adw_sdlc.py <issue_number>` across different issue types
- Monitor execution logs for resolution attempts: `grep -r "Invoking agent resolution" automation/logs/kota-db-ts/local/*/adw_test/execution.log`
- Check ADWState for resolution tracking: `jq '.validation_retry_count, .last_resolution_attempts' automation/agents/*/adw_state.json`
- Run `cd automation && uv run adws/scripts/analyze_logs.py --format markdown --hours 168` for post-integration metrics
- Compare success rates (baseline vs post-integration) and verify >30% target

### Phase 5: Final Steps
- Commit changes with message: `chore: integrate agent resolution retry loop into test phase (#132)`
- Push branch: `git push -u origin chore/132-integrate-resolution-retry`
- Run `/pull_request chore/132-integrate-resolution-retry <issue_json> docs/specs/chore-132-integrate-resolution-retry.md <adw_id>`

## Risks
- **Retry loops increase execution time** → Max 3 attempts with smart bailout. Expected overhead: 2-6 minutes per workflow. Monitor average execution time.
- **Agent resolution introduces hallucinations** → Always persist validation results. Manual inspection via logs. Limit retry attempts to prevent runaway loops.
- **Success rate doesn't improve** → Environment variable `ADW_ENABLE_RESOLUTION=false` allows quick rollback. Preserve logs for analysis.
- **Infinite loops if agent repeatedly fails** → Smart bailout checks `resolved_count > 0`. Max 3 attempts hard limit enforced.

## Validation Commands
- `cd automation && python3 -m py_compile adws/adw_phases/adw_test.py`
- `cd automation && uv run pytest adws/adw_tests/ -v --tb=short`
- `cd automation && uv run adws/adw_phases/adw_test.py --help` (verify script runs)
- `cd automation && uv run adws/scripts/analyze_logs.py --format json --hours 168` (baseline metrics)

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: integrate agent resolution retry loop into test phase` not `Based on the plan, the commit should integrate the retry loop`

## Deliverables
- Code changes: `automation/adws/adw_phases/adw_test.py` (integration + enhanced observability)
- Documentation update: `automation/adws/README.md` (integration status + rollback instructions)
- Success rate validation: 20+ ADW runs with >30% completion rate documented in PR
