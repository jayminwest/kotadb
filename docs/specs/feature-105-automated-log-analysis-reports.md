# Feature Plan: Automated ADW Log Analysis Reports with stdout Output

## Metadata
- **Issue**: #105
- **Title**: feat: automated log analysis reports with stdout output for ADW monitoring
- **Labels**: component:observability, priority:medium, effort:medium, status:needs-investigation
- **Branch**: feature-105-9d0acfda

## Overview

### Problem
The ADW system generates extensive execution logs in `automation/logs/` and agent state in `automation/agents/`, but lacks automated analysis tooling to surface critical metrics and failure patterns. A proof-of-concept Python script (`analyze_logs.py`) and markdown report (`agentic_run_analysis.md`) exist in the repository root but are untracked and lack integration with standard output for continuous monitoring.

Current limitations:
- No automated reporting for ADW success rates and failure patterns
- Manual analysis required to diagnose systemic blockers
- Logs dispersed across multiple directories without aggregation
- No CI/cron integration for continuous monitoring
- Agent state not correlated with execution logs for full visibility

Recent metrics (October 13, 2025) reveal critical issues:
- Overall success rate: 5.6% (0 completed, 1 in-progress, 17 failed)
- Primary blockers: Test phase failures (50%), commit message validation (22%), Claude Code errors (22%)
- Zero end-to-end completions across 18 workflow runs

### Desired Outcome
Productionize log analysis capability with automated reporting to stdout for CI/cron integration:
1. Structured log parsing from `automation/logs/kota-db-ts/local/*/adw_sdlc/execution.log`
2. Agent state introspection from `automation/agents/**/adw_state.json`
3. Multiple output formats (text, JSON, markdown) for different consumption patterns
4. CI integration with daily analysis reports and alerting thresholds
5. Extensible metrics framework for tracking success rates, phase funnels, and failure distributions

### Non-Goals
- Real-time log streaming or tailing (batch analysis only)
- Web dashboard or UI frontend (stdout/JSON output only)
- Webhook endpoint for monitoring (future enhancement, not in scope)
- Historical trend analysis across multiple days (focus on recent windows)
- Log archival or rotation management (out of scope)

## Technical Approach

### Architecture Notes
The log analysis system will be structured as a standalone script under `automation/adws/scripts/` with:
- CLI interface using `argparse` for flexible invocation
- Modular parsing functions for logs and agent state
- Output formatters for text, JSON, and markdown
- Integration with existing `adw_modules/utils.py` for path resolution
- Unit tests under `automation/adws/adw_tests/` following existing patterns

### Key Modules to Touch
- **New module**: `automation/adws/scripts/analyze_logs.py` - Main CLI script
- **Existing**: `automation/adws/adw_modules/utils.py` - Reuse `logs_root()`, `project_root()` helpers
- **Existing**: `automation/adws/adw_modules/state.py` - Reference `AdwState` schema for agent state parsing
- **New tests**: `automation/adws/adw_tests/test_analyze_logs.py` - Unit tests with fixture data
- **CI workflow**: `.github/workflows/adw-metrics.yml` - Daily analysis job
- **Documentation**: `automation/adws/README.md`, `CLAUDE.md` - Usage examples and integration docs

### Data/API Impacts
No database or API changes required. Script operates on local filesystem:
- **Input**: Log files in `automation/logs/kota-db-ts/{env}/{adw_id}/adw_sdlc/execution.log`
- **Input**: Agent state in `automation/agents/{adw_id}/adw_state.json`
- **Output**: Structured reports to stdout or file (text, JSON, markdown)

Key metrics to extract:
- Success rate: `(completed_runs / total_runs) * 100`
- Phase funnel: Runs reaching each phase (plan → build → test → review → document)
- Failure distribution: Count by phase and root cause category
- Issue distribution: Runs per issue number with outcome breakdown
- Temporal analysis: Success rate trends over configurable time windows

## Relevant Files

