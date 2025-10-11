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

import json
import logging
import os
import signal
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from queue import Queue
from typing import Any, Dict, List, Optional

import click
import requests
import schedule
from rich import box
from rich.align import Align
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

# Add parent directory to path for module imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

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


class WorkflowMonitor:
    """Monitor background workflow processes and stream their output."""

    def __init__(self, verbose: bool = False, quiet: bool = False):
        self.active_workflows: Dict[str, Dict[str, Any]] = {}
        self.output_queue: Queue = Queue()
        self.verbose = verbose
        self.quiet = quiet

    def spawn_workflow(
        self, task_id: str, adw_id: str, cmd: List[str], worktree: Optional[str] = None
    ) -> subprocess.Popen:
        """Spawn workflow and start monitoring its output."""
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,  # Line buffered
        )

        # Start threads to read stdout/stderr
        stdout_thread = threading.Thread(
            target=self._read_stream,
            args=(process.stdout, task_id, adw_id, "stdout"),
            daemon=True,
        )
        stderr_thread = threading.Thread(
            target=self._read_stream,
            args=(process.stderr, task_id, adw_id, "stderr"),
            daemon=True,
        )

        stdout_thread.start()
        stderr_thread.start()

        self.active_workflows[task_id] = {
            "process": process,
            "adw_id": adw_id,
            "worktree": worktree or "N/A",
            "started_at": datetime.now(),
            "phase": None,
            "status": "running",
        }

        return process

    def _read_stream(
        self, stream: Any, task_id: str, adw_id: str, stream_type: str
    ) -> None:
        """Read lines from process stream and queue them for display."""
        try:
            for line in iter(stream.readline, ""):
                if line:
                    self.output_queue.put(
                        {
                            "task_id": task_id,
                            "adw_id": adw_id,
                            "stream": stream_type,
                            "line": line.strip(),
                            "timestamp": datetime.now(),
                        }
                    )
        finally:
            stream.close()

    def process_output(self) -> None:
        """Process queued output lines and display them."""
        while not self.output_queue.empty():
            output = self.output_queue.get()
            self._display_workflow_output(output)

    def _display_workflow_output(self, output: Dict[str, Any]) -> None:
        """Display workflow output with formatting."""
        if self.quiet and output["stream"] != "stderr":
            return

        timestamp = output["timestamp"].strftime("%H:%M:%S")
        adw_id_short = output["adw_id"][:6]
        line = output["line"]

        # Parse special markers for phase detection
        if "Executing /plan template" in line or "plan is running" in line:
            if output["task_id"] in self.active_workflows:
                self.active_workflows[output["task_id"]]["phase"] = "plan"
        elif "Executing /implement template" in line or "implement is running" in line:
            if output["task_id"] in self.active_workflows:
                self.active_workflows[output["task_id"]]["phase"] = "implement"
        elif "Executing /build template" in line or "build is running" in line:
            if output["task_id"] in self.active_workflows:
                self.active_workflows[output["task_id"]]["phase"] = "build"

        # Color based on content
        if "ERROR" in line or output["stream"] == "stderr":
            color = "red"
            icon = "❌"
        elif "✓" in line or "completed" in line.lower() or "success" in line.lower():
            color = "green"
            icon = "✅"
        elif "WARN" in line or "warning" in line.lower():
            color = "yellow"
            icon = "⚠️"
        else:
            color = "cyan"
            icon = "🔄"

        # Only show verbose output if verbose mode enabled
        if self.verbose or output["stream"] == "stderr" or any(
            keyword in line.lower()
            for keyword in ["error", "failed", "completed", "success", "executing"]
        ):
            console.print(
                f"[dim][{timestamp}][/dim] [{color}]{icon} {adw_id_short}[/{color}]: {line}"
            )

    def check_completed_workflows(self) -> List[tuple[str, int]]:
        """Check for completed workflows and return list of (task_id, exit_code)."""
        completed = []
        for task_id, workflow in list(self.active_workflows.items()):
            process = workflow["process"]
            if process.poll() is not None:  # Process finished
                exit_code = process.returncode
                completed.append((task_id, exit_code, workflow))

        for task_id, exit_code, workflow in completed:
            self.active_workflows.pop(task_id)
            duration = (datetime.now() - workflow["started_at"]).total_seconds()

            if exit_code == 0:
                console.print(
                    f"[green]✅ Task {task_id} completed successfully "
                    f"(ADW: {workflow['adw_id'][:6]}, Duration: {duration:.0f}s)[/green]"
                )
            else:
                console.print(
                    f"[red]❌ Task {task_id} failed with exit code {exit_code} "
                    f"(ADW: {workflow['adw_id'][:6]}, Duration: {duration:.0f}s)[/red]"
                )

        return [(task_id, exit_code) for task_id, exit_code, _ in completed]


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

    def __init__(
        self,
        config: HomeServerCronConfig,
        verbose: bool = False,
        quiet: bool = False,
        log_file: Optional[str] = None,
    ):
        self.config = config
        self.task_manager = HomeServerTaskManager(
            config.home_server_url, config.tasks_endpoint
        )
        self.active_tasks: Dict[str, subprocess.Popen] = {}
        self.processed_tasks = set()
        self.workflow_monitor = WorkflowMonitor(verbose=verbose, quiet=quiet)
        self._setup_logging(log_file)

    def _setup_logging(self, log_file: Optional[str] = None) -> None:
        """Setup structured logging to file."""
        if log_file:
            log_path = Path(log_file)
        else:
            log_dir = Path(".adw_logs/cron")
            log_dir.mkdir(parents=True, exist_ok=True)
            log_path = log_dir / f"trigger_{datetime.now().strftime('%Y%m%d')}.log"

        # Structured JSON logging
        logging.basicConfig(
            filename=str(log_path),
            level=logging.INFO,
            format="%(message)s",
        )

        self.logger = logging.getLogger(__name__)

    def _log_event(self, event_type: str, **data: Any) -> None:
        """Log structured event."""
        event = {
            "timestamp": datetime.now().isoformat(),
            "event": event_type,
            **data,
        }
        self.logger.info(json.dumps(event))

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

            # Spawn workflow with monitoring
            timestamp = datetime.now().strftime("%H:%M:%S")
            console.print(
                f"[dim][{timestamp}][/dim] [cyan]🚀 Spawning workflow: {script_name} (model: {model})[/cyan]"
            )

            # Set working directory to project root (not adws/)
            project_root = Path(__file__).parent.parent.parent

            # Change to project root before spawning
            original_cwd = os.getcwd()
            os.chdir(project_root)

            try:
                process = self.workflow_monitor.spawn_workflow(
                    task.task_id, adw_id, cmd, worktree=worktree_name
                )
                self.active_tasks[task.task_id] = process
                stats["tasks_started"] += 1
                return True
            finally:
                os.chdir(original_cwd)
        except Exception as e:
            console.print(f"[red]ERROR: Failed to delegate task: {e}[/red]")
            stats["errors"] += 1
            return False

    def process_tasks(self) -> None:
        """Main polling loop - check for tasks and delegate them."""
        if shutdown_requested:
            console.print("[yellow]Shutdown requested; skipping poll cycle.[/yellow]")
            return

        # Process any queued output from running workflows
        self.workflow_monitor.process_output()

        # Check for completed workflows
        self.workflow_monitor.check_completed_workflows()

        stats["checks"] += 1
        stats["last_check"] = datetime.now().strftime("%H:%M:%S")

        # Fetch eligible tasks
        console.print(f"[dim][{datetime.now().strftime('%H:%M:%S')}][/dim] 🔍 Polling for pending tasks...")
        self._log_event("poll_start")

        tasks = self.task_manager.get_eligible_tasks(
            self.config.status_filter,
            limit=self.config.max_concurrent_tasks - len(self.active_tasks),
        )

        if not tasks:
            return

        console.print(
            f"[dim][{datetime.now().strftime('%H:%M:%S')}][/dim] [cyan]📥 Found {len(tasks)} eligible task(s)[/cyan]"
        )
        self._log_event("tasks_found", count=len(tasks))

        for task in tasks:
            if shutdown_requested:
                break

            if task.task_id in self.processed_tasks:
                continue

            # Log task discovery
            timestamp = datetime.now().strftime("%H:%M:%S")
            console.print(
                f"\n[dim][{timestamp}][/dim] [cyan]🎯 Task: {task.task_id}[/cyan]"
            )
            console.print(f"           Title: {task.title}")
            console.print(
                f"           Workflow: {task.tags.get('workflow', 'simple')} | "
                f"Model: {task.tags.get('model', 'sonnet')}"
            )

            # Generate ADW ID
            adw_id = str(uuid.uuid4())[:8]

            # Generate worktree name if not provided (include ADW ID for uniqueness/observability)
            worktree_name = task.worktree
            if not worktree_name:
                base_name = self.task_manager.generate_worktree_name(
                    task.title, prefix="feat"
                )
                if not base_name:
                    console.print(
                        f"[red]ERROR: Failed to generate worktree name for task {task.task_id}[/red]"
                    )
                    self._log_event(
                        "worktree_generation_failed", task_id=task.task_id
                    )
                    continue
                # Append ADW ID to ensure uniqueness and observability
                worktree_name = f"{base_name}-{adw_id}"

            # Create worktree if it doesn't exist
            if not self.check_worktree_exists(worktree_name):
                if not self.create_worktree(worktree_name):
                    continue
            else:
                console.print(
                    f"[dim][{datetime.now().strftime('%H:%M:%S')}][/dim] [yellow]✓ Worktree already exists: {worktree_name}[/yellow]"
                )

            # Claim the task
            if not self.task_manager.claim_task(task.task_id, adw_id, worktree_name):
                continue

            console.print(
                f"[dim][{datetime.now().strftime('%H:%M:%S')}][/dim] [green]✓ Task claimed (ADW: {adw_id}, Worktree: {worktree_name})[/green]"
            )
            self._log_event(
                "task_claimed",
                task_id=task.task_id,
                adw_id=adw_id,
                worktree=worktree_name,
            )

            # Delegate to workflow
            if self.delegate_task(task, worktree_name, adw_id):
                self.processed_tasks.add(task.task_id)
                self._log_event(
                    "workflow_started",
                    task_id=task.task_id,
                    adw_id=adw_id,
                    worktree=worktree_name,
                )

    def create_status_display(self) -> Panel:
        """Create a rich panel displaying current status."""
        # Main stats table
        stats_table = Table(show_header=False, box=None)
        stats_table.add_column(style="bold cyan")
        stats_table.add_column()

        status_color = "green" if not shutdown_requested else "yellow"
        status_text = "Running" if not shutdown_requested else "Shutting down"

        stats_table.add_row("Status", f"[{status_color}]{status_text}[/{status_color}]")
        stats_table.add_row("Polling Interval", f"{self.config.polling_interval} seconds")
        stats_table.add_row("Home Server", self.config.home_server_url.split("//")[-1])
        stats_table.add_row("Checks Performed", str(stats["checks"]))
        stats_table.add_row("Tasks Started", str(stats["tasks_started"]))
        stats_table.add_row("Worktrees Created", str(stats["worktrees_created"]))
        stats_table.add_row("Errors", str(stats["errors"]))
        stats_table.add_row("Last Check", stats["last_check"] or "Never")

        # Active tasks table
        if self.workflow_monitor.active_workflows:
            active_table = Table(show_header=True, box=box.SIMPLE)
            active_table.add_column("Task ID", style="cyan")
            active_table.add_column("ADW ID", style="dim")
            active_table.add_column("Worktree", style="bold")
            active_table.add_column("Phase", style="yellow")
            active_table.add_column("Duration", style="green")

            for task_id, workflow in self.workflow_monitor.active_workflows.items():
                duration = (datetime.now() - workflow["started_at"]).total_seconds()
                minutes = int(duration // 60)
                seconds = int(duration % 60)
                duration_str = f"{minutes:02d}:{seconds:02d}" if minutes > 0 else f"{seconds}s"

                active_table.add_row(
                    task_id[:20],
                    workflow["adw_id"][:8],
                    workflow.get("worktree", "N/A")[:20],
                    workflow.get("phase", "starting") or "starting",
                    duration_str,
                )

            # Combine into layout
            layout = Table.grid(padding=1)
            layout.add_row(stats_table)
            layout.add_row(
                Panel(
                    active_table,
                    title=f"[bold cyan]🚀 Active Tasks ({len(self.workflow_monitor.active_workflows)})[/bold cyan]",
                    border_style="cyan",
                )
            )

            return Panel(
                layout,
                title="[bold blue]🔄 Home Server Multi-Agent Cron[/bold blue]",
                border_style="blue",
            )
        else:
            return Panel(
                Align.center(stats_table),
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
@click.option(
    "--verbose",
    is_flag=True,
    help="Show detailed workflow output (stdout from workflows)",
)
@click.option(
    "--quiet",
    is_flag=True,
    help="Minimal output (errors only)",
)
@click.option(
    "--log-file",
    type=click.Path(),
    default=None,
    help="Path to log file for structured events (default: .adw_logs/cron/trigger_YYYYMMDD.log)",
)
def main(
    home_server_url: str,
    tasks_endpoint: str,
    polling_interval: int,
    max_concurrent: int,
    dry_run: bool,
    once: bool,
    verbose: bool,
    quiet: bool,
    log_file: Optional[str],
) -> None:
    """Home server cron trigger for AI Developer Workflows."""
    config = HomeServerCronConfig(
        home_server_url=home_server_url,
        tasks_endpoint=tasks_endpoint,
        polling_interval=polling_interval,
        max_concurrent_tasks=max_concurrent,
        dry_run=dry_run,
    )

    trigger = HomeServerCronTrigger(
        config, verbose=verbose, quiet=quiet, log_file=log_file
    )

    if once:
        trigger.run_once()
    else:
        trigger.run_continuous()


if __name__ == "__main__":
    main()
