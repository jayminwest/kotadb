# Cron Trigger Stdout Enhancement Specification

**Version**: 1.0
**Date**: 2025-10-11
**Purpose**: Enhance observability and real-time feedback in the ADW cron trigger script

---

## Overview

Currently, the trigger script (`adw_trigger_cron_homeserver.py`) spawns workflow scripts as detached background processes, making it difficult to see real-time progress. This spec defines enhancements to provide better stdout communication and observability.

---

## Goals

1. **Real-time visibility**: Show what each spawned workflow is doing
2. **Error transparency**: Surface errors from workflows immediately
3. **Progress tracking**: Display status updates as tasks progress through phases
4. **Historical logging**: Persist logs for debugging and analysis
5. **Rich UI**: Use colored panels and tables for clear visual hierarchy

---

## Enhanced Status Display

### Current Status Panel (Baseline)

```
╭─────────────────────────── 🔄 Home Server Multi-Agent Cron ────────────────────────────╮
│                  Status             Running                                            │
│                  Polling Interval   15 seconds                                         │
│                  Home Server        <YOUR_HOMESERVER>.ts.net                  │
│                  Checks Performed   5                                                  │
│                  Tasks Started      3                                                  │
│                  Worktrees Created  2                                                  │
│                  Errors             0                                                  │
│                  Last Check         14:35:42                                           │
╰────────────────────────────────────────────────────────────────────────────────────────╯
```

### Enhanced Active Tasks Panel (New)

Add a second panel showing currently running tasks:

```
╭───────────────────────────── 🚀 Active Tasks (2) ─────────────────────────────────────╮
│ Task ID          ADW ID    Worktree              Phase      Status      Duration       │
│ ─────────────────────────────────────────────────────────────────────────────────────  │
│ issue-47         d081c104  feat-fulltext-search  implement  Running     00:03:42       │
│ issue-52         a3f9b221  fix-rate-limit-bug    build      Running     00:01:15       │
╰────────────────────────────────────────────────────────────────────────────────────────╯
```

### Task Lifecycle Events (New)

Print timestamped events for each major action:

```
[14:35:22] 📥 Found 1 eligible task(s)
[14:35:22] 🎯 Task: issue-47 - "Optimize search with full-text search"
[14:35:22] ✓ Task claimed (ADW: d081c104, Worktree: feat-fulltext-search)
[14:35:23] ✓ Worktree created: feat-fulltext-search
[14:35:23] 🚀 Spawning workflow: adw_plan_implement_update_homeserver_task.py (model: sonnet)
[14:35:24] 🔄 Task d081c104: status → in_progress
[14:36:45] 📝 Task d081c104: phase → plan (completed)
[14:38:52] 📝 Task d081c104: phase → implement (in progress)
[14:42:15] ✅ Task d081c104: completed (commit: a1b2c3d4)
[14:42:15] 📊 Duration: 6m 53s | Files modified: 3 | Tests: passed
```

---

## Implementation Approach

### 1. Background Process Monitoring

**Current**: Workflows spawn as detached processes with no stdout capture

**Enhanced**: Capture stdout/stderr while allowing processes to run in background

