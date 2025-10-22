"""Atomic agent: Plan Implementation

Implements plans using the /workflows:implement slash command.
"""

from __future__ import annotations

import logging
from typing import Optional

from ..adw_modules.data_types import AgentPromptResponse, AgentTemplateRequest
from ..adw_modules.agent import execute_template
from ..adw_modules.workflow_ops import AGENT_IMPLEMENTOR


def implement_plan(
    plan_file: str,
    adw_id: str,
    logger: logging.Logger,
    agent_name: str | None = None,
    cwd: Optional[str] = None,
) -> AgentPromptResponse:
    """Run the implementor agent against the generated plan.

    Args:
        plan_file: Relative path to plan file to implement
        adw_id: ADW execution ID for tracking
        logger: Logger instance for debugging
        agent_name: Optional custom agent name (defaults to AGENT_IMPLEMENTOR)
        cwd: Working directory (worktree path) for execution

    Returns:
        AgentPromptResponse with success status and output

    Examples:
        >>> response = implement_plan("docs/specs/feat-123.md", "abc123", logger)
        >>> response.success
        True
    """
    request = AgentTemplateRequest(
        agent_name=agent_name or AGENT_IMPLEMENTOR,
        slash_command="/implement",
        args=[plan_file],
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"implement_plan request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"implement_plan response: {response.model_dump_json(indent=2)}")
    return response
