# Feature Plan: Enable ADW Metrics Analysis Workflow for Observability

## Metadata
- **Issue**: #163
- **Title**: feat: enable ADW Metrics Analysis workflow for observability
- **Labels**: component:ci-cd, component:observability, priority:high, effort:small, status:blocked
- **Branch**: feature-163-8c4efe83

## Overview

### Problem
The ADW Metrics Analysis workflow (`.github/workflows/adw-metrics.yml`) was implemented in PR #106 but has never been executed, leaving the team without observability into ADW success rates and failure patterns. The workflow is fully configured with:
- Log analysis script (`automation/adws/scripts/analyze_logs.py`) already implemented
- Daily cron schedule (00:00 UTC)
- Metrics artifact upload and GitHub Step Summary integration
- Alert threshold logic for low success rates
- Issue comment creation when success rate falls below 50%

**Current State Evidence:**
- Workflow file exists on `develop` branch (commit 5df485b)
- Zero execution history: `gh run list --workflow="ADW Metrics Analysis"` returns error "could not find any workflows named ADW Metrics Analysis"
- Root cause: Workflow only exists on `develop`, not merged to `main`
- GitHub Actions only executes scheduled workflows from the default branch (`main`)

**Impact:**
- No visibility into ADW success/failure rates over time
- Cannot detect degradation in autonomous workflow reliability
- Missing early warning system for systemic issues (e.g., test phase failures, commit message validation)
- Unable to validate ADW improvements from resilience patterns (issue #148)

### Desired Outcome
Enable the ADW Metrics Analysis workflow for automated observability:
1. Merge workflow file from `develop` to `main` branch (required for scheduled runs)
2. Trigger manual workflow dispatch to validate execution
3. Verify metrics artifact upload and GitHub Step Summary rendering
4. Confirm alert threshold logic works correctly
5. Monitor first scheduled cron execution (next day at 00:00 UTC)
6. Document baseline metrics and expected success rate threshold (target: >80%)

### Non-Goals
- Modifying the log analysis script logic (already implemented and tested)
- Adding new metrics or analysis capabilities (defer to future enhancements)
- Creating alternative alerting channels (Slack, email) - GitHub issues are sufficient
- Historical trend dashboards or long-term storage (use GitHub Artifacts retention)
- Real-time log streaming or webhook integrations

## Technical Approach

### Architecture Notes
The workflow is already well-architected and requires no structural changes:
- **Log Analysis Script**: `automation/adws/scripts/analyze_logs.py` parses execution logs and agent state
- **CI Integration**: `.github/workflows/adw-metrics.yml` runs daily with `uv` dependency management
- **Output Formats**: JSON for programmatic parsing, markdown for GitHub Step Summary
- **Alert Logic**: Conditional step creates/updates GitHub issue when success rate < 50%
- **Artifacts**: Metrics JSON uploaded with 90-day retention for historical tracking

The task is purely operational: merge the workflow to `main` and validate execution.

### Key Modules to Touch
No code changes required. Key files for validation:
- `.github/workflows/adw-metrics.yml` - Workflow definition (already exists on `develop`)
- `automation/adws/scripts/analyze_logs.py` - Log analysis script (already implemented)
- `automation/adws/README.md` - Documentation to update with usage examples
- `CLAUDE.md` - Project instructions to reference metrics workflow

### Data/API Impacts
No database or API changes. Workflow operates on filesystem:
- **Input**: Execution logs in `automation/logs/kota-db-ts/local/*/adw_sdlc/execution.log`
- **Input**: Agent state in `automation/agents/*/adw_state.json`
- **Output**: Metrics JSON artifact uploaded to GitHub Actions
- **Output**: Markdown report rendered in GitHub Step Summary
- **Side Effect**: GitHub issue created/commented when success rate < threshold

## Relevant Files

### Existing Files
- `.github/workflows/adw-metrics.yml` - Workflow definition (on `develop`, needs merge to `main`)
- `automation/adws/scripts/analyze_logs.py` - Log analysis script (already implemented)
- `automation/adws/adw_modules/state.py` - Agent state parsing logic
- `automation/adws/adw_modules/utils.py` - Path resolution helpers
- `automation/adws/README.md` - Documentation (needs update with workflow usage)
- `CLAUDE.md` - Project instructions (needs update with workflow reference)
- `.claude/commands/docs/conditional_docs.md` - Documentation guide (needs workflow entry)
- `docs/specs/feature-105-automated-log-analysis-reports.md` - Original implementation spec

### New Files
None required. All infrastructure already exists.

## Task Breakdown

### Phase 1: Investigation and Branch Status
Verify workflow location and branch status to determine merge strategy.

**Tasks:**
1. Confirm workflow file exists on `develop` branch
2. Check if workflow exists on `main` branch
3. Identify commit that introduced workflow file (PR #106)
4. Verify no conflicts between `develop` and `main` for workflow file
5. Check if other unmerged changes exist on `develop` that should not be merged

### Phase 2: Merge Workflow to Main
Get the workflow onto the default branch so scheduled runs can execute.

**Tasks:**
1. Checkout `main` branch and pull latest changes
2. Cherry-pick workflow commit from `develop` (commit 5df485b) if isolated
3. Alternatively, create minimal PR from `develop` to `main` with only workflow file
4. Verify no unintended files are included in merge
5. Commit and push to `main` branch
6. Wait for merge/push to complete

### Phase 3: Manual Trigger Validation
Trigger the workflow manually to validate execution before relying on scheduled runs.

**Tasks:**
1. Trigger manual workflow dispatch from `main` branch
2. Monitor workflow run in GitHub Actions UI
3. Verify all steps complete successfully (setup Python, install uv, run analysis, upload artifact)
4. Check for errors in log analysis script execution
5. Download metrics artifact and validate JSON schema
6. Verify GitHub Step Summary displays markdown report correctly
7. Check rate limit headers and API quota consumption

### Phase 4: Alert Threshold Testing
Validate alert logic by simulating low success rate scenario.

**Tasks:**
1. Create mock ADW logs with <50% success rate in `automation/logs/kota-db-ts/local/`
2. Trigger workflow manually with mock logs
3. Verify workflow creates new GitHub issue with alert message
4. Confirm issue has correct labels (`automation`, `alert`, `priority:high`)
5. Run workflow again with same low success rate
6. Verify workflow comments on existing alert issue instead of creating duplicate
7. Clean up mock logs after validation

### Phase 5: Documentation and Monitoring
Document usage patterns and set up monitoring for scheduled runs.

**Tasks:**
1. Update `automation/adws/README.md` with "ADW Observability" section
2. Document workflow schedule, manual trigger commands, and alert thresholds
3. Add usage examples for reading metrics artifacts
4. Update `CLAUDE.md` with workflow reference in "ADW Observability" section
5. Update `.claude/commands/docs/conditional_docs.md` with workflow documentation entry
6. Document baseline metrics from first successful run
7. Set calendar reminder to check first scheduled run (next day 00:00 UTC)
8. Monitor workflow execution status for 7 days to establish baseline

## Step by Step Tasks

### Investigation
1. Verify workflow file exists on `develop`: `git show develop:.github/workflows/adw-metrics.yml`
2. Check workflow on `main`: `git show main:.github/workflows/adw-metrics.yml` (expect error)
3. Find introducing commit: `git log develop --oneline -- .github/workflows/adw-metrics.yml | head -1`
4. Check for other `develop` changes: `git diff main..develop --name-only`

### Merge Strategy Decision
5. If workflow commit is isolated: cherry-pick to `main` directly
6. If workflow mixed with other changes: create focused branch from `main`, cherry-pick workflow only
7. Checkout `main` branch: `git checkout main && git pull origin main`
8. Cherry-pick workflow commit: `git cherry-pick 5df485b`
9. Verify only workflow file changed: `git status` and `git diff HEAD~1`
10. Push to `main`: `git push origin main`

### Manual Trigger Validation
11. Trigger workflow from `main`: `gh workflow run "ADW Metrics Analysis" --ref main -f hours=168 -f alert_threshold=50`
12. Monitor run: `gh run watch` or check GitHub Actions UI
13. Wait for completion and check exit status
14. Download artifact: `gh run download <run_id> -n adw-metrics-<run_number>`
15. Validate JSON schema: `jq '.' automation/metrics.json`
16. Verify expected fields: `summary.success_rate`, `summary.total_runs`, `runs[]`, `phase_reaches`, `failure_phases`
17. Check GitHub Step Summary in Actions UI for markdown rendering

### Alert Testing (Optional - if time permits)
18. Create mock logs directory: `mkdir -p automation/logs/kota-db-ts/local/test-mock-001/adw_sdlc/`
19. Create mock execution.log with failed run pattern
20. Trigger workflow with alert threshold: `gh workflow run "ADW Metrics Analysis" --ref main -f hours=1 -f alert_threshold=80`
21. Verify issue creation: `gh issue list --label automation,alert`
22. Clean up mock logs: `rm -rf automation/logs/kota-db-ts/local/test-mock-001/`
23. Close test alert issue if created

### Documentation
24. Update `automation/adws/README.md` - add "## ADW Observability" section after "Resilience & Recovery"
25. Document workflow schedule, manual trigger commands, and expected metrics
26. Add example: "View latest metrics: `gh run view --workflow='ADW Metrics Analysis'`"
27. Add example: "Download metrics: `gh run download <run_id> -n adw-metrics-<run_number>`"
28. Update `CLAUDE.md` - expand "ADW Observability" section with workflow reference
29. Update `.claude/commands/docs/conditional_docs.md` - add workflow documentation entry
30. Commit documentation: `git add -A && git commit -m "docs: add ADW Metrics workflow usage and observability guide (#163)"`
31. Push documentation: `git push origin feature-163-8c4efe83`

### Validation and Finalization
32. Wait 24 hours and check first scheduled run: `gh run list --workflow="ADW Metrics Analysis" --limit 1`
33. Verify cron execution completed successfully
34. Document baseline metrics in issue #163 comment
35. Create PR from `feature-163-8c4efe83` with documentation updates
36. Link PR to issue #163

## Risks & Mitigations

### Risk: Workflow fails on first scheduled run due to missing dependencies
**Impact**: Cron execution fails, no metrics collected, alert fatigue if repeated failures
**Mitigation**:
- Manual trigger validates all dependencies before relying on scheduled runs
- Workflow uses `uv` with `--frozen` to ensure reproducible dependency resolution
- Timeout set to 10 minutes prevents hung processes from blocking queue
- Workflow uses cached dependencies via `astral-sh/setup-uv@v4` for reliability

### Risk: Workflow not found after merge due to naming mismatch
**Impact**: Scheduled runs don't execute, workflow remains dormant
**Mitigation**:
- Verify workflow name exactly matches: `ADW Metrics Analysis` (check `name:` field in YAML)
- Use `gh workflow list` to confirm workflow is discoverable after merge
- Test manual trigger with exact workflow name before declaring success
- Check GitHub Actions UI to confirm workflow appears in repository workflows list

### Risk: Alert threshold triggers false positives with low run volume
**Impact**: Noise from alerts when only 1-2 runs analyzed (50% success rate statistically insignificant)
**Mitigation**:
- Alert logic only triggers on scheduled runs (not manual dispatches)
- Consider minimum run threshold before alerting (future enhancement)
- Document expected success rate threshold (>80%) and alert threshold (50%) in README
- Team can adjust alert threshold via workflow inputs if needed

### Risk: Log directory empty causes workflow to fail
**Impact**: Workflow crashes when no logs exist for analysis time window
**Mitigation**:
- Log analysis script handles empty directories gracefully (returns 0 runs)
- Workflow continues even with 0 runs, just reports empty state
- No alert triggered when total_runs=0 (only when success rate is calculated)
- GitHub Step Summary shows "No runs found in time window" message

### Risk: Metrics drift if log format changes
**Impact**: Success rate calculations become inaccurate if log patterns change
**Mitigation**:
- Log analysis script uses flexible regex with optional groups
- Script already handles multiple log format versions (implemented in #105)
- Future log format changes should be validated against script before merging
- Test coverage in `automation/adws/adw_tests/test_analyze_logs.py` catches regressions

## Validation Strategy

### Automated Tests
No new automated tests required. Existing test coverage:
- `automation/adws/adw_tests/test_analyze_logs.py` - Log parsing and metrics calculation
- Automation CI validates Python syntax on all workflow changes
- Workflow YAML syntax validated by GitHub Actions on push

### Manual Testing
**Pre-merge validation:**
1. Verify workflow file syntax: `yamllint .github/workflows/adw-metrics.yml`
2. Check workflow appears after merge: `gh workflow list | grep "ADW Metrics Analysis"`
3. Trigger manual dispatch: `gh workflow run "ADW Metrics Analysis" --ref main`
4. Monitor run completion: `gh run watch`
5. Download and inspect metrics artifact
6. Verify GitHub Step Summary renders correctly

**Post-merge validation:**
1. Check first scheduled run (next day 00:00 UTC): `gh run list --workflow="ADW Metrics Analysis" --limit 1`
2. Verify metrics artifact uploaded
3. Check for any error logs in workflow run
4. Confirm success rate threshold makes sense (should be >80% target)

### Release Guardrails
**Monitoring:**
- Check workflow execution status daily for first week
- Monitor GitHub Actions usage quota (workflow should be <5min runtime)
- Track artifact storage consumption (90-day retention, ~10KB per run)

**Alerting:**
- Workflow self-reports when success rate < 50% via GitHub issue
- Team receives notification via issue assignment or mention
- Workflow fails if success rate < 20% (critical threshold)

**Rollback:**
- Disable scheduled runs by commenting out cron trigger in workflow file
- Delete workflow file from `main` if causing quota issues
- No data loss risk (all analysis is read-only from existing logs)
- Manual analysis always available via `uv run automation/adws/scripts/analyze_logs.py`

## Validation Commands

```bash
# Check workflow exists after merge
gh workflow list | grep "ADW Metrics Analysis"

# Trigger manual workflow dispatch
gh workflow run "ADW Metrics Analysis" --ref main -f hours=168 -f alert_threshold=50

# Monitor workflow execution
gh run watch

# List recent workflow runs
gh run list --workflow="ADW Metrics Analysis" --limit 5

# Download metrics artifact
gh run download <run_id> -n adw-metrics-<run_number>

# Validate metrics JSON schema
jq '.' automation/metrics.json

# View GitHub Step Summary (requires web browser)
gh run view <run_id> --web

# Check for alert issues
gh issue list --label automation,alert

# Manual log analysis (bypass workflow)
uv run automation/adws/scripts/analyze_logs.py --format json --hours 24 --env local
```

## Issue Relationships

- **Depends On**: #162 (bug: fix application CI reliability) - Should resolve CI flakiness before adding more workflows that depend on stable infrastructure
- **Related To**: #105 (feat: automated log analysis reports) - Uses log analysis script implemented in this issue
- **Related To**: #106 (chore: add automated log analysis specification) - CI integration that added the workflow file
- **Related To**: #141 (feat: persistent ADW state management) - Metrics will help track state-related failures and validate state persistence
- **Follow-Up**: CI performance monitoring - Template pattern for tracking app-ci metrics similarly