```python
import subprocess
import threading
from queue import Queue

class WorkflowMonitor:
    """Monitor background workflow processes and stream their output."""

    def __init__(self):
        self.active_workflows = {}  # task_id -> WorkflowProcess
        self.output_queue = Queue()

    def spawn_workflow(self, task_id: str, adw_id: str, cmd: List[str]) -> subprocess.Popen:
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
            args=(process.stdout, task_id, adw_id, "stdout")
        )
        stderr_thread = threading.Thread(
            target=self._read_stream,
            args=(process.stderr, task_id, adw_id, "stderr")
        )

        stdout_thread.daemon = True
        stderr_thread.daemon = True
        stdout_thread.start()
        stderr_thread.start()

        self.active_workflows[task_id] = {
            "process": process,
            "adw_id": adw_id,
            "started_at": datetime.now(),
            "phase": None,
            "status": "running",
        }

        return process

    def _read_stream(self, stream, task_id: str, adw_id: str, stream_type: str):
        """Read lines from process stream and queue them for display."""
        try:
            for line in iter(stream.readline, ''):
                if line:
                    self.output_queue.put({
                        "task_id": task_id,
                        "adw_id": adw_id,
                        "stream": stream_type,
                        "line": line.strip(),
                        "timestamp": datetime.now()
                    })
        finally:
            stream.close()

    def process_output(self):
        """Process queued output lines and display them."""
        while not self.output_queue.empty():
            output = self.output_queue.get()
            self._display_workflow_output(output)

    def _display_workflow_output(self, output: dict):
        """Display workflow output with formatting."""
        timestamp = output["timestamp"].strftime("%H:%M:%S")
        adw_id_short = output["adw_id"][:6]
        line = output["line"]

        # Parse special markers for phase detection
        if "Executing /plan template" in line:
            self.active_workflows[output["task_id"]]["phase"] = "plan"
        elif "Executing /implement template" in line:
            self.active_workflows[output["task_id"]]["phase"] = "implement"
        elif "Executing /build template" in line:
            self.active_workflows[output["task_id"]]["phase"] = "build"

        # Color based on content
        if "ERROR" in line or output["stream"] == "stderr":
            color = "red"
            icon = "❌"
        elif "✓" in line or "completed" in line.lower():
            color = "green"
            icon = "✅"
        else:
            color = "cyan"
            icon = "🔄"

        console.print(f"[{timestamp}] [{color}]{icon} {adw_id_short}[/{color}]: {line}")

    def check_completed_workflows(self):
        """Check for completed workflows and clean them up."""
        completed = []
        for task_id, workflow in self.active_workflows.items():
            process = workflow["process"]
            if process.poll() is not None:  # Process finished
                exit_code = process.returncode
                completed.append((task_id, exit_code))

        for task_id, exit_code in completed:
            workflow = self.active_workflows.pop(task_id)
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
```

### 2. Enhanced Process Loop

Update the main `process_tasks()` method to use the monitor:

```python
class HomeServerCronTrigger:
    def __init__(self, config: HomeServerCronConfig):
        # ... existing init ...
        self.workflow_monitor = WorkflowMonitor()

    def process_tasks(self) -> None:
        """Main polling loop with enhanced output."""
        # Process any queued output from running workflows
        self.workflow_monitor.process_output()

        # Check for completed workflows
        self.workflow_monitor.check_completed_workflows()

        # ... existing task fetching logic ...

        for task in tasks:
            # ... existing claim/worktree logic ...

            # Spawn workflow with monitoring
            cmd = [...]  # Build command
            console.print(
                f"[cyan]🚀 Spawning workflow for task {task.task_id} "
                f"(ADW: {adw_id}, Model: {model})[/cyan]"
            )

            self.workflow_monitor.spawn_workflow(task.task_id, adw_id, cmd)

    def create_status_display(self) -> Panel:
        """Enhanced status display with active tasks."""
        # Main stats table
        stats_table = Table(show_header=False, box=None)
        # ... existing stats ...

        # Active tasks table
        active_table = Table(show_header=True, box=box.SIMPLE)
        active_table.add_column("Task ID", style="cyan")
        active_table.add_column("ADW ID", style="dim")
        active_table.add_column("Worktree", style="bold")
        active_table.add_column("Phase", style="yellow")
        active_table.add_column("Duration", style="green")

        for task_id, workflow in self.workflow_monitor.active_workflows.items():
            duration = (datetime.now() - workflow["started_at"]).total_seconds()
            active_table.add_row(
                task_id[:20],
                workflow["adw_id"][:8],
                workflow.get("worktree", "N/A")[:20],
                workflow.get("phase", "starting") or "starting",
                f"{duration:.0f}s"
            )

        # Combine into layout
        layout = Table.grid(padding=1)
        layout.add_row(stats_table)
        if self.workflow_monitor.active_workflows:
            layout.add_row(active_table)

        return Panel(
            layout,
            title="[bold blue]🔄 Home Server Multi-Agent Cron[/bold blue]",
            border_style="blue"
        )
```

### 3. Structured Logging

Add file-based logging for historical analysis:

