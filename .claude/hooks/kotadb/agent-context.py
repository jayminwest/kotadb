#!/usr/bin/env python3
"""
SubagentStart hook for injecting context into spawned agents.

Performance:
- Total budget: 10 seconds
- MCP health check: 0.5s
- Parallel dependency queries: Up to 9.5s

Graceful degradation:
- MCP unavailable: Completes in <1s
- Budget exhausted: Returns partial results
- Always exits 0 (never blocks)
"""

import asyncio
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.hook_helpers import (
    HookLogger,
    TimeoutBudget,
    parse_stdin,
    extract_agent_info,
    check_mcp_server_health,
    query_multiple_files,
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
        # Call kotadb MCP server to get statistics (with short timeout)
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
            timeout=2
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
    logger = HookLogger("agent-context")
    logger.start()
    
    try:
        # Create 10-second budget for this hook
        budget = TimeoutBudget(10.0)
        
        # Parse input
        hook_input = parse_stdin()
        
        # Always provide capability context
        capability_context = get_kotadb_capabilities_context()
        
        if not hook_input:
            logger.log("NO_INPUT", "No hook input received")
            if capability_context:
                logger.context_provided("Capability context only")
                logger.end()
                output_context(capability_context)
            else:
                logger.end()
                output_continue()
            return
        
        # Extract agent info
        agent_info = extract_agent_info(hook_input)
        prompt = agent_info.get("prompt", "")
        
        if not prompt:
            logger.log("NO_PROMPT", "No prompt in input")
            if capability_context:
                logger.context_provided("Capability context only")
                logger.end()
                output_context(capability_context)
            else:
                logger.end()
                output_continue()
            return
        
        # Quick MCP health check (0.5s max)
        mcp_available = check_mcp_server_health(timeout=0.5)
        if not mcp_available:
            logger.mcp_unavailable()
            if capability_context:
                logger.context_provided("Capability context only (MCP down)")
                logger.end()
                output_context(capability_context)
            else:
                logger.end()
                output_continue()
            return
        
        # Extract file paths from the task description
        file_paths = extract_file_paths(prompt)
        
        if not file_paths:
            logger.log("NO_FILES", "No file paths found in prompt")
            if capability_context:
                logger.context_provided("Capability context only")
                logger.end()
                output_context(capability_context)
            else:
                logger.end()
                output_continue()
            return
        
        logger.log("FILES", f"Found {len(file_paths)} files to query")
        
        # Check remaining budget
        if budget.is_exhausted():
            logger.budget_exhausted()
            if capability_context:
                logger.context_provided("Capability context only (budget exhausted)")
                logger.end()
                output_context(capability_context)
            else:
                logger.end()
                output_continue()
            return
        
        # Query dependencies for all files in parallel
        logger.log("QUERY", f"Querying deps for {len(file_paths)} files in parallel")
        deps_results = asyncio.run(query_multiple_files(file_paths, budget))
        
        # Combine capability context with dependency context
        final_context = []
        
        if capability_context:
            final_context.append(capability_context)
        
        # Check if any file has dependents
        has_dependents = any(r.get("dependents") for r in deps_results)
        if has_dependents:
            dep_context = format_agent_context(deps_results, max_files=15)
            final_context.append(dep_context)
            logger.context_provided(f"Capabilities + {len(deps_results)} files with deps")
        else:
            logger.context_provided("Capability context only (no deps)")
        
        if final_context:
            logger.end()
            output_context("\n\n".join(final_context))
        else:
            logger.end()
            output_continue()
        
    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}")
        logger.end(status="ERROR")
        output_continue()  # Always exit 0


if __name__ == "__main__":
    main()
