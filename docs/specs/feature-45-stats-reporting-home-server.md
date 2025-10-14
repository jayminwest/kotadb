# Feature Plan: Stats Reporting for Home Server Integration

## Issue Reference
- **Issue Number**: 45
- **Title**: feat(adws): add stats reporting to home server integration
- **Labels**: enhancement, component:backend, priority:medium, effort:small
- **Summary**: Add periodic statistics reporting from trigger to home server API for remote monitoring and alerting

## Overview

### Problem
The home server ADW trigger (`adw_trigger_cron_homeserver.py:56-64`) tracks comprehensive local statistics (checks performed, tasks started, worktrees created, errors, last check timestamp) but only displays them in the terminal UI. These stats are not sent to the home server API, limiting visibility into trigger health and performance when not actively monitoring the terminal.

### Desired Outcome
Enable remote monitoring of trigger health by implementing periodic stats heartbeat to home server API with configurable reporting intervals, error resilience, and comprehensive trigger identification.

### Non-Goals
- Real-time streaming (periodic heartbeat is sufficient)
- Historical stats storage on trigger side (home server owns persistence)
- Stats aggregation across multiple triggers (home server responsibility)
- Retry logic with exponential backoff (optional for V1)

## Technical Approach

### Architecture Notes
- Introduce new `POST /api/kota-tasks/stats` endpoint contract in API specification
- Add timer-based callback in trigger's main polling loop using existing `schedule` library
- Reuse existing `HomeServerTaskManager` HTTP client pattern for consistency
- Include trigger identification metadata (hostname, trigger_id) for multi-instance deployments
- Track additional uptime metric by storing trigger start timestamp

### Key Modules to Touch
- `automation/adws/adw_triggers/adw_trigger_cron_homeserver.py` - Add stats reporting logic
- `automation/adws/adw_modules/data_types.py` - Add `TriggerStatsReport` Pydantic model
- `docs/specs/adws-homeserver-api-specification.md` - Document new stats endpoint
- `automation/adws/README.md` - Update monitoring section with stats reporting details

### Data/API Impacts
New endpoint contract requires home server implementation:
- **Endpoint**: `POST /api/kota-tasks/stats` or `PUT /api/kota-tasks/trigger/{trigger_id}/stats`
- **Payload**: JSON object with trigger identification + stats dict + timestamp
- **Response**: 200 OK (no body required) or error details
- **Failure Mode**: Non-blocking (trigger continues on stats reporting errors)

## Relevant Files

### Modified Files
- `automation/adws/adw_triggers/adw_trigger_cron_homeserver.py:218-289` - `HomeServerTaskManager` class (add `report_stats()` method)
- `automation/adws/adw_triggers/adw_trigger_cron_homeserver.py:291-661` - `HomeServerCronTrigger` class (add stats reporting schedule + callback)
- `automation/adws/adw_triggers/adw_trigger_cron_homeserver.py:56-64` - Global stats dict (add `uptime_start` field)
- `automation/adws/adw_modules/data_types.py` - Add `TriggerStatsReport` model
- `docs/specs/adws-homeserver-api-specification.md` - Add stats endpoint documentation
- `automation/adws/README.md:189-357` - Update Home Server Integration section

### New Files
None (feature integrates into existing codebase)

## Task Breakdown

### Phase 1: Data Model and Configuration
- Define `TriggerStatsReport` Pydantic model in `data_types.py` with all required fields
- Add configuration fields to `HomeServerCronConfig`: `stats_reporting_enabled`, `stats_reporting_interval`, `stats_endpoint`
- Add CLI options to trigger script for stats configuration
- Add environment variable support: `HOMESERVER_STATS_ENABLED`, `HOMESERVER_STATS_INTERVAL`

### Phase 2: Stats Reporting Implementation
- Add `report_stats()` method to `HomeServerTaskManager` class with error handling
- Initialize trigger start timestamp in `HomeServerCronTrigger.__init__`
- Add stats reporting callback function that builds payload and calls task manager
- Schedule periodic stats reporting in `run_continuous()` method
- Ensure stats reporting failures are logged but don't crash trigger

