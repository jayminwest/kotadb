# /tasks:update_status

**Template Category**: Action
**Prompt Level**: 2 (Parameterized)

Update the status of an existing task in the kota-tasks MCP server.

## Usage
```
/tasks:update_status <task_id> <status> [result_json] [error_message]
```

## Arguments
- `$1` (task_id): Task ID (UUID string)
- `$2` (status): New status - must be one of: pending, claimed, in_progress, completed, failed
- `$3` (result_json): Optional result data as JSON string (for completed tasks)
- `$4` (error_message): Optional error message (for failed tasks)

## Instructions
1. Validate that the status is one of: pending, claimed, in_progress, completed, failed
2. Parse result_json if provided
3. Use the tasks_api module to update the task status
4. Return success confirmation or error message

## Status Transitions
Valid transitions:
- pending → claimed (when trigger picks up task)
- claimed → in_progress (when phase script starts execution)
- in_progress → completed (phase succeeded)
- in_progress → failed (phase failed)
- Any status → pending (for retry scenarios)

## Example
```python
from adws.adw_modules.tasks_api import update_task_status

# Mark task as in progress
success = update_task_status(
    task_id="$1",
    status="$2"
)

# Mark task as completed with result
success = update_task_status(
    task_id="$1",
    status="completed",
    result={"exit_code": 0, "duration_seconds": 120}
)

# Mark task as failed with error
success = update_task_status(
    task_id="$1",
    status="failed",
    error="Build failed: compilation errors"
)
```

## Output Schema
Return JSON with the following structure:
```json
{
  "type": "object",
  "required": ["success", "task_id", "status"],
  "properties": {
    "success": {"type": "boolean"},
    "task_id": {"type": "string"},
    "status": {"type": "string"},
    "message": {"type": "string"}
  }
}
```

## Error Handling
- Invalid status: Return error with list of valid statuses
- Task not found: Return error indicating task doesn't exist
- MCP server unavailable: Return error with connectivity troubleshooting steps
- Update failed: Return error with server response

## Implementation
Create a Python script that uses the tasks_api module and execute it:

```python
#!/usr/bin/env python3
"""Update task status via kota-tasks MCP API."""

import json
import sys
from pathlib import Path

# Add automation directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "automation"))

from adws.adw_modules.tasks_api import (
    update_task_status,
    TaskValidationError,
    MCPServerError
)

def main():
    # Parse arguments
    task_id = "$1"
    status = "$2"
    result_json = "$3" if "$3" else None
    error_message = "$4" if "$4" else None

    # Validate required args
    if not task_id or not status:
        print(json.dumps({
            "error": "Missing required arguments",
            "usage": "/tasks:update_status <task_id> <status> [result_json] [error_message]"
        }), file=sys.stderr)
        sys.exit(1)

    # Parse result JSON if provided
    result_data = None
    if result_json:
        try:
            result_data = json.loads(result_json)
        except json.JSONDecodeError as e:
            print(json.dumps({
                "error": "Invalid result JSON",
                "message": str(e)
            }), file=sys.stderr)
            sys.exit(1)

    try:
        # Update status
        success = update_task_status(
            task_id=task_id,
            status=status,
            result=result_data,
            error=error_message
        )

        # Return result
        result = {
            "success": success,
            "task_id": task_id,
            "status": status,
            "message": f"Task status updated to '{status}'" if success else "Update failed"
        }
        print(json.dumps(result, indent=2))

        sys.exit(0 if success else 1)

    except TaskValidationError as e:
        print(json.dumps({
            "success": False,
            "error": "Validation failed",
            "message": str(e)
        }), file=sys.stderr)
        sys.exit(1)

    except MCPServerError as e:
        print(json.dumps({
            "success": False,
            "error": "MCP server error",
            "message": str(e),
            "troubleshooting": [
                "Check MCP server is running",
                "Verify task_id exists",
                "Test connectivity: claude --mcp kota-tasks__tasks_get --args '{\"task_id\":\"<task_id>\"}'"
            ]
        }), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
```
