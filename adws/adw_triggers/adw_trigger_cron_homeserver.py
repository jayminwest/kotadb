#!/usr/bin/env uv run
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pydantic",
#     "python-dotenv",
#     "click",
#     "rich",
#     "schedule",
#     "requests",
# ]
# ///

"""Home server cron trigger for ADW workflows."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import click
import requests
import schedule
from rich.align import Align
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from adws.adw_modules.data_types import (
    HomeServerCronConfig,
    HomeServerTask,
    ModelType,
    TaskStatus,
)
from adws.adw_modules.utils import load_adw_env

load_adw_env()

console = Console()
shutdown_requested = False

# Statistics tracking
stats = {
    "checks": 0,
    "tasks_started": 0,
    "worktrees_created": 0,
    "homeserver_updates": 0,
    "errors": 0,
    "last_check": None,
}


def signal_handler(signum: int, _frame: object) -> None:
    """Handle shutdown signals gracefully."""
    global shutdown_requested
    console.print(
        f"\n[yellow]INFO: Received signal {signum}; shutting down after current cycle.[/yellow]"
    )
    shutdown_requested = True


class HomeServerTaskManager:
    """Manages communication with the home server API."""

    def __init__(self, base_url: str, tasks_endpoint: str = "/api/tasks/kotadb"):
        self.base_url = base_url.rstrip("/")
        self.tasks_endpoint = tasks_endpoint
        self.timeout = 10  # seconds

    def get_eligible_tasks(
        self, status_filter: List[TaskStatus], limit: int = 3
    ) -> List[HomeServerTask]:
        """Fetch tasks with specified statuses from the home server."""
        try:
            url = f"{self.base_url}{self.tasks_endpoint}"
            status_values = [s.value for s in status_filter]
            params = {"status": ",".join(status_values), "limit": limit}

            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()

            tasks_data = response.json()
            return [HomeServerTask(**task) for task in tasks_data]
        except requests.exceptions.RequestException as e:
            console.print(f"[red]ERROR: Failed to fetch tasks: {e}[/red]")
            stats["errors"] += 1
            return []
        except Exception as e:
            console.print(f"[red]ERROR: Unexpected error fetching tasks: {e}[/red]")
            stats["errors"] += 1
            return []

    def claim_task(self, task_id: str, adw_id: str, worktree: Optional[str] = None) -> bool:
        """Claim a task by updating its status to 'claimed'."""
        try:
            url = f"{self.base_url}{self.tasks_endpoint}/{task_id}/claim"
            payload = {
                "adw_id": adw_id,
            }
            if worktree:
                payload["worktree"] = worktree

            response = requests.post(url, json=payload, timeout=self.timeout)
            response.raise_for_status()

            stats["homeserver_updates"] += 1
            return True
        except requests.exceptions.RequestException as e:
            console.print(f"[red]ERROR: Failed to claim task {task_id}: {e}[/red]")
            stats["errors"] += 1
            return False

    def generate_worktree_name(
        self, task_description: str, prefix: str = "feat"
    ) -> Optional[str]:
        """Generate a worktree name from task description."""
        # Simple implementation - would use Claude Code template in production
        import re

        name = task_description.lower()
        name = re.sub(r"[^a-z0-9\s-]", "", name)
        name = re.sub(r"\s+", "-", name)
        name = re.sub(r"-+", "-", name)
        name = name.strip("-")

        if prefix:
            name = f"{prefix}-{name}"

        if len(name) > 50:
            name = name[:50].rstrip("-")

        return name if name else None


class HomeServerCronTrigger:
    """Manages the cron-based polling and task delegation."""

    def __init__(self, config: HomeServerCronConfig):
        self.config = config
        self.task_manager = HomeServerTaskManager(
            config.home_server_url, config.tasks_endpoint
        )
        self.active_tasks: Dict[str, subprocess.Popen] = {}
        self.processed_tasks = set()

    def check_worktree_exists(self, worktree_name: str) -> bool:
        """Check if a worktree already exists."""
        try:
            result = subprocess.run(
                ["git", "worktree", "list"],
                capture_output=True,
                text=True,
                check=True,
            )
            return worktree_name in result.stdout
        except subprocess.CalledProcessError:
            return False

    def create_worktree(self, worktree_name: str) -> bool:
        """Create a new git worktree."""
        try:
            worktree_path = Path(self.config.worktree_base_path) / worktree_name
            if worktree_path.exists():
                console.print(
                    f"[yellow]WARN: Worktree directory {worktree_path} already exists[/yellow]"
                )
                return True

            # Create worktree from develop branch
            result = subprocess.run(
                [
                    "git",
                    "worktree",
                    "add",
                    str(worktree_path),
                    "-b",
                    worktree_name,
                    "develop",
                ],
                capture_output=True,
                text=True,
            )

            if result.returncode == 0:
                stats["worktrees_created"] += 1
                console.print(
                    f"[green]✓ Created worktree: {worktree_name}[/green]"
                )
                return True
            else:
                console.print(
                    f"[red]ERROR: Failed to create worktree: {result.stderr}[/red]"
                )
                stats["errors"] += 1
                return False
        except Exception as e:
            console.print(f"[red]ERROR: Exception creating worktree: {e}[/red]")
            stats["errors"] += 1
            return False

    def delegate_task(
        self, task: HomeServerTask, worktree_name: str, adw_id: str
    ) -> bool:
        """Delegate task to appropriate workflow script."""
        try:
            # Determine workflow script based on complexity
            if task.should_use_full_workflow():
                script_name = "adw_plan_implement_update_homeserver_task.py"
            else:
                script_name = "adw_build_update_homeserver_task.py"

            script_path = Path(__file__).parent.parent / script_name
            if not script_path.exists():
                console.print(f"[red]ERROR: Workflow script not found: {script_path}[/red]")
                return False

            # Determine model preference
            model = task.get_preferred_model().value

            # Build command
            cmd = [
                "uv",
                "run",
                str(script_path),
                "--adw-id",
                adw_id,
                "--worktree-name",
                worktree_name,
                "--task",
                task.description,
                "--task-id",
                task.task_id,
                "--model",
                model,
            ]

            if self.config.dry_run:
                console.print(f"[cyan]DRY RUN: Would execute: {' '.join(cmd)}[/cyan]")
                return True

            # Spawn workflow as detached subprocess
            console.print(
                f"[cyan]→ Spawning workflow: {script_name} (model: {model})[/cyan]"
            )

            process = subprocess.Popen(
                cmd,
                cwd=Path(__file__).parent.parent,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            self.active_tasks[task.task_id] = process
            stats["tasks_started"] += 1

            return True
        except Exception as e:
            console.print(f"[red]ERROR: Failed to delegate task: {e}[/red]")
            stats["errors"] += 1
            return False

    def process_tasks(self) -> None:
        """Main polling loop - check for tasks and delegate them."""
        if shutdown_requested:
            console.print("[yellow]Shutdown requested; skipping poll cycle.[/yellow]")
            return

        stats["checks"] += 1
        stats["last_check"] = datetime.now().strftime("%H:%M:%S")

        # Fetch eligible tasks
        tasks = self.task_manager.get_eligible_tasks(
            self.config.status_filter,
            limit=self.config.max_concurrent_tasks - len(self.active_tasks),
        )

        if not tasks:
            return

        console.print(f"[cyan]Found {len(tasks)} eligible task(s)[/cyan]")

        for task in tasks:
            if shutdown_requested:
                break

            if task.task_id in self.processed_tasks:
                continue

            # Generate ADW ID
            adw_id = str(uuid.uuid4())[:8]

            # Generate worktree name if not provided
            worktree_name = task.worktree
            if not worktree_name:
                worktree_name = self.task_manager.generate_worktree_name(
                    task.title, prefix="feat"
                )
                if not worktree_name:
                    console.print(
                        f"[red]ERROR: Failed to generate worktree name for task {task.task_id}[/red]"
                    )
                    continue

            # Create worktree if it doesn't exist
            if not self.check_worktree_exists(worktree_name):
                if not self.create_worktree(worktree_name):
                    continue

            # Claim the task
            if not self.task_manager.claim_task(task.task_id, adw_id, worktree_name):
                continue

            # Delegate to workflow
            if self.delegate_task(task, worktree_name, adw_id):
                self.processed_tasks.add(task.task_id)
                console.print(
                    f"[green]✓ Task {task.task_id} delegated (ADW: {adw_id}, Worktree: {worktree_name})[/green]"
                )

    def create_status_display(self) -> Panel:
        """Create a rich panel displaying current status."""
        table = Table(show_header=False, box=None)
        table.add_column(style="bold cyan")
        table.add_column()

        status_color = "green" if not shutdown_requested else "yellow"
        status_text = "Running" if not shutdown_requested else "Shutting down"

        table.add_row("Status", f"[{status_color}]{status_text}[/{status_color}]")
        table.add_row("Polling Interval", f"{self.config.polling_interval} seconds")
        table.add_row("Home Server", self.config.home_server_url.split("//")[-1])
        table.add_row("Checks Performed", str(stats["checks"]))
        table.add_row("Tasks Started", str(stats["tasks_started"]))
        table.add_row("Worktrees Created", str(stats["worktrees_created"]))
        table.add_row("Errors", str(stats["errors"]))
        table.add_row("Last Check", stats["last_check"] or "Never")

        return Panel(
            Align.center(table),
            title="[bold blue]🔄 Home Server Multi-Agent Cron[/bold blue]",
            border_style="blue",
        )

    def run_once(self) -> None:
        """Run a single check cycle."""
        console.print(self.create_status_display())
        self.process_tasks()

    def run_continuous(self) -> None:
        """Run continuous polling loop."""
        console.print(self.create_status_display())

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        schedule.every(self.config.polling_interval).seconds.do(self.process_tasks)

        while not shutdown_requested:
            schedule.run_pending()
            time.sleep(1)

        console.print("[yellow]Cron trigger exiting[/yellow]")


@click.command()
@click.option(
    "--home-server-url",
    default=os.getenv("HOMESERVER_URL", "https://jaymins-mac-pro.tail1b7f44.ts.net"),
    help="Base URL of the home server",
)
@click.option(
    "--tasks-endpoint",
    default=os.getenv("HOMESERVER_TASKS_ENDPOINT", "/api/tasks/kotadb"),
    help="Tasks API endpoint path",
)
@click.option(
    "--polling-interval",
    default=15,
    type=int,
    help="Polling interval in seconds",
)
@click.option(
    "--max-concurrent",
    default=3,
    type=int,
    help="Maximum concurrent tasks",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="Run without executing workflows",
)
@click.option(
    "--once",
    is_flag=True,
    help="Run once and exit (no continuous polling)",
)
def main(
    home_server_url: str,
    tasks_endpoint: str,
    polling_interval: int,
    max_concurrent: int,
    dry_run: bool,
    once: bool,
) -> None:
    """Home server cron trigger for AI Developer Workflows."""
    config = HomeServerCronConfig(
        home_server_url=home_server_url,
        tasks_endpoint=tasks_endpoint,
        polling_interval=polling_interval,
        max_concurrent_tasks=max_concurrent,
        dry_run=dry_run,
    )

    trigger = HomeServerCronTrigger(config)

    if once:
        trigger.run_once()
    else:
        trigger.run_continuous()


if __name__ == "__main__":
    main()
