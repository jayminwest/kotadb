#!/usr/bin/env python3
"""Test suite for ADW phase execution metrics logging."""

from __future__ import annotations

import json
import tempfile
import time
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock

import pytest

from adws.adw_modules.data_types import PhaseMetrics, WorkflowMetrics
from adws.adw_modules.state import ADWState
from adws.adw_modules.workflow_ops import PhaseMetricsCollector


class TestPhaseMetricsDataModel:
    """Test PhaseMetrics Pydantic model validation."""

    def test_phase_metrics_valid_data(self):
        """Test PhaseMetrics with valid data."""
        metrics = PhaseMetrics(
            phase_name="adw_plan",
            start_timestamp=datetime.now(),
            end_timestamp=datetime.now(),
            duration_seconds=10.5,
            memory_usage_mb=256.7,
            checkpoint_count=3,
            git_operation_count=5,
            git_operation_duration_seconds=2.3,
            agent_invocation_count=2,
            agent_invocation_duration_seconds=7.8,
        )
        assert metrics.phase_name == "adw_plan"
        assert metrics.duration_seconds == 10.5
        assert metrics.checkpoint_count == 3
        assert metrics.git_operation_count == 5
        assert metrics.agent_invocation_count == 2

    def test_phase_metrics_minimal_data(self):
        """Test PhaseMetrics with minimal required fields."""
        start_time = datetime.now()
        metrics = PhaseMetrics(
            phase_name="adw_build",
            start_timestamp=start_time,
        )
        assert metrics.phase_name == "adw_build"
        assert metrics.start_timestamp == start_time
        assert metrics.end_timestamp is None
        assert metrics.duration_seconds is None
        assert metrics.checkpoint_count == 0
        assert metrics.git_operation_count == 0
        assert metrics.agent_invocation_count == 0

    def test_phase_metrics_json_serialization(self):
        """Test PhaseMetrics JSON serialization for state persistence."""
        start_time = datetime.now()
        end_time = datetime.now()
        metrics = PhaseMetrics(
            phase_name="adw_review",
            start_timestamp=start_time,
            end_timestamp=end_time,
            duration_seconds=15.2,
            checkpoint_count=1,
        )
        metrics_dict = metrics.model_dump(mode="json")
        assert metrics_dict["phase_name"] == "adw_review"
        assert metrics_dict["duration_seconds"] == 15.2
        assert metrics_dict["checkpoint_count"] == 1


class TestWorkflowMetricsDataModel:
    """Test WorkflowMetrics Pydantic model validation."""

    def test_workflow_metrics_valid_data(self):
        """Test WorkflowMetrics with valid data."""
        phase1 = PhaseMetrics(
            phase_name="adw_plan",
            start_timestamp=datetime.now(),
            duration_seconds=10.0,
        )
        phase2 = PhaseMetrics(
            phase_name="adw_build",
            start_timestamp=datetime.now(),
            duration_seconds=20.0,
        )
        workflow = WorkflowMetrics(
            phases=[phase1, phase2],
            total_duration_seconds=30.0,
            workflow_type="adw_plan_build",
        )
        assert len(workflow.phases) == 2
        assert workflow.total_duration_seconds == 30.0
        assert workflow.workflow_type == "adw_plan_build"

    def test_workflow_metrics_empty_phases(self):
        """Test WorkflowMetrics with no phases."""
        workflow = WorkflowMetrics(
            phases=[],
            workflow_type="adw_sdlc",
        )
        assert len(workflow.phases) == 0
        assert workflow.total_duration_seconds is None


