#!/usr/bin/env python3
"""
PreToolUse hook for injecting memory context before file edits.

This hook is triggered when Claude Code uses Edit, Write, or MultiEdit tools.
It queries KotaDB for relevant failures and decisions based on the file being
edited, and injects context to help avoid past mistakes and follow established
patterns.

Hook Configuration (in .claude/settings.json):
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [{
        "type": "command",
        "command": "python3 .claude/hooks/kotadb/memory-recall.py"
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
Memory context if relevant failures/decisions found, otherwise empty.

Exit codes:
- 0: Success (always - don't block tool execution)
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.hook_helpers import (
    parse_stdin,
    extract_file_path,
    extract_search_terms_from_path,
    run_kotadb_search_failures,
    run_kotadb_search_decisions,
    format_memory_context,
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
    
    # Convert absolute path to relative for context extraction
    cwd = os.getcwd()
    relative_path = file_path
    if file_path.startswith(cwd):
        relative_path = file_path[len(cwd):].lstrip("/")
    
    # Extract search terms from the file path
    search_terms = extract_search_terms_from_path(relative_path)
    
    if not search_terms:
        # No meaningful terms extracted, continue without context
        output_continue()
        return
    
    # Build a search query from terms
    search_query = " ".join(search_terms)
    
    # Search for relevant failures and decisions
    failures_result = run_kotadb_search_failures(search_query, limit=5)
    decisions_result = run_kotadb_search_decisions(search_query, limit=5)
    
    # Check for errors (log to stderr but don't block)
    if failures_result.get("error"):
        sys.stderr.write(f"[kotadb-memory] Warning: {failures_result['error']}\n")
    if decisions_result.get("error"):
        sys.stderr.write(f"[kotadb-memory] Warning: {decisions_result['error']}\n")
    
    # Extract results arrays
    failures = failures_result.get("results", [])
    decisions = decisions_result.get("results", [])
    
    # Format and output memory context if we have any results
    context = format_memory_context(failures, decisions)
    
    if context:
        output_context(context)
    else:
        output_continue()


if __name__ == "__main__":
    main()
