"""Atomic agent: Plan Creation

Creates implementation plans using slash commands (/chore, /bug, /feature).
"""

from __future__ import annotations

import logging
from typing import Optional

from ..adw_modules.data_types import AgentPromptResponse, AgentTemplateRequest, GitHubIssue
from ..adw_modules.agent import execute_template
from ..adw_modules.workflow_ops import AGENT_PLANNER


def build_plan(
    issue: GitHubIssue,
    command: str,
    adw_id: str,
    logger: logging.Logger,
    cwd: Optional[str] = None,
) -> AgentPromptResponse:
    """Generate an implementation plan using the planner agent.

    Args:
        issue: GitHub issue to plan for
        command: Slash command to use (/chore, /bug, /feature)
        adw_id: ADW execution ID for tracking
        logger: Logger instance for debugging
        cwd: Working directory (worktree path) for execution

    Returns:
        AgentPromptResponse with success status and output

    Examples:
        >>> issue = GitHubIssue(number=123, title="Add auth", body="...")
        >>> response = build_plan(issue, "/feature", "abc123", logger)
        >>> response.success
        True
    """
    request = AgentTemplateRequest(
        agent_name=AGENT_PLANNER,
        slash_command=command,
        args=[f"{issue.title}: {issue.body}"],
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"build_plan request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"build_plan response: {response.model_dump_json(indent=2)}")
    logger.info("Plan generation complete, checking for created files...")
    return response