### Existing Files
- `/Users/jayminwest/Projects/kota-db-ts/analyze_logs.py` - Proof-of-concept script to refactor
- `/Users/jayminwest/Projects/kota-db-ts/agentic_run_analysis.md` - Example report format to preserve
- `automation/adws/adw_modules/utils.py` - Path helpers (`logs_root()`, `project_root()`, `run_logs_dir()`)
- `automation/adws/adw_modules/state.py` - `AdwState` Pydantic model for state parsing
- `automation/adws/adw_modules/data_types.py` - Enums and types for issue classification
- `automation/adws/adw_tests/test_utils.py` - Testing patterns for utilities
- `.github/workflows/automation-ci.yml` - CI workflow to extend
- `automation/adws/README.md` - Documentation to update
- `CLAUDE.md` - Project instructions to update

### New Files
- `automation/adws/scripts/analyze_logs.py` - Main CLI script with argparse interface
- `automation/adws/adw_tests/test_analyze_logs.py` - Unit tests with fixture data
- `automation/adws/adw_tests/fixtures/logs/` - Test fixture data (success/failure/in-progress scenarios)
- `.github/workflows/adw-metrics.yml` - GitHub Actions workflow for daily analysis

## Task Breakdown

### Phase 1: Script Refactoring and Core Functionality
1. Create `automation/adws/scripts/` directory
2. Move and refactor `analyze_logs.py` to new location
3. Add argparse CLI interface with options:
   - `--format [text|json|markdown]` (default: text)
   - `--hours [N]` (default: 24)
   - `--output [stdout|file]` (default: stdout)
   - `--output-file PATH` (for file output mode)
   - `--env [local|staging|production]` (default: local)
4. Extract modular functions:
   - `parse_execution_logs(time_window: timedelta) -> list[RunAnalysis]`
   - `parse_agent_state(adw_id: str) -> AdwState | None`
   - `calculate_metrics(runs: list[RunAnalysis]) -> AnalysisMetrics`
   - `format_output(metrics: AnalysisMetrics, format: str) -> str`
5. Integrate with `adw_modules/utils.py` for path resolution

### Phase 2: Agent State Integration
1. Extend analysis to parse `automation/agents/**/adw_state.json`
2. Correlate agent state with execution logs (match by `adw_id`)
3. Track metrics:
   - Worktree count (active, completed, stale)
   - State fields: `issue_number`, `branch_name`, `plan_path`, `worktree_path`
   - Phase completion status from state vs. logs
4. Add worktree staleness detection (last modified > 7 days)

### Phase 3: Output Formatters and Testing
1. Implement text formatter (human-readable stdout)
2. Implement JSON formatter (programmatic consumption)
3. Implement markdown formatter (compatible with existing report structure)
4. Create test fixtures:
   - `fixtures/logs/success/` - Completed workflow logs
   - `fixtures/logs/failure/` - Failed workflow logs with different root causes
   - `fixtures/logs/in_progress/` - Active workflow logs
   - `fixtures/agents/` - Sample `adw_state.json` files
5. Write unit tests in `test_analyze_logs.py`:
   - Test log parsing with fixture data
   - Validate JSON schema output
   - Test time window filtering (24h, 7d, 30d)
   - Test metrics calculation accuracy

### Phase 4: CI Integration
1. Create `.github/workflows/adw-metrics.yml`:
   - Run daily at 00:00 UTC
   - Execute `uv run automation/adws/scripts/analyze_logs.py --format json --hours 24`
   - Parse JSON output and post metrics as issue comment or commit status
   - Alert on success rate < 50% threshold
   - Store metrics artifacts for historical tracking
2. Test workflow dry-run locally
3. Validate workflow syntax and permissions

### Phase 5: Documentation and Validation
1. Update `automation/adws/README.md`:
   - Add "Log Analysis" section with usage examples
   - Document CLI options and output formats
   - Include integration examples (CI, cron, manual)
2. Update `CLAUDE.md`:
   - Add log analysis capabilities to observability section
   - Reference script location and key metrics
3. Update `.claude/commands/docs/conditional_docs.md`:
   - Add entry for new spec document
4. Run validation suite:
   - Python syntax check
   - pytest suite (new tests + existing tests)
   - CI workflow dry-run
5. Manual testing with real logs

## Step by Step Tasks

