"""Atomic agent: Pull Request Creation

Creates pull requests using the /pull_request slash command.
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

from ..adw_modules.data_types import AgentTemplateRequest, GitHubIssue
from ..adw_modules.agent import execute_template
from ..adw_modules.workflow_ops import AGENT_PR_CREATOR, minimal_issue_payload


def create_pull_request(
    branch_name: str,
    issue: GitHubIssue,
    plan_file: str,
    adw_id: str,
    logger: logging.Logger,
    cwd: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Ask Claude to create a pull request summary for the work.

    Args:
        branch_name: Name of the branch to create PR for
        issue: GitHub issue for context
        plan_file: Path to the plan/spec file
        adw_id: ADW execution ID for tracking
        logger: Logger instance for debugging
        cwd: Working directory (worktree path) for execution

    Returns:
        Tuple of (pr_url, error):
        - (pr_url, None): Successfully created PR with URL
        - (None, error): PR creation failed

    Examples:
        >>> issue = GitHubIssue(number=123, title="Add auth", body="...")
        >>> create_pull_request("feat/123-add-auth", issue, "docs/specs/feat-123.md", "abc123", logger)
        ('https://github.com/org/repo/pull/456', None)
    """
    request = AgentTemplateRequest(
        agent_name=AGENT_PR_CREATOR,
        slash_command="/pull_request",
        args=[branch_name, minimal_issue_payload(issue), plan_file, adw_id],
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"create_pull_request request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"create_pull_request response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    pr_url = response.output.strip()
    if not pr_url:
        return None, "Empty PR URL returned"
    return pr_url, None
