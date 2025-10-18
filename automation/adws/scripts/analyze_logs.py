#!/usr/bin/env python3
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
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

# Add parent directory to path for imports
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


@dataclass
class WorktreeMetrics:
    """Metrics about worktree usage and staleness."""

    total: int = 0
    active: int = 0
    completed: int = 0
    stale: int = 0
    stale_threshold_days: int = 7


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


def parse_execution_logs(
    time_window: timedelta, env: str = "local"
) -> List[RunAnalysis]:
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

        # Check if modified within time window
        mtime = datetime.fromtimestamp(run_dir.stat().st_mtime)
        if mtime < cutoff_time:
            continue

        run_id = run_dir.name
        sdlc_log = run_dir / "adw_sdlc" / "execution.log"

        if not sdlc_log.exists():
            continue

        # Parse the log
        try:
            with open(sdlc_log, encoding="utf-8") as f:
                content = f.read()
        except (OSError, UnicodeDecodeError):
            continue

        # Extract metadata
        issue_match = re.search(r"issue #(\d+)", content, re.IGNORECASE)
        issue_num = issue_match.group(1) if issue_match else "unknown"

        # Extract phases executed
        phases = []
        phase_pattern = r"Running (adw_phases/\w+\.py)"
        for match in re.finditer(phase_pattern, content):
            phase_name = match.group(1).replace("adw_phases/", "").replace(".py", "")
            phases.append(phase_name)

        # Check for failures
        failures = []
        failure_pattern = r"(adw_phases/\w+\.py) failed with exit code (\d+)"
        for match in re.finditer(failure_pattern, content):
            failed_phase = match.group(1).replace("adw_phases/", "").replace(".py", "")
            exit_code = match.group(2)
            failures.append((failed_phase, exit_code))

        # Determine outcome
        if not failures:
            if "adw_review" in phases or "adw_document" in phases:
                outcome = "completed"
            else:
                outcome = "in_progress"
        else:
            failed_phase = failures[0][0]
            outcome = f"failed_at_{failed_phase}"

        # Get error messages
        errors = []
        for line in content.split("\n"):
            if " - ERROR - " in line and "failed with exit code" not in line:
                errors.append(line.strip())

        # Try to load agent state
        agent_state = parse_agent_state(run_id)

        runs.append(
            RunAnalysis(
                run_id=run_id,
                issue=issue_num,
                phases=phases,
                failures=failures,
                outcome=outcome,
                errors=errors,
                timestamp=mtime,
                agent_state=agent_state,
            )
        )

    # Sort by timestamp
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
        if not run.agent_state or not run.agent_state.get("worktree_name"):
            continue

        worktree_name = run.agent_state["worktree_name"]
        if worktree_name in seen_worktrees:
            continue

        seen_worktrees.add(worktree_name)
        metrics.total += 1

        # Check if stale
        if run.timestamp < stale_threshold:
            metrics.stale += 1
        elif run.outcome == "completed":
            metrics.completed += 1
        elif run.outcome == "in_progress":
            metrics.active += 1

    return metrics


def calculate_metrics(
    runs: List[RunAnalysis], time_window_hours: int, env: str
) -> AnalysisMetrics:
    """Calculate aggregated metrics from run analyses.

    Args:
        runs: List of RunAnalysis objects
        time_window_hours: Time window in hours
        env: Environment name

    Returns:
        AnalysisMetrics with aggregated statistics
    """
    if not runs:
        return AnalysisMetrics(
            total_runs=0,
            success_rate=0.0,
            outcomes={},
            issues={},
            phase_reaches={},
            failure_phases={},
            runs=[],
            time_window_hours=time_window_hours,
            analysis_time=datetime.now(),
            environment=env,
        )

    # Outcome distribution
    outcomes = Counter(r.outcome for r in runs)

    # Issue distribution
    issues = Counter(r.issue for r in runs)

    # Phase progression
    phase_reaches = defaultdict(int)
    for run in runs:
        for phase in run.phases:
            phase_reaches[phase] += 1

    # Failure analysis
    failure_phases = Counter()
    failed_runs = [r for r in runs if r.failures]
    for run in failed_runs:
        if run.failures:
            failure_phases[run.failures[0][0]] += 1

    # Calculate success rate
    completed_count = len([r for r in runs if r.outcome == "completed"])
    success_rate = (completed_count / len(runs) * 100) if runs else 0.0

    # Worktree metrics
    worktree_metrics = calculate_worktree_metrics(runs)

    return AnalysisMetrics(
        total_runs=len(runs),
        success_rate=success_rate,
        outcomes=dict(outcomes),
        issues=dict(issues),
        phase_reaches=dict(phase_reaches),
        failure_phases=dict(failure_phases),
        runs=runs,
        time_window_hours=time_window_hours,
        analysis_time=datetime.now(),
        environment=env,
        worktree_metrics=worktree_metrics,
    )


