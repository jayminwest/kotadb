"""Atomic agent: Worktree Cleanup

Cleans up git worktrees after workflow completion.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from ..adw_modules import git_ops


def cleanup_worktree(
    worktree_name: str,
    logger: logging.Logger,
    base_path: Optional[str] = None,
    delete_branch: bool = False,
) -> bool:
    """Clean up a git worktree after workflow completion.

    Args:
        worktree_name: Name of the worktree to clean up
        logger: Logger instance for debugging
        base_path: Base path for worktrees (defaults to ADW_WORKTREE_BASE_PATH or "automation/trees")
        delete_branch: Whether to delete the associated branch (default: False)

    Returns:
        True if cleanup succeeded, False otherwise

    Examples:
        >>> cleanup_worktree("feat-123-abc12345", logger)
        True

        >>> cleanup_worktree("feat-123-abc12345", logger, delete_branch=True)
        True
    """
    if base_path is None:
        base_path = os.getenv("ADW_WORKTREE_BASE_PATH", "automation/trees")

    logger.info(f"Cleaning up worktree: {worktree_name}")
    success = git_ops.cleanup_worktree(
        worktree_name,
        base_path=base_path,
        delete_branch=delete_branch
    )

    if success:
        logger.info(f"Worktree cleanup completed: {worktree_name}")
    else:
        logger.warning(
            f"Worktree cleanup failed: {worktree_name}. "
            f"Manual cleanup may be required: {base_path}/{worktree_name}"
        )

    return success
