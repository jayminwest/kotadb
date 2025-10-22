"""Atomic agent: Branch Name Generation

Generates conventional branch names based on issue classification and metadata.
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

from ..adw_modules.data_types import AgentTemplateRequest, GitHubIssue, IssueClassSlashCommand
from ..adw_modules.agent import execute_template
from ..adw_modules.workflow_ops import AGENT_BRANCH_GENERATOR, minimal_issue_payload


def generate_branch_name(
    issue: GitHubIssue,
    issue_class: IssueClassSlashCommand,
    adw_id: str,
    logger: logging.Logger,
) -> Tuple[Optional[str], Optional[str]]:
    """Generate a descriptive branch name using the branch generator agent.

    Args:
        issue: GitHub issue for context
        issue_class: Issue classification (/chore, /bug, /feature)
        adw_id: ADW execution ID for tracking
        logger: Logger instance for debugging

    Returns:
        Tuple of (branch_name, error):
        - (branch_name, None): Successfully generated branch name
        - (None, error): Generation failed

    Examples:
        >>> issue = GitHubIssue(number=123, title="Add authentication", body="...")
        >>> generate_branch_name(issue, "/feature", "abc123", logger)
        ('feat/123-add-authentication', None)
    """
    request = AgentTemplateRequest(
        agent_name=AGENT_BRANCH_GENERATOR,
        slash_command="/generate_branch_name",
        args=[issue_class.replace("/", ""), adw_id, minimal_issue_payload(issue)],
        adw_id=adw_id,
        model="sonnet",
    )
    logger.debug(f"generate_branch_name request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"generate_branch_name response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    branch_name = response.output.strip()
    if not branch_name:
        return None, "Empty branch name returned"
    logger.info(f"Generated branch: {branch_name}")
    return branch_name, None
