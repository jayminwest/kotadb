"""Beads integration helpers for ADW workflows.

This module provides documentation and type hints for beads MCP tool usage from
Claude Code slash commands. Beads operations are invoked directly via MCP tools
in Claude Code context, not from Python automation scripts.

For Python scripts that need beads data, use subprocess to call `bd` CLI directly.
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class BeadsError(Exception):
    """Raised when beads operation fails."""


def query_ready_issues_cli(
    workspace_root: str = ".",
    priority: Optional[int] = None,
    assignee: Optional[str] = None,
    limit: int = 50,
) -> Optional[List[Dict[str, Any]]]:
    """Query ready-to-work issues from beads via CLI (for Python scripts).

    This function calls the `bd ready` command directly for use in Python automation
    scripts. For Claude Code workflows, use the MCP tool directly via:
    `mcp__plugin_beads_beads__ready`

    Args:
        workspace_root: Path to workspace with initialized beads
        priority: Filter by priority (1-5, where 1=highest)
        assignee: Filter by assignee (None for unassigned)
        limit: Maximum number of issues to return

    Returns:
        List of issue dicts with fields: id, title, priority, status, dependencies
        Returns None if beads CLI unavailable (enables fallback)

    Example:
        >>> issues = query_ready_issues_cli(priority=1, assignee=None, limit=10)
        >>> if issues:
        ...     for issue in issues:
        ...         print(f"{issue['id']}: {issue['title']}")
    """
    try:
        cmd = ["bd", "ready", "--limit", str(limit), "--json"]
        if priority:
            cmd.extend(["--priority", str(priority)])
        if assignee:
            cmd.extend(["--assignee", assignee])

        result = subprocess.run(
            cmd,
            cwd=workspace_root,
            capture_output=True,
            text=True,
            check=True,
        )

        issues = json.loads(result.stdout)
        logger.info(f"Found {len(issues)} ready issues in beads")
        return issues

    except subprocess.CalledProcessError as e:
        logger.warning(f"Beads CLI command failed: {e.stderr}")
        return None
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse beads output: {e}")
        return None
    except FileNotFoundError:
        logger.warning("Beads CLI not found in PATH")
        return None
    except Exception as e:
        logger.warning(f"Failed to query beads ready issues: {e}")
        return None


def get_issue_details_cli(
    issue_id: str,
    workspace_root: str = ".",
) -> Optional[Dict[str, Any]]:
    """Get detailed information about a specific issue from beads via CLI.

    This function calls the `bd show` command directly for use in Python automation
    scripts. For Claude Code workflows, use the MCP tool directly via:
    `mcp__plugin_beads_beads__show`

    Args:
        issue_id: Beads issue ID (e.g., "kota-db-ts-303")
        workspace_root: Path to workspace with initialized beads

    Returns:
        Issue dict with fields: id, title, description, priority, status,
        dependencies, dependents, labels, external_ref
        Returns None if beads CLI unavailable or issue not found

    Example:
        >>> details = get_issue_details_cli("kota-db-ts-303")
        >>> if details:
        ...     print(f"Title: {details['title']}")
        ...     print(f"Dependencies: {details['dependencies']}")
    """
    try:
        result = subprocess.run(
            ["bd", "show", issue_id, "--json"],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            check=True,
        )

        issue = json.loads(result.stdout)
        logger.info(f"Retrieved details for issue {issue_id}")
        return issue

    except subprocess.CalledProcessError as e:
        logger.warning(f"Beads show for {issue_id} failed: {e.stderr}")
        return None
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse beads output: {e}")
        return None
    except FileNotFoundError:
        logger.warning("Beads CLI not found in PATH")
        return None
    except Exception as e:
        logger.warning(f"Failed to get issue details for {issue_id}: {e}")
        return None


def update_issue_status_cli(
    issue_id: str,
    status: str,
    workspace_root: str = ".",
    notes: Optional[str] = None,
    assignee: Optional[str] = None,
) -> bool:
    """Update issue status in beads via CLI (atomic claim operation).

    This function calls the `bd update` command directly for use in Python automation
    scripts. For Claude Code workflows, use the MCP tool directly via:
    `mcp__plugin_beads_beads__update`

    Args:
        issue_id: Beads issue ID (e.g., "kota-db-ts-303")
        status: New status (open, in_progress, blocked, closed)
        workspace_root: Path to workspace with initialized beads
        notes: Optional notes to append to issue
        assignee: Optional assignee to set

    Returns:
        True if update successful, False otherwise

    Example:
        >>> # Claim work atomically
        >>> success = update_issue_status_cli("kota-db-ts-303", "in_progress", assignee="claude")
        >>> if success:
        ...     print("Work claimed successfully")
    """
    try:
        cmd = ["bd", "update", issue_id, "--status", status]
        if notes:
            cmd.extend(["--notes", notes])
        if assignee:
            cmd.extend(["--assignee", assignee])

        result = subprocess.run(
            cmd,
            cwd=workspace_root,
            capture_output=True,
            text=True,
            check=True,
        )

        logger.info(f"Updated issue {issue_id} to status '{status}'")
        return True

    except subprocess.CalledProcessError as e:
        logger.warning(f"Beads update for {issue_id} failed: {e.stderr}")
        return False
    except FileNotFoundError:
        logger.warning("Beads CLI not found in PATH")
        return False
    except Exception as e:
        logger.warning(f"Failed to update issue {issue_id}: {e}")
        return False


def close_issue_cli(
    issue_id: str,
    reason: str = "Completed",
    workspace_root: str = ".",
) -> bool:
    """Close an issue in beads via CLI (marks as complete).

    This function calls the `bd close` command directly for use in Python automation
    scripts. For Claude Code workflows, use the MCP tool directly via:
    `mcp__plugin_beads_beads__close`

    Args:
        issue_id: Beads issue ID (e.g., "kota-db-ts-303")
        reason: Closure reason (e.g., "Completed", "PR merged")
        workspace_root: Path to workspace with initialized beads

    Returns:
        True if close successful, False otherwise

    Example:
        >>> success = close_issue_cli("kota-db-ts-303", reason="PR #304 merged")
        >>> if success:
        ...     print("Issue closed successfully")
    """
    try:
        result = subprocess.run(
            ["bd", "close", issue_id, "--reason", reason],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            check=True,
        )

        logger.info(f"Closed issue {issue_id}: {reason}")
        return True

    except subprocess.CalledProcessError as e:
        logger.warning(f"Beads close for {issue_id} failed: {e.stderr}")
        return False
    except FileNotFoundError:
        logger.warning("Beads CLI not found in PATH")
        return False
    except Exception as e:
        logger.warning(f"Failed to close issue {issue_id}: {e}")
        return False


def create_discovered_issue_cli(
    title: str,
    description: str,
    parent_issue_id: Optional[str] = None,
    workspace_root: str = ".",
    priority: int = 2,
    issue_type: str = "task",
) -> Optional[str]:
    """Create a new issue discovered during work via CLI (automatic relationship tracking).

    This function calls the `bd create` and `bd dep` commands directly for use in Python
    automation scripts. For Claude Code workflows, use the MCP tools directly via:
    `mcp__plugin_beads_beads__create` and `mcp__plugin_beads_beads__dep`

    Args:
        title: Issue title
        description: Issue description
        parent_issue_id: Parent issue ID for discovered-from relationship
        workspace_root: Path to workspace with initialized beads
        priority: Issue priority (1-5, where 1=highest)
        issue_type: Issue type (bug, feature, task, epic, chore)

    Returns:
        New issue ID if successful, None otherwise

    Example:
        >>> new_id = create_discovered_issue_cli(
        ...     title="Add rate limit tests",
        ...     description="Discovered during implementation of #303",
        ...     parent_issue_id="kota-db-ts-303",
        ...     priority=2,
        ... )
        >>> if new_id:
        ...     print(f"Created follow-up issue: {new_id}")
    """
    try:
        # Create issue
        result = subprocess.run(
            [
                "bd",
                "create",
                title,
                "--description",
                description,
                "--priority",
                str(priority),
                "--type",
                issue_type,
                "--json",
            ],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            check=True,
        )

        issue_data = json.loads(result.stdout)
        new_issue_id = issue_data.get("id")
        if not new_issue_id:
            logger.warning("Beads create issue did not return ID")
            return None

        # Add discovered-from relationship if parent specified
        if parent_issue_id:
            subprocess.run(
                ["bd", "dep", new_issue_id, parent_issue_id, "--type", "discovered-from"],
                cwd=workspace_root,
                capture_output=True,
                text=True,
                check=True,
            )

        logger.info(f"Created discovered issue {new_issue_id}: {title}")
        return new_issue_id

    except subprocess.CalledProcessError as e:
        logger.warning(f"Beads create/dep command failed: {e.stderr}")
        return None
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse beads output: {e}")
        return None
    except FileNotFoundError:
        logger.warning("Beads CLI not found in PATH")
        return None
    except Exception as e:
        logger.warning(f"Failed to create discovered issue: {e}")
        return None


def list_open_issues_cli(
    workspace_root: str = ".",
    status: Optional[str] = None,
    priority: Optional[int] = None,
    limit: int = 50,
) -> Optional[List[Dict[str, Any]]]:
    """List all open issues from beads via CLI (for prioritization).

    This function calls the `bd list` command directly for use in Python automation
    scripts. For Claude Code workflows, use the MCP tool directly via:
    `mcp__plugin_beads_beads__list`

    Args:
        workspace_root: Path to workspace with initialized beads
        status: Filter by status (open, in_progress, blocked, closed)
        priority: Filter by priority (1-5)
        limit: Maximum number of issues to return

    Returns:
        List of issue dicts with fields: id, title, priority, status
        Returns None if beads CLI unavailable

    Example:
        >>> issues = list_open_issues_cli(status="open", priority=1)
        >>> if issues:
        ...     for issue in issues:
        ...         print(f"{issue['id']}: {issue['title']}")
    """
    try:
        cmd = ["bd", "list", "--limit", str(limit), "--json"]
        if status:
            cmd.extend(["--status", status])
        if priority:
            cmd.extend(["--priority", str(priority)])

        result = subprocess.run(
            cmd,
            cwd=workspace_root,
            capture_output=True,
            text=True,
            check=True,
        )

        issues = json.loads(result.stdout)
        logger.info(f"Found {len(issues)} issues in beads")
        return issues

    except subprocess.CalledProcessError as e:
        logger.warning(f"Beads list command failed: {e.stderr}")
        return None
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse beads output: {e}")
        return None
    except FileNotFoundError:
        logger.warning("Beads CLI not found in PATH")
        return None
    except Exception as e:
        logger.warning(f"Failed to list beads issues: {e}")
        return None


__all__ = [
    "BeadsError",
    "query_ready_issues_cli",
    "get_issue_details_cli",
    "update_issue_status_cli",
    "close_issue_cli",
    "create_discovered_issue_cli",
    "list_open_issues_cli",
]
