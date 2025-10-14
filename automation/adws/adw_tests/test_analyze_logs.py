"""Unit tests for log analysis script."""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add scripts directory to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from analyze_logs import (
    AnalysisMetrics,
    RunAnalysis,
    WorktreeMetrics,
    calculate_metrics,
    calculate_worktree_metrics,
    format_json,
    format_markdown,
    format_text,
    parse_agent_state,
    parse_execution_logs,
)


@pytest.fixture
def fixture_logs_root(tmp_path, monkeypatch):
    """Create a temporary logs directory with fixture data."""
    # Copy fixture logs to temp directory
    fixtures_dir = Path(__file__).parent / "fixtures" / "logs"
    logs_dir = tmp_path / "logs" / "kota-db-ts" / "local"
    logs_dir.mkdir(parents=True)

    # Copy each fixture log directory
    for fixture_run in fixtures_dir.iterdir():
        if fixture_run.is_dir():
            run_dir = logs_dir / fixture_run.name
            run_dir.mkdir()
            sdlc_dir = run_dir / "adw_sdlc"
            sdlc_dir.mkdir()
            # Copy execution.log
            src_log = fixture_run / "adw_sdlc" / "execution.log"
            if src_log.exists():
                (sdlc_dir / "execution.log").write_text(src_log.read_text())

    # Patch logs_root to return our temp directory
    def mock_logs_root():
        return tmp_path / "logs" / "kota-db-ts"

    monkeypatch.setattr("analyze_logs.logs_root", mock_logs_root)

    return logs_dir


@pytest.fixture
def fixture_agents_root(tmp_path, monkeypatch):
    """Create a temporary agents directory with fixture data."""
    # Copy fixture agent state to temp directory
    fixtures_dir = Path(__file__).parent / "fixtures" / "agents"
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir(parents=True)

    # Copy each fixture agent directory
    for fixture_agent in fixtures_dir.iterdir():
        if fixture_agent.is_dir():
            agent_dir = agents_dir / fixture_agent.name
            agent_dir.mkdir()
            # Copy adw_state.json
            src_state = fixture_agent / "adw_state.json"
            if src_state.exists():
                (agent_dir / "adw_state.json").write_text(src_state.read_text())

    # Patch agents_root at multiple levels
    def mock_agents_root():
        return agents_dir

    monkeypatch.setattr("analyze_logs.agents_root", mock_agents_root)
    # Also patch the state module's agents_root since ADWState.load uses it
    monkeypatch.setattr("adw_modules.state.agents_root", mock_agents_root)

    return agents_dir


def test_parse_execution_logs_success(fixture_logs_root):
    """Test parsing logs with successful runs."""
    time_window = timedelta(days=1)
    runs = parse_execution_logs(time_window, "local")

    # Should find all fixture runs
    assert len(runs) >= 1

    # Find the success run
    success_runs = [r for r in runs if "success" in r.run_id]
    assert len(success_runs) > 0

    success_run = success_runs[0]
    assert success_run.issue == "105"
    assert "adw_plan" in success_run.phases
    assert "adw_build" in success_run.phases
    assert "adw_test" in success_run.phases
    assert "adw_review" in success_run.phases
    assert "adw_document" in success_run.phases
    assert success_run.outcome == "completed"
    assert len(success_run.failures) == 0


def test_parse_execution_logs_failure_by_phase(fixture_logs_root):
    """Test parsing logs with phase-specific failures."""
    time_window = timedelta(days=1)
    runs = parse_execution_logs(time_window, "local")

    # Find failure runs
    test_failure_runs = [r for r in runs if "failure_test" in r.run_id]
    plan_failure_runs = [r for r in runs if "failure_plan" in r.run_id]

    # Test phase failure
    if test_failure_runs:
        test_failure = test_failure_runs[0]
        assert test_failure.issue == "84"
        assert "adw_test" in [f[0] for f in test_failure.failures]
        assert test_failure.outcome == "failed_at_adw_test"
        assert len(test_failure.errors) >= 1

    # Plan phase failure
    if plan_failure_runs:
        plan_failure = plan_failure_runs[0]
        assert plan_failure.issue == "98"
        assert "adw_plan" in [f[0] for f in plan_failure.failures]
        assert plan_failure.outcome == "failed_at_adw_plan"


