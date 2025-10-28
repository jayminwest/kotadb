# Chore Plan: Fix ADW Success Rate False Positive Alert

## Context
The ADW metrics workflow (`adw-metrics.yml`) triggered issue #230 reporting 0% success rate with 0 total runs and 0 failed runs. This is a false positive caused by timing issues rather than actual ADW system failure. The workflow runs daily at 00:00 UTC but may not find recent logs due to:
- Time window misalignment: 24-hour analysis window may miss recent runs created after workflow execution
- Empty result handling: 0 runs found results in 0% success rate calculation, triggering alerts
- Alert threshold logic: current implementation alerts on 0% success rate even when no runs exist

Investigation shows recent successful ADW runs exist (e.g., c133fd73 on Oct 21 completing all phases: plan → build → review), indicating the ADW system is functional but the metrics collection has timing/logic gaps.

**Constraints**: This is observability infrastructure critical for monitoring ADW health. Changes must not mask legitimate failures while eliminating false positives.

## Relevant Files
- `.github/workflows/adw-metrics.yml` — CI workflow that triggers analysis and creates alert issues
- `automation/adws/scripts/analyze_logs.py` — Log parsing and metrics calculation logic
- `automation/logs/kota-db-ts/local/` — ADW execution logs organized by run ID

### New Files
None - this is a maintenance task that modifies existing alerting logic

## Work Items
### Preparation
- Verify current ADW runs exist in `automation/logs/kota-db-ts/local/`
- Run manual analysis to confirm false positive (should show 0 runs in 24hr window at time of alert)
- Document expected behavior for empty result sets

### Execution
- Update alert threshold check in `.github/workflows/adw-metrics.yml` to skip alerting when total_runs = 0
- Add minimum run threshold (e.g., require at least 1 run before calculating success rate)
- Update issue creation logic to distinguish between "no runs found" vs "low success rate"
- Optionally: extend time window from 24 to 48 hours to reduce timing sensitivity
- Update alert message template to include "No runs found" case

### Follow-up
- Monitor next scheduled workflow run (daily at 00:00 UTC)
- Verify no false positive alerts created when runs exist
- Confirm alerts still trigger for legitimate failures (success rate < 50% with runs present)
- Consider adding metrics for "time since last run" to detect ADW downtime

## Step by Step Tasks
### 1. Analysis & Validation
- Run `gh run list --workflow="ADW Metrics Analysis" --limit 5` to find workflow run that created issue #230
- Download metrics artifact from that run: `gh run download <run_id> -n adw-metrics-<run_number>`
- Verify metrics.json shows `total_runs: 0` confirming false positive root cause
- Check current logs: `ls -lt automation/logs/kota-db-ts/local/ | head -10` to confirm recent runs exist

### 2. Fix Alert Threshold Logic
- Edit `.github/workflows/adw-metrics.yml` line 85-97 (Check alert threshold step)
- Add condition to skip alert when `total_runs == 0`
- Change alert condition from `SUCCESS_RATE < THRESHOLD` to `SUCCESS_RATE < THRESHOLD && TOTAL_RUNS > 0`
- Update alert message to clarify "no runs found" vs "low success rate" scenarios

### 3. Update Issue Creation Logic
- Modify issue body template in lines 111-126 to handle zero-run case
- Add conditional logic: if `totalRuns == 0`, create informational comment (not alert)
- Update issue title format to distinguish false positives: "ADW No Runs Found" vs "ADW Success Rate Alert"

### 4. Testing & Verification
- Trigger manual workflow run: `gh workflow run "ADW Metrics Analysis" --ref develop`
- Monitor execution: `gh run list --workflow="ADW Metrics Analysis" --limit 1`
- Verify no alert issue created when runs = 0
- Test with mock low success rate (if possible) to confirm alerts still work

### 5. Documentation & Cleanup
- Update CLAUDE.md ADW Observability section (lines 326-343) with false positive handling notes
- Add troubleshooting entry: "Alert triggered with 0 runs → check time window alignment"
- Close issue #230 with reference to fix commit

### 6. Validation & Push
- Run `cd automation && uv run adws/scripts/analyze_logs.py --format json --hours 48` to confirm script works
- Verify workflow syntax: `gh workflow view "ADW Metrics Analysis" --yaml | head -100`
- Commit changes with conventional commit message
- Push branch: `git push -u origin chore/230-false-positive-alert`

## Risks
- **Risk**: Masking legitimate ADW downtime (no runs for extended period)
  - **Mitigation**: Add "time since last run" metric in follow-up work
- **Risk**: Breaking existing alert logic for genuine low success rates
  - **Mitigation**: Manual workflow trigger with test data before merge
- **Risk**: Workflow fails with new conditional logic syntax error
  - **Mitigation**: YAML syntax validation via `gh workflow view` before push

## Validation Commands
- `cd automation && uv run adws/scripts/analyze_logs.py --format json --hours 24` (verify script runs)
- `gh workflow view "ADW Metrics Analysis" --yaml | head -200` (verify YAML syntax)
- `gh run list --workflow="ADW Metrics Analysis" --limit 1` (verify workflow doesn't fail)
- Manual workflow trigger to test no-alert path: `gh workflow run "ADW Metrics Analysis" --ref develop`

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `chore(observability): <subject>`
- Valid types: chore, fix (if treating as bug fix)
- Avoid meta-commentary patterns: "based on", "the commit should", etc.
- Use direct statements: `chore(observability): skip alert when no ADW runs found`

Example commit messages:
- ✅ `chore(observability): skip ADW alert when total runs is zero`
- ✅ `fix(ci): prevent false positive ADW success rate alerts`
- ❌ `chore: based on the analysis, the commit should fix the alert issue`

## Deliverables
- Updated `.github/workflows/adw-metrics.yml` with zero-run handling
- Validated workflow syntax (no YAML errors)
- Manual test run confirming no false positive alerts
- Documentation update in CLAUDE.md
- Issue #230 closed with reference to fix