```python
import logging
from pathlib import Path

class HomeServerCronTrigger:
    def __init__(self, config: HomeServerCronConfig):
        # ... existing init ...
        self._setup_logging()

    def _setup_logging(self):
        """Setup structured logging to file."""
        log_dir = Path(".adw_logs/cron")
        log_dir.mkdir(parents=True, exist_ok=True)

        log_file = log_dir / f"trigger_{datetime.now().strftime('%Y%m%d')}.log"

        # Structured JSON logging
        logging.basicConfig(
            filename=str(log_file),
            level=logging.INFO,
            format='%(message)s'
        )

        self.logger = logging.getLogger(__name__)

    def _log_event(self, event_type: str, **data):
        """Log structured event."""
        event = {
            "timestamp": datetime.now().isoformat(),
            "event": event_type,
            **data
        }
        self.logger.info(json.dumps(event))

# Usage:
self._log_event("task_claimed", task_id=task.task_id, adw_id=adw_id, worktree=worktree_name)
self._log_event("workflow_started", task_id=task.task_id, adw_id=adw_id, script=script_name)
self._log_event("task_completed", task_id=task.task_id, adw_id=adw_id, duration=duration)
```

**Log Format Example**:
```json
{"timestamp": "2025-10-11T14:35:22Z", "event": "task_claimed", "task_id": "issue-47", "adw_id": "d081c104", "worktree": "feat-fulltext-search"}
{"timestamp": "2025-10-11T14:35:23Z", "event": "workflow_started", "task_id": "issue-47", "adw_id": "d081c104", "script": "adw_plan_implement_update_homeserver_task.py"}
{"timestamp": "2025-10-11T14:42:15Z", "event": "task_completed", "task_id": "issue-47", "adw_id": "d081c104", "duration": 413.2}
```

---

## Enhanced Output Examples

### Startup

```
╭───────────────────────────── 🔄 Home Server Multi-Agent Cron ──────────────────────────────╮
│                     Status             Running                                             │
│                     Polling Interval   15 seconds                                          │
│                     Home Server        <YOUR_HOMESERVER>.ts.net                   │
│                     Endpoint           /api/tasks/kotadb                                   │
│                     Max Concurrent     3 tasks                                             │
│                     Worktree Base      trees/                                              │
│                     Checks Performed   0                                                   │
│                     Tasks Started      0                                                   │
│                     Worktrees Created  0                                                   │
│                     Errors             0                                                   │
│                     Last Check         Never                                               │
╰────────────────────────────────────────────────────────────────────────────────────────────╯

[14:35:00] ℹ️  Cron trigger started
[14:35:00] ℹ️  Press Ctrl+C to gracefully shutdown
```

### Task Discovery & Execution

```
[14:35:15] 🔍 Polling for pending tasks...
[14:35:15] 📥 Found 2 eligible task(s)

[14:35:15] 🎯 Task #1: issue-47
           Title: Optimize search with PostgreSQL full-text search
           Workflow: complex | Model: sonnet

[14:35:16] ✓ Task claimed (ADW: d081c104, Worktree: feat-fulltext-search)
[14:35:17] ✓ Worktree created: trees/feat-fulltext-search
[14:35:17] 🚀 Spawning workflow: adw_plan_implement_update_homeserver_task.py
[14:35:18] 🔄 d081c1: Starting complex workflow (plan+implement)
[14:35:18] 🔄 d081c1: Working in: /Users/jayminwest/Projects/kota-db-ts/trees/feat-fulltext-search
[14:35:19] 📡 d081c1: Updated home server → in_progress

[14:35:20] 🎯 Task #2: issue-52
           Title: Fix rate limiting edge case
           Workflow: simple | Model: sonnet

[14:35:21] ✓ Task claimed (ADW: a3f9b221, Worktree: fix-rate-limit-bug)
[14:35:22] ✓ Worktree already exists: trees/fix-rate-limit-bug
[14:35:22] 🚀 Spawning workflow: adw_build_update_homeserver_task.py
[14:35:23] 🔄 a3f9b2: Starting simple build workflow
[14:35:24] 📡 a3f9b2: Updated home server → in_progress

╭───────────────────────────── 🚀 Active Tasks (2) ──────────────────────────────────────╮
│ Task ID    ADW ID    Worktree               Phase      Duration                         │
│ ─────────────────────────────────────────────────────────────────────────────────────── │
│ issue-47   d081c104  feat-fulltext-search   plan       00:00:12                         │
│ issue-52   a3f9b221  fix-rate-limit-bug     build      00:00:05                         │
╰─────────────────────────────────────────────────────────────────────────────────────────╯
```

