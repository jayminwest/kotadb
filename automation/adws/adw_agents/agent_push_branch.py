"""Atomic agent: Git Push

Pushes branches to remote repository with retry logic and error classification.
"""

from __future__ import annotations

import logging
from typing import Dict, Optional

from ..adw_modules import git_ops


def push_branch(
    branch_name: str,
    logger: logging.Logger,
    cwd: Optional[str] = None,
) -> Dict[str, any]:
    """Push a branch to the remote repository.

    Args:
        branch_name: Name of the branch to push
        logger: Logger instance for debugging
        cwd: Working directory (worktree path) for git operations

    Returns:
        Dictionary with keys:
        - success: bool - Whether push succeeded
        - error_type: str - Error classification (auth, network, email_privacy, unknown)
        - error_message: str - Detailed error message if failed

    Examples:
        >>> result = push_branch("feat/123-add-auth", logger)
        >>> result["success"]
        True

        >>> result = push_branch("invalid-branch", logger)
        >>> result["success"]
        False
        >>> result["error_type"]
        'auth'
    """
    logger.info(f"Pushing branch: {branch_name}")
    result = git_ops.push_branch(branch_name, cwd=cwd)

    if result["success"]:
        logger.info(f"Branch pushed successfully: {branch_name}")
    else:
        logger.error(
            f"Branch push failed: {result['error_message']} "
            f"(type: {result['error_type']})"
        )

    return result
