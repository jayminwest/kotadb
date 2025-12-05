# ADW Observability

**Template Category**: Message-Only
**Prompt Level**: 4 (Contextual)

ADW metrics analysis, log analysis, and CI integration for monitoring success rates and failure patterns.

## Log Analysis Script

Location: `automation/adws/scripts/analyze_logs.py`

Automated log analysis for ADW success rates and failure patterns.

### Data Sources

- **Execution logs**: `automation/logs/kota-db-ts/{env}/{adw_id}/adw_sdlc/execution.log`
- **Agent state**: `automation/agents/{adw_id}/adw_state.json`

### Key Metrics

- Success rate
- Phase progression (funnel analysis)
- Worktree staleness
- Failure patterns by phase

### Agent-Level Metrics (Phase 4 - Stub)

`--agent-metrics` flag for:
- Agent success rates
- Retry counts
- Execution times

### Usage

```bash
uv run automation/adws/scripts/analyze_logs.py --format json --hours 24
```

### Output Formats

- **Text**: Human-readable summary
- **JSON**: Machine-parseable metrics
- **Markdown**: GitHub-friendly reports

## ADW Metrics Analysis Workflow

Location: `.github/workflows/adw-metrics.yml`

### Schedule

Runs daily at 00:00 UTC for automated metrics collection.

### Manual Trigger

```bash
gh workflow run "ADW Metrics Analysis" --ref main
```

### Outputs

- JSON metrics artifact + markdown summary in GitHub Step Summary
- 90-day artifact retention for historical tracking

### Alerting

- Creates/updates GitHub issue when success rate < 50% AND total_runs > 0
- **False Positive Prevention**: Workflow skips alerts when no runs found (0 total_runs) to prevent timing-related false positives
- **Critical Threshold**: Workflow fails if success rate < 20%

### Target Success Rate

>80% (per 3-phase architecture goals)

### View Runs

```bash
gh run list --workflow="ADW Metrics Analysis" --limit 5
```

### Download Metrics

```bash
gh run download <run_id> -n adw-metrics-<run_number>
```

### Troubleshooting

If alert triggered with 0 runs:
1. Verify recent runs exist in `automation/logs/kota-db-ts/local/`
2. Check time window alignment (workflow runs at 00:00 UTC, logs may be created after analysis)

## Monitoring Best Practices

1. **Daily Review**: Check GitHub Step Summary for daily metrics
2. **Alert Response**: Investigate when success rate < 50%
3. **Trend Analysis**: Download metrics artifacts to track trends over time
4. **Phase Funnel**: Monitor phase progression to identify bottlenecks
5. **Failure Patterns**: Analyze failure distributions to prioritize fixes

## Related Documentation

- [ADW Architecture](./.claude/commands/workflows/adw-architecture.md)
- [CI Configuration](./.claude/commands/ci/ci-configuration.md)
- Complete automation architecture: `automation/adws/README.md`
