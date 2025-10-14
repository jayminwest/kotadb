# /tasks:query_phase

Query tasks from the kota-tasks MCP server filtered by phase and/or status.

## Usage
```
/tasks:query_phase <phase> [status] [limit]
```

## Arguments
- `$1` (phase): Phase filter - must be one of: plan, build, test, review, document, or "all" for no filter
- `$2` (status): Optional status filter - must be one of: pending, claimed, in_progress, completed, failed, or "all" for no filter
- `$3` (limit): Optional maximum number of tasks to return (default: 100)

## Instructions
1. Validate that the phase (if not "all") is one of: plan, build, test, review, document
2. Validate that the status (if not "all") is one of: pending, claimed, in_progress, completed, failed
3. Use the tasks_api module to query tasks with appropriate filters
4. Return list of matching tasks as JSON array

## Example
```python
from adws.adw_modules.tasks_api import list_tasks

# Query all pending build tasks
tasks = list_tasks(phase="build", status="pending", limit=10)

# Query all tasks for a phase (any status)
tasks = list_tasks(phase="test", limit=50)

# Query all tasks with a specific status (any phase)
tasks = list_tasks(status="in_progress")
```

## Output Schema
Return JSON array with the following structure:
```json
{
  "type": "array",
  "items": {
    "type": "object",
    "required": ["task_id", "title", "status", "priority", "tags"],
    "properties": {
      "task_id": {"type": "string"},
      "title": {"type": "string"},
      "description": {"type": "string"},
      "status": {"type": "string"},
      "priority": {"type": "string"},
      "tags": {
        "type": "object",
        "properties": {
          "phase": {"type": "string"},
          "issue_number": {"type": "string"},
          "worktree": {"type": "string"}
        }
      },
      "created_at": {"type": "string"},
      "updated_at": {"type": "string"}
    }
  }
}
```

## Error Handling
- Invalid phase: Return error with list of valid phases
- Invalid status: Return error with list of valid statuses
- MCP server unavailable: Return error with connectivity troubleshooting steps
- Query failed: Return error with server response

## Use Cases
1. **Trigger polling**: Query pending tasks for a specific phase to find work
2. **Status monitoring**: Check in_progress tasks to track active workflows
3. **Debugging**: Query failed tasks to investigate errors
4. **Metrics**: Count completed tasks per phase for observability

## Implementation
Create a Python script that uses the tasks_api module and execute it:

```python
#!/usr/bin/env python3
"""Query tasks by phase and status via kota-tasks MCP API."""

import json
import sys
from pathlib import Path

# Add automation directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "automation"))

from adws.adw_modules.tasks_api import (
    list_tasks,
    TaskValidationError,
    MCPServerError
)

def main():
    # Parse arguments
    phase_arg = "$1"
    status_arg = "$2" if "$2" else "all"
    limit_arg = "$3" if "$3" else "100"

    # Validate required args
    if not phase_arg:
        print(json.dumps({
            "error": "Missing required arguments",
            "usage": "/tasks:query_phase <phase> [status] [limit]"
        }), file=sys.stderr)
        sys.exit(1)

    # Parse limit
    try:
        limit = int(limit_arg)
    except ValueError:
        print(json.dumps({
            "error": "Invalid limit",
            "message": "Limit must be an integer"
        }), file=sys.stderr)
        sys.exit(1)

    # Build filters
    phase = None if phase_arg == "all" else phase_arg
    status = None if status_arg == "all" else status_arg

    try:
        # Query tasks
        tasks = list_tasks(
            phase=phase,
            status=status,
            limit=limit
        )

        # Return results
        result = {
            "count": len(tasks),
            "filters": {
                "phase": phase or "all",
                "status": status or "all",
                "limit": limit
            },
            "tasks": tasks
        }
        print(json.dumps(result, indent=2))

    except TaskValidationError as e:
        print(json.dumps({
            "error": "Validation failed",
            "message": str(e)
        }), file=sys.stderr)
        sys.exit(1)

    except MCPServerError as e:
        print(json.dumps({
            "error": "MCP server error",
            "message": str(e),
            "troubleshooting": [
                "Check MCP server is running",
                "Verify .mcp.json configuration",
                "Test connectivity: claude --mcp kota-tasks__tasks_list --args '{\"project_id\":\"kotadb\"}'"
            ]
        }), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
```

## Examples

### Query pending build tasks
```bash
/tasks:query_phase build pending 10
```

Returns:
```json
{
  "count": 3,
  "filters": {"phase": "build", "status": "pending", "limit": 10},
  "tasks": [
    {
      "task_id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Build phase: Issue #110",
      "status": "pending",
      "priority": "high",
      "tags": {"phase": "build", "issue_number": "110", "worktree": "feat-110-example"}
    }
  ]
}
```

### Query all in-progress tasks
```bash
/tasks:query_phase all in_progress
```

Returns all tasks currently being executed, regardless of phase.

### Query completed test tasks
```bash
/tasks:query_phase test completed 50
```

Returns up to 50 completed test phase tasks for metrics/observability.
