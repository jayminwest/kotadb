"""Analyze ADW execution logs to quantify success rates and failure patterns.

This script parses execution logs from automation/logs/ and agent state from
automation/agents/ to generate metrics reports in multiple formats (text, JSON, markdown).

Usage:
    # Text output to stdout (default)
    uv run automation/adws/scripts/analyze_logs.py

    # JSON output for programmatic consumption
    uv run automation/adws/scripts/analyze_logs.py --format json

    # Markdown report to file
    uv run automation/adws/scripts/analyze_logs.py --format markdown --output file --output-file report.md

    # Analyze last 48 hours
    uv run automation/adws/scripts/analyze_logs.py --hours 48

    # Analyze specific environment
    uv run automation/adws/scripts/analyze_logs.py --env staging
"""
import argparse
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adw_modules.state import ADWState, StateNotFoundError
from adw_modules.state import agents_root as get_agents_root
from adw_modules.utils import logs_root, project_root

@dataclass
class RunAnalysis:
    """Analysis results for a single ADW run."""
    run_id: str
    issue: str
    phases: List[str]
    failures: List[tuple[str, str]]
    outcome: str
    errors: List[str]
    timestamp: datetime
    agent_state: Optional[Dict[str, Any]] = None
    phase_metrics: Optional[List[Dict[str, Any]]] = None

@dataclass
class WorktreeMetrics:
    """Metrics about worktree usage and staleness."""
    total: int = 0
    active: int = 0
    completed: int = 0
    stale: int = 0
    stale_threshold_days: int = 7

@dataclass
class AutoMergeMetrics:
    """Metrics about auto-merge usage and success rates."""
    enabled_count: int = 0
    success_count: int = 0
    failed_count: int = 0
    pending_count: int = 0
    conflict_count: int = 0
    success_rate: float = 0.0

@dataclass
class AnalysisMetrics:
    """Aggregated metrics from log analysis."""
    total_runs: int
    success_rate: float
    outcomes: Dict[str, int]
    issues: Dict[str, int]
    phase_reaches: Dict[str, int]
    failure_phases: Dict[str, int]
    runs: List[RunAnalysis]
    time_window_hours: int
    analysis_time: datetime
    environment: str
    worktree_metrics: WorktreeMetrics = field(default_factory=WorktreeMetrics)
    auto_merge_metrics: AutoMergeMetrics = field(default_factory=AutoMergeMetrics)

def parse_execution_logs(time_window: timedelta, env: str='local') -> List[RunAnalysis]:
    """Parse execution logs from automation/logs/ within the time window.

    Args:
        time_window: Only include runs modified within this time window
        env: Environment name (local, staging, production)

    Returns:
        List of RunAnalysis objects for each discovered run
    """
    logs_base = logs_root() / env
    if not logs_base.exists():
        return []
    cutoff_time = datetime.now() - time_window
    runs = []
    for run_dir in logs_base.iterdir():
        if not run_dir.is_dir():
            continue
        mtime = datetime.fromtimestamp(run_dir.stat().st_mtime)
        if mtime < cutoff_time:
            continue
        run_id = run_dir.name
        sdlc_log = run_dir / 'adw_sdlc' / 'execution.log'
        if not sdlc_log.exists():
            continue
        try:
            with open(sdlc_log, encoding='utf-8') as f:
                content = f.read()
        except (OSError, UnicodeDecodeError):
            continue
        issue_match = re.search('issue #(\\d+)', content, re.IGNORECASE)
        issue_num = issue_match.group(1) if issue_match else 'unknown'
        phases = []
        phase_pattern = 'Running (adw_phases/\\w+\\.py)'
        for match in re.finditer(phase_pattern, content):
            phase_name = match.group(1).replace('adw_phases/', '').replace('.py', '')
            phases.append(phase_name)
        failures = []
        failure_pattern = '(adw_phases/\\w+\\.py) failed with exit code (\\d+)'
        for match in re.finditer(failure_pattern, content):
            failed_phase = match.group(1).replace('adw_phases/', '').replace('.py', '')
            exit_code = match.group(2)
            failures.append((failed_phase, exit_code))
        if not failures:
            if 'adw_review' in phases or 'adw_document' in phases:
                outcome = 'completed'
            else:
                outcome = 'in_progress'
        else:
            failed_phase = failures[0][0]
            outcome = f'failed_at_{failed_phase}'
        errors = []
        for line in content.split('\n'):
            if ' - ERROR - ' in line and 'failed with exit code' not in line:
                errors.append(line.strip())
        agent_state = parse_agent_state(run_id)
        phase_metrics = None
        if agent_state and 'metrics' in agent_state:
            metrics_data = agent_state.get('metrics', {})
            if metrics_data and 'phases' in metrics_data:
                phase_metrics = metrics_data['phases']
        runs.append(RunAnalysis(run_id=run_id, issue=issue_num, phases=phases, failures=failures, outcome=outcome, errors=errors, timestamp=mtime, agent_state=agent_state, phase_metrics=phase_metrics))
    runs.sort(key=lambda x: x.timestamp)
    return runs