def format_text(metrics: AnalysisMetrics) -> str:
    """Format metrics as human-readable text for stdout.

    Args:
        metrics: Analysis metrics

    Returns:
        Formatted text report
    """
    lines = []
    lines.append("=" * 80)
    lines.append(f"ADW Agentic Run Analysis - Last {metrics.time_window_hours} Hours")
    lines.append(
        f"Analysis Time: {metrics.analysis_time.strftime('%Y-%m-%d %H:%M:%S')}"
    )
    lines.append(f"Environment: {metrics.environment}")
    lines.append("=" * 80)
    lines.append("")

    # Summary stats
    lines.append("📊 SUMMARY METRICS")
    lines.append("─" * 80)
    lines.append(f"Total runs analyzed: {metrics.total_runs}")
    lines.append("")

    if metrics.total_runs == 0:
        lines.append("No runs found in the specified time window.")
        lines.append("")
        lines.append("=" * 80)
        return "\n".join(lines)

    # Outcome breakdown
    lines.append("Outcome Distribution:")
    for outcome, count in sorted(
        metrics.outcomes.items(), key=lambda x: x[1], reverse=True
    ):
        percentage = (count / metrics.total_runs * 100) if metrics.total_runs else 0
        lines.append(f"  • {outcome:30s}: {count:2d} runs ({percentage:5.1f}%)")
    lines.append("")

    # Issue distribution
    lines.append("Issues Worked On:")
    for issue, count in sorted(
        metrics.issues.items(), key=lambda x: x[1], reverse=True
    ):
        lines.append(f"  • Issue #{issue}: {count} run(s)")
    lines.append("")

    # Phase progression analysis
    phase_order = ["adw_plan", "adw_build", "adw_test", "adw_review", "adw_document"]
    lines.append("Phase Reach (how many runs got to each phase):")
    for phase in phase_order:
        count = metrics.phase_reaches.get(phase, 0)
        percentage = (count / metrics.total_runs * 100) if metrics.total_runs else 0
        lines.append(f"  • {phase:15s}: {count:2d} runs ({percentage:5.1f}%)")
    lines.append("")

    # Worktree metrics
    if metrics.worktree_metrics.total > 0:
        lines.append("Worktree Metrics:")
        lines.append(f"  • Total worktrees: {metrics.worktree_metrics.total}")
        lines.append(f"  • Active: {metrics.worktree_metrics.active}")
        lines.append(f"  • Completed: {metrics.worktree_metrics.completed}")
        lines.append(
            f"  • Stale (>{metrics.worktree_metrics.stale_threshold_days}d): {metrics.worktree_metrics.stale}"
        )
        lines.append("")

    # Failure analysis
    lines.append("🔍 FAILURE PATTERNS")
    lines.append("─" * 80)

    if metrics.failure_phases:
        lines.append("Failures by Phase:")
        for phase, count in sorted(
            metrics.failure_phases.items(), key=lambda x: x[1], reverse=True
        ):
            percentage = (count / metrics.total_runs * 100) if metrics.total_runs else 0
            lines.append(
                f"  • {phase:15s}: {count:2d} failures ({percentage:5.1f}% of all runs)"
            )
        lines.append("")

        # Calculate success rate
        completed_runs = [r for r in metrics.runs if r.outcome == "completed"]
        in_progress_runs = [r for r in metrics.runs if r.outcome == "in_progress"]
        failed_runs = [r for r in metrics.runs if r.failures]

        lines.append(f"Overall Success Rate: {metrics.success_rate:.1f}%")
        lines.append(f"  • Successful completions: {len(completed_runs)}")
        lines.append(f"  • In progress: {len(in_progress_runs)}")
        lines.append(f"  • Failed: {len(failed_runs)}")
    else:
        lines.append("No failures detected in analyzed runs!")
    lines.append("")

    # Detail recent runs
    lines.append(f"📋 RECENT RUNS (last 10)")
    lines.append("─" * 80)
    for run in metrics.runs[-10:]:
        timestamp = run.timestamp.strftime("%H:%M:%S")
        phases_str = " → ".join(run.phases[:4])  # Show first 4 phases
        if len(run.phases) > 4:
            phases_str += " → ..."

        lines.append(
            f"{timestamp} | {run.run_id[:8]} | Issue #{run.issue:3s} | {run.outcome:20s}"
        )
        if run.failures:
            failed_phase, exit_code = run.failures[0]
            lines.append(f"         └─ Failed at {failed_phase} (exit {exit_code})")

    lines.append("")
    lines.append("=" * 80)
    return "\n".join(lines)


