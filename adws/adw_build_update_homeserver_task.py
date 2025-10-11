#!/usr/bin/env uv run
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pydantic",
#     "python-dotenv",
#     "click",
#     "rich",
#     "requests",
# ]
# ///

"""Simple build workflow for home server tasks."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import click
import requests
from rich.console import Console
from rich.panel import Panel

# Add parent directory to path for module imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adws.adw_modules.agent import execute_template
from adws.adw_modules.data_types import (
    AgentTemplateRequest,
    TaskStatus,
)
from adws.adw_modules.utils import load_adw_env

load_adw_env()
console = Console()


def print_status_panel(action: str, adw_id: str, worktree: str, status: str = "info") -> None:
    """Print timestamped status panel."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    icon = {"success": "✅", "error": "❌", "info": "🔄"}.get(status, "ℹ️")
    border_style = {"success": "green", "error": "red", "info": "cyan"}.get(status, "blue")

    title = f"[{timestamp}] | {adw_id[:6]} | {worktree} | build"

    console.print(
        Panel(
            f"{icon} {action}",
            title=f"[bold {border_style}]{title}[/bold {border_style}]",
            border_style=border_style,
            padding=(0, 1),
        )
    )


def update_homeserver_task(
    task_id: str,
    status: TaskStatus,
    adw_id: str,
    worktree: str,
    commit_hash: Optional[str] = None,
    error: Optional[str] = None,
    result: Optional[dict] = None,
) -> bool:
    """Update task status on home server."""
    try:
        home_server_url = os.getenv("HOMESERVER_URL", "https://jaymins-mac-pro.tail1b7f44.ts.net")
        tasks_endpoint = os.getenv("HOMESERVER_TASKS_ENDPOINT", "/api/tasks/kotadb")

        # Map status to appropriate endpoint
        endpoint_map = {
            TaskStatus.IN_PROGRESS: f"{tasks_endpoint}/{task_id}/start",
            TaskStatus.COMPLETED: f"{tasks_endpoint}/{task_id}/complete",
            TaskStatus.FAILED: f"{tasks_endpoint}/{task_id}/fail",
        }

        if status not in endpoint_map:
            console.print(f"[red]ERROR: Invalid status for update: {status}[/red]")
            return False

        url = f"{home_server_url}{endpoint_map[status]}"

        # Build payload based on status
        payload = {"adw_id": adw_id, "worktree": worktree}
        if status == TaskStatus.COMPLETED and commit_hash:
            payload["commit_hash"] = commit_hash
            payload["result"] = result or {}
        elif status == TaskStatus.FAILED and error:
            payload["error"] = error

        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()

        console.print(f"[green]✓ Updated home server task {task_id} to status: {status.value}[/green]")
        return True
    except Exception as e:
        console.print(f"[red]ERROR: Failed to update home server task: {e}[/red]")
        return False


def get_commit_hash(working_dir: Path) -> Optional[str]:
    """Get current git commit hash."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            cwd=working_dir,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None


def push_and_create_pr(
    worktree_path: Path,
    worktree_name: str,
    task_title: str,
    task_description: str,
    adw_id: str,
    task_id: str,
    commit_hash: str,
    base_branch: str = "develop",
) -> Optional[str]:
    """Push branch to remote and create pull request.

    Returns:
        PR URL if successful, None otherwise
    """
    try:
        # Push branch to remote
        console.print(f"[cyan]🔄 Pushing branch {worktree_name} to remote...[/cyan]")

        result = subprocess.run(
            ["git", "push", "-u", "origin", worktree_name],
            cwd=worktree_path,
            capture_output=True,
            text=True,
            check=True,
        )

        console.print("[green]✓ Branch pushed successfully[/green]")

        # Create PR using gh CLI
        console.print("[cyan]🔄 Creating pull request...[/cyan]")

        # Build PR body with metadata
        pr_body = f"""{task_description}

---

**Automated Workflow Details:**
- **Task ID**: {task_id}
- **ADW ID**: {adw_id}
- **Worktree**: {worktree_name}
- **Commit**: {commit_hash[:8]}
- **Generated**: {datetime.now().isoformat()}

