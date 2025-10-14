"""Unit tests for tasks_api module.

These tests verify MCP tool command construction and response parsing
without requiring a live kota-tasks MCP server connection.
"""

from __future__ import annotations

import json
import subprocess
from unittest.mock import MagicMock, patch

import pytest

from adws.adw_modules.tasks_api import (
    MCPServerError,
    TaskAPIError,
    TaskValidationError,
    create_phase_task,
    get_task,
    list_tasks,
    update_task_status,
)
from adws.adw_modules.data_types import TaskStatus


class TestCreatePhaseTask:
    """Tests for create_phase_task function."""

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_create_phase_task_success(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test successful phase task creation."""
        # Setup mocks
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps({"task_id": "test-task-123"}),
            stderr=""
        )

        # Execute
        task_id = create_phase_task(
            phase="build",
            issue_number="110",
            adw_id="abc-123",
            worktree="feat-110-example",
            priority="high"
        )

        # Verify
        assert task_id == "test-task-123"
        mock_run.assert_called_once()

        # Verify command construction
        call_args = mock_run.call_args
        cmd = call_args[0][0]
        assert "claude" in cmd[0] or cmd[0] == "claude"
        assert "--mcp" in cmd
        assert "mcp__kota-tasks__tasks_create" in cmd

        # Verify args JSON
        args_json = cmd[cmd.index("--args") + 1]
        args = json.loads(args_json)
        assert args["project_id"] == "kotadb"
        assert args["title"] == "Build phase: Issue #110"
        assert args["priority"] == "high"
        assert args["tags"]["phase"] == "build"
        assert args["tags"]["issue_number"] == "110"
        assert args["tags"]["worktree"] == "feat-110-example"

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_create_phase_task_with_custom_description(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test phase task creation with custom description."""
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps({"task_id": "test-task-456"}),
            stderr=""
        )

        # Execute with custom description
        task_id = create_phase_task(
            phase="plan",
            issue_number="110",
            adw_id="abc-123",
            worktree="feat-110-example",
            description="Custom planning task description"
        )

        # Verify
        assert task_id == "test-task-456"

        # Verify description was passed
        call_args = mock_run.call_args
        args_json = call_args[0][0][call_args[0][0].index("--args") + 1]
        args = json.loads(args_json)
        assert args["description"] == "Custom planning task description"

    def test_create_phase_task_invalid_phase(self) -> None:
        """Test validation error for invalid phase."""
        with pytest.raises(TaskValidationError) as exc_info:
            create_phase_task(
                phase="invalid_phase",  # type: ignore[arg-type]
                issue_number="110",
                adw_id="abc-123",
                worktree="feat-110-example"
            )

        assert "Invalid phase" in str(exc_info.value)

    def test_create_phase_task_invalid_priority(self) -> None:
        """Test validation error for invalid priority."""
        with pytest.raises(TaskValidationError) as exc_info:
            create_phase_task(
                phase="build",
                issue_number="110",
                adw_id="abc-123",
                worktree="feat-110-example",
                priority="urgent"  # type: ignore[arg-type]
            )

        assert "Invalid priority" in str(exc_info.value)

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_create_phase_task_mcp_server_error(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test handling of MCP server errors."""
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=1,
            stdout="",
            stderr="MCP server connection refused"
        )

        with pytest.raises(MCPServerError) as exc_info:
            create_phase_task(
                phase="build",
                issue_number="110",
                adw_id="abc-123",
                worktree="feat-110-example"
            )

        assert "MCP server connection refused" in str(exc_info.value)

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    def test_create_phase_task_claude_not_installed(
        self, mock_check: MagicMock
    ) -> None:
        """Test error when Claude CLI is not installed."""
        mock_check.return_value = "Error: Claude Code CLI is not installed"

        with pytest.raises(MCPServerError) as exc_info:
            create_phase_task(
                phase="build",
                issue_number="110",
                adw_id="abc-123",
                worktree="feat-110-example"
            )

        assert "Claude Code CLI is not installed" in str(exc_info.value)


class TestUpdateTaskStatus:
    """Tests for update_task_status function."""

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_update_task_status_success(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test successful task status update."""
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps({"success": True}),
            stderr=""
        )

        # Execute
        success = update_task_status(
            task_id="test-task-123",
            status=TaskStatus.IN_PROGRESS
        )

        # Verify
        assert success is True
        mock_run.assert_called_once()

        # Verify command construction
        call_args = mock_run.call_args
        cmd = call_args[0][0]
        assert "--mcp" in cmd
        assert "mcp__kota-tasks__tasks_update" in cmd

        # Verify args
        args_json = cmd[cmd.index("--args") + 1]
        args = json.loads(args_json)
        assert args["task_id"] == "test-task-123"
        assert args["status"] == "in_progress"

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_update_task_status_with_result(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test task status update with result data."""
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps({"success": True}),
            stderr=""
        )

        # Execute
        result_data = {"exit_code": 0, "duration_seconds": 120}
        success = update_task_status(
            task_id="test-task-123",
            status="completed",
            result=result_data
        )

        # Verify
        assert success is True

        # Verify result data was passed
        call_args = mock_run.call_args
        args_json = call_args[0][0][call_args[0][0].index("--args") + 1]
        args = json.loads(args_json)
        assert args["result"] == result_data

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_update_task_status_with_error(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test task status update with error message."""
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps({"success": True}),
            stderr=""
        )

        # Execute
        success = update_task_status(
            task_id="test-task-123",
            status="failed",
            error="Build failed: compilation errors"
        )

        # Verify
        assert success is True

        # Verify error was passed
        call_args = mock_run.call_args
        args_json = call_args[0][0][call_args[0][0].index("--args") + 1]
        args = json.loads(args_json)
        assert args["error"] == "Build failed: compilation errors"

    def test_update_task_status_invalid_status(self) -> None:
        """Test validation error for invalid status."""
        with pytest.raises(TaskValidationError) as exc_info:
            update_task_status(
                task_id="test-task-123",
                status="invalid_status"  # type: ignore[arg-type]
            )

        assert "Invalid status" in str(exc_info.value)

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_update_task_status_server_failure(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test graceful handling of server failures."""
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=1,
            stdout="",
            stderr="Connection timeout"
        )

        # Execute - should return False, not raise
        success = update_task_status(
            task_id="test-task-123",
            status=TaskStatus.COMPLETED
        )

        assert success is False


class TestGetTask:
    """Tests for get_task function."""

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_get_task_success(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test successful task retrieval."""
        mock_check.return_value = None
        task_data = {
            "task_id": "test-task-123",
            "project_id": "kotadb",
            "title": "Build phase: Issue #110",
            "status": "pending",
            "priority": "high",
            "tags": {"phase": "build", "issue_number": "110"}
        }
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(task_data),
            stderr=""
        )

        # Execute
        task = get_task("test-task-123")

        # Verify
        assert task["task_id"] == "test-task-123"
        assert task["status"] == "pending"
        assert task["tags"]["phase"] == "build"

        # Verify command
        call_args = mock_run.call_args
        cmd = call_args[0][0]
        assert "mcp__kota-tasks__tasks_get" in cmd

        # Verify args
        args_json = cmd[cmd.index("--args") + 1]
        args = json.loads(args_json)
        assert args["task_id"] == "test-task-123"

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_get_task_not_found(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test error when task is not found."""
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=1,
            stdout="",
            stderr="Task not found"
        )

        with pytest.raises(MCPServerError) as exc_info:
            get_task("nonexistent-task")

        assert "Failed to retrieve task" in str(exc_info.value)


class TestListTasks:
    """Tests for list_tasks function."""

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_list_tasks_no_filters(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test listing all tasks without filters."""
        mock_check.return_value = None
        tasks_data = [
            {"task_id": "task-1", "status": "pending", "tags": {"phase": "build"}},
            {"task_id": "task-2", "status": "in_progress", "tags": {"phase": "test"}}
        ]
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(tasks_data),
            stderr=""
        )

        # Execute
        tasks = list_tasks()

        # Verify
        assert len(tasks) == 2
        assert tasks[0]["task_id"] == "task-1"
        assert tasks[1]["task_id"] == "task-2"

        # Verify command
        call_args = mock_run.call_args
        cmd = call_args[0][0]
        assert "mcp__kota-tasks__tasks_list" in cmd

        # Verify args
        args_json = cmd[cmd.index("--args") + 1]
        args = json.loads(args_json)
        assert args["project_id"] == "kotadb"
        assert args["limit"] == 100

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_list_tasks_with_phase_filter(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test listing tasks filtered by phase."""
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps([{"task_id": "task-1", "tags": {"phase": "build"}}]),
            stderr=""
        )

        # Execute
        tasks = list_tasks(phase="build", limit=10)

        # Verify
        assert len(tasks) == 1

        # Verify phase filter was applied
        call_args = mock_run.call_args
        args_json = call_args[0][0][call_args[0][0].index("--args") + 1]
        args = json.loads(args_json)
        assert args["tags"]["phase"] == "build"
        assert args["limit"] == 10

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_list_tasks_with_status_filter(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test listing tasks filtered by status."""
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps([{"task_id": "task-1", "status": "pending"}]),
            stderr=""
        )

        # Execute
        tasks = list_tasks(status=TaskStatus.PENDING)

        # Verify
        assert len(tasks) == 1

        # Verify status filter was applied
        call_args = mock_run.call_args
        args_json = call_args[0][0][call_args[0][0].index("--args") + 1]
        args = json.loads(args_json)
        assert args["status"] == "pending"

    def test_list_tasks_invalid_phase(self) -> None:
        """Test validation error for invalid phase filter."""
        with pytest.raises(TaskValidationError) as exc_info:
            list_tasks(phase="invalid_phase")  # type: ignore[arg-type]

        assert "Invalid phase filter" in str(exc_info.value)

    def test_list_tasks_invalid_status(self) -> None:
        """Test validation error for invalid status filter."""
        with pytest.raises(TaskValidationError) as exc_info:
            list_tasks(status="invalid_status")  # type: ignore[arg-type]

        assert "Invalid status filter" in str(exc_info.value)

    @patch("adws.adw_modules.tasks_api.check_claude_installed")
    @patch("adws.adw_modules.tasks_api.subprocess.run")
    def test_list_tasks_empty_result(
        self, mock_run: MagicMock, mock_check: MagicMock
    ) -> None:
        """Test listing tasks when no tasks match filters."""
        mock_check.return_value = None
        mock_run.return_value = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps([]),
            stderr=""
        )

        # Execute
        tasks = list_tasks(phase="build", status="pending")

        # Verify
        assert len(tasks) == 0
        assert isinstance(tasks, list)