### Foundation
1. Create `automation/adws/scripts/` directory if it doesn't exist
2. Copy `/Users/jayminwest/Projects/kota-db-ts/analyze_logs.py` to `automation/adws/scripts/analyze_logs.py`
3. Add argparse CLI interface with `--format`, `--hours`, `--output`, `--output-file`, `--env` options
4. Refactor existing logic into modular functions (`parse_execution_logs`, `calculate_metrics`, `format_output`)
5. Replace hardcoded paths with calls to `adw_modules.utils.logs_root()` and `project_root()`
6. Add type hints and docstrings for all functions

### Agent State Integration
7. Create `parse_agent_state(adw_id: str) -> AdwState | None` function
8. Update `parse_execution_logs()` to correlate with agent state by `adw_id`
9. Add worktree metrics: count active/completed/stale worktrees
10. Add state field extraction: `issue_number`, `branch_name`, `plan_path`, `worktree_path`
11. Detect stale worktrees (last modified > 7 days)

### Output Formatters
12. Implement `format_text(metrics: AnalysisMetrics) -> str` for human-readable stdout
13. Implement `format_json(metrics: AnalysisMetrics) -> str` for programmatic consumption
14. Implement `format_markdown(metrics: AnalysisMetrics) -> str` compatible with existing report structure
15. Add file output mode with `--output file --output-file PATH`

### Testing Infrastructure
16. Create `automation/adws/adw_tests/test_analyze_logs.py`
17. Create `automation/adws/adw_tests/fixtures/logs/` directory structure
18. Add fixture data: success logs, failure logs (test/plan/build phase), in-progress logs
19. Add fixture data: sample `adw_state.json` files
20. Write test: `test_parse_execution_logs_success()`
21. Write test: `test_parse_execution_logs_failure_by_phase()`
22. Write test: `test_calculate_metrics_success_rate()`
23. Write test: `test_format_json_schema()`
24. Write test: `test_time_window_filtering()`

### CI Integration
25. Create `.github/workflows/adw-metrics.yml` workflow file
26. Configure daily schedule (cron: '0 0 * * *')
27. Add job to run analysis: `uv run automation/adws/scripts/analyze_logs.py --format json --hours 24`
28. Add step to parse JSON output and extract key metrics
29. Add conditional step to post issue comment if success rate < 50%
30. Add step to upload metrics artifact for historical tracking
31. Test workflow syntax: `gh workflow view adw-metrics.yml`

### Documentation
32. Update `automation/adws/README.md` with "Log Analysis" section
33. Add usage examples: stdout, JSON, markdown, CI integration
34. Add example cron setup for continuous monitoring
35. Update `CLAUDE.md` with log analysis capabilities in observability section
36. Update `.claude/commands/docs/conditional_docs.md` with new spec reference

### Validation and Finalization
37. Run Python syntax check: `python3 -m py_compile automation/adws/scripts/analyze_logs.py`
38. Run pytest suite: `cd automation && uv run pytest adws/adw_tests/test_analyze_logs.py -v`
39. Run full pytest suite: `cd automation && uv run pytest adws/adw_tests/ -v`
40. Test manual invocation with text output: `uv run automation/adws/scripts/analyze_logs.py`
41. Test manual invocation with JSON output: `uv run automation/adws/scripts/analyze_logs.py --format json`
42. Test manual invocation with markdown output: `uv run automation/adws/scripts/analyze_logs.py --format markdown --output file --output-file /tmp/report.md`
43. Test time window filtering: `uv run automation/adws/scripts/analyze_logs.py --hours 48`
44. Verify CI workflow dry-run: `gh workflow run adw-metrics.yml --ref feature-105-9d0acfda`
45. Push branch: `git push -u origin feature-105-9d0acfda`
46. Create PR: Use `/pull_request` command with branch name, issue JSON, plan path, and adw_id

## Risks & Mitigations

### Risk: Log parsing breaks with format changes
**Impact**: Script fails when log format evolves (new fields, different error messages)
**Mitigation**:
- Use regex patterns with optional groups for non-critical fields
- Add version detection based on log file timestamps
- Fallback gracefully when expected fields are missing
- Add test coverage for multiple log format versions

### Risk: Large log volumes impact performance
**Impact**: Script becomes slow with thousands of log files (long time windows)
**Mitigation**:
- Default to 24-hour window (reasonable log volume)
- Add `--limit` option to cap number of runs analyzed
- Consider parallel processing for large batches (future optimization)
- Document performance characteristics in README