🤖 Generated with [Claude Code](https://claude.com/claude-code)
"""

        result = subprocess.run(
            [
                "gh", "pr", "create",
                "--title", task_title,
                "--body", pr_body,
                "--base", base_branch,
                "--head", worktree_name,
            ],
            cwd=worktree_path,
            capture_output=True,
            text=True,
            check=True,
        )

        # Extract PR URL from output
        pr_url = result.stdout.strip()
        console.print(f"[green]✓ Pull request created: {pr_url}[/green]")

        return pr_url

    except subprocess.CalledProcessError as e:
        console.print(f"[red]ERROR: Failed to push/create PR: {e.stderr}[/red]")
        return None
    except Exception as e:
        console.print(f"[red]ERROR: Unexpected error: {e}[/red]")
        return None


def cleanup_worktree(
    worktree_name: str,
    worktree_base_path: str = "trees",
) -> bool:
    """Remove worktree and delete local branch.

    Returns:
        True if cleanup successful, False otherwise
    """
    try:
        console.print(f"[cyan]🧹 Cleaning up worktree {worktree_name}...[/cyan]")

        # Remove worktree
        result = subprocess.run(
            ["git", "worktree", "remove", f"{worktree_base_path}/{worktree_name}", "--force"],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            console.print(f"[yellow]WARN: Failed to remove worktree: {result.stderr}[/yellow]")

        # Delete local branch
        result = subprocess.run(
            ["git", "branch", "-D", worktree_name],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            console.print(f"[yellow]WARN: Failed to delete branch: {result.stderr}[/yellow]")

        console.print("[green]✓ Worktree cleanup complete[/green]")
        return True

    except Exception as e:
        console.print(f"[red]ERROR: Cleanup failed: {e}[/red]")
        return False


@click.command()
@click.option("--adw-id", required=True, help="ADW execution ID")
@click.option("--worktree-name", required=True, help="Worktree name")
@click.option("--task", required=True, help="Task description")
@click.option("--task-title", required=True, help="Task title for PR")
@click.option("--task-id", required=True, help="Task ID from home server")
@click.option("--model", default="sonnet", help="Claude model (sonnet or opus)")
@click.option("--skip-pr", is_flag=True, help="Skip PR creation")
@click.option("--skip-cleanup", is_flag=True, help="Skip worktree cleanup")
def main(
    adw_id: str,
    worktree_name: str,
    task: str,
    task_title: str,
    task_id: str,
    model: str,
    skip_pr: bool = False,
    skip_cleanup: bool = False,
) -> None:
    """Execute simple build workflow for home server task."""
    print_status_panel("Starting simple build workflow", adw_id, worktree_name, "info")

    # Determine working directory
    worktree_path = Path.cwd() / "trees" / worktree_name
    if not worktree_path.exists():
        error_msg = f"Worktree directory not found: {worktree_path}"
        console.print(f"[red]{error_msg}[/red]")
        update_homeserver_task(task_id, TaskStatus.FAILED, adw_id, worktree_name, error=error_msg)
        sys.exit(1)

    print_status_panel(f"Working in: {worktree_path}", adw_id, worktree_name, "info")

    # Update home server: in_progress
    update_homeserver_task(task_id, TaskStatus.IN_PROGRESS, adw_id, worktree_name)

    try:
        # Execute /build template
        print_status_panel("Executing /build template", adw_id, worktree_name, "info")

        request = AgentTemplateRequest(
            agent_name="builder",
            slash_command="/build",
            args=[adw_id, task],
            adw_id=adw_id,
            model=model,
        )

        response = execute_template(request)

        if not response.success:
            error_msg = f"Build failed: {response.output[:200]}"
            console.print(f"[red]{error_msg}[/red]")
            print_status_panel("Build failed", adw_id, worktree_name, "error")
            update_homeserver_task(task_id, TaskStatus.FAILED, adw_id, worktree_name, error=error_msg)
            sys.exit(1)

        print_status_panel("Build completed successfully", adw_id, worktree_name, "success")

        # Get commit hash
        commit_hash = get_commit_hash(worktree_path)
        if commit_hash:
            console.print(f"[cyan]Commit: {commit_hash[:8]}[/cyan]")

        # Push branch and create PR (unless skipped)
        pr_url = None
        if not skip_pr:
            pr_url = push_and_create_pr(
                worktree_path=worktree_path,
                worktree_name=worktree_name,
                task_title=task_title,
                task_description=task,
                adw_id=adw_id,
                task_id=task_id,
                commit_hash=commit_hash,
                base_branch="develop",
            )

        # Update home server with PR URL
        result_data = {"commit_hash": commit_hash}
        if pr_url:
            result_data["pr_url"] = pr_url

        update_homeserver_task(
            task_id,
            TaskStatus.COMPLETED,
            adw_id,
            worktree_name,
            commit_hash=commit_hash,
            result=result_data,
        )

        # Optional: Clean up worktree after successful PR creation
        if pr_url and not skip_cleanup and os.getenv("ADW_CLEANUP_WORKTREES", "true").lower() == "true":
            cleanup_worktree(worktree_name)

        # Generate workflow summary
        summary = {
            "adw_id": adw_id,
            "task_id": task_id,
            "worktree": worktree_name,
            "workflow": "simple",
            "model": model,
            "commit_hash": commit_hash,
            "completed_at": datetime.now().isoformat(),
        }

        summary_path = Path.cwd() / "agents" / adw_id / "workflow_summary.json"
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(json.dumps(summary, indent=2))

        print_status_panel("Workflow completed successfully", adw_id, worktree_name, "success")

    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        console.print(f"[red]{error_msg}[/red]")
        print_status_panel("Workflow failed", adw_id, worktree_name, "error")
        update_homeserver_task(task_id, TaskStatus.FAILED, adw_id, worktree_name, error=error_msg)
        sys.exit(1)


if __name__ == "__main__":
    main()
