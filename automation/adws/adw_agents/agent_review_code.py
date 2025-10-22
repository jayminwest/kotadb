"""Atomic agent: Code Review

Reviews code changes using the /review slash command.
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

from ..adw_modules.data_types import AgentTemplateRequest, ReviewResult
from ..adw_modules.agent import execute_template
from ..adw_modules.workflow_ops import AGENT_REVIEWER
from ..adw_modules.utils import parse_json


def run_review(
    spec_file: str,
    adw_id: str,
    logger: logging.Logger,
    cwd: Optional[str] = None,
) -> Tuple[Optional[ReviewResult], Optional[str]]:
    """Execute the reviewer agent against the provided spec file.

    Args:
        spec_file: Path to the specification file
        adw_id: ADW execution ID for tracking
        logger: Logger instance for debugging
        cwd: Working directory (worktree path) for execution

    Returns:
        Tuple of (review_result, error):
        - (review_result, None): Successfully completed review
        - (None, error): Review failed or parsing failed

    Examples:
        >>> result, error = run_review("docs/specs/feat-123.md", "abc123", logger)
        >>> result.success
        True
        >>> len(result.review_issues)
        0
    """
    request = AgentTemplateRequest(
        agent_name=AGENT_REVIEWER,
        slash_command="/review",
        args=[adw_id, spec_file, AGENT_REVIEWER],
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"review request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"review response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    try:
        result = parse_json(response.output, ReviewResult)
    except ValueError as exc:
        return None, f"Failed to parse review result: {exc}"
    return result, None
