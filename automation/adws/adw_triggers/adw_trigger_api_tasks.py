#!/usr/bin/env uv run
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pydantic",
#     "python-dotenv",
#     "click",
#     "rich",
# ]
# ///

"""API-driven trigger for phase-level ADW task orchestration.

This trigger polls the kota-tasks MCP server for pending phase tasks and
routes them to the appropriate phase scripts. It enables API-driven workflow
orchestration with phase-level granularity.

Usage:
    # Run continuous polling
    uv run automation/adws/adw_triggers/adw_trigger_api_tasks.py --verbose

    # Run single check and exit
    uv run automation/adws/adw_triggers/adw_trigger_api_tasks.py --once

    # Dry run (no execution)
    uv run automation/adws/adw_triggers/adw_trigger_api_tasks.py --dry-run --verbose --once
"""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

# Add parent directory to path for module imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from adws.adw_modules.tasks_api import (
    MCPServerError,
    TaskValidationError,
    list_tasks,
    update_task_status,
)
from adws.adw_modules.data_types import TaskStatus
from adws.adw_modules.utils import load_adw_env

load_adw_env()

console = Console()
shutdown_requested = False

# Statistics tracking
stats = {
    "checks": 0,
    "tasks_claimed": 0,
    "tasks_completed": 0,
    "tasks_failed": 0,
    "errors": 0,
    "last_check": None,
    "uptime_start": time.time(),
}


def signal_handler(signum: int, _frame: object) -> None:
    """Handle shutdown signals gracefully."""
    global shutdown_requested
    console.print(
        f"\n[yellow]INFO: Received signal {signum}; shutting down after current cycle.[/yellow]"
    )
    shutdown_requested = True


