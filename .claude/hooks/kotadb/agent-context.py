#!/usr/bin/env python3
"""
SubagentStart hook for injecting context into spawned agents.

This hook is triggered when Claude Code spawns build or Explore agents.
It queries KotaDB for dependency information based on files mentioned
in the task description and injects context about those dependencies.

Hook Configuration (in .claude/settings.json):
{
  "hooks": {
    "SubagentStart": [{
      "matcher": "build|Explore",
      "hooks": [{
        "type": "command",
        "command": "python3 .claude/hooks/kotadb/agent-context.py"
      }]
    }]
  }
}

Input (stdin JSON):
{
  "agent_type": "build",
  "prompt": "Implement feature X in src/api/routes.ts...",
  "cwd": "/path/to/project"
}

Output (stdout):
Dependency context for files mentioned in the task.

Exit codes:
- 0: Success (continue with agent spawn)
- Non-zero exits would block the agent (we always exit 0)
"""

import os
import re
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.hook_helpers import (
    parse_stdin,
    extract_agent_info,
    run_kotadb_deps,
    format_agent_context,
    output_continue,
    output_context,
)


def extract_file_paths(text: str) -> list[str]:
    """
    Extract likely file paths from task description.
    
    Looks for common patterns like:
    - Explicit file extensions (.ts, .tsx, .js, .py, etc.)
    - src/ or app/ prefixed paths
    - test/ prefixed paths
    
    Returns up to 5 unique file paths.
    """
    if not text:
        return []
    
    # Common file path patterns
    patterns = [
        r'[a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|py|rs|go|java|rb)',  # Files with extensions
        r'src/[a-zA-Z0-9_\-./]+',  # src/ paths
        r'app/[a-zA-Z0-9_\-./]+',  # app/ paths
        r'tests?/[a-zA-Z0-9_\-./]+',  # test paths
        r'lib/[a-zA-Z0-9_\-./]+',  # lib paths
    ]
    
    paths = set()
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            # Clean up the path
            clean_path = match.strip('./')
            if clean_path and not clean_path.startswith('.'):
                paths.add(clean_path)
    
    # Return up to 5 unique paths
    return list(paths)[:5]


def main() -> None:
    """Main hook entry point."""
    # Parse input from Claude Code
    hook_input = parse_stdin()
    
    if not hook_input:
        # No input, continue without context
        output_continue()
        return
    
    # Extract agent info
    agent_info = extract_agent_info(hook_input)
    prompt = agent_info.get("prompt", "")
    
    if not prompt:
        # No prompt, continue without context
        output_continue()
        return
    
    # Extract file paths from the task description
    file_paths = extract_file_paths(prompt)
    
    if not file_paths:
        # No files mentioned, continue without context
        output_continue()
        return
    
    # Query KotaDB for each file
    deps_results = []
    for file_path in file_paths:
        result = run_kotadb_deps(file_path, format="json", depth=1)
        if not result.get("error"):
            deps_results.append(result)
    
    if not deps_results:
        # No valid results, continue without context
        output_continue()
        return
    
    # Check if any file has dependents
    has_dependents = any(r.get("dependents") for r in deps_results)
    if not has_dependents:
        # No dependents found, no context needed
        output_continue()
        return
    
    # Format and output agent context
    context = format_agent_context(deps_results, max_files=15)
    output_context(context)


if __name__ == "__main__":
    main()
