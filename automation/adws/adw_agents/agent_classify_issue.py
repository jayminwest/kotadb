"""Atomic agent: Issue Classification

Classifies GitHub issues into feat/bug/chore categories or identifies out-of-scope work.
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

from ..adw_modules.data_types import AgentTemplateRequest, GitHubIssue, IssueClassSlashCommand
from ..adw_modules.agent import execute_template
from ..adw_modules.workflow_ops import AGENT_CLASSIFIER, _extract_slash_command, minimal_issue_payload


def classify_issue(
    issue: GitHubIssue,
    adw_id: str,
    logger: logging.Logger,
) -> Tuple[Optional[IssueClassSlashCommand], Optional[str]]:
    """Classify a GitHub issue using the classifier agent.

    Args:
        issue: GitHub issue to classify
        adw_id: ADW execution ID for tracking
        logger: Logger instance for debugging

    Returns:
        Tuple of (classification, error):
        - (None, None): Out-of-scope classification (graceful skip)
        - (command, None): Valid classification (/chore, /bug, /feature)
        - (None, error): Classification failed

    Examples:
        >>> issue = GitHubIssue(number=123, title="Add auth", body="...")
        >>> classify_issue(issue, "abc123", logger)
        ('/feature', None)

        >>> test_issue = GitHubIssue(number=124, title="Test coverage", body="...")
        >>> classify_issue(test_issue, "def456", logger)
        (None, None)  # Out-of-scope, graceful skip
    """
    from ..adw_modules.github import make_issue_comment
    from ..adw_modules.workflow_ops import format_issue_message

    request = AgentTemplateRequest(
        agent_name=AGENT_CLASSIFIER,
        slash_command="/classify_issue",
        args=[minimal_issue_payload(issue)],
        adw_id=adw_id,
        model="sonnet",
    )
    logger.debug(f"classify_issue request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"classify_issue response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    # Check for out-of-scope classification (agent returns "0")
    if response.output.strip() == "0":
        logger.info("Issue classified as out-of-scope (test/analysis work)")
        make_issue_comment(
            str(issue.number),
            format_issue_message(
                adw_id,
                "ops",
                "⏭️ Issue classified as out-of-scope for automation (test/analysis work)"
            )
        )
        return None, None  # Signal graceful skip (not an error)

    command = _extract_slash_command(response.output, ["/chore", "/bug", "/feature"])
    if not command:
        return None, f"Unrecognised classification: {response.output}"
    return command, None  # type: ignore[return-value]