def format_json(metrics: AnalysisMetrics) -> str:
    """Format metrics as JSON for programmatic consumption.

    Args:
        metrics: Analysis metrics

    Returns:
        JSON string
    """
    data = {
        "analysis_time": metrics.analysis_time.isoformat(),
        "time_window_hours": metrics.time_window_hours,
        "environment": metrics.environment,
        "summary": {
            "total_runs": metrics.total_runs,
            "success_rate": round(metrics.success_rate, 2),
        },
        "outcomes": metrics.outcomes,
        "issues": metrics.issues,
        "phase_reaches": metrics.phase_reaches,
        "failure_phases": metrics.failure_phases,
        "worktree_metrics": {
            "total": metrics.worktree_metrics.total,
            "active": metrics.worktree_metrics.active,
            "completed": metrics.worktree_metrics.completed,
            "stale": metrics.worktree_metrics.stale,
            "stale_threshold_days": metrics.worktree_metrics.stale_threshold_days,
        },
        "runs": [
            {
                "run_id": r.run_id,
                "issue": r.issue,
                "phases": r.phases,
                "failures": [{"phase": f[0], "exit_code": f[1]} for f in r.failures],
                "outcome": r.outcome,
                "timestamp": r.timestamp.isoformat(),
                "agent_state": r.agent_state,
            }
            for r in metrics.runs
        ],
    }
    return json.dumps(data, indent=2)


