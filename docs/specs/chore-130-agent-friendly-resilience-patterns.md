# Feature Plan: Agent-Friendly Resilience for ADW System

**Issue**: #130
**Title**: chore: implement agent-friendly resilience patterns for ADW system
**Classification**: chore
**Priority**: critical
**Effort**: large

## Overview

### Problem
The ADW system exhibits 0% success rate across 56 workflow runs due to systemic brittleness rooted in fail-fast design. Current implementation treats agents as deterministic functions rather than stochastic processes, leading to immediate workflow death on transient failures instead of leveraging agent self-correction capabilities.

**Key Failure Modes**:
- 62% drop-off from plan to build phase (59% of workflows fail after planning)
- 32.1% fail at test phase (validation environment provisioning and fail-fast validation)
- 30.4% fail at plan phase (git staging volatility, agent output parsing fragility)
- No recovery mechanisms for transient failures (Docker timeouts, git staging issues)
- Agent failures never passed back for self-correction

### Desired Outcome
Transform ADW from fail-fast system to resilient system that:
1. Collects all validation failures before deciding to exit
2. Passes failures back to agents for self-correction via retry loops
3. Implements smart bailout (exits early if agent can't resolve)
4. Adds exponential backoff for infrastructure operations (test environment provisioning)
5. Achieves >30% completion rate within 2 weeks (up from 0%)

### Non-Goals
- Eliminating all failures (accept that some failures are legitimate)
- Replicating TAC-8 implementation verbatim (adapt patterns to KotaDB architecture)
- Modifying agent capabilities (focus on workflow orchestration resilience)
- Changing existing phase script APIs (maintain backward compatibility)

## Technical Approach

### Architecture Notes
Implement three layers of resilience:

**Layer 1: Continue-on-Error Collection** (Quick Win)
- Modify `run_validation_commands()` to remove `break` statement at line 532
- Collect all validation failures instead of exiting on first failure
- Return complete failure set for agent analysis

**Layer 2: Agent Resolution Retry Loop** (Core Resilience)
- Create `/resolve_failed_validation` slash command that receives failure context
- Add `run_validation_with_resolution()` function wrapping validation + retry logic
- Implement 3-attempt retry loop with agent feedback between attempts
- Smart bailout: track resolution count, exit early if agent can't fix anything

**Layer 3: Infrastructure Retry with Exponential Backoff**
- Wrap `setup_test_environment()` in retry loop (3 attempts, 2s/4s/8s delays)
- Handle Docker timeouts gracefully instead of immediate failure
- Log all retry attempts for observability

### Key Modules to Touch

**Modified Files**:
- `automation/adws/adw_modules/workflow_ops.py` - Add `run_validation_with_resolution()`, remove break in `run_validation_commands()`
- `automation/adws/adw_phases/adw_test.py` - Replace validation call with resolution-enabled version, add test environment retry
- `automation/adws/adw_modules/agent.py` - Add agent resolution execution helpers if needed

**New Files**:
- `.claude/commands/validation/resolve_failed_validation.md` - Slash command for agent-driven validation resolution
- `automation/adws/adw_modules/agent_resolution.py` - Agent feedback loop utilities and retry coordination

### Data/API Impacts
- Add `last_resolution_attempts` field to `ADWState` for tracking resolution history
- Add `validation_retry_count` field to track retry attempts per phase
- Extend `ValidationCommandResult` to include `resolution_attempted: bool` flag
- No breaking changes to existing phase script CLI interfaces

## Relevant Files

### Existing Files
- `automation/adws/adw_modules/workflow_ops.py:532` - Break statement prevents collecting all failures
- `automation/adws/adw_phases/adw_test.py:66-93` - Test environment provisioning with 180s timeout, no retry
- `automation/adws/adw_phases/adw_test.py:222` - Validation command execution point
- `automation/adws/adw_modules/data_types.py` - ValidationCommandResult and ADWState definitions
- `automation/adws/adw_modules/ts_commands.py` - Validation command definitions

### New Files
- `.claude/commands/validation/resolve_failed_validation.md` - Agent resolution template (Message-Only category per prompt-code-alignment.md)
- `automation/adws/adw_modules/agent_resolution.py` - Resolution coordination logic and retry state management

## Task Breakdown

### Phase 1: Foundation (Continue-on-Error + Test Environment Retry)
- Remove fail-fast break in `workflow_ops.py:run_validation_commands()`
- Add exponential backoff retry to `adw_test.py:setup_test_environment()`
- Add resolution tracking fields to `ADWState` and `ValidationCommandResult`
- Create `/resolve_failed_validation` slash command template
- Add unit tests for continue-on-error behavior

### Phase 2: Agent Resolution Loop
- Create `agent_resolution.py` module with `resolve_validation_failure()` function
- Implement `run_validation_with_resolution()` in `workflow_ops.py`
- Add smart bailout logic (track resolution count, exit if zero)
- Integrate resolution loop into test phase
- Add unit tests for resolution retry logic

### Phase 3: Integration & Observability
- Update test phase to use resolution-enabled validation
- Add comprehensive logging for retry attempts and resolution outcomes
- Update ADW state schema to persist resolution attempts
- Add integration tests with intentional validation failures
- Update documentation (automation/adws/README.md)

## Step by Step Tasks

### Task Group 1: Continue-on-Error Foundation
1. Read `automation/adws/adw_modules/workflow_ops.py` and locate `run_validation_commands()` function
2. Remove `break` statement at line 532 to collect all validation failures
3. Update function docstring to reflect continue-on-error behavior
4. Add unit test in `automation/adws/adw_tests/test_workflow_ops.py` verifying all commands run despite failures
5. Validate change with `cd automation && uv run pytest adws/adw_tests/test_workflow_ops.py -v -k validation`

### Task Group 2: Test Environment Retry
1. Read `automation/adws/adw_phases/adw_test.py` and locate `setup_test_environment()` function
2. Wrap function body in retry loop with 3 attempts and exponential backoff (2s, 4s, 8s)
3. Add logging for each retry attempt with attempt number and delay
4. Update function docstring to document retry behavior
5. Add unit test in `automation/adws/adw_tests/test_adw_test.py` for retry logic
6. Validate with `cd automation && uv run pytest adws/adw_tests/test_adw_test.py -v`

### Task Group 3: Data Model Extensions
1. Read `automation/adws/adw_modules/data_types.py` and locate `ADWState` class
2. Add `last_resolution_attempts: Optional[str]` field for JSON serialization of resolution history
3. Add `validation_retry_count: int = 0` field to track retry attempts
4. Extend `ValidationCommandResult` dataclass with `resolution_attempted: bool = False` field
5. Update unit tests in `automation/adws/adw_tests/test_state.py` to verify new fields

### Task Group 4: Agent Resolution Command Template
1. Create `.claude/commands/validation/resolve_failed_validation.md` following Message-Only template category
2. Document input format: JSON with `label`, `command`, `exit_code`, `stdout`, `stderr` fields
3. Specify output format: Plain text describing fix actions taken (no markdown, no code execution in template)
4. Add examples of correct/incorrect output formats
5. Include validation failure patterns (lint errors, type errors, test failures) in template context

### Task Group 5: Agent Resolution Module
1. Create `automation/adws/adw_modules/agent_resolution.py` module
2. Implement `resolve_validation_failure()` function that:
   - Accepts `ValidationCommandResult`, `adw_id`, `worktree_path`, `logger`
   - Constructs failure context JSON with truncated stdout/stderr (max 1000 chars)
   - Invokes `/resolve_failed_validation` template via `execute_template()`
   - Returns `bool` indicating if resolution was attempted successfully
3. Add `track_resolution_attempt()` helper to persist resolution history to ADWState
4. Add unit tests in `automation/adws/adw_tests/test_agent_resolution.py`
5. Validate with `cd automation && uv run pytest adws/adw_tests/test_agent_resolution.py -v`

### Task Group 6: Resolution-Enabled Validation
1. Add `run_validation_with_resolution()` function to `workflow_ops.py` that:
   - Accepts `commands`, `worktree_path`, `adw_id`, `issue_number`, `logger`, `max_attempts=3`
   - Implements retry loop with agent resolution between attempts
   - Tracks resolved failure count per iteration
   - Implements smart bailout (exit if resolved_count == 0)
   - Returns `Tuple[List[ValidationCommandResult], bool]` (results, success)
2. Add comprehensive logging for each retry attempt and resolution outcome
3. Add unit tests in `automation/adws/adw_tests/test_workflow_ops.py` for resolution loop
4. Validate with `cd automation && uv run pytest adws/adw_tests/test_workflow_ops.py -v -k resolution`

### Task Group 7: Test Phase Integration
1. Read `automation/adws/adw_phases/adw_test.py` line 222 (validation execution point)
2. Replace `run_validation_commands()` call with `run_validation_with_resolution()`
3. Pass `adw_id`, `issue_number`, `worktree_path` to enable agent feedback
4. Update error handling to log resolution attempts before failing
5. Update GitHub comment formatting to include resolution attempt count
6. Add integration test that triggers validation failure and verifies resolution attempt

### Task Group 8: Observability & Documentation
1. Update `automation/adws/README.md` Validation section to document resolution retry behavior
2. Add "Agent Resolution Retry Loop" subsection describing 3-attempt limit and smart bailout
3. Document new ADWState fields (`last_resolution_attempts`, `validation_retry_count`)
4. Add troubleshooting section for resolution failures
5. Update `.claude/commands/docs/conditional_docs.md` to reference chore-130 spec

### Task Group 9: Final Validation
1. Run full automation test suite: `cd automation && uv run pytest adws/adw_tests/ -v`
2. Run syntax check: `cd automation && python3 -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py`
3. Trigger real ADW workflow with known validation failures to verify resolution attempts
4. Check logs for resolution attempt evidence: `cat logs/kota-db-ts/local/<adw_id>/adw_test/execution.log`
5. Verify ADW state includes resolution history: `cat agents/<adw_id>/adw_state.json | jq .last_resolution_attempts`
6. Push branch: `git push -u origin chore-130-<adw_id[:8]>`
7. Run `/pull_request chore-130-<adw_id[:8]> {"number": 130, "title": "chore: implement agent-friendly resilience patterns for ADW system", "body": "[issue body]"} docs/specs/chore-130-agent-friendly-resilience-patterns.md <adw_id>`

## Risks & Mitigations

**Risk**: Retry loops increase workflow execution time significantly
**Mitigation**: Max 3 attempts per phase with smart bailout exits early if agent can't resolve. Expected overhead: 2-6 minutes per workflow (acceptable for 30%+ success rate gain).

**Risk**: Agent resolution introduces non-determinism and debugging difficulty
**Mitigation**: Log all resolution attempts to `logs/` with full context. Preserve worktrees for manual inspection via `ADW_CLEANUP_WORKTREES=false`. Track resolution history in ADWState for post-mortem analysis.

**Risk**: Breaking changes to phase script APIs disrupt existing workflows
**Mitigation**: Add new functions alongside existing (`run_validation_with_resolution()` vs `run_validation_commands()`). Only modify test phase to use new function. Other phases continue using existing validation.

**Risk**: Infinite loops if agent repeatedly "resolves" without actually fixing
**Mitigation**: Smart bailout checks if `resolved_count > 0` before continuing. Track unique failure signatures to prevent re-attempting same failure. Max 3 attempts hard limit prevents indefinite execution.

**Risk**: Agent resolution may hallucinate fixes that don't address root cause
**Mitigation**: Always persist validation results to ADWState regardless of resolution success. Manual inspection via logs and preserved worktrees. Monitor success rate metrics to detect ineffective resolution patterns.

## Validation Strategy

### Automated Tests (Level 2 - Integration Required)

**Unit Tests** (`automation/adws/adw_tests/`):
- `test_workflow_ops.py::test_run_validation_commands_continue_on_error` - Verify all commands run despite failures
- `test_workflow_ops.py::test_run_validation_with_resolution_retry_loop` - Verify retry loop with agent feedback
- `test_workflow_ops.py::test_smart_bailout_zero_resolutions` - Verify early exit when agent can't resolve
- `test_agent_resolution.py::test_resolve_validation_failure_invokes_agent` - Verify agent invocation with failure context
- `test_agent_resolution.py::test_track_resolution_attempt_persists_history` - Verify resolution history in ADWState
- `test_adw_test.py::test_setup_test_environment_retry_exponential_backoff` - Verify test environment retry behavior

**Integration Tests**:
- Run `adw_test.py` with intentional lint failure, verify resolution attempt logged
- Run `adw_test.py` with Docker timeout, verify test environment retry succeeds
- Verify complete workflow with multiple validation failures collects all errors

### Manual Checks

**Test Environment Retry Verification**:
```bash
# Simulate Docker timeout by reducing timeout to 5 seconds
# Edit adw_test.py:80 temporarily: timeout=5
cd automation
uv run adws/adw_phases/adw_test.py 130 <adw_id>
# Expected: 3 retry attempts with exponential backoff (2s, 4s, 8s delays)
# Check logs: cat logs/kota-db-ts/local/<adw_id>/adw_test/execution.log | grep -i retry
```

**Agent Resolution Verification**:
```bash
# Introduce intentional lint failure in worktree
echo "const unused = 1;" >> trees/<worktree>/app/src/index.ts

# Run test phase
cd automation
uv run adws/adw_phases/adw_test.py 130 <adw_id>

# Expected:
# 1. Lint failure detected
# 2. Agent resolution attempted (3 attempts)
# 3. Resolution history persisted to ADWState
# 4. GitHub comment includes resolution attempt count

# Verify logs
cat logs/kota-db-ts/local/<adw_id>/adw_test/execution.log | grep -i resolution

# Verify state
cat agents/<adw_id>/adw_state.json | jq .last_resolution_attempts
```

**Continue-on-Error Verification**:
```bash
# Introduce multiple validation failures
echo "const unused = 1;" >> trees/<worktree>/app/src/index.ts  # Lint failure
echo "type Foo = string & number;" >> trees/<worktree>/app/src/types/index.ts  # Type error

# Run test phase
cd automation
uv run adws/adw_phases/adw_test.py 130 <adw_id>

# Expected: Both lint and typecheck run, both failures captured
# Verify logs show both commands executed despite first failure
cat logs/kota-db-ts/local/<adw_id>/adw_test/execution.log | grep "Running validation command"
```

### Release Guardrails

**Monitoring**:
- Track ADW success rate metric: `uv run automation/adws/scripts/analyze_logs.py --format json --hours 168 | jq .success_rate`
- Target: >30% success rate within 2 weeks of deployment
- Alert if success rate drops below 20% (indicates resolution ineffectiveness)

**Rollback Plan**:
- If success rate doesn't improve or degrades: revert test phase to use `run_validation_commands()` directly
- Resolution retry can be disabled per-workflow via `ADW_ENABLE_RESOLUTION=false` environment variable (implement in Phase 2)
- Preserve logs and ADWState for post-mortem analysis before rollback

**Real-Service Evidence**:
- Supabase test environment provisioning logs show retry success rate
- GitHub issue comments include resolution attempt counts
- ADW state JSON persists resolution history for all workflow runs
- Log analysis script tracks resolution effectiveness over time

## Validation Commands

**Level 2 Validation** (required for this chore):
```bash
cd automation
uv run python3 -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py
uv run pytest adws/adw_tests/ -v --tb=short
```

**Domain-Specific Validation**:
```bash
# Verify no import errors in new modules
cd automation
uv run python3 -c "from adws.adw_modules.agent_resolution import resolve_validation_failure; print('✅ Import successful')"

# Verify slash command template exists and is discoverable
test -f ../.claude/commands/validation/resolve_failed_validation.md && echo "✅ Template exists"

# Verify ADWState schema changes don't break existing state files
cd automation
uv run python3 -c "
from adws.adw_modules.state import ADWState
import tempfile
import json
with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as f:
    json.dump({'issue_number': '130', 'worktree_name': 'test'}, f)
    f.flush()
    state = ADWState.load_from_file(f.name)
    print(f'✅ State schema backward compatible: {state.data}')
"
```

## References

- **TAC-8 Retry Pattern**: `tac8_app5/adws/adw_test_iso.py:346-453` (test resolution with retry)
- **TAC-8 Continue-on-Error**: `tac8_app5/adws/adw_sdlc_iso.py:73-143` (phase orchestration)
- **Log Analysis Report**: `automation/adws/scripts/analyze_logs.py --format markdown --hours 168`
- **Current Brittleness Data**: 0% success rate over 56 runs (32.1% test failures, 30.4% plan failures)
- **Template Alignment Guide**: `.claude/commands/docs/prompt-code-alignment.md`
- **Validation Documentation**: `docs/adws/validation.md`