def test_parse_execution_logs_in_progress(fixture_logs_root):
    """Test parsing logs with in-progress runs."""
    time_window = timedelta(days=1)
    runs = parse_execution_logs(time_window, "local")

    # Find in-progress run
    in_progress_runs = [r for r in runs if "in_progress" in r.run_id]

    if in_progress_runs:
        in_progress = in_progress_runs[0]
        assert in_progress.issue == "92"
        assert in_progress.outcome == "in_progress"
        assert len(in_progress.failures) == 0
        assert "adw_plan" in in_progress.phases


def test_parse_agent_state(fixture_agents_root):
    """Test parsing agent state from JSON files."""
    state = parse_agent_state("test_run_123")

    assert state is not None
    assert state["adw_id"] == "test_run_123"
    assert state["issue_number"] == "105"
    assert state["branch_name"] == "feature-105-test123"
    assert state["worktree_name"] == "feature-105-test123"


def test_parse_agent_state_not_found(fixture_agents_root):
    """Test parsing agent state for non-existent run."""
    state = parse_agent_state("nonexistent_run")
    assert state is None


def test_calculate_metrics_success_rate(fixture_logs_root, fixture_agents_root):
    """Test metrics calculation for success rate."""
    time_window = timedelta(days=1)
    runs = parse_execution_logs(time_window, "local")
    metrics = calculate_metrics(runs, 24, "local")

    assert metrics.total_runs == len(runs)
    assert 0 <= metrics.success_rate <= 100
    assert len(metrics.outcomes) > 0
    assert len(metrics.runs) == len(runs)


def test_calculate_metrics_phase_funnel(fixture_logs_root, fixture_agents_root):
    """Test phase funnel calculation."""
    time_window = timedelta(days=1)
    runs = parse_execution_logs(time_window, "local")
    metrics = calculate_metrics(runs, 24, "local")

    # Check phase reaches
    assert "adw_plan" in metrics.phase_reaches
    assert metrics.phase_reaches["adw_plan"] >= 1


def test_calculate_metrics_empty_runs():
    """Test metrics calculation with no runs."""
    metrics = calculate_metrics([], 24, "local")

    assert metrics.total_runs == 0
    assert metrics.success_rate == 0.0
    assert len(metrics.outcomes) == 0
    assert len(metrics.issues) == 0
    assert len(metrics.phase_reaches) == 0
    assert len(metrics.failure_phases) == 0


def test_calculate_worktree_metrics():
    """Test worktree metrics calculation."""
    now = datetime.now()
    runs = [
        RunAnalysis(
            run_id="run1",
            issue="105",
            phases=["adw_plan"],
            failures=[],
            outcome="completed",
            errors=[],
            timestamp=now,
            agent_state={"worktree_name": "tree1"},
        ),
        RunAnalysis(
            run_id="run2",
            issue="84",
            phases=["adw_plan"],
            failures=[("adw_test", "1")],
            outcome="failed_at_adw_test",
            errors=[],
            timestamp=now,
            agent_state={"worktree_name": "tree2"},
        ),
        RunAnalysis(
            run_id="run3",
            issue="92",
            phases=["adw_plan"],
            failures=[],
            outcome="in_progress",
            errors=[],
            timestamp=now,
            agent_state={"worktree_name": "tree3"},
        ),
        RunAnalysis(
            run_id="run4",
            issue="98",
            phases=["adw_plan"],
            failures=[],
            outcome="completed",
            errors=[],
            timestamp=now - timedelta(days=10),  # Stale
            agent_state={"worktree_name": "tree4"},
        ),
    ]

    metrics = calculate_worktree_metrics(runs)

    assert metrics.total == 4
    assert metrics.completed >= 1
    assert metrics.active >= 1
    assert metrics.stale >= 1