def format_markdown(metrics: AnalysisMetrics) -> str:
    """Format metrics as markdown compatible with existing report structure.

    Args:
        metrics: Analysis metrics

    Returns:
        Markdown formatted report
    """
    lines = []
    analysis_date = metrics.analysis_time.strftime("%Y-%m-%d")
    analysis_datetime = metrics.analysis_time.strftime("%Y-%m-%d %H:%M:%S")

    lines.append(f"# Agentic Run Analysis - {analysis_date}")
    lines.append("")
    lines.append(f"**Analysis Time**: {analysis_datetime}")
    lines.append(f"**Period Analyzed**: Last {metrics.time_window_hours} hours")
    lines.append(f"**Environment**: {metrics.environment}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Executive Summary
    lines.append("## Executive Summary")
    lines.append("")
    lines.append(
        f"**Overall Success Rate: {metrics.success_rate:.1f}%** "
        f"({sum(1 for r in metrics.runs if r.outcome == 'in_progress')} in-progress, "
        f"{sum(1 for r in metrics.runs if r.outcome == 'completed')} completed, "
        f"{sum(1 for r in metrics.runs if r.failures)} failed)"
    )
    lines.append("")

    if metrics.total_runs > 0:
        lines.append(
            f"The ADW (Automated Developer Workflow) system executed **{metrics.total_runs} workflow runs** "
            f"across **{len(metrics.issues)} different issues**."
        )
    else:
        lines.append("No ADW workflow runs found in the specified time window.")
    lines.append("")
    lines.append("---")
    lines.append("")

    if metrics.total_runs == 0:
        return "\n".join(lines)

    # Quantitative Metrics
    lines.append("## Quantitative Metrics")
    lines.append("")

    # Run Distribution by Outcome
    lines.append("### Run Distribution by Outcome")
    lines.append("")
    lines.append("| Outcome | Count | Percentage |")
    lines.append("|---------|-------|------------|")
    for outcome, count in sorted(
        metrics.outcomes.items(), key=lambda x: x[1], reverse=True
    ):
        percentage = (count / metrics.total_runs * 100) if metrics.total_runs else 0
        lines.append(f"| {outcome} | {count} | {percentage:.1f}% |")
    lines.append("")

    # Phase Progression (Funnel Analysis)
    lines.append("### Phase Progression (Funnel Analysis)")
    lines.append("")
    lines.append("| Phase | Runs Reached | Percentage |")
    lines.append("|-------|--------------|------------|")
    phase_order = ["adw_plan", "adw_build", "adw_test", "adw_review", "adw_document"]
    for phase in phase_order:
        count = metrics.phase_reaches.get(phase, 0)
        percentage = (count / metrics.total_runs * 100) if metrics.total_runs else 0
        lines.append(f"| {phase} | {count} | {percentage:.1f}% |")
    lines.append("")

    # Issue Distribution
    lines.append("### Issue Distribution")
    lines.append("")
    lines.append("| Issue | Runs |")
    lines.append("|-------|------|")
    for issue, count in sorted(
        metrics.issues.items(), key=lambda x: x[1], reverse=True
    ):
        lines.append(f"| #{issue} | {count} |")
    lines.append("")

    # Worktree Metrics
    if metrics.worktree_metrics.total > 0:
        lines.append("### Worktree Metrics")
        lines.append("")
        lines.append("| Metric | Count |")
        lines.append("|--------|-------|")
        lines.append(f"| Total worktrees | {metrics.worktree_metrics.total} |")
        lines.append(f"| Active | {metrics.worktree_metrics.active} |")
        lines.append(f"| Completed | {metrics.worktree_metrics.completed} |")
        lines.append(
            f"| Stale (>{metrics.worktree_metrics.stale_threshold_days}d) | {metrics.worktree_metrics.stale} |"
        )
        lines.append("")

    # Failure Pattern Analysis
    if metrics.failure_phases:
        lines.append("## Failure Pattern Analysis")
        lines.append("")
        lines.append("### Failures by Phase")
        lines.append("")
        lines.append("| Phase | Failures | Percentage |")
        lines.append("|-------|----------|------------|")
        for phase, count in sorted(
            metrics.failure_phases.items(), key=lambda x: x[1], reverse=True
        ):
            percentage = (count / metrics.total_runs * 100) if metrics.total_runs else 0
            lines.append(f"| {phase} | {count} | {percentage:.1f}% |")
        lines.append("")

    # Recent Runs
    lines.append("## Recent Runs")
    lines.append("")
    lines.append("| Time | Run ID | Issue | Outcome |")
    lines.append("|------|--------|-------|---------|")
    for run in metrics.runs[-20:]:  # Show last 20 in markdown
        timestamp = run.timestamp.strftime("%H:%M:%S")
        lines.append(
            f"| {timestamp} | {run.run_id[:8]} | #{run.issue} | {run.outcome} |"
        )
    lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("*Generated by `automation/adws/scripts/analyze_logs.py`*")
    lines.append("")

    return "\n".join(lines)


def format_output(metrics: AnalysisMetrics, format_type: str) -> str:
    """Format metrics according to the specified format type.

    Args:
        metrics: Analysis metrics
        format_type: Output format (text, json, markdown)

    Returns:
        Formatted string
    """
    if format_type == "json":
        return format_json(metrics)
    elif format_type == "markdown":
        return format_markdown(metrics)
    else:
        return format_text(metrics)


def main() -> int:
    """Main entry point for log analysis script."""
    parser = argparse.ArgumentParser(
        description="Analyze ADW execution logs to quantify success rates and failure patterns",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Text output to stdout (default)
  %(prog)s

  # JSON output for programmatic consumption
  %(prog)s --format json

  # Markdown report to file
  %(prog)s --format markdown --output file --output-file report.md

  # Analyze last 48 hours
  %(prog)s --hours 48

  # Analyze staging environment
  %(prog)s --env staging
        """,
    )

    parser.add_argument(
        "--format",
        choices=["text", "json", "markdown"],
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="Time window in hours to analyze (default: 24)",
    )
    parser.add_argument(
        "--output",
        choices=["stdout", "file"],
        default="stdout",
        help="Output destination (default: stdout)",
    )
    parser.add_argument(
        "--output-file", type=str, help="Output file path (required when --output=file)"
    )
    parser.add_argument(
        "--env",
        type=str,
        default="local",
        help="Environment to analyze (default: local)",
    )

    args = parser.parse_args()

    # Validate output-file requirement
    if args.output == "file" and not args.output_file:
        parser.error("--output-file is required when --output=file")

    # Parse logs
    time_window = timedelta(hours=args.hours)
    runs = parse_execution_logs(time_window, args.env)

    # Calculate metrics
    metrics = calculate_metrics(runs, args.hours, args.env)

    # Format output
    output = format_output(metrics, args.format)

    # Write output
    if args.output == "file":
        try:
            output_path = Path(args.output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(output, encoding="utf-8")
            print(f"Report written to: {output_path}", file=sys.stderr)
        except OSError as e:
            print(f"Error writing to file: {e}", file=sys.stderr)
            return 1
    else:
        print(output)

    return 0


if __name__ == "__main__":
    sys.exit(main())
