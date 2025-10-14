"""Task API wrappers for kota-tasks MCP server via Claude Code CLI.

This module provides Python wrappers for creating and managing tasks in the
kota-tasks MCP server. It leverages the Claude Code CLI's --mcp flag to execute
MCP tools without implementing the full MCP client protocol.

Usage:
    from adws.adw_modules.tasks_api import create_phase_task, update_task_status

    # Create a task for the build phase
    task_id = create_phase_task(
        phase="build",
        issue_number="123",
        adw_id="abc-123",
        worktree="feat-123-example",
        description="Execute build phase for issue #123",
        priority="high"
    )

    # Update task status
    update_task_status(
        task_id=task_id,
        status="in_progress"
    )
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from .agent import check_claude_installed, CLAUDE_PATH
from .data_types import TaskStatus

# Resolve MCP server name from environment or default to kota-tasks
MCP_SERVER_NAME = os.getenv("KOTA_TASKS_MCP_SERVER", "kota-tasks")
PROJECT_ID = os.getenv("KOTA_TASKS_PROJECT_ID", "kotadb")

PhaseType = Literal["plan", "build", "test", "review", "document"]
PriorityType = Literal["low", "medium", "high"]


class TaskAPIError(Exception):
    """Base exception for task API errors."""
    pass


class MCPServerError(TaskAPIError):
    """Raised when MCP server is unreachable or returns an error."""
    pass


class TaskValidationError(TaskAPIError):
    """Raised when task parameters are invalid."""
    pass


def _execute_mcp_tool(
    tool_name: str,
    args: Dict[str, Any],
    timeout: int = 30
) -> Dict[str, Any]:
    """Execute an MCP tool via Claude Code CLI and return parsed response.

    Args:
        tool_name: Name of the MCP tool (e.g., "tasks_create")
        args: Dictionary of arguments to pass to the tool
        timeout: Command timeout in seconds (default: 30)

    Returns:
        Parsed JSON response from the MCP tool

    Raises:
        MCPServerError: If MCP server is unavailable or returns an error
        TaskValidationError: If tool arguments are invalid
    """
    # Check Claude CLI is installed
    error_msg = check_claude_installed()
    if error_msg:
        raise MCPServerError(error_msg)

    # Build command
    full_tool_name = f"mcp__{MCP_SERVER_NAME}__{tool_name}"
    cmd = [
        CLAUDE_PATH,
        "--mcp",
        full_tool_name,
        "--args",
        json.dumps(args)
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False
        )
    except subprocess.TimeoutExpired as exc:
        raise MCPServerError(
            f"MCP tool '{tool_name}' timed out after {timeout}s"
        ) from exc
    except Exception as exc:
        raise MCPServerError(
            f"Failed to execute MCP tool '{tool_name}': {exc}"
        ) from exc

    # Check for execution errors
    if result.returncode != 0:
        error_msg = result.stderr.strip() if result.stderr else "Unknown error"
        raise MCPServerError(
            f"MCP tool '{tool_name}' failed: {error_msg}"
        )

    # Parse JSON response from stdout
    stdout = result.stdout.strip()
    if not stdout:
        raise MCPServerError(
            f"MCP tool '{tool_name}' returned empty response"
        )

    try:
        response = json.loads(stdout)
        return response
    except json.JSONDecodeError as exc:
        raise MCPServerError(
            f"Failed to parse MCP tool response as JSON: {stdout[:200]}"
        ) from exc


def create_phase_task(
    phase: PhaseType,
    issue_number: str,
    adw_id: str,
    worktree: str,
    description: Optional[str] = None,
    priority: PriorityType = "medium",
    parent_adw_id: Optional[str] = None
) -> str:
    """Create a new phase task in the kota-tasks MCP server.

    Args:
        phase: Phase name (plan, build, test, review, document)
        issue_number: GitHub issue number (e.g., "123")
        adw_id: ADW execution ID for tracking
        worktree: Worktree name where phase will execute
        description: Optional task description (defaults to auto-generated)
        priority: Task priority (low, medium, high)
        parent_adw_id: Optional parent workflow ADW ID for nested workflows

    Returns:
        Task ID (UUID string) of the created task

    Raises:
        TaskValidationError: If parameters are invalid
        MCPServerError: If task creation fails

    Example:
        >>> task_id = create_phase_task(
        ...     phase="build",
        ...     issue_number="123",
        ...     adw_id="abc-123",
        ...     worktree="feat-123-example",
        ...     priority="high"
        ... )
        >>> print(task_id)
        "550e8400-e29b-41d4-a716-446655440000"
    """
    # Validate phase
    valid_phases: List[PhaseType] = ["plan", "build", "test", "review", "document"]
    if phase not in valid_phases:
        raise TaskValidationError(
            f"Invalid phase '{phase}'. Must be one of: {', '.join(valid_phases)}"
        )

    # Validate priority
    valid_priorities: List[PriorityType] = ["low", "medium", "high"]
    if priority not in valid_priorities:
        raise TaskValidationError(
            f"Invalid priority '{priority}'. Must be one of: {', '.join(valid_priorities)}"
        )

    # Auto-generate description if not provided
    if not description:
        description = f"Execute {phase} phase for issue #{issue_number}"

    # Build title
    title = f"{phase.capitalize()} phase: Issue #{issue_number}"

    # Build tags
    tags = {
        "phase": phase,
        "issue_number": issue_number,
        "parent_adw_id": parent_adw_id or adw_id,
        "worktree": worktree
    }

    # Execute MCP tool
    args = {
        "project_id": PROJECT_ID,
        "title": title,
        "description": description,
        "priority": priority,
        "tags": tags
    }

    try:
        response = _execute_mcp_tool("tasks_create", args)
    except MCPServerError as exc:
        raise MCPServerError(
            f"Failed to create task for phase '{phase}': {exc}"
        ) from exc

    # Extract task_id from response
    if not isinstance(response, dict) or "task_id" not in response:
        raise MCPServerError(
            f"Invalid response from tasks_create: missing 'task_id' field"
        )

    task_id = response["task_id"]
    sys.stdout.write(f"Created task {task_id} for phase '{phase}'\n")
    return task_id


def update_task_status(
    task_id: str,
    status: TaskStatus | str,
    result: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None
) -> bool:
    """Update the status of an existing task.

    Args:
        task_id: Task ID (UUID string)
        status: New status (pending, claimed, in_progress, completed, failed)
        result: Optional result data to attach (used for completed tasks)
        error: Optional error message (used for failed tasks)

    Returns:
        True if update succeeded, False otherwise

    Raises:
        TaskValidationError: If parameters are invalid
        MCPServerError: If status update fails

    Example:
        >>> update_task_status(
        ...     task_id="550e8400-e29b-41d4-a716-446655440000",
        ...     status="completed",
        ...     result={"exit_code": 0, "duration_seconds": 120}
        ... )
        True
    """
    # Validate status
    if isinstance(status, TaskStatus):
        status_str = status.value
    else:
        status_str = status
        valid_statuses = [s.value for s in TaskStatus]
        if status_str not in valid_statuses:
            raise TaskValidationError(
                f"Invalid status '{status_str}'. Must be one of: {', '.join(valid_statuses)}"
            )

    # Build args
    args: Dict[str, Any] = {
        "task_id": task_id,
        "status": status_str
    }

    if result is not None:
        args["result"] = result

    if error is not None:
        args["error"] = error

    # Execute MCP tool
    try:
        response = _execute_mcp_tool("tasks_update", args)
    except MCPServerError as exc:
        sys.stderr.write(f"Failed to update task {task_id} to '{status_str}': {exc}\n")
        return False

    # Check for success indicator
    success = response.get("success", False) if isinstance(response, dict) else False
    if success:
        sys.stdout.write(f"Updated task {task_id} to status '{status_str}'\n")
    else:
        sys.stderr.write(f"Task update returned success=false for task {task_id}\n")

    return success


def get_task(task_id: str) -> Dict[str, Any]:
    """Retrieve a single task by ID.

    Args:
        task_id: Task ID (UUID string)

    Returns:
        Task dictionary with all fields

    Raises:
        MCPServerError: If task retrieval fails

    Example:
        >>> task = get_task("550e8400-e29b-41d4-a716-446655440000")
        >>> print(task["status"])
        "in_progress"
    """
    args = {"task_id": task_id}

    try:
        response = _execute_mcp_tool("tasks_get", args)
    except MCPServerError as exc:
        raise MCPServerError(
            f"Failed to retrieve task {task_id}: {exc}"
        ) from exc

    if not isinstance(response, dict):
        raise MCPServerError(
            f"Invalid response from tasks_get: expected dict, got {type(response)}"
        )

    return response


def list_tasks(
    phase: Optional[PhaseType] = None,
    status: Optional[TaskStatus | str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """List tasks with optional filtering.

    Args:
        phase: Optional phase filter (plan, build, test, review, document)
        status: Optional status filter (pending, claimed, in_progress, completed, failed)
        limit: Maximum number of tasks to return (default: 100)

    Returns:
        List of task dictionaries

    Raises:
        TaskValidationError: If filter parameters are invalid
        MCPServerError: If task listing fails

    Example:
        >>> tasks = list_tasks(phase="build", status="pending", limit=10)
        >>> print(len(tasks))
        3
    """
    # Build filters
    filters: Dict[str, Any] = {
        "project_id": PROJECT_ID,
        "limit": limit
    }

    # Validate and add phase filter
    if phase is not None:
        valid_phases: List[PhaseType] = ["plan", "build", "test", "review", "document"]
        if phase not in valid_phases:
            raise TaskValidationError(
                f"Invalid phase filter '{phase}'. Must be one of: {', '.join(valid_phases)}"
            )
        filters["tags"] = {"phase": phase}

    # Validate and add status filter
    if status is not None:
        if isinstance(status, TaskStatus):
            status_str = status.value
        else:
            status_str = status
            valid_statuses = [s.value for s in TaskStatus]
            if status_str not in valid_statuses:
                raise TaskValidationError(
                    f"Invalid status filter '{status_str}'. Must be one of: {', '.join(valid_statuses)}"
                )
        filters["status"] = status_str

    # Execute MCP tool
    try:
        response = _execute_mcp_tool("tasks_list", filters)
    except MCPServerError as exc:
        raise MCPServerError(
            f"Failed to list tasks: {exc}"
        ) from exc

    # Response should be a list of tasks
    if not isinstance(response, list):
        raise MCPServerError(
            f"Invalid response from tasks_list: expected list, got {type(response)}"
        )

    return response


__all__ = [
    "create_phase_task",
    "update_task_status",
    "get_task",
    "list_tasks",
    "TaskAPIError",
    "MCPServerError",
    "TaskValidationError",
    "PhaseType",
    "PriorityType",
]
