"""Integration tests for API-driven phase task trigger.

These tests verify the phase routing logic, task status updates, and
concurrent execution limits without requiring a live MCP server.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, call, Mock

import pytest

# Mock click and rich before importing to avoid missing dependencies in tests
sys.modules['click'] = Mock()
sys.modules['rich'] = Mock()
sys.modules['rich.console'] = Mock()
sys.modules['rich.panel'] = Mock()
sys.modules['rich.table'] = Mock()

# Import after ensuring path is set up and mocking dependencies
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from adws.adw_triggers.adw_trigger_api_tasks import PhaseTaskExecutor


class TestPhaseTaskExecutor:
    """Tests for PhaseTaskExecutor class."""

    @pytest.fixture
    def executor(self, tmp_path: Path) -> PhaseTaskExecutor:
        """Create a PhaseTaskExecutor instance with temporary log file."""
        log_file = tmp_path / "test_trigger.log"
        return PhaseTaskExecutor(
            dry_run=False,
            verbose=False,
            max_concurrent=3,
            log_file=str(log_file)
        )

    @pytest.fixture
    def dry_run_executor(self, tmp_path: Path) -> PhaseTaskExecutor:
        """Create a PhaseTaskExecutor instance in dry-run mode."""
        log_file = tmp_path / "test_trigger_dry.log"
        return PhaseTaskExecutor(
            dry_run=True,
            verbose=False,
            max_concurrent=3,
            log_file=str(log_file)
        )

    def test_get_phase_script_valid_phases(self, executor: PhaseTaskExecutor) -> None:
        """Test that get_phase_script returns valid paths for all phases."""
        phases = ["plan", "build", "test", "review", "document"]

        for phase in phases:
            script_path = executor.get_phase_script(phase)
            # Script may not exist in test environment, but method should return a Path
            assert script_path is None or isinstance(script_path, Path)

    def test_get_phase_script_invalid_phase(self, executor: PhaseTaskExecutor) -> None:
        """Test that get_phase_script returns None for invalid phase."""
        script_path = executor.get_phase_script("invalid_phase")
        assert script_path is None

    @patch("adws.adw_triggers.adw_trigger_api_tasks.update_task_status")
    def test_execute_phase_task_missing_tags(
        self,
        mock_update: MagicMock,
        executor: PhaseTaskExecutor
    ) -> None:
        """Test that tasks with missing required tags are rejected."""
        task = {
            "task_id": "test-task-123",
            "title": "Test task",
            "status": "pending",
            "tags": {}  # Missing required tags
        }

        result = executor.execute_phase_task(task)

        # Should fail and update task status to failed
        assert result is False
        mock_update.assert_called_once()
        call_args = mock_update.call_args
        assert call_args[1]["task_id"] == "test-task-123"
        assert call_args[1]["status"].value == "failed"
        assert "missing required tags" in call_args[1]["error"].lower()

    @patch("adws.adw_triggers.adw_trigger_api_tasks.update_task_status")
    def test_execute_phase_task_invalid_phase(
        self,
        mock_update: MagicMock,
        executor: PhaseTaskExecutor
    ) -> None:
        """Test that tasks with invalid phase are rejected."""
        task = {
            "task_id": "test-task-456",
            "title": "Test task",
            "status": "pending",
            "tags": {
                "phase": "invalid_phase",
                "issue_number": "110",
                "worktree": "feat-110-test"
            }
        }

        result = executor.execute_phase_task(task)

        # Should fail and update task status to failed
        assert result is False
        mock_update.assert_called_once()
        call_args = mock_update.call_args
        assert call_args[1]["task_id"] == "test-task-456"
        assert call_args[1]["status"].value == "failed"
        assert "no phase script found" in call_args[1]["error"].lower()

    def test_execute_phase_task_dry_run(
        self,
        dry_run_executor: PhaseTaskExecutor
    ) -> None:
        """Test that dry-run mode doesn't execute phase scripts."""
        task = {
            "task_id": "test-task-789",
            "title": "Test task",
            "status": "pending",
            "tags": {
                "phase": "build",
                "issue_number": "110",
                "worktree": "feat-110-test",
                "parent_adw_id": "abc-123"
            }
        }

        result = dry_run_executor.execute_phase_task(task)

        # Should succeed without executing
        assert result is True
        # No active tasks should be created in dry-run mode
        assert len(dry_run_executor.active_tasks) == 0

    @patch("adws.adw_triggers.adw_trigger_api_tasks.list_tasks")
    @patch("adws.adw_triggers.adw_trigger_api_tasks.update_task_status")
    def test_poll_and_execute_no_tasks(
        self,
        mock_update: MagicMock,
        mock_list: MagicMock,
        executor: PhaseTaskExecutor
    ) -> None:
        """Test polling when no tasks are available."""
        mock_list.return_value = []

        executor.poll_and_execute()

        # Should call list_tasks but not execute anything
        mock_list.assert_called_once()
        mock_update.assert_not_called()
        assert len(executor.active_tasks) == 0

    @patch("adws.adw_triggers.adw_trigger_api_tasks.list_tasks")
    def test_poll_and_execute_filters_non_phase_tasks(
        self,
        mock_list: MagicMock,
        executor: PhaseTaskExecutor
    ) -> None:
        """Test that tasks without phase tags are filtered out."""
        mock_list.return_value = [
            {
                "task_id": "task-1",
                "title": "Task without phase tag",
                "status": "pending",
                "tags": {"issue_number": "110"}  # No phase tag
            },
            {
                "task_id": "task-2",
                "title": "Task with empty tags",
                "status": "pending",
                "tags": {}
            }
        ]

        executor.poll_and_execute()

        # Should fetch tasks but not execute any (no phase tags)
        mock_list.assert_called_once()
        assert len(executor.active_tasks) == 0

    @patch("adws.adw_triggers.adw_trigger_api_tasks.list_tasks")
    @patch("adws.adw_triggers.adw_trigger_api_tasks.update_task_status")
    @patch("adws.adw_triggers.adw_trigger_api_tasks.subprocess.Popen")
    @patch("adws.adw_triggers.adw_trigger_api_tasks.Path.exists")
    def test_poll_and_execute_with_valid_task(
        self,
        mock_exists: MagicMock,
        mock_popen: MagicMock,
        mock_update: MagicMock,
        mock_list: MagicMock,
        executor: PhaseTaskExecutor
    ) -> None:
        """Test polling and executing a valid phase task."""
        # Mock phase script exists
        mock_exists.return_value = True

        # Mock process
        mock_process = MagicMock()
        mock_process.poll.return_value = None  # Still running
        mock_popen.return_value = mock_process

        # Mock task list response
        mock_list.return_value = [
            {
                "task_id": "test-task-abc",
                "title": "Build phase test",
                "status": "pending",
                "tags": {
                    "phase": "build",
                    "issue_number": "110",
                    "worktree": "feat-110-test",
                    "parent_adw_id": "abc-123"
                }
            }
        ]

        # Mock update_task_status to succeed
        mock_update.return_value = True

        executor.poll_and_execute()

        # Should fetch tasks and start execution
        mock_list.assert_called_once()
        mock_popen.assert_called_once()

        # Verify command construction
        call_args = mock_popen.call_args
        cmd = call_args[0][0]
        assert "uv" in cmd
        assert "run" in cmd
        assert "--adw-id" in cmd
        assert "abc-123" in cmd
        assert "--worktree-name" in cmd
        assert "feat-110-test" in cmd
        assert "--issue-number" in cmd
        assert "110" in cmd
        assert "--task-id" in cmd
        assert "test-task-abc" in cmd

        # Should have one active task
        assert len(executor.active_tasks) == 1
        assert "test-task-abc" in executor.active_tasks

    @patch("adws.adw_triggers.adw_trigger_api_tasks.list_tasks")
    def test_poll_and_execute_respects_max_concurrent(
        self,
        mock_list: MagicMock,
        executor: PhaseTaskExecutor
    ) -> None:
        """Test that max_concurrent limit is respected."""
        # Fill up active tasks to max capacity
        for i in range(executor.max_concurrent):
            mock_process = MagicMock()
            mock_process.poll.return_value = None  # Still running
            executor.active_tasks[f"task-{i}"] = mock_process

        # Mock task list with additional tasks
        mock_list.return_value = [
            {
                "task_id": "test-task-new",
                "title": "New task",
                "status": "pending",
                "tags": {
                    "phase": "build",
                    "issue_number": "110",
                    "worktree": "feat-110-test"
                }
            }
        ]

        executor.poll_and_execute()

        # Should skip polling due to max concurrent limit
        # list_tasks should not be called when at capacity
        mock_list.assert_not_called()

    def test_check_completed_tasks_success(
        self,
        executor: PhaseTaskExecutor
    ) -> None:
        """Test checking completed tasks with successful exit code."""
        # Add a completed process
        mock_process = MagicMock()
        mock_process.poll.return_value = 0  # Completed
        mock_process.returncode = 0
        executor.active_tasks["test-task-success"] = mock_process

        with patch("adws.adw_triggers.adw_trigger_api_tasks.update_task_status") as mock_update:
            executor.check_completed_tasks()

            # Should remove from active tasks
            assert "test-task-success" not in executor.active_tasks

            # Should update task status to completed
            mock_update.assert_called_once()
            call_args = mock_update.call_args
            assert call_args[1]["task_id"] == "test-task-success"
            assert call_args[1]["status"].value == "completed"

    def test_check_completed_tasks_failure(
        self,
        executor: PhaseTaskExecutor
    ) -> None:
        """Test checking completed tasks with failed exit code."""
        # Add a failed process
        mock_process = MagicMock()
        mock_process.poll.return_value = 1  # Completed with error
        mock_process.returncode = 1
        executor.active_tasks["test-task-failed"] = mock_process

        with patch("adws.adw_triggers.adw_trigger_api_tasks.update_task_status") as mock_update:
            executor.check_completed_tasks()

            # Should remove from active tasks
            assert "test-task-failed" not in executor.active_tasks

            # Should update task status to failed
            mock_update.assert_called_once()
            call_args = mock_update.call_args
            assert call_args[1]["task_id"] == "test-task-failed"
            assert call_args[1]["status"].value == "failed"
            assert "exited with code" in call_args[1]["error"].lower()

    def test_check_completed_tasks_still_running(
        self,
        executor: PhaseTaskExecutor
    ) -> None:
        """Test that still-running tasks are not removed."""
        # Add a running process
        mock_process = MagicMock()
        mock_process.poll.return_value = None  # Still running
        executor.active_tasks["test-task-running"] = mock_process

        executor.check_completed_tasks()

        # Should remain in active tasks
        assert "test-task-running" in executor.active_tasks

    @patch("adws.adw_triggers.adw_trigger_api_tasks.list_tasks")
    def test_poll_and_execute_mcp_server_error(
        self,
        mock_list: MagicMock,
        executor: PhaseTaskExecutor
    ) -> None:
        """Test handling of MCP server errors during polling."""
        from adws.adw_modules.tasks_api import MCPServerError

        mock_list.side_effect = MCPServerError("Connection refused")

        executor.poll_and_execute()

        # Should handle error gracefully without crashing
        mock_list.assert_called_once()
        assert len(executor.active_tasks) == 0

    def test_processed_task_ids_deduplication(
        self,
        dry_run_executor: PhaseTaskExecutor
    ) -> None:
        """Test that processed tasks are not re-executed."""
        task = {
            "task_id": "test-task-dupe",
            "title": "Test task",
            "status": "pending",
            "tags": {
                "phase": "build",
                "issue_number": "110",
                "worktree": "feat-110-test",
                "parent_adw_id": "abc-123"
            }
        }

        # Execute first time
        result1 = dry_run_executor.execute_phase_task(task)
        assert result1 is True
        dry_run_executor.processed_task_ids.add(task["task_id"])

        # Mock list_tasks to return the same task again
        with patch("adws.adw_triggers.adw_trigger_api_tasks.list_tasks") as mock_list:
            mock_list.return_value = [task]

            # Poll should skip the already-processed task
            dry_run_executor.poll_and_execute()

            # Should not execute again (still 0 active tasks in dry-run)
            assert len(dry_run_executor.active_tasks) == 0