def agents_root() -> Path:
    """Get the agents root directory."""
    return get_agents_root()

def parse_agent_state(adw_id: str) -> Optional[Dict[str, Any]]:
    """Parse agent state from automation/agents/{adw_id}/adw_state.json.

    Args:
        adw_id: The ADW run identifier

    Returns:
        Dictionary of agent state or None if not found
    """
    try:
        state = ADWState.load(adw_id)
        return state.to_dict()
    except StateNotFoundError:
        return None

def compute_metrics_statistics(runs: List[RunAnalysis]) -> Dict[str, Any]:
    """Compute aggregated statistics from phase metrics.

    Args:
        runs: List of run analyses with phase metrics

    Returns:
        Dictionary with phase duration statistics (avg, P50, P95)
    """
    phase_durations = defaultdict(list)
    phase_git_ops = defaultdict(list)
    phase_agent_calls = defaultdict(list)
    for run in runs:
        if not run.phase_metrics:
            continue
        for phase_metric in run.phase_metrics:
            phase_name = phase_metric.get('phase_name')
            duration = phase_metric.get('duration_seconds')
            git_ops = phase_metric.get('git_operation_count', 0)
            agent_calls = phase_metric.get('agent_invocation_count', 0)
            if phase_name and duration is not None:
                phase_durations[phase_name].append(duration)
                phase_git_ops[phase_name].append(git_ops)
                phase_agent_calls[phase_name].append(agent_calls)
    stats = {}
    for phase, durations in phase_durations.items():
        if not durations:
            continue
        sorted_durations = sorted(durations)
        n = len(sorted_durations)
        stats[phase] = {'avg_duration': sum(durations) / n, 'p50_duration': sorted_durations[n // 2], 'p95_duration': sorted_durations[int(n * 0.95)] if n > 1 else sorted_durations[0], 'avg_git_ops': sum(phase_git_ops[phase]) / n if phase_git_ops[phase] else 0, 'avg_agent_calls': sum(phase_agent_calls[phase]) / n if phase_agent_calls[phase] else 0, 'sample_count': n}
    return stats

def calculate_worktree_metrics(runs: List[RunAnalysis]) -> WorktreeMetrics:
    """Calculate metrics about worktree usage and staleness.

    Args:
        runs: List of run analyses with agent state

    Returns:
        WorktreeMetrics with counts and staleness detection
    """
    metrics = WorktreeMetrics()
    seen_worktrees = set()
    stale_threshold = datetime.now() - timedelta(days=metrics.stale_threshold_days)
    for run in runs:
        if not run.agent_state or not run.agent_state.get('worktree_name'):
            continue
        worktree_name = run.agent_state['worktree_name']
        if worktree_name in seen_worktrees:
            continue
        seen_worktrees.add(worktree_name)
        metrics.total += 1
        if run.timestamp < stale_threshold:
            metrics.stale += 1
        elif run.outcome == 'completed':
            metrics.completed += 1
        elif run.outcome == 'in_progress':
            metrics.active += 1
    return metrics

def calculate_auto_merge_metrics(runs: List[RunAnalysis]) -> AutoMergeMetrics:
    """Calculate metrics about auto-merge usage and success rates.

    Args:
        runs: List of run analyses with agent state

    Returns:
        AutoMergeMetrics with counts and success rate
    """
    metrics = AutoMergeMetrics()
    for run in runs:
        if not run.agent_state:
            continue
        if run.agent_state.get('auto_merge_enabled'):
            metrics.enabled_count += 1
            merge_status = run.agent_state.get('merge_status')
            if merge_status == 'success':
                metrics.success_count += 1
            elif merge_status == 'failed':
                metrics.failed_count += 1
            elif merge_status == 'conflict':
                metrics.conflict_count += 1
            elif merge_status == 'pending':
                metrics.pending_count += 1

    # Calculate success rate (excluding pending)
    completed_merges = metrics.success_count + metrics.failed_count + metrics.conflict_count
    if completed_merges > 0:
        metrics.success_rate = (metrics.success_count / completed_merges) * 100

    return metrics

def calculate_metrics(runs: List[RunAnalysis], time_window_hours: int, env: str) -> AnalysisMetrics:
    """Calculate aggregated metrics from run analyses.

    Args:
        runs: List of RunAnalysis objects
        time_window_hours: Time window in hours
        env: Environment name

    Returns:
        AnalysisMetrics with aggregated statistics
    """
    if not runs:
        return AnalysisMetrics(total_runs=0, success_rate=0.0, outcomes={}, issues={}, phase_reaches={}, failure_phases={}, runs=[], time_window_hours=time_window_hours, analysis_time=datetime.now(), environment=env)
    outcomes = Counter((r.outcome for r in runs))
    issues = Counter((r.issue for r in runs))
    phase_reaches = defaultdict(int)
    for run in runs:
        for phase in run.phases:
            phase_reaches[phase] += 1
    failure_phases = Counter()
    failed_runs = [r for r in runs if r.failures]
    for run in failed_runs:
        if run.failures:
            failure_phases[run.failures[0][0]] += 1
    completed_count = len([r for r in runs if r.outcome == 'completed'])
    success_rate = completed_count / len(runs) * 100 if runs else 0.0
    worktree_metrics = calculate_worktree_metrics(runs)
    auto_merge_metrics = calculate_auto_merge_metrics(runs)
    return AnalysisMetrics(total_runs=len(runs), success_rate=success_rate, outcomes=dict(outcomes), issues=dict(issues), phase_reaches=dict(phase_reaches), failure_phases=dict(failure_phases), runs=runs, time_window_hours=time_window_hours, analysis_time=datetime.now(), environment=env, worktree_metrics=worktree_metrics, auto_merge_metrics=auto_merge_metrics)

def format_text(metrics: AnalysisMetrics) -> str:
    """Format metrics as human-readable text for stdout.

    Args:
        metrics: Analysis metrics

    Returns:
        Formatted text report
    """
    lines = []
    lines.append('=' * 80)
    lines.append(f'ADW Agentic Run Analysis - Last {metrics.time_window_hours} Hours')
    lines.append(f'Analysis Time: {metrics.analysis_time.strftime('%Y-%m-%d %H:%M:%S')}')
    lines.append(f'Environment: {metrics.environment}')
    lines.append('=' * 80)
    lines.append('')
    lines.append('📊 SUMMARY METRICS')
    lines.append('─' * 80)
    lines.append(f'Total runs analyzed: {metrics.total_runs}')
    lines.append('')
    if metrics.total_runs == 0:
        lines.append('No runs found in the specified time window.')
        lines.append('')
        lines.append('=' * 80)
        return '\n'.join(lines)
    lines.append('Outcome Distribution:')
    for outcome, count in sorted(metrics.outcomes.items(), key=lambda x: x[1], reverse=True):
        percentage = count / metrics.total_runs * 100 if metrics.total_runs else 0
        lines.append(f'  • {outcome:30s}: {count:2d} runs ({percentage:5.1f}%)')
    lines.append('')
    lines.append('Issues Worked On:')
    for issue, count in sorted(metrics.issues.items(), key=lambda x: x[1], reverse=True):
        lines.append(f'  • Issue #{issue}: {count} run(s)')
    lines.append('')
    phase_order = ['adw_plan', 'adw_build', 'adw_test', 'adw_review', 'adw_document']
    lines.append('Phase Reach (how many runs got to each phase):')
    for phase in phase_order:
        count = metrics.phase_reaches.get(phase, 0)
        percentage = count / metrics.total_runs * 100 if metrics.total_runs else 0
        lines.append(f'  • {phase:15s}: {count:2d} runs ({percentage:5.1f}%)')
    lines.append('')
    if metrics.worktree_metrics.total > 0:
        lines.append('Worktree Metrics:')
        lines.append(f'  • Total worktrees: {metrics.worktree_metrics.total}')
        lines.append(f'  • Active: {metrics.worktree_metrics.active}')
        lines.append(f'  • Completed: {metrics.worktree_metrics.completed}')
        lines.append(f'  • Stale (>{metrics.worktree_metrics.stale_threshold_days}d): {metrics.worktree_metrics.stale}')
        lines.append('')
    if metrics.auto_merge_metrics.enabled_count > 0:
        lines.append('Auto-Merge Metrics:')
        lines.append(f'  • Auto-merge enabled: {metrics.auto_merge_metrics.enabled_count}')
        lines.append(f'  • Success: {metrics.auto_merge_metrics.success_count}')
        lines.append(f'  • Failed: {metrics.auto_merge_metrics.failed_count}')
        lines.append(f'  • Conflicts: {metrics.auto_merge_metrics.conflict_count}')
        lines.append(f'  • Pending: {metrics.auto_merge_metrics.pending_count}')
        lines.append(f'  • Success rate: {metrics.auto_merge_metrics.success_rate:.1f}%')
        if metrics.auto_merge_metrics.success_rate < 90 and metrics.auto_merge_metrics.enabled_count >= 5:
            lines.append(f'  ⚠️  Warning: Auto-merge success rate below 90% ({metrics.auto_merge_metrics.enabled_count} runs)')
        lines.append('')
    lines.append('🔍 FAILURE PATTERNS')
    lines.append('─' * 80)
    if metrics.failure_phases:
        lines.append('Failures by Phase:')
        for phase, count in sorted(metrics.failure_phases.items(), key=lambda x: x[1], reverse=True):
            percentage = count / metrics.total_runs * 100 if metrics.total_runs else 0
            lines.append(f'  • {phase:15s}: {count:2d} failures ({percentage:5.1f}% of all runs)')
        lines.append('')
        completed_runs = [r for r in metrics.runs if r.outcome == 'completed']
        in_progress_runs = [r for r in metrics.runs if r.outcome == 'in_progress']
        failed_runs = [r for r in metrics.runs if r.failures]
        lines.append(f'Overall Success Rate: {metrics.success_rate:.1f}%')
        lines.append(f'  • Successful completions: {len(completed_runs)}')
        lines.append(f'  • In progress: {len(in_progress_runs)}')
        lines.append(f'  • Failed: {len(failed_runs)}')
    else:
        lines.append('No failures detected in analyzed runs!')
    lines.append('')
    lines.append(f'📋 RECENT RUNS (last 10)')
    lines.append('─' * 80)
    for run in metrics.runs[-10:]:
        timestamp = run.timestamp.strftime('%H:%M:%S')
        phases_str = ' → '.join(run.phases[:4])
        if len(run.phases) > 4:
            phases_str += ' → ...'
        lines.append(f'{timestamp} | {run.run_id[:8]} | Issue #{run.issue:3s} | {run.outcome:20s}')
        if run.failures:
            failed_phase, exit_code = run.failures[0]
            lines.append(f'         └─ Failed at {failed_phase} (exit {exit_code})')
    lines.append('')
    lines.append('=' * 80)
    return '\n'.join(lines)

def format_json(metrics: AnalysisMetrics) -> str:
    """Format metrics as JSON for programmatic consumption.

    Args:
        metrics: Analysis metrics

    Returns:
        JSON string
    """
    data = {'analysis_time': metrics.analysis_time.isoformat(), 'time_window_hours': metrics.time_window_hours, 'environment': metrics.environment, 'summary': {'total_runs': metrics.total_runs, 'success_rate': round(metrics.success_rate, 2)}, 'outcomes': metrics.outcomes, 'issues': metrics.issues, 'phase_reaches': metrics.phase_reaches, 'failure_phases': metrics.failure_phases, 'worktree_metrics': {'total': metrics.worktree_metrics.total, 'active': metrics.worktree_metrics.active, 'completed': metrics.worktree_metrics.completed, 'stale': metrics.worktree_metrics.stale, 'stale_threshold_days': metrics.worktree_metrics.stale_threshold_days}, 'auto_merge_metrics': {'enabled_count': metrics.auto_merge_metrics.enabled_count, 'success_count': metrics.auto_merge_metrics.success_count, 'failed_count': metrics.auto_merge_metrics.failed_count, 'pending_count': metrics.auto_merge_metrics.pending_count, 'conflict_count': metrics.auto_merge_metrics.conflict_count, 'success_rate': round(metrics.auto_merge_metrics.success_rate, 2)}, 'runs': [{'run_id': r.run_id, 'issue': r.issue, 'phases': r.phases, 'failures': [{'phase': f[0], 'exit_code': f[1]} for f in r.failures], 'outcome': r.outcome, 'timestamp': r.timestamp.isoformat(), 'agent_state': r.agent_state} for r in metrics.runs]}
    return json.dumps(data, indent=2)

def format_markdown(metrics: AnalysisMetrics) -> str:
    """Format metrics as markdown compatible with existing report structure.

    Args:
        metrics: Analysis metrics

    Returns:
        Markdown formatted report
    """
    lines = []
    analysis_date = metrics.analysis_time.strftime('%Y-%m-%d')
    analysis_datetime = metrics.analysis_time.strftime('%Y-%m-%d %H:%M:%S')
    lines.append(f'# Agentic Run Analysis - {analysis_date}')
    lines.append('')
    lines.append(f'**Analysis Time**: {analysis_datetime}')
    lines.append(f'**Period Analyzed**: Last {metrics.time_window_hours} hours')
    lines.append(f'**Environment**: {metrics.environment}')
    lines.append('')
    lines.append('---')
    lines.append('')
    lines.append('## Executive Summary')
    lines.append('')
    lines.append(f'**Overall Success Rate: {metrics.success_rate:.1f}%** ({sum((1 for r in metrics.runs if r.outcome == 'in_progress'))} in-progress, {sum((1 for r in metrics.runs if r.outcome == 'completed'))} completed, {sum((1 for r in metrics.runs if r.failures))} failed)')
    lines.append('')
    if metrics.total_runs > 0:
        lines.append(f'The ADW (Automated Developer Workflow) system executed **{metrics.total_runs} workflow runs** across **{len(metrics.issues)} different issues**.')
    else:
        lines.append('No ADW workflow runs found in the specified time window.')
    lines.append('')
    lines.append('---')
    lines.append('')
    if metrics.total_runs == 0:
        return '\n'.join(lines)
    lines.append('## Quantitative Metrics')
    lines.append('')
    lines.append('### Run Distribution by Outcome')
    lines.append('')
    lines.append('| Outcome | Count | Percentage |')
    lines.append('|---------|-------|------------|')
    for outcome, count in sorted(metrics.outcomes.items(), key=lambda x: x[1], reverse=True):
        percentage = count / metrics.total_runs * 100 if metrics.total_runs else 0
        lines.append(f'| {outcome} | {count} | {percentage:.1f}% |')
    lines.append('')
    lines.append('### Phase Progression (Funnel Analysis)')
    lines.append('')
    lines.append('| Phase | Runs Reached | Percentage |')
    lines.append('|-------|--------------|------------|')
    phase_order = ['adw_plan', 'adw_build', 'adw_test', 'adw_review', 'adw_document']
    for phase in phase_order:
        count = metrics.phase_reaches.get(phase, 0)
        percentage = count / metrics.total_runs * 100 if metrics.total_runs else 0
        lines.append(f'| {phase} | {count} | {percentage:.1f}% |')
    lines.append('')
    lines.append('### Issue Distribution')
    lines.append('')
    lines.append('| Issue | Runs |')
    lines.append('|-------|------|')
    for issue, count in sorted(metrics.issues.items(), key=lambda x: x[1], reverse=True):
        lines.append(f'| #{issue} | {count} |')
    lines.append('')
    if metrics.worktree_metrics.total > 0:
        lines.append('### Worktree Metrics')
        lines.append('')
        lines.append('| Metric | Count |')
        lines.append('|--------|-------|')
        lines.append(f'| Total worktrees | {metrics.worktree_metrics.total} |')
        lines.append(f'| Active | {metrics.worktree_metrics.active} |')
        lines.append(f'| Completed | {metrics.worktree_metrics.completed} |')
        lines.append(f'| Stale (>{metrics.worktree_metrics.stale_threshold_days}d) | {metrics.worktree_metrics.stale} |')
        lines.append('')
    if metrics.auto_merge_metrics.enabled_count > 0:
        lines.append('### Auto-Merge Metrics')
        lines.append('')
        lines.append('| Metric | Count |')
        lines.append('|--------|-------|')
        lines.append(f'| Auto-merge enabled | {metrics.auto_merge_metrics.enabled_count} |')
        lines.append(f'| Success | {metrics.auto_merge_metrics.success_count} |')
        lines.append(f'| Failed | {metrics.auto_merge_metrics.failed_count} |')
        lines.append(f'| Conflicts | {metrics.auto_merge_metrics.conflict_count} |')
        lines.append(f'| Pending | {metrics.auto_merge_metrics.pending_count} |')
        lines.append(f'| Success rate | {metrics.auto_merge_metrics.success_rate:.1f}% |')
        if metrics.auto_merge_metrics.success_rate < 90 and metrics.auto_merge_metrics.enabled_count >= 5:
            lines.append('')
            lines.append(f'⚠️  **Warning**: Auto-merge success rate below 90% ({metrics.auto_merge_metrics.enabled_count} runs)')
        lines.append('')
    if metrics.failure_phases:
        lines.append('## Failure Pattern Analysis')
        lines.append('')
        lines.append('### Failures by Phase')
        lines.append('')
        lines.append('| Phase | Failures | Percentage |')
        lines.append('|-------|----------|------------|')
        for phase, count in sorted(metrics.failure_phases.items(), key=lambda x: x[1], reverse=True):
            percentage = count / metrics.total_runs * 100 if metrics.total_runs else 0
            lines.append(f'| {phase} | {count} | {percentage:.1f}% |')
        lines.append('')
    lines.append('## Recent Runs')
    lines.append('')
    lines.append('| Time | Run ID | Issue | Outcome |')
    lines.append('|------|--------|-------|---------|')
    for run in metrics.runs[-20:]:
        timestamp = run.timestamp.strftime('%H:%M:%S')
        lines.append(f'| {timestamp} | {run.run_id[:8]} | #{run.issue} | {run.outcome} |')
    lines.append('')
    lines.append('---')
    lines.append('')
    lines.append('*Generated by `automation/adws/scripts/analyze_logs.py`*')
    lines.append('')
    return '\n'.join(lines)

def format_output(metrics: AnalysisMetrics, format_type: str) -> str:
    """Format metrics according to the specified format type.

    Args:
        metrics: Analysis metrics
        format_type: Output format (text, json, markdown)

    Returns:
        Formatted string
    """
    if format_type == 'json':
        return format_json(metrics)
    elif format_type == 'markdown':
        return format_markdown(metrics)
    else:
        return format_text(metrics)

def get_db_path() -> Path:
    """Get path to beads database.

    Returns:
        Path to beads database

    Raises:
        FileNotFoundError: If database not found
    """
    db_path = project_root() / '.beads' / 'beads.db'
    if not db_path.exists():
        raise FileNotFoundError(f'Beads database not found at {db_path}. Run migrations first: python automation/adws/scripts/migrate_beads_schema.py --apply')
    return db_path

def query_database_metrics(time_window_hours: int) -> AnalysisMetrics:
    """Query ADW metrics from beads database.

    Args:
        time_window_hours: Hours to look back from now

    Returns:
        AnalysisMetrics populated from database queries
    """
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cutoff_time = datetime.now() - timedelta(hours=time_window_hours)
        cutoff_str = cutoff_time.isoformat()
        cursor = conn.cursor()
        cursor.execute('\n            SELECT e.*, i.title, i.issue_type\n            FROM adw_executions e\n            LEFT JOIN issues i ON e.issue_id = i.id\n            WHERE e.started_at >= ?\n            ORDER BY e.started_at DESC\n            ', (cutoff_str,))
        rows = cursor.fetchall()
        total_runs = len(rows)
        if total_runs == 0:
            return AnalysisMetrics(total_runs=0, success_rate=0.0, outcomes={}, issues={}, phase_reaches={}, failure_phases={}, runs=[], time_window_hours=time_window_hours, analysis_time=datetime.now(), environment='database')
        runs = []
        outcomes = Counter()
        issues = Counter()
        phase_reaches = Counter()
        failure_phases = Counter()
        for row in rows:
            run_id = row['id']
            issue_id = row['issue_id'] or 'unknown'
            phase = row['phase']
            status = row['status']
            error_msg = row['error_message']
            outcome = status if status in ('completed', 'failed') else 'in_progress'
            outcomes[outcome] += 1
            if issue_id and issue_id != 'unknown':
                issues[issue_id] += 1
            phase_reaches[phase] += 1
            failures = []
            if status == 'failed' and error_msg:
                failures.append((phase, error_msg))
                failure_phases[phase] += 1
            runs.append(RunAnalysis(run_id=run_id, issue=issue_id, phases=[phase], failures=failures, outcome=outcome, errors=[error_msg] if error_msg else [], timestamp=datetime.fromisoformat(row['started_at']), agent_state=None))
        completed_count = outcomes.get('completed', 0)
        success_rate = completed_count / total_runs * 100 if total_runs > 0 else 0.0
        return AnalysisMetrics(total_runs=total_runs, success_rate=success_rate, outcomes=dict(outcomes), issues=dict(issues), phase_reaches=dict(phase_reaches), failure_phases=dict(failure_phases), runs=runs, time_window_hours=time_window_hours, analysis_time=datetime.now(), environment='database')
    finally:
        conn.close()

def main() -> int:
    """Main entry point for log analysis script."""
    parser = argparse.ArgumentParser(description='Analyze ADW execution logs to quantify success rates and failure patterns', formatter_class=argparse.RawDescriptionHelpFormatter, epilog='\nExamples:\n  # Text output to stdout (default)\n  %(prog)s\n\n  # JSON output for programmatic consumption\n  %(prog)s --format json\n\n  # Markdown report to file\n  %(prog)s --format markdown --output file --output-file report.md\n\n  # Analyze last 48 hours\n  %(prog)s --hours 48\n\n  # Analyze staging environment\n  %(prog)s --env staging\n        ')
    parser.add_argument('--format', choices=['text', 'json', 'markdown'], default='text', help='Output format (default: text)')
    parser.add_argument('--hours', type=int, default=24, help='Time window in hours to analyze (default: 24)')
    parser.add_argument('--output', choices=['stdout', 'file'], default='stdout', help='Output destination (default: stdout)')
    parser.add_argument('--output-file', type=str, help='Output file path (required when --output=file)')
    parser.add_argument('--env', type=str, default='local', help='Environment to analyze (default: local)')
    parser.add_argument('--agent-metrics', action='store_true', help='Include agent-level success rate metrics (Phase 4)')
    parser.add_argument('--backend', choices=['json', 'database'], default='json', help='Data source backend (json=log files, database=beads database) (default: json)')
    args = parser.parse_args()
    if args.agent_metrics:
        sys.stderr.write('Warning: --agent-metrics flag is not yet implemented (Phase 4)' + '\n')
        sys.stderr.write('This flag will enable agent-level metrics in future versions:' + '\n')
        sys.stderr.write('  - Success rate by agent (which agents fail most often)' + '\n')
        sys.stderr.write('  - Retry count distribution per agent' + '\n')
        sys.stderr.write('  - Execution time per agent' + '\n')
        sys.stderr.write('  - Failure pattern analysis by agent' + '\n')
        sys.stderr.write('' + '\n')
    if args.output == 'file' and (not args.output_file):
        parser.error('--output-file is required when --output=file')
    if args.backend == 'database':
        try:
            metrics = query_database_metrics(args.hours)
        except FileNotFoundError as e:
            sys.stderr.write(f'Error: {e}' + '\n')
            return 1
    else:
        time_window = timedelta(hours=args.hours)
        runs = parse_execution_logs(time_window, args.env)
        metrics = calculate_metrics(runs, args.hours, args.env)
    output = format_output(metrics, args.format)
    if args.output == 'file':
        try:
            output_path = Path(args.output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(output, encoding='utf-8')
            sys.stderr.write(f'Report written to: {output_path}' + '\n')
        except OSError as e:
            sys.stderr.write(f'Error writing to file: {e}' + '\n')
            return 1
    else:
        sys.stdout.write(output + '\n')
    return 0
if __name__ == '__main__':
    sys.exit(main())