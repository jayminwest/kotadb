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

from adws.adw_modules.agent import execute_template
from adws.adw_modules.data_types import (
    AgentTemplateRequest,
    HomeServerTaskUpdate,
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
) -> bool:
    """Update task status on home server."""
    try:
        home_server_url = os.getenv("HOMESERVER_URL", "https://jaymins-mac-pro.tail1b7f44.ts.net")
        tasks_endpoint = os.getenv("HOMESERVER_TASKS_ENDPOINT", "/api/kota-tasks")

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
            payload["result"] = {}
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


@click.command()
@click.option("--adw-id", required=True, help="ADW execution ID")
@click.option("--worktree-name", required=True, help="Worktree name")
@click.option("--task", required=True, help="Task description")
@click.option("--task-id", required=True, help="Task ID from home server")
@click.option("--model", default="sonnet", help="Claude model (sonnet or opus)")
def main(adw_id: str, worktree_name: str, task: str, task_id: str, model: str) -> None:
    """Execute simple build workflow for home server task."""
    print_status_panel("Starting simple build workflow", adw_id, worktree_name, "info")

    # Determine working directory (detect repository name dynamically)
    repo_name = Path.cwd().name
    worktree_path = Path.cwd() / "trees" / worktree_name / repo_name
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

        # Update home server: completed
        update_homeserver_task(
            task_id,
            TaskStatus.COMPLETED,
            adw_id,
            worktree_name,
            commit_hash=commit_hash,
        )

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