class TestADWStateMetricsPersistence:
    """Test ADWState metrics persistence via helper methods."""

    def test_set_and_get_phase_metrics(self, tmp_path, monkeypatch):
        """Test round-trip save/load of phase metrics."""
        # Create test state in temporary directory
        test_adw_id = "test-metrics-123"
        test_agents_root = tmp_path / "agents"
        test_agents_root.mkdir()

        # Patch agents_root to use temp directory
        from adws.adw_modules import state as state_module
        monkeypatch.setattr(state_module, "agents_root", lambda: test_agents_root)

        state = ADWState(adw_id=test_adw_id)
        state.base_dir.mkdir(parents=True, exist_ok=True)

        # Create and set phase metrics
        metrics = PhaseMetrics(
            phase_name="adw_plan",
            start_timestamp=datetime(2024, 1, 1, 10, 0, 0),
            end_timestamp=datetime(2024, 1, 1, 10, 10, 0),
            duration_seconds=600.0,
            checkpoint_count=2,
            git_operation_count=3,
            agent_invocation_count=4,
        )
        state.set_phase_metrics("adw_plan", metrics)

        # Reload state and verify metrics
        loaded_state = ADWState.load(test_adw_id)
        loaded_metrics = loaded_state.get_phase_metrics("adw_plan")

        assert loaded_metrics is not None
        assert loaded_metrics["phase_name"] == "adw_plan"
        assert loaded_metrics["duration_seconds"] == 600.0
        assert loaded_metrics["checkpoint_count"] == 2
        assert loaded_metrics["git_operation_count"] == 3
        assert loaded_metrics["agent_invocation_count"] == 4

    def test_get_phase_metrics_not_found(self):
        """Test get_phase_metrics returns None for non-existent phase."""
        state = ADWState(adw_id="test-456")
        metrics = state.get_phase_metrics("adw_nonexistent")
        assert metrics is None

    def test_set_workflow_metrics(self, tmp_path, monkeypatch):
        """Test setting workflow-level metrics."""
        test_adw_id = "test-metrics-789"
        test_agents_root = tmp_path / "agents"
        test_agents_root.mkdir()

        # Patch agents_root to use temp directory
        from adws.adw_modules import state as state_module
        monkeypatch.setattr(state_module, "agents_root", lambda: test_agents_root)

        state = ADWState(adw_id=test_adw_id)
        state.base_dir.mkdir(parents=True, exist_ok=True)

        workflow = WorkflowMetrics(
            phases=[],
            total_duration_seconds=1000.0,
            workflow_type="adw_sdlc",
        )
        state.set_workflow_metrics(workflow)

        loaded_state = ADWState.load(test_adw_id)
        loaded_workflow = loaded_state.get_workflow_metrics()

        assert loaded_workflow is not None
        assert loaded_workflow["total_duration_seconds"] == 1000.0
        assert loaded_workflow["workflow_type"] == "adw_sdlc"