### Risk: Agent state schema changes
**Impact**: State parsing fails when `AdwState` Pydantic model evolves
**Mitigation**:
- Import `AdwState` from `adw_modules.state` (single source of truth)
- Use Pydantic validation with lenient parsing (`model_validate` with `from_attributes=True`)
- Handle missing fields gracefully with default values
- Add test coverage for schema evolution scenarios

### Risk: CI workflow permissions
**Impact**: GitHub Actions workflow fails to post comments or access logs
**Mitigation**:
- Verify workflow has `contents: read` and `issues: write` permissions
- Use `GITHUB_TOKEN` with appropriate scopes
- Test with dry-run mode before production deployment
- Document required permissions in workflow file

### Risk: False negatives in success rate calculation
**Impact**: Script reports incorrect metrics due to incomplete log parsing
**Mitigation**:
- Validate metrics against manual inspection during development
- Add test fixtures covering edge cases (partial logs, missing phases)
- Cross-reference with agent state for outcome confirmation
- Include data quality warnings in output (e.g., "3 runs excluded due to incomplete logs")

## Validation Strategy

### Automated Tests
**Integration tests** (pytest suite):
- Log parsing with real fixture data from recent ADW runs
- Metrics calculation accuracy verified against known outcomes
- JSON schema validation using `jsonschema` library
- Time window filtering with various date ranges
- Agent state correlation with execution logs
- Worktree staleness detection

**CI validation** (automation-ci.yml):
- Python syntax check on new script
- Full pytest suite execution (new tests + existing tests)
- Test fixtures committed to repository for reproducibility

### Manual Testing
**Local validation**:
1. Generate report to stdout: `uv run automation/adws/scripts/analyze_logs.py`
2. Verify metrics match manual log inspection
3. Generate JSON output: `uv run automation/adws/scripts/analyze_logs.py --format json > metrics.json`
4. Validate JSON schema: `jq '.' metrics.json`
5. Generate markdown report: `uv run automation/adws/scripts/analyze_logs.py --format markdown --output file --output-file /tmp/report.md`
6. Compare markdown output with original `/Users/jayminwest/Projects/kota-db-ts/agentic_run_analysis.md`

**Real-world testing**:
- Run against `automation/logs/kota-db-ts/local/` with recent ADW runs
- Verify success rate, failure distribution, phase funnel accuracy
- Cross-reference with agent state files in `automation/agents/`
- Test with empty logs directory (no recent runs)
- Test with incomplete logs (runs in progress)

**CI integration testing**:
- Trigger `adw-metrics.yml` workflow manually via GitHub Actions UI
- Verify workflow completes successfully
- Check metrics artifact is uploaded
- Test alert threshold logic (simulate low success rate)
- Verify issue comment posting functionality

### Release Guardrails
**Monitoring**:
- Track daily workflow execution status in GitHub Actions
- Monitor for parsing errors or exceptions in workflow logs
- Set alert threshold: success rate < 50% triggers notification

**Alerting**:
- GitHub Actions workflow posts issue comment when threshold breached
- Include summary metrics and link to detailed logs
- Tag relevant team members for investigation

**Rollback**:
- Disable workflow via `.github/workflows/adw-metrics.yml` schedule toggle
- Revert to manual analysis if script produces incorrect metrics
- Fix-forward approach: update script and redeploy (no data persistence)

## Validation Commands

```bash
# Python syntax check
cd automation && python3 -m py_compile adws/scripts/analyze_logs.py

# Run new tests
cd automation && uv run pytest adws/adw_tests/test_analyze_logs.py -v --tb=short

# Run full test suite
cd automation && uv run pytest adws/adw_tests/ -v --tb=short

# Manual script testing
uv run automation/adws/scripts/analyze_logs.py
uv run automation/adws/scripts/analyze_logs.py --format json --hours 48
uv run automation/adws/scripts/analyze_logs.py --format markdown --output file --output-file /tmp/report.md

# CI workflow validation
gh workflow run adw-metrics.yml --ref feature-105-9d0acfda
gh run list --workflow=adw-metrics.yml
