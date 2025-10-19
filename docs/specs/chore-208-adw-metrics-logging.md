# Chore Plan: Add ADW Phase Execution Metrics Logging

## Context
Currently, ADW phases lack detailed execution metrics (duration, resource usage, checkpoint timing), making it difficult to analyze performance bottlenecks and optimize workflow efficiency. This chore adds structured logging to capture phase-level metrics and stores them in `adw_state.json` for downstream analysis by `analyze_logs.py`.

This is a test issue for examining ADW workflow robustness. Implementation will be analyzed but not merged.

## Issue Relationships

- **Related To**: #148 (hybrid resilience patterns) - Both enhance ADW observability and integrate with checkpoint infrastructure

## Constraints
- Performance overhead must be < 5% to avoid impacting workflow execution
- Must use existing logger infrastructure in `workflow_ops.py`
- Metrics must be compatible with existing state management and log analysis tools
- No breaking changes to existing ADW state schema

## Relevant Files
- `automation/adws/adw_modules/workflow_ops.py` — Add metrics collection helpers
- `automation/adws/adw_modules/state.py` — Extend ADWState to store phase metrics
- `automation/adws/adw_modules/data_types.py` — Define metrics data models
- `automation/adws/adw_phases/adw_plan.py` — Instrument plan phase with metrics
- `automation/adws/adw_phases/adw_build.py` — Instrument build phase with metrics
- `automation/adws/adw_phases/adw_review.py` — Instrument review phase with metrics
- `automation/adws/adw_phases/adw_test.py` — Instrument test phase with metrics
- `automation/adws/scripts/analyze_logs.py` — Extend to parse and report metrics

### New Files
- `automation/adws/adw_tests/test_metrics_logging.py` — Test suite for metrics logging

## Work Items

