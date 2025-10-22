"""Atomic agent: Plan Commit Message Generation

Generates commit messages for plan documents following Conventional Commits format.
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

from ..adw_modules.data_types import GitHubIssue, IssueClassSlashCommand
from ..adw_modules.workflow_ops import AGENT_PLANNER, create_commit_message


def commit_plan(
    issue: GitHubIssue,
    issue_class: IssueClassSlashCommand,
    adw_id: str,
    logger: logging.Logger,
    cwd: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Generate a commit message for the plan document.

    Args:
        issue: GitHub issue for context
        issue_class: Issue classification (/chore, /bug, /feature)
        adw_id: ADW execution ID for tracking
        logger: Logger instance for debugging
        cwd: Working directory (worktree path) for git operations

    Returns:
        Tuple of (commit_message, error):
        - (commit_message, None): Successfully generated commit message
        - (None, error): Generation failed

    Examples:
        >>> issue = GitHubIssue(number=123, title="Add auth", body="...")
        >>> commit_plan(issue, "/feature", "abc123", logger)
        ('feat: add authentication implementation plan', None)
    """
    return create_commit_message(
        AGENT_PLANNER,
        issue,
        issue_class,
        adw_id,
        logger,
        cwd=cwd,
    )