### Phase 3: Documentation and Testing
- Add stats endpoint specification to `adws-homeserver-api-specification.md`
- Update README monitoring section with stats reporting details
- Document configuration options and environment variables
- Add manual testing instructions for observing stats updates

## Step by Step Tasks

### Data Model Definition
1. Add `TriggerStatsReport` Pydantic model to `automation/adws/adw_modules/data_types.py`:
   - Fields: `trigger_id`, `hostname`, `stats` (dict), `timestamp`
   - Validators for required fields and data types
   - Default timestamp generation using `datetime.now().isoformat()`

2. Extend `HomeServerCronConfig` in `data_types.py`:
   - Add `stats_reporting_enabled: bool = Field(default=True)`
   - Add `stats_reporting_interval: int = Field(default=60, ge=10)` (minimum 10 seconds)
   - Add `stats_endpoint: str = Field(default="/api/kota-tasks/stats")`

3. Update global stats dict in `adw_trigger_cron_homeserver.py:56-64`:
   - Add `uptime_start` field (initialized to `time.time()` on trigger start)
   - Keep existing fields: checks, tasks_started, worktrees_created, homeserver_updates, errors, last_check

### Stats Reporting Logic
4. Add `report_stats()` method to `HomeServerTaskManager` class (after line 289):
   - Accept `trigger_id`, `stats_dict` parameters
   - Build stats payload using `TriggerStatsReport` model
   - Calculate uptime_seconds from `stats_dict["uptime_start"]`
   - Make POST request to `{base_url}{stats_endpoint}`
   - Return bool success status
   - Wrap in try/except, log errors, increment stats["errors"] on failure

5. Generate trigger identification in `HomeServerCronTrigger.__init__`:
   - Set `self.trigger_id` using hostname + timestamp (e.g., `kota-trigger-{hostname}-{timestamp}`)
   - Or accept optional `--trigger-id` CLI flag for custom identifiers
   - Store trigger start time: `stats["uptime_start"] = time.time()`

6. Add stats reporting callback in `HomeServerCronTrigger` class:
   - Define `_report_stats_callback()` method
   - Build stats payload dict with active_tasks count from `self.workflow_monitor.active_workflows`
   - Call `self.task_manager.report_stats(self.trigger_id, stats)`
   - Log success/failure with appropriate console output

7. Schedule stats reporting in `run_continuous()` method (after line 654):
   - Check if `self.config.stats_reporting_enabled` is True
   - Schedule callback: `schedule.every(self.config.stats_reporting_interval).seconds.do(self._report_stats_callback)`
   - Ensure scheduling happens before main loop

### CLI and Configuration
8. Add CLI options to `main()` function (after line 711):
   - `--stats-enabled/--no-stats-enabled` flag (default: True)
   - `--stats-interval` option (type: int, default: 60)
   - `--stats-endpoint` option (type: str, default: `/api/kota-tasks/stats`)
   - `--trigger-id` option (type: str, optional)
   - Pass options to `HomeServerCronConfig` constructor

9. Add environment variable support:
   - Check `os.getenv("HOMESERVER_STATS_ENABLED")` and convert to bool
   - Check `os.getenv("HOMESERVER_STATS_INTERVAL")` and convert to int
   - Use environment variables as defaults for CLI options

### Documentation
10. Update `docs/specs/adws-homeserver-api-specification.md`:
    - Add stats endpoint section (after line 474, before "## Data Models")
    - Document endpoint: `POST /api/kota-tasks/stats`
    - Request body structure with example
    - Response format (200 OK or error)
    - Add stats endpoint to implementation checklist

11. Update `automation/adws/README.md`:
    - Add "Statistics Reporting" subsection under "Home Server Integration" (after line 357)
    - Document configuration options
    - Document environment variables
    - Show example stats payload
    - Note non-blocking failure behavior

12. Add manual testing instructions:
    - Document how to observe stats updates in home server logs
    - Provide example curl command for testing stats endpoint
    - Note expected reporting frequency based on interval