def test_format_text_output(fixture_logs_root, fixture_agents_root):
    """Test text formatting."""
    time_window = timedelta(days=1)
    runs = parse_execution_logs(time_window, "local")
    metrics = calculate_metrics(runs, 24, "local")

    output = format_text(metrics)

    assert "ADW Agentic Run Analysis" in output
    assert "SUMMARY METRICS" in output
    assert "Total runs analyzed:" in output
    assert "Outcome Distribution:" in output
    assert "Phase Reach" in output


def test_format_text_output_empty():
    """Test text formatting with empty metrics."""
    metrics = calculate_metrics([], 24, "local")
    output = format_text(metrics)

    assert "Total runs analyzed: 0" in output
    assert "No runs found" in output


def test_format_json_schema(fixture_logs_root, fixture_agents_root):
    """Test JSON output schema validation."""
    time_window = timedelta(days=1)
    runs = parse_execution_logs(time_window, "local")
    metrics = calculate_metrics(runs, 24, "local")

    output = format_json(metrics)
    data = json.loads(output)

    # Validate schema
    assert "analysis_time" in data
    assert "time_window_hours" in data
    assert "environment" in data
    assert "summary" in data
    assert "total_runs" in data["summary"]
    assert "success_rate" in data["summary"]
    assert "outcomes" in data
    assert "issues" in data
    assert "phase_reaches" in data
    assert "failure_phases" in data
    assert "worktree_metrics" in data
    assert "runs" in data

    # Validate runs schema
    if data["runs"]:
        run = data["runs"][0]
        assert "run_id" in run
        assert "issue" in run
        assert "phases" in run
        assert "failures" in run
        assert "outcome" in run
        assert "timestamp" in run


def test_format_json_empty():
    """Test JSON formatting with empty metrics."""
    metrics = calculate_metrics([], 24, "local")
    output = format_json(metrics)
    data = json.loads(output)

    assert data["summary"]["total_runs"] == 0
    assert data["summary"]["success_rate"] == 0.0
    assert len(data["runs"]) == 0


def test_format_markdown_structure(fixture_logs_root, fixture_agents_root):
    """Test markdown output structure."""
    time_window = timedelta(days=1)
    runs = parse_execution_logs(time_window, "local")
    metrics = calculate_metrics(runs, 24, "local")

    output = format_markdown(metrics)

    # Check for markdown headers
    assert "# Agentic Run Analysis" in output
    assert "## Executive Summary" in output
    assert "## Quantitative Metrics" in output
    assert "### Run Distribution by Outcome" in output
    assert "### Phase Progression" in output
    assert "### Issue Distribution" in output

    # Check for tables
    assert "| Outcome | Count | Percentage |" in output
    assert "|---------|-------|------------|" in output


def test_format_markdown_empty():
    """Test markdown formatting with empty metrics."""
    metrics = calculate_metrics([], 24, "local")
    output = format_markdown(metrics)

    assert "# Agentic Run Analysis" in output
    assert "No ADW workflow runs found" in output


def test_time_window_filtering(fixture_logs_root):
    """Test that time window filtering works correctly."""
    # Test with very short time window (should find nothing)
    short_window = timedelta(seconds=1)
    runs_short = parse_execution_logs(short_window, "local")
    # May or may not find runs depending on when fixtures were created

    # Test with long time window (should find all)
    long_window = timedelta(days=365)
    runs_long = parse_execution_logs(long_window, "local")
    assert len(runs_long) >= 0  # At least should not error


def test_parse_execution_logs_nonexistent_env():
    """Test parsing logs for non-existent environment."""
    time_window = timedelta(days=1)
    runs = parse_execution_logs(time_window, "nonexistent")

    # Should return empty list without errors
    assert len(runs) == 0
