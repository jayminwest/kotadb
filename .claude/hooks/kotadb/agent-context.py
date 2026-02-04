#!/usr/bin/env python3
"""
SubagentStart hook for injecting context into spawned agents.

This hook is triggered when Claude Code spawns build or Explore agents.
It queries KotaDB for dependency information based on files mentioned
in the task description and injects context about those dependencies.

Also provides KotaDB capability context at startup to help agents
understand when to use KotaDB over Grep.

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
Dependency context for files mentioned in the task + KotaDB capability hints.

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


def get_kotadb_capabilities_context() -> str:
    """
    Query KotaDB for index statistics and format as capability hints.
    
    This provides agents with:
    1. Current indexed statistics (how much is indexed)
    2. When to use KotaDB over Grep (capability hints)
    3. Available search scopes and their use cases
    
    Returns empty string if KotaDB is not available or has no data.
    """
    import subprocess
    import json
    
    try:
        # Call kotadb MCP server to get statistics
        result = subprocess.run(
            ['bunx', 'kotadb', '--stdio'],
            input=json.dumps({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "get_index_statistics",
                    "arguments": {}
                }
            }),
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode != 0:
            return ""
        
        response = json.loads(result.stdout)
        if "error" in response:
            return ""
        
        stats = response.get("result", {}).get("content", [{}])[0].get("text", "{}")
        stats_data = json.loads(stats)
        
        # Format context
        context_lines = [
            "## KotaDB Code Intelligence Capabilities",
            "",
            f"**Indexed Data:**",
            f"- {stats_data['symbols']:,} symbols indexed (functions, classes, types)",
            f"- {stats_data['references']:,} references mapped (import/export relationships)",
            f"- {stats_data['files']:,} files indexed across {stats_data['repositories']} repositories",
        ]
        
        # Add memory layer stats if available
        if stats_data.get('decisions', 0) > 0:
            context_lines.append(f"- {stats_data['decisions']} architectural decisions documented")
        if stats_data.get('patterns', 0) > 0:
            context_lines.append(f"- {stats_data['patterns']} coding patterns captured")
        if stats_data.get('failures', 0) > 0:
            context_lines.append(f"- {stats_data['failures']} failures/lessons learned")
        
        context_lines.extend([
            "",
            "**When to use KotaDB over Grep:**",
            "- Need structural search (find all exported functions, specific class)",
            "- Want to understand 'why' decisions (search scope: ['decisions'])",
            "- Need dependency analysis (use search_dependencies tool)",
            "- Looking for patterns/conventions (search scope: ['patterns'])",
            "- Want to avoid past mistakes (search scope: ['failures'])",
            "",
            "**Multi-scope search:** KotaDB can search multiple scopes simultaneously:",
            "  scope: ['code', 'symbols', 'decisions'] - searches all three at once",
            "",
            "**Output formats:** Adjust verbosity based on result size:",
            "  output: 'full' - complete details (default)",
            "  output: 'paths' - file paths only",
            "  output: 'compact' - summary information",
            ""
        ])
        
        return "\n".join(context_lines)
        
    except Exception:
        # Silently fail - don't block agent startup if KotaDB unavailable
        return ""


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
    
    # Always provide capability context
    capability_context = get_kotadb_capabilities_context()
    
    if not hook_input:
        # No input, provide capability context only
        if capability_context:
            output_context(capability_context)
        else:
            output_continue()
        return
    
    # Extract agent info
    agent_info = extract_agent_info(hook_input)
    prompt = agent_info.get("prompt", "")
    
    if not prompt:
        # No prompt, provide capability context only
        if capability_context:
            output_context(capability_context)
        else:
            output_continue()
        return
    
    # Extract file paths from the task description
    file_paths = extract_file_paths(prompt)
    
    if not file_paths:
        # No files mentioned, provide capability context only
        if capability_context:
            output_context(capability_context)
        else:
            output_continue()
        return
    
    # Query KotaDB for each file
    deps_results = []
    for file_path in file_paths:
        result = run_kotadb_deps(file_path, format="json", depth=1)
        if not result.get("error"):
            deps_results.append(result)
    
    # Combine capability context with dependency context
    final_context = []
    
    if capability_context:
        final_context.append(capability_context)
    
    # Check if any file has dependents
    has_dependents = any(r.get("dependents") for r in deps_results)
    if has_dependents:
        dep_context = format_agent_context(deps_results, max_files=15)
        final_context.append(dep_context)
    
    if final_context:
        output_context("\n\n".join(final_context))
    else:
        output_continue()


if __name__ == "__main__":
    main()