### Final Validation
13. Test stats reporting functionality:
    - Start trigger with default stats reporting enabled
    - Verify stats are sent every 60 seconds (default interval)
    - Test with custom interval: `--stats-interval 30`
    - Test with stats disabled: `--no-stats-enabled`
    - Test with custom trigger ID: `--trigger-id test-trigger-001`
    - Verify stats reporting failures don't crash trigger

14. Verify configuration loading:
    - Test environment variable overrides: `HOMESERVER_STATS_ENABLED=false`
    - Test interval via env var: `HOMESERVER_STATS_INTERVAL=45`
    - Confirm CLI flags override environment variables

15. Validate documentation completeness:
    - Review API specification for stats endpoint clarity
    - Review README for configuration examples
    - Confirm implementation checklist updated

16. Git operations and PR creation:
    - Stage all modified files: `git add -A`
    - Commit changes with conventional commit message
    - Push branch: `git push -u origin feature-45-ce5c1681`
    - Create PR with issue reference and plan path

## Risks & Mitigations

### Risk: Stats reporting failures crash trigger
**Mitigation**: Wrap all HTTP calls in try/except blocks, log errors but continue execution. Increment error counter for observability.

### Risk: Rapid stats updates overload home server
**Mitigation**: Enforce minimum reporting interval (10 seconds) in Pydantic model validation. Default to 60 seconds for reasonable balance.

### Risk: Trigger identification collisions in multi-instance deployments
**Mitigation**: Include hostname + timestamp in auto-generated trigger_id. Support explicit `--trigger-id` CLI flag for manual disambiguation.

### Risk: Stats payload format changes break home server parser
**Mitigation**: Use Pydantic model for payload structure validation. Version the endpoint path if breaking changes needed (`/api/v2/kota-tasks/stats`).

### Risk: Missing uptime calculation causes inaccurate metrics
**Mitigation**: Initialize `stats["uptime_start"]` in trigger constructor. Calculate delta in `report_stats()` method as `time.time() - stats["uptime_start"]`.

## Validation Strategy

### Automated Tests
Integration tests would require mocking home server HTTP responses, which is out of scope for this small feature. Focus on manual validation instead.

### Manual Checks
- **Trigger Start**: Verify stats dict initialized with `uptime_start` field
- **Stats Scheduling**: Confirm schedule.every() called with correct interval
- **Payload Structure**: Inspect request body matches `TriggerStatsReport` schema
- **Error Handling**: Test with invalid home server URL, observe error logs without crash
- **Configuration Overrides**: Test CLI flags and environment variables take precedence
- **Multi-Trigger**: Run two triggers with different trigger IDs, verify distinct reporting

### Release Guardrails
- **Monitoring**: Home server logs should show periodic stats POST requests
- **Alerting**: Home server can alert if trigger stats not received within 2x reporting interval
- **Rollback**: Stats reporting is opt-in via config flag, can be disabled without code changes

### Validation Data Setup
No database seeding required. Feature only sends data to home server API (stateless trigger side).

### Failure Scenarios Exercised
- Home server unavailable (connection refused)
- Home server returns 500 error
- Network timeout (exceeds 10 second timeout)
- Invalid stats endpoint path (404)
- Stats payload JSON encoding error

## Validation Commands

All commands executed from repository root:

```bash
# Type checking
cd automation && uv run python3 -m py_compile adws/adw_triggers/adw_trigger_cron_homeserver.py
cd automation && uv run python3 -m py_compile adws/adw_modules/data_types.py

# Linting (if applicable)
cd automation && uv run ruff check adws/adw_triggers/ adws/adw_modules/

# Syntax validation
cd automation && python3 -m py_compile adws/adw_triggers/*.py adws/adw_modules/*.py

# Run trigger in test mode (dry-run)
cd automation && uv run adws/adw_triggers/adw_trigger_cron_homeserver.py --dry-run --once --stats-interval 10

# Test with custom configuration
cd automation && HOMESERVER_STATS_ENABLED=true HOMESERVER_STATS_INTERVAL=30 uv run adws/adw_triggers/adw_trigger_cron_homeserver.py --once
```

Note: Full test suite (`uv run pytest adws/adw_tests/`) can be run but no new test files are added for this feature (manual validation focused).