class PhaseTaskExecutor:
    """Executes phase tasks by routing to appropriate phase scripts."""

    def __init__(
        self,
        dry_run: bool = False,
        verbose: bool = False,
        max_concurrent: int = 5,
        log_file: Optional[str] = None
    ):
        self.dry_run = dry_run
        self.verbose = verbose
        self.max_concurrent = max_concurrent
        self.active_tasks: Dict[str, subprocess.Popen] = {}
        self.processed_task_ids = set()

        # Setup logging
        self._setup_logging(log_file)

    def _setup_logging(self, log_file: Optional[str] = None) -> None:
        """Setup structured logging to file."""
        project_root = Path(__file__).parent.parent.parent

        if log_file:
            log_path = Path(log_file)
            if not log_path.is_absolute():
                log_path = project_root / log_path
        else:
            log_dir = project_root / ".adw_logs" / "api_trigger"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_path = log_dir / f"{datetime.now().strftime('%Y%m%d')}.log"

        # Structured JSON logging
        logging.basicConfig(
            filename=str(log_path),
            level=logging.INFO,
            format="%(message)s",
        )

        self.logger = logging.getLogger(__name__)
        console.print(f"[dim]Logging to: {log_path}[/dim]")

    def _log_event(self, event_type: str, **data: Any) -> None:
        """Log structured event."""
        event = {
            "timestamp": datetime.now().isoformat(),
            "event": event_type,
            **data,
        }
        self.logger.info(json.dumps(event))

    def get_phase_script(self, phase: str) -> Optional[Path]:
        """Return the path to the phase script for a given phase."""
        phase_scripts = {
            "plan": "adw_plan.py",
            "build": "adw_build.py",
            "test": "adw_test.py",
            "review": "adw_review.py",
            "document": "adw_document.py"
        }

        script_name = phase_scripts.get(phase)
        if not script_name:
            return None

        script_path = Path(__file__).parent.parent / "adw_phases" / script_name
        return script_path if script_path.exists() else None

    def execute_phase_task(self, task: Dict[str, Any]) -> bool:
        """Execute a phase task by invoking the appropriate phase script.

        Args:
            task: Task dictionary from MCP API

        Returns:
            True if task execution started successfully, False otherwise
        """
        task_id = task["task_id"]
        tags = task.get("tags", {})
        phase = tags.get("phase")
        issue_number = tags.get("issue_number")
        worktree = tags.get("worktree")
        adw_id = tags.get("parent_adw_id", "unknown")

        # Validate required fields
        if not all([phase, issue_number, worktree]):
            console.print(
                f"[red]ERROR: Task {task_id} missing required tags (phase/issue_number/worktree)[/red]"
            )
            self._log_event(
                "task_validation_failed",
                task_id=task_id,
                reason="missing_required_tags"
            )
            # Mark task as failed
            update_task_status(
                task_id=task_id,
                status=TaskStatus.FAILED,
                error="Missing required tags: phase, issue_number, or worktree"
            )
            stats["errors"] += 1
            return False

        # Get phase script
        script_path = self.get_phase_script(phase)
        if not script_path:
            console.print(
                f"[red]ERROR: No phase script found for phase '{phase}'[/red]"
            )
            self._log_event(
                "phase_script_not_found",
                task_id=task_id,
                phase=phase
            )
            # Mark task as failed
            update_task_status(
                task_id=task_id,
                status=TaskStatus.FAILED,
                error=f"No phase script found for phase '{phase}'"
            )
            stats["errors"] += 1
            return False

        # Build command for phase script
        # Phase scripts expect: --adw-id, --worktree-name, and phase-specific args
        cmd = [
            "uv",
            "run",
            str(script_path),
            "--adw-id",
            adw_id,
            "--worktree-name",
            worktree,
            "--issue-number",
            issue_number,
            "--task-id",
            task_id,
        ]

        if self.dry_run:
            console.print(f"[cyan]DRY RUN: Would execute: {' '.join(cmd)}[/cyan]")
            self._log_event(
                "dry_run_phase_task",
                task_id=task_id,
                phase=phase,
                command=" ".join(cmd)
            )
            return True

        # Mark task as in_progress
        try:
            success = update_task_status(
                task_id=task_id,
                status=TaskStatus.IN_PROGRESS
            )
            if not success:
                console.print(
                    f"[yellow]WARN: Failed to update task {task_id} to in_progress[/yellow]"
                )
        except Exception as e:
            console.print(
                f"[yellow]WARN: Exception updating task status: {e}[/yellow]"
            )

        # Execute phase script
        try:
            timestamp = datetime.now().strftime("%H:%M:%S")
            console.print(
                f"[dim][{timestamp}][/dim] [cyan]🚀 Executing {phase} phase: {task_id[:8]}[/cyan]"
            )
            if self.verbose:
                console.print(f"           Command: {' '.join(cmd)}")

            # Change to project root for execution
            project_root = Path(__file__).parent.parent.parent
            original_cwd = os.getcwd()
            os.chdir(project_root)

            try:
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE if not self.verbose else None,
                    stderr=subprocess.PIPE if not self.verbose else None,
                    text=True
                )

                self.active_tasks[task_id] = process
                stats["tasks_claimed"] += 1

                self._log_event(
                    "phase_task_started",
                    task_id=task_id,
                    phase=phase,
                    issue_number=issue_number,
                    worktree=worktree,
                    adw_id=adw_id
                )

                return True
            finally:
                os.chdir(original_cwd)

        except Exception as e:
            console.print(
                f"[red]ERROR: Failed to execute phase task {task_id}: {e}[/red]"
            )
            self._log_event(
                "phase_task_execution_failed",
                task_id=task_id,
                phase=phase,
                error=str(e)
            )
            # Mark task as failed
            update_task_status(
                task_id=task_id,
                status=TaskStatus.FAILED,
                error=f"Execution failed: {e}"
            )
            stats["errors"] += 1
            return False

    def check_completed_tasks(self) -> None:
        """Check for completed task processes and update their status."""
        completed = []

        for task_id, process in list(self.active_tasks.items()):
            if process.poll() is not None:  # Process finished
                exit_code = process.returncode
                completed.append((task_id, exit_code))

        for task_id, exit_code in completed:
            self.active_tasks.pop(task_id)

            if exit_code == 0:
                console.print(
                    f"[green]✅ Task {task_id[:8]} completed successfully[/green]"
                )
                stats["tasks_completed"] += 1
                self._log_event(
                    "phase_task_completed",
                    task_id=task_id,
                    exit_code=exit_code
                )
                # Update task status to completed
                update_task_status(
                    task_id=task_id,
                    status=TaskStatus.COMPLETED,
                    result={"exit_code": exit_code}
                )
            else:
                console.print(
                    f"[red]❌ Task {task_id[:8]} failed with exit code {exit_code}[/red]"
                )
                stats["tasks_failed"] += 1
                self._log_event(
                    "phase_task_failed",
                    task_id=task_id,
                    exit_code=exit_code
                )
                # Update task status to failed
                update_task_status(
                    task_id=task_id,
                    status=TaskStatus.FAILED,
                    error=f"Phase script exited with code {exit_code}"
                )

    def poll_and_execute(self) -> None:
        """Poll for pending phase tasks and execute them."""
        if shutdown_requested:
            console.print("[yellow]Shutdown requested; skipping poll cycle.[/yellow]")
            return

        # Check for completed tasks first
        self.check_completed_tasks()

        # Update stats
        stats["checks"] += 1
        stats["last_check"] = datetime.now().strftime("%H:%M:%S")

        # Calculate available capacity
        available_slots = self.max_concurrent - len(self.active_tasks)
        if available_slots <= 0:
            if self.verbose:
                console.print(
                    f"[dim]Max concurrent tasks reached ({self.max_concurrent}), skipping poll[/dim]"
                )
            return

        # Fetch pending tasks from MCP API
        console.print(
            f"[dim][{datetime.now().strftime('%H:%M:%S')}][/dim] 🔍 Polling for pending phase tasks..."
        )
        self._log_event("poll_start", available_slots=available_slots)

        try:
            tasks = list_tasks(
                status=TaskStatus.PENDING,
                limit=available_slots
            )
        except (MCPServerError, TaskValidationError) as e:
            console.print(f"[red]ERROR: Failed to fetch tasks from MCP API: {e}[/red]")
            stats["errors"] += 1
            self._log_event("poll_failed", error=str(e))
            return
        except Exception as e:
            console.print(f"[red]ERROR: Unexpected error polling tasks: {e}[/red]")
            stats["errors"] += 1
            self._log_event("poll_error", error=str(e))
            return

        # Filter tasks with phase tags
        phase_tasks = [
            t for t in tasks
            if t.get("tags", {}).get("phase") is not None
            and t["task_id"] not in self.processed_task_ids
        ]

        if not phase_tasks:
            if self.verbose:
                console.print("[dim]No pending phase tasks found[/dim]")
            return

        console.print(
            f"[dim][{datetime.now().strftime('%H:%M:%S')}][/dim] [cyan]📥 Found {len(phase_tasks)} pending phase task(s)[/cyan]"
        )
        self._log_event("tasks_found", count=len(phase_tasks))

        # Execute tasks
        for task in phase_tasks:
            if shutdown_requested:
                break

            if len(self.active_tasks) >= self.max_concurrent:
                console.print(
                    f"[yellow]Max concurrent limit reached ({self.max_concurrent}), deferring remaining tasks[/yellow]"
                )
                break

            task_id = task["task_id"]
            phase = task.get("tags", {}).get("phase", "unknown")

            timestamp = datetime.now().strftime("%H:%M:%S")
            console.print(
                f"\n[dim][{timestamp}][/dim] [cyan]🎯 Task: {task_id[:20]}[/cyan]"
            )
            console.print(f"           Phase: {phase}")
            console.print(f"           Title: {task.get('title', 'N/A')}")

            # Execute the phase task
            if self.execute_phase_task(task):
                self.processed_task_ids.add(task_id)

    def create_status_display(self) -> Panel:
        """Create a rich panel displaying current status."""
        stats_table = Table(show_header=False, box=None)
        stats_table.add_column(style="bold cyan")
        stats_table.add_column()

        status_color = "green" if not shutdown_requested else "yellow"
        status_text = "Running" if not shutdown_requested else "Shutting down"

        stats_table.add_row("Status", f"[{status_color}]{status_text}[/{status_color}]")
        stats_table.add_row("Max Concurrent", str(self.max_concurrent))
        stats_table.add_row("Active Tasks", str(len(self.active_tasks)))
        stats_table.add_row("Checks Performed", str(stats["checks"]))
        stats_table.add_row("Tasks Claimed", str(stats["tasks_claimed"]))
        stats_table.add_row("Tasks Completed", str(stats["tasks_completed"]))
        stats_table.add_row("Tasks Failed", str(stats["tasks_failed"]))
        stats_table.add_row("Errors", str(stats["errors"]))
        stats_table.add_row("Last Check", stats["last_check"] or "Never")

        return Panel(
            stats_table,
            title="[bold blue]🔄 API-Driven Phase Task Trigger[/bold blue]",
            border_style="blue",
        )