### Phase Updates

```
[14:36:45] 📝 d081c1: Executing /plan template
[14:37:32] ✅ d081c1: Planning completed
[14:37:32] 📄 d081c1: Plan created: docs/specs/plan-d081c104.md
[14:37:33] 📝 d081c1: Executing /implement template
[14:38:15] 🔄 d081c1: Modified: app/src/api/queries.ts
[14:38:42] 🔄 d081c1: Created: app/src/db/migrations/0012_fulltext_search_index.sql
[14:39:10] 🔄 d081c1: Modified: app/tests/api/authenticated-routes.test.ts
[14:40:25] ✓ d081c1: Type-check passed
[14:41:50] ✓ d081c1: Tests passed (133/133)
```

### Completion

```
[14:42:15] ✅ d081c1: Implementation completed
[14:42:15] 📦 d081c1: Commit: a1b2c3d4e5f6
[14:42:16] 📡 d081c1: Updated home server → completed
[14:42:16] 📊 d081c1: Summary
           • Duration: 6m 53s
           • Files modified: 3
           • Commit: a1b2c3d4e5f6
           • Tests: passed (133/133)
           • Type-check: passed

[14:42:16] ✅ Task issue-47 completed successfully (ADW: d081c1, Duration: 413s)

╭───────────────────────────── 🚀 Active Tasks (1) ──────────────────────────────────────╮
│ Task ID    ADW ID    Worktree               Phase      Duration                         │
│ ─────────────────────────────────────────────────────────────────────────────────────── │
│ issue-52   a3f9b221  fix-rate-limit-bug     build      00:07:02                         │
╰─────────────────────────────────────────────────────────────────────────────────────────╯
```

### Errors

```
[14:43:22] ❌ a3f9b2: Build failed: Type check failed
[14:43:22] ❌ a3f9b2: app/src/auth/middleware.ts:42 - Property 'tier' does not exist on type 'AuthContext'
[14:43:23] 📡 a3f9b2: Updated home server → failed
[14:43:23] ❌ Task issue-52 failed with exit code 1 (ADW: a3f9b2, Duration: 481s)
```

---

## Command-Line Options

Add flags for controlling output verbosity:

```python
@click.option(
    "--verbose",
    is_flag=True,
    help="Show detailed workflow output (stdout from workflows)"
)
@click.option(
    "--quiet",
    is_flag=True,
    help="Minimal output (errors only)"
)
@click.option(
    "--log-file",
    type=click.Path(),
    default=".adw_logs/cron/trigger.log",
    help="Path to log file for structured events"
)
```

**Usage**:
```bash
# Default: Balanced output with status updates
uv run automation/adws/adw_triggers/adw_trigger_cron_homeserver.py

# Verbose: Show all workflow stdout/stderr
uv run automation/adws/adw_triggers/adw_trigger_cron_homeserver.py --verbose

# Quiet: Only show errors and final results
uv run automation/adws/adw_triggers/adw_trigger_cron_homeserver.py --quiet

# Custom log location
uv run automation/adws/adw_triggers/adw_trigger_cron_homeserver.py --log-file /var/log/adw-cron.log
```

---

## Implementation Checklist

- [ ] Add `WorkflowMonitor` class for background process monitoring
- [ ] Implement stdout/stderr capture with threading
- [ ] Parse workflow output for phase detection
- [ ] Add structured JSON logging to files
- [ ] Create enhanced status display with active tasks panel
- [ ] Add timestamped event logging for task lifecycle
- [ ] Implement command-line flags (--verbose, --quiet, --log-file)
- [ ] Add color-coded output based on event type
- [ ] Handle process completion detection and cleanup
- [ ] Add duration tracking for active tasks
- [ ] Test with multiple concurrent workflows

---

## Benefits

1. **Debugging**: Instantly see what's failing and why
2. **Monitoring**: Track multiple tasks running in parallel
3. **Confidence**: Know the system is working without checking databases
4. **Historical analysis**: JSON logs enable metrics and alerting
5. **User experience**: Clear visual feedback builds trust in automation

---

**End of Specification**
