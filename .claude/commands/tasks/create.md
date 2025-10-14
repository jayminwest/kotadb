# /tasks:create

Create a new phase task in the kota-tasks MCP server for API-driven workflow orchestration.

## Usage
```
/tasks:create <phase> <description> <issue_number> <adw_id> <worktree> [priority]
```

## Arguments
- `$1` (phase): Phase name - must be one of: plan, build, test, review, document
- `$2` (description): Task description (e.g., "Execute build phase for issue #110")
- `$3` (issue_number): GitHub issue number (e.g., "110")
- `$4` (adw_id): ADW execution ID for tracking (e.g., "abc-123")
- `$5` (worktree): Worktree name where phase will execute (e.g., "feat-110-example")
- `$6` (priority): Optional priority level (low, medium, high). Default: medium

## Instructions
1. Validate that the phase is one of: plan, build, test, review, document
2. Validate that the priority (if provided) is one of: low, medium, high
3. Use the tasks_api module to create the phase task
4. Return the task_id and full task metadata as JSON

## Example
```python
from adws.adw_modules.tasks_api import create_phase_task

task_id = create_phase_task(
    phase="$1",
    issue_number="$3",
    adw_id="$4",
    worktree="$5",
    description="$2",
    priority="$6" if "$6" else "medium"
)

print(f"Task created: {task_id}")
```

## Output Schema
Return JSON with the following structure:
```json
{
  "type": "object",
  "required": ["task_id", "phase", "issue_number", "worktree"],
  "properties": {
    "task_id": {"type": "string"},
    "phase": {"type": "string"},
    "issue_number": {"type": "string"},
    "adw_id": {"type": "string"},
    "worktree": {"type": "string"},
    "priority": {"type": "string"}
  }
}
```

## Error Handling
- Invalid phase: Return error with list of valid phases
- Invalid priority: Return error with list of valid priorities
- MCP server unavailable: Return error with connectivity troubleshooting steps
- Task creation failed: Return error with server response

## Implementation
Create a Python script that uses the tasks_api module and execute it:

```python
#!/usr/bin/env python3
"""Create a phase task via kota-tasks MCP API."""

import json
import sys
from pathlib import Path

# Add automation directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "automation"))

from adws.adw_modules.tasks_api import (
    create_phase_task,
    TaskValidationError,
    MCPServerError
)

def main():
    # Parse arguments
    phase = "$1"
    description = "$2"
    issue_number = "$3"
    adw_id = "$4"
    worktree = "$5"
    priority = "$6" if "$6" else "medium"

    # Validate required args
    if not all([phase, description, issue_number, adw_id, worktree]):
        print(json.dumps({
            "error": "Missing required arguments",
            "usage": "/tasks:create <phase> <description> <issue_number> <adw_id> <worktree> [priority]"
        }), file=sys.stderr)
        sys.exit(1)

    try:
        # Create task
        task_id = create_phase_task(
            phase=phase,
            issue_number=issue_number,
            adw_id=adw_id,
            worktree=worktree,
            description=description,
            priority=priority
        )

        # Return success
        result = {
            "task_id": task_id,
            "phase": phase,
            "issue_number": issue_number,
            "adw_id": adw_id,
            "worktree": worktree,
            "priority": priority
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