@click.command()
@click.option(
    "--polling-interval",
    default=10,
    type=int,
    help="Polling interval in seconds (default: 10)",
)
@click.option(
    "--max-concurrent",
    default=5,
    type=int,
    help="Maximum concurrent phase tasks (default: 5)",
)
@click.option(
    "--dry-run",
    is_flag=True,
    help="Run without executing phase scripts",
)
@click.option(
    "--once",
    is_flag=True,
    help="Run once and exit (no continuous polling)",
)
@click.option(
    "--verbose",
    is_flag=True,
    help="Show detailed output",
)
@click.option(
    "--log-file",
    type=click.Path(),
    default=None,
    help="Path to log file for structured events (default: .adw_logs/api_trigger/YYYYMMDD.log)",
)
def main(
    polling_interval: int,
    max_concurrent: int,
    dry_run: bool,
    once: bool,
    verbose: bool,
    log_file: Optional[str],
) -> None:
    """API-driven trigger for phase-level ADW task orchestration.

    Polls the kota-tasks MCP server for pending phase tasks and routes them
    to the appropriate phase scripts (plan, build, test, review, document).
    """
    executor = PhaseTaskExecutor(
        dry_run=dry_run,
        verbose=verbose,
        max_concurrent=max_concurrent,
        log_file=log_file
    )

    console.print(executor.create_status_display())

    if once:
        # Run single check and exit
        executor.poll_and_execute()
        # Wait for active tasks to complete
        while executor.active_tasks:
            time.sleep(1)
            executor.check_completed_tasks()
        console.print("[green]Single check completed[/green]")
    else:
        # Run continuous polling
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        while not shutdown_requested:
            executor.poll_and_execute()
            time.sleep(polling_interval)

        # Wait for active tasks to complete before exiting
        if executor.active_tasks:
            console.print(
                f"[yellow]Waiting for {len(executor.active_tasks)} active task(s) to complete...[/yellow]"
            )
            while executor.active_tasks:
                time.sleep(1)
                executor.check_completed_tasks()

        console.print("[yellow]API trigger exiting[/yellow]")


if __name__ == "__main__":
    main()
