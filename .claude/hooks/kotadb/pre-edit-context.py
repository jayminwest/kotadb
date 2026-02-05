#!/usr/bin/env python3
"""
PreToolUse hook for injecting dependency context before file edits.

Performance:
- Total budget: 3 seconds
- MCP health check: 0.5s
- Dependency query: Up to 2.5s

Graceful degradation:
- MCP unavailable: Completes in <1s
- Budget exhausted: Returns partial results
- Always exits 0 (never blocks)
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.hook_helpers import (
    HookLogger,
    TimeoutBudget,
    parse_stdin,
    extract_file_path,
    check_mcp_server_health,
    run_kotadb_deps,
    format_dependency_alert,
    output_continue,
    output_context,
)


def main() -> None:
    """Main hook entry point."""
    logger = HookLogger("pre-edit-context")
    logger.start()
    
    try:
        # Create 3-second budget for this hook
        budget = TimeoutBudget(3.0)
        
        # Parse input
        hook_input = parse_stdin()
        if not hook_input:
            logger.log("NO_INPUT", "No hook input received")
            logger.end()
            output_continue()
            return
        
        # Extract file path
        file_path = extract_file_path(hook_input)
        if not file_path:
            logger.log("NO_FILE", "No file path found in input")
            logger.end()
            output_continue()
            return
        
        # Convert to relative path
        cwd = os.getcwd()
        if file_path.startswith(cwd):
            file_path = file_path[len(cwd):].lstrip("/")
        
        logger.log("FILE", f"Processing {file_path}")
        
        # Quick MCP health check (0.5s max)
        mcp_available = check_mcp_server_health(timeout=0.5)
        if not mcp_available:
            logger.mcp_unavailable()
            logger.end()
            output_continue()
            return
        
        # Check remaining budget
        if budget.is_exhausted():
            logger.budget_exhausted()
            logger.end()
            output_continue()
            return
        
        # Query dependencies with remaining budget
        timeout = budget.timeout_for_operation(max_timeout=5.0)
        logger.log("QUERY", f"Querying deps with {timeout:.1f}s timeout")
        
        deps_result = run_kotadb_deps(file_path, format="json", depth=1, timeout=timeout)
        
        # Check for errors
        if deps_result.get("error"):
            logger.error(deps_result["error"])
            logger.end()
            output_continue()
            return
        
        # Check for dependents
        dependents = deps_result.get("dependents", [])
        if not dependents:
            logger.log("NO_DEPENDENTS", "No dependents found")
            logger.end()
            output_continue()
            return
        
        # Format and output alert
        logger.context_provided(f"{len(dependents)} dependents")
        alert = format_dependency_alert(deps_result, max_files=10)
        
        logger.end()
        output_context(alert)
        
    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}")
        logger.end(status="ERROR")
        output_continue()  # Always exit 0


if __name__ == "__main__":
    main()
