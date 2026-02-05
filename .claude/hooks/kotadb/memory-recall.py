#!/usr/bin/env python3
"""
PreToolUse hook for injecting memory context before file edits.

Performance:
- Total budget: 3 seconds
- MCP health check: 0.5s
- Memory queries: Up to 2.5s

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
    extract_search_terms_from_path,
    check_mcp_server_health,
    call_mcp_tool_with_health_check,
    run_kotadb_search_failures,
    run_kotadb_search_decisions,
    format_memory_context,
    output_continue,
    output_context,
)


def main() -> None:
    """Main hook entry point."""
    logger = HookLogger("memory-recall")
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
        
        # Convert to relative path for context extraction
        cwd = os.getcwd()
        relative_path = file_path
        if file_path.startswith(cwd):
            relative_path = file_path[len(cwd):].lstrip("/")
        
        logger.log("FILE", f"Processing {relative_path}")
        
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
        
        # Extract search terms from the file path
        search_terms = extract_search_terms_from_path(relative_path)
        
        if not search_terms:
            logger.log("NO_TERMS", "No meaningful search terms extracted")
            logger.end()
            output_continue()
            return
        
        # Build a search query from terms
        search_query = " ".join(search_terms)
        logger.log("QUERY", f"Searching memory with: {search_query}")
        
        # Calculate timeout for each query
        remaining = budget.remaining()
        query_timeout = min(remaining / 2, 2.5)  # Split budget between two queries
        
        # Search for relevant failures and decisions
        failures_result = run_kotadb_search_failures(search_query, limit=5, timeout=query_timeout)
        
        # Check budget before second query
        if budget.is_exhausted():
            logger.budget_exhausted()
            logger.end()
            output_continue()
            return
        
        query_timeout = budget.timeout_for_operation(max_timeout=2.5)
        decisions_result = run_kotadb_search_decisions(search_query, limit=5, timeout=query_timeout)
        
        # Check for errors (log to stderr but don't block)
        if failures_result.get("error"):
            logger.log("WARN", f"Failures search: {failures_result['error']}", level="WARN")
        if decisions_result.get("error"):
            logger.log("WARN", f"Decisions search: {decisions_result['error']}", level="WARN")
        
        # Extract results arrays
        failures = failures_result.get("results", [])
        decisions = decisions_result.get("results", [])
        
        # Format and output memory context if we have any results
        context = format_memory_context(failures, decisions)
        
        if context:
            logger.context_provided(f"{len(failures)} failures, {len(decisions)} decisions")
            logger.end()
            output_context(context)
        else:
            logger.log("NO_RESULTS", "No relevant memory context found")
            logger.end()
            output_continue()
        
    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}")
        logger.end(status="ERROR")
        output_continue()  # Always exit 0


if __name__ == "__main__":
    main()