### Preparation
- Verify current ADW state schema and identify extension points
- Review existing checkpoint infrastructure (issue #148) for integration points
- Check analyze_logs.py to understand current metric extraction patterns
- Set up test fixtures for metrics validation

### Execution

#### 1. Define metrics data models (`data_types.py`)
Add Pydantic models for structured metrics:
- `PhaseMetrics`: Container for single phase execution metrics
  - `phase_name: str` — Phase identifier (adw_plan, adw_build, etc.)
  - `start_timestamp: datetime` — Phase start time (ISO 8601)
  - `end_timestamp: Optional[datetime]` — Phase end time (None if incomplete)
  - `duration_seconds: Optional[float]` — Computed elapsed time
  - `memory_usage_mb: Optional[float]` — Peak memory usage snapshot
  - `checkpoint_count: int` — Number of checkpoints created
  - `git_operation_count: int` — Number of git operations executed
  - `git_operation_duration_seconds: Optional[float]` — Total time in git operations
  - `agent_invocation_count: int` — Number of agent calls
  - `agent_invocation_duration_seconds: Optional[float]` — Total time in agent calls
- `WorkflowMetrics`: Container for multi-phase workflow metrics
  - `phases: List[PhaseMetrics]` — Ordered list of phase metrics
  - `total_duration_seconds: Optional[float]` — End-to-end workflow duration
  - `workflow_type: str` — Workflow identifier (adw_sdlc, adw_plan_build, etc.)

#### 2. Extend ADWState to store metrics (`state.py`)
Modify ADWState dataclass:
- Add `metrics: Optional[Dict[str, Any]]` field (stored in extra dict)
- Add helper methods:
  - `get_phase_metrics(phase_name: str) -> Optional[PhaseMetrics]`
  - `set_phase_metrics(phase_name: str, metrics: PhaseMetrics) -> None`
  - `get_workflow_metrics() -> Optional[WorkflowMetrics]`
  - `set_workflow_metrics(metrics: WorkflowMetrics) -> None`

#### 3. Add metrics collection helpers (`workflow_ops.py`)
Create context manager for automatic metrics collection:
- `PhaseMetricsCollector` context manager class
  - Captures start/end timestamps automatically
  - Tracks memory usage via `psutil` (optional dependency)
  - Integrates with existing logger infrastructure
  - Persists metrics to ADWState on exit
  - Example usage:
    ```python
    with PhaseMetricsCollector(adw_id, "adw_plan", logger) as metrics:
        # Phase logic here
        metrics.increment_checkpoint_count()
        metrics.record_git_operation(duration=0.5)
        metrics.record_agent_invocation(duration=2.3)
    # Metrics automatically saved to state on context exit
    ```

Add helper functions:
- `start_phase_metrics(adw_id: str, phase: str, logger: logging.Logger) -> PhaseMetrics`
- `end_phase_metrics(adw_id: str, phase: str, metrics: PhaseMetrics, logger: logging.Logger) -> None`
- `record_checkpoint_metrics(adw_id: str, phase: str, logger: logging.Logger) -> None`

#### 4. Instrument phase scripts with metrics
For each phase script (`adw_plan.py`, `adw_build.py`, `adw_review.py`, `adw_test.py`):
- Wrap main execution logic with `PhaseMetricsCollector` context manager
- Add metrics tracking to key operations:
  - Git operations (clone, commit, push): record operation count and duration
  - Agent invocations (classify, plan, implement): record invocation count and duration
  - Checkpoint creation: increment checkpoint count
- Log metrics summary at phase completion

Example pattern for `adw_plan.py`:
```python
from adws.adw_modules.workflow_ops import PhaseMetricsCollector

def main() -> None:
    load_adw_env()
    issue_number, provided_adw_id = parse_args(sys.argv)
    adw_id, state = ensure_state(provided_adw_id, issue_number)
    logger = start_logger(adw_id, "adw_plan")

    with PhaseMetricsCollector(adw_id, "adw_plan", logger) as metrics:
        # Existing plan phase logic
        issue = fetch_issue(issue_number, repo_path)

        # Track git operation
        start_time = time.time()
        git_ops.create_worktree(...)
        metrics.record_git_operation(duration=time.time() - start_time)

        # Track agent invocation
        start_time = time.time()
        plan_response = build_plan(...)
        metrics.record_agent_invocation(duration=time.time() - start_time)
```

#### 5. Extend log analysis script (`analyze_logs.py`)
Add metrics extraction and reporting:
- Extend `RunAnalysis` dataclass to include `phase_metrics: Optional[List[PhaseMetrics]]`
- Add parsing logic to extract metrics from `adw_state.json`
- Extend output formats (text, JSON, markdown) to include metrics:
  - Average phase durations
  - P50/P95 duration percentiles
  - Memory usage statistics
  - Git/agent operation counts and timing
- Add metrics validation to catch incomplete or corrupted data

#### 6. Create test suite (`test_metrics_logging.py`)
Test coverage:
- Metrics data model validation (Pydantic schema compliance)
- ADWState metrics persistence (round-trip save/load)
- PhaseMetricsCollector context manager behavior (start/end timestamps, error handling)
- Metrics extraction from state files (analyze_logs.py integration)
- Performance overhead validation (< 5% baseline)

### Follow-up
- Run full test suite to validate metrics collection: `uv run pytest automation/adws/adw_tests/test_metrics_logging.py -v`
- Run existing ADW tests to ensure no regressions: `uv run pytest automation/adws/adw_tests/ -v`
- Verify Python syntax: `python -m py_compile automation/adws/adw_modules/*.py automation/adws/adw_phases/*.py`
- Test metrics output with sample ADW run: `uv run automation/adws/scripts/analyze_logs.py --format json --hours 1`
- Verify performance overhead by comparing execution times before/after instrumentation

## Step by Step Tasks

### Initial Setup
- Read current ADWState schema in `state.py` to understand extension strategy
- Read PhaseMetrics in `data_types.py` (if exists) or identify where to add it
- Read `workflow_ops.py` to understand existing logger patterns and checkpoint infrastructure

### Data Model Definition
- Add `PhaseMetrics` Pydantic model to `data_types.py` with all required fields
- Add `WorkflowMetrics` Pydantic model to `data_types.py`
- Export new models in `__all__` list

### State Management
- Extend `ADWState` dataclass in `state.py` to include metrics field
- Add `get_phase_metrics()` helper method
- Add `set_phase_metrics()` helper method
- Add `get_workflow_metrics()` helper method
- Add `set_workflow_metrics()` helper method
- Update `to_dict()` to serialize metrics if present

### Metrics Collection Infrastructure
- Add `PhaseMetricsCollector` context manager class to `workflow_ops.py`
- Implement `__enter__()` to capture start timestamp and initial memory
- Implement `__exit__()` to capture end timestamp, compute duration, persist to state
- Add `increment_checkpoint_count()` method
- Add `record_git_operation(duration: float)` method
- Add `record_agent_invocation(duration: float)` method
- Add `start_phase_metrics()` helper function
- Add `end_phase_metrics()` helper function
- Add `record_checkpoint_metrics()` helper function
- Export new helpers in `__all__` list

### Phase Instrumentation (adw_plan.py)
- Import `PhaseMetricsCollector` and `time` module
- Wrap `main()` logic in `PhaseMetricsCollector` context manager
- Add timing around `git_ops.create_worktree()` call with `metrics.record_git_operation()`
- Add timing around `classify_issue()` call with `metrics.record_agent_invocation()`
- Add timing around `build_plan()` call with `metrics.record_agent_invocation()`
- Add timing around `create_commit_message()` call with `metrics.record_agent_invocation()`
- Add timing around `git_ops.commit_all()` call with `metrics.record_git_operation()`
- Add timing around `git_ops.push_branch()` call with `metrics.record_git_operation()`
- Log metrics summary before phase completion

### Phase Instrumentation (adw_build.py)
- Import `PhaseMetricsCollector` and `time` module
- Wrap `main()` logic in `PhaseMetricsCollector` context manager
- Add timing around `implement_plan()` call with `metrics.record_agent_invocation()`
- Add timing around `create_commit_message()` call with `metrics.record_agent_invocation()`
- Add timing around `git_ops.commit_all()` call with `metrics.record_git_operation()`
- Add timing around `git_ops.push_branch()` call with `metrics.record_git_operation()`
- Add timing around `create_pull_request()` call with `metrics.record_agent_invocation()`
- Log metrics summary before phase completion

### Phase Instrumentation (adw_review.py)
- Import `PhaseMetricsCollector` and `time` module
- Wrap `main()` logic in `PhaseMetricsCollector` context manager
- Add timing around `run_review()` call with `metrics.record_agent_invocation()`
- Add timing around git operations with `metrics.record_git_operation()`
- Log metrics summary before phase completion

### Phase Instrumentation (adw_test.py)
- Import `PhaseMetricsCollector` and `time` module
- Wrap `main()` logic in `PhaseMetricsCollector` context manager
- Add timing around test execution with appropriate metric tracking
- Log metrics summary before phase completion

### Log Analysis Extension
- Extend `RunAnalysis` dataclass in `analyze_logs.py` to include `phase_metrics` field
- Add logic in `parse_execution_logs()` to load metrics from `adw_state.json`
- Add `compute_metrics_statistics()` function to calculate aggregates (avg, P50, P95)
- Extend `format_text_report()` to include metrics section
- Extend `format_json_report()` to include metrics in output
- Extend `format_markdown_report()` to include metrics table

### Test Suite
- Create `test_metrics_logging.py` with imports and fixtures
- Test `PhaseMetrics` Pydantic validation (valid/invalid data)
- Test `WorkflowMetrics` Pydantic validation
- Test `ADWState` metrics persistence (save/load round-trip)
- Test `PhaseMetricsCollector` context manager (normal exit)
- Test `PhaseMetricsCollector` context manager (exception handling)
- Test metrics extraction from state files
- Test performance overhead (baseline vs instrumented execution time)

### Validation and Push
- Run new test suite: `uv run pytest automation/adws/adw_tests/test_metrics_logging.py -v`
- Run existing ADW tests: `uv run pytest automation/adws/adw_tests/ -v`
- Validate Python syntax: `python -m py_compile automation/adws/adw_modules/*.py automation/adws/adw_phases/*.py`
- Run sample metrics extraction: `uv run automation/adws/scripts/analyze_logs.py --format json --hours 1`
- Verify no performance regression (compare execution times)
- Stage all changes: `git add automation/adws/`
- Push branch: `git push -u origin chore-208-fea7b5a8`

## Risks
- **Memory profiling dependency**: `psutil` may not be available in all environments
  - Mitigation: Make memory tracking optional, gracefully degrade if `psutil` unavailable
- **Performance overhead**: Metrics collection could slow down phases
  - Mitigation: Use lightweight timing methods (`time.time()` instead of `time.perf_counter()`), minimize I/O operations
- **State file size growth**: Storing detailed metrics may increase `adw_state.json` size
  - Mitigation: Store only aggregate metrics (not per-operation granularity), add retention policy for old metrics
- **Breaking changes to state schema**: Adding new fields could break existing consumers
  - Mitigation: Make metrics field optional, preserve backward compatibility with old state files

## Validation Commands
- `python -m py_compile automation/adws/adw_modules/*.py automation/adws/adw_phases/*.py`
- `uv run pytest automation/adws/adw_tests/test_metrics_logging.py -v`
- `uv run pytest automation/adws/adw_tests/ -v`
- `uv run automation/adws/scripts/analyze_logs.py --format json --hours 1`

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(adw): add phase metrics logging infrastructure` not `Based on the plan, the commit should add metrics logging`

## Deliverables
- Phase metrics data models in `data_types.py`
- Extended ADWState with metrics persistence in `state.py`
- PhaseMetricsCollector context manager in `workflow_ops.py`
- Instrumented phase scripts (adw_plan.py, adw_build.py, adw_review.py, adw_test.py)
- Extended log analysis script with metrics reporting
- Comprehensive test suite in `test_metrics_logging.py`
- No performance regression (< 5% overhead validated)
