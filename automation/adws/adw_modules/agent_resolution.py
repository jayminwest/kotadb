"""Agent resolution retry coordination for ADW validation failures."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from .agent import execute_template
from .data_types import AgentTemplateRequest
from .state import ADWState
from .workflow_ops import ValidationCommandResult


def resolve_validation_failure(
    result: ValidationCommandResult,
    adw_id: str,
    worktree_path: Path,
    logger: logging.Logger,
) -> bool:
    """Invoke agent resolution for a failed validation command.

    Args:
        result: Failed validation command result
        adw_id: ADW execution ID for tracking
        worktree_path: Path to git worktree for file operations
        logger: Logger instance for tracking resolution attempts

    Returns:
        True if agent resolution was invoked successfully, False otherwise

    Note:
        Success return value indicates the agent executed, NOT that the issue was fixed.
        The orchestration layer must re-run validation to determine if resolution worked.
    """
    # Truncate outputs to prevent overwhelming agent context
    max_length = 1000
    stdout_truncated = result.stdout[:max_length] if result.stdout else "(empty)"
    stderr_truncated = result.stderr[:max_length] if result.stderr else "(empty)"

    if len(result.stdout) > max_length:
        stdout_truncated += "... (truncated)"
    if len(result.stderr) > max_length:
        stderr_truncated += "... (truncated)"

    failure_context = {
        "label": result.label,
        "command": " ".join(result.command),
        "exit_code": result.returncode,
        "stdout": stdout_truncated,
        "stderr": stderr_truncated,
    }

    failure_json = json.dumps(failure_context, indent=2)

    logger.info(f"Invoking agent resolution for failure: {result.label}")
    logger.debug(f"Failure context: {failure_json}")

    request = AgentTemplateRequest(
        agent_name="validation_resolver",
        slash_command="/resolve_failed_validation",
        args=[failure_json],
        adw_id=adw_id,
        model="sonnet",
        cwd=str(worktree_path),
    )

    response = execute_template(request)

    if not response.success:
        logger.warning(f"Agent resolution execution failed: {response.output}")
        return False

    logger.info(f"Agent resolution output: {response.output.strip()}")
    return True


def track_resolution_attempt(
    state: ADWState,
    result: ValidationCommandResult,
    resolution_success: bool,
    logger: logging.Logger,
) -> None:
    """Persist resolution attempt history to ADWState for post-mortem analysis.

    Args:
        state: ADWState instance to update
        result: Validation command result that was resolved
        resolution_success: Whether agent resolution executed successfully
        logger: Logger instance for tracking

    Updates:
        - state.extra["last_resolution_attempts"]: JSON array of resolution attempts
        - state.extra["validation_retry_count"]: Incremented counter
    """
    # Load existing resolution history
    existing_history_json = state.get("last_resolution_attempts")
    history = []

    if existing_history_json:
        try:
            history = json.loads(existing_history_json)
        except json.JSONDecodeError:
            logger.warning("Failed to parse existing resolution history, starting fresh")
            history = []

    # Append new attempt
    attempt = {
        "label": result.label,
        "command": " ".join(result.command),
        "exit_code": result.returncode,
        "resolution_success": resolution_success,
        "stderr_snippet": result.stderr[:200] if result.stderr else "(empty)",
    }
    history.append(attempt)

    # Update state
    retry_count = state.get("validation_retry_count", 0)
    state.update(
        last_resolution_attempts=json.dumps(history, indent=2),
        validation_retry_count=retry_count + 1,
        persist=True,
    )

    logger.debug(f"Tracked resolution attempt for {result.label}, total retries: {retry_count + 1}")


__all__ = [
    "resolve_validation_failure",
    "track_resolution_attempt",
]
