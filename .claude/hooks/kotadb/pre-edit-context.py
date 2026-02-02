#!/usr/bin/env python3
"""
PreToolUse hook for injecting dependency context before file edits.

This hook is triggered when Claude Code uses Edit, Write, or MultiEdit tools.
It queries KotaDB for dependency information and injects a context alert
if the file has dependents that may need updates.

Hook Configuration (in .claude/settings.json):
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [{
        "type": "command",
        "command": "python3 .claude/hooks/kotadb/pre-edit-context.py"
      }]
    }]
  }
}

Input (stdin JSON):
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    ...
  }
}

Output (stdout):
Dependency alert if file has dependents, otherwise empty.

Exit codes:
- 0: Success (continue with tool execution)
- Non-zero exits would block the tool (we always exit 0)
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.hook_helpers import (
    parse_stdin,
    extract_file_path,
    run_kotadb_deps,
    format_dependency_alert,
    output_continue,
    output_context,
)


def main() -> None:
    """Main hook entry point."""
    # Parse input from Claude Code
    hook_input = parse_stdin()
    
    if not hook_input:
        # No input, continue without context
        output_continue()
        return
    
    # Extract file path from tool input
    file_path = extract_file_path(hook_input)
    
    if not file_path:
        # No file path found, continue without context
        output_continue()
        return
    
    # Convert absolute path to relative (kotadb expects relative paths)
    cwd = os.getcwd()
    if file_path.startswith(cwd):
        file_path = file_path[len(cwd):].lstrip("/")
    
    # Query KotaDB for dependency information
    deps_result = run_kotadb_deps(file_path, format="json", depth=1)
    
    # Check if there was an error
    if deps_result.get("error"):
        # Log warning but don't block
        sys.stderr.write(f"[kotadb] {deps_result['error']}\n")
        output_continue()
        return
    
    # Check if file has dependents
    dependents = deps_result.get("dependents", [])
    if not dependents:
        # No dependents, no context needed
        output_continue()
        return
    
    # Format and output dependency alert
    alert = format_dependency_alert(deps_result, max_files=10)
    output_context(alert)


if __name__ == "__main__":
    main()