class TestPhaseMetricsCollector:
    """Test PhaseMetricsCollector context manager behavior."""

    def test_context_manager_normal_exit(self, tmp_path, monkeypatch):
        """Test metrics collection and persistence on normal exit."""
        adw_id = "test-collector-001"
        test_agents_root = tmp_path / "agents"
        test_agents_root.mkdir()

        # Patch agents_root to use temp directory
        from adws.adw_modules import state as state_module
        monkeypatch.setattr(state_module, "agents_root", lambda: test_agents_root)

        state = ADWState(adw_id=adw_id)
        state.base_dir.mkdir(parents=True, exist_ok=True)
        state.save()

        logger = Mock()

        # Use metrics collector
        with PhaseMetricsCollector(adw_id, "adw_test_phase", logger) as metrics:
            # Simulate some work
            time.sleep(0.1)
            metrics.increment_checkpoint_count()
            metrics.record_git_operation(duration=0.05)
            metrics.record_agent_invocation(duration=0.03)

        # Verify metrics were saved
        loaded_state = ADWState.load(adw_id)
        loaded_metrics = loaded_state.get_phase_metrics("adw_test_phase")

        assert loaded_metrics is not None
        assert loaded_metrics["phase_name"] == "adw_test_phase"
        assert loaded_metrics["duration_seconds"] >= 0.1
        assert loaded_metrics["checkpoint_count"] == 1
        assert loaded_metrics["git_operation_count"] == 1
        assert loaded_metrics["agent_invocation_count"] == 1

    def test_context_manager_exception_handling(self, tmp_path, monkeypatch):
        """Test metrics are saved even when exception occurs."""
        adw_id = "test-collector-002"
        test_agents_root = tmp_path / "agents"
        test_agents_root.mkdir()

        # Patch agents_root to use temp directory
        from adws.adw_modules import state as state_module
        monkeypatch.setattr(state_module, "agents_root", lambda: test_agents_root)

        state = ADWState(adw_id=adw_id)
        state.base_dir.mkdir(parents=True, exist_ok=True)
        state.save()

        logger = Mock()

        # Use metrics collector with exception
        try:
            with PhaseMetricsCollector(adw_id, "adw_error_phase", logger) as metrics:
                metrics.increment_checkpoint_count()
                raise ValueError("Test exception")
        except ValueError:
            pass  # Expected exception

        # Verify metrics were saved despite exception
        loaded_state = ADWState.load(adw_id)
        loaded_metrics = loaded_state.get_phase_metrics("adw_error_phase")

        assert loaded_metrics is not None
        assert loaded_metrics["phase_name"] == "adw_error_phase"
        assert loaded_metrics["checkpoint_count"] == 1

    def test_multiple_operation_tracking(self, tmp_path, monkeypatch):
        """Test tracking multiple operations of each type."""
        adw_id = "test-collector-003"
        test_agents_root = tmp_path / "agents"
        test_agents_root.mkdir()

        # Patch agents_root to use temp directory
        from adws.adw_modules import state as state_module
        monkeypatch.setattr(state_module, "agents_root", lambda: test_agents_root)

        state = ADWState(adw_id=adw_id)
        state.base_dir.mkdir(parents=True, exist_ok=True)
        state.save()

        logger = Mock()

        with PhaseMetricsCollector(adw_id, "adw_multi_ops", logger) as metrics:
            # Simulate multiple git operations
            metrics.record_git_operation(duration=0.1)
            metrics.record_git_operation(duration=0.2)
            metrics.record_git_operation(duration=0.3)

            # Simulate multiple agent invocations
            metrics.record_agent_invocation(duration=1.0)
            metrics.record_agent_invocation(duration=2.0)

            # Simulate multiple checkpoints
            metrics.increment_checkpoint_count()
            metrics.increment_checkpoint_count()
            metrics.increment_checkpoint_count()
            metrics.increment_checkpoint_count()

        loaded_state = ADWState.load(adw_id)
        loaded_metrics = loaded_state.get_phase_metrics("adw_multi_ops")

        assert loaded_metrics["git_operation_count"] == 3
        assert loaded_metrics["git_operation_duration_seconds"] == pytest.approx(0.6, abs=0.01)
        assert loaded_metrics["agent_invocation_count"] == 2
        assert loaded_metrics["agent_invocation_duration_seconds"] == pytest.approx(3.0, abs=0.01)
        assert loaded_metrics["checkpoint_count"] == 4


class TestMetricsPerformanceOverhead:
    """Test performance overhead of metrics collection."""

    def test_metrics_overhead_is_minimal(self, tmp_path, monkeypatch):
        """Verify metrics collection overhead is less than 5%."""
        def simulate_phase_work():
            """Simulate phase work without metrics."""
            time.sleep(0.2)

        # Measure baseline execution time
        baseline_start = time.time()
        simulate_phase_work()
        baseline_duration = time.time() - baseline_start

        # Measure execution time with metrics collection
        adw_id = "test-overhead"
        test_agents_root = tmp_path / "agents"
        test_agents_root.mkdir()

        # Patch agents_root to use temp directory
        from adws.adw_modules import state as state_module
        monkeypatch.setattr(state_module, "agents_root", lambda: test_agents_root)

        state = ADWState(adw_id=adw_id)
        state.base_dir.mkdir(parents=True, exist_ok=True)
        state.save()

        logger = Mock()

        instrumented_start = time.time()
        with PhaseMetricsCollector(adw_id, "adw_overhead_test", logger) as metrics:
            simulate_phase_work()
            metrics.record_git_operation(duration=0.01)
            metrics.record_agent_invocation(duration=0.01)
        instrumented_duration = time.time() - instrumented_start

        # Calculate overhead percentage
        overhead = (instrumented_duration - baseline_duration) / baseline_duration * 100

        # Verify overhead is less than 5%
        assert overhead < 5.0, f"Metrics overhead {overhead:.2f}% exceeds 5% threshold"
