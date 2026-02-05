#!/usr/bin/env python3
"""
SessionStart hook for injecting dynamic expertise context at session start.

Performance:
- Total budget: 15 seconds
- MCP health check: 0.5s
- Pattern search: Up to 2s
- Parallel dependency queries: Up to 12.5s

Graceful degradation:
- MCP unavailable: Completes in <1s
- Budget exhausted: Returns partial results
- Always exits 0 (never blocks)
"""

import asyncio
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.hook_helpers import (
    HookLogger,
    TimeoutBudget,
    check_mcp_server_health,
    call_mcp_tool,
    query_multiple_files,
    get_kotadb_command,
    output_continue,
    output_context,
)


# Domain mapping: directory prefixes to domain names
DOMAIN_PREFIXES = {
    "src/db/": "database",
    "app/src/db/": "database",
    "src/api/": "api",
    "app/src/api/": "api",
    "src/mcp/": "api",
    "app/src/mcp/": "api",
    "src/indexer/": "indexer",
    "app/src/indexer/": "indexer",
    ".claude/": "claude-config",
    ".claude/agents/": "agent-authoring",
    ".claude/hooks/": "claude-config",
    ".claude/commands/": "claude-config",
    "tests/": "testing",
    "app/tests/": "testing",
    "__tests__/": "testing",
}


def run_kotadb_search_patterns(limit: int = 10, timeout: float = 5.0) -> dict[str, Any]:
    """
    Query KotaDB for recent patterns via MCP HTTP endpoint.
    
    Args:
        limit: Maximum number of patterns to retrieve
        timeout: Request timeout
    
    Returns:
        Dict with results or error
    """
    return call_mcp_tool("search_patterns", {"limit": limit}, timeout)


def get_recent_git_files(days: int = 7, limit: int = 30) -> list[str]:
    """
    Get files changed in git within the last N days.
    
    Args:
        days: Number of days to look back
        limit: Maximum number of files to return
    
    Returns:
        List of file paths
    """
    try:
        since_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        
        result = subprocess.run(
            ["git", "log", f"--since={since_date}", "--name-only", "--pretty=format:", "--diff-filter=AM"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=os.getcwd(),
        )
        
        if result.returncode != 0:
            return []
        
        # Parse unique files from output
        files = set()
        for line in result.stdout.strip().split("\n"):
            line = line.strip()
            if line and not line.startswith("."):
                files.add(line)
        
        return list(files)[:limit]
    
    except Exception:
        return []


async def get_key_files_by_domain(budget: TimeoutBudget, logger: Any) -> dict[str, list[dict[str, Any]]]:
    """
    Get key files organized by domain using KotaDB dependency data.
    
    Uses async parallel execution to query multiple files quickly.
    
    Args:
        budget: Timeout budget for queries
        logger: Hook logger for tracing
    
    Returns:
        Dict mapping domain names to list of {file, dependents_count}
    """
    domain_files: dict[str, list[dict[str, Any]]] = {}
    
    # Get recently changed files
    recent_files = get_recent_git_files(days=7, limit=30)
    
    if not recent_files:
        logger.log("NO_GIT_FILES", "No recent git files, using fallback")
        # Fall back to common entry points
        recent_files = [
            "app/src/db/sqlite/index.ts",
            "app/src/api/routes.ts",
            "app/src/mcp/server.ts",
            "app/src/indexer/bun-indexer.ts",
        ]
    else:
        logger.log("GIT_FILES", f"Found {len(recent_files)} recent files")
    
    # Filter to known domain files
    domain_file_paths = []
    for file_path in recent_files:
        for prefix in DOMAIN_PREFIXES.keys():
            if file_path.startswith(prefix):
                domain_file_paths.append(file_path)
                break
    
    if not domain_file_paths:
        logger.log("NO_DOMAIN_FILES", "No files in known domains")
        return {}
    
    logger.log("DOMAIN_FILES", f"Querying {len(domain_file_paths)} domain files in parallel")
    
    # Query all files in parallel with budget
    deps_results = await query_multiple_files(domain_file_paths, budget)
    
    # Organize results by domain
    for result in deps_results:
        file_path = result.get("file", "")
        dependents_count = len(result.get("dependents", []))
        
        # Determine domain
        domain = "other"
        for prefix, domain_name in DOMAIN_PREFIXES.items():
            if file_path.startswith(prefix):
                domain = domain_name
                break
        
        if domain == "other":
            continue
        
        if domain not in domain_files:
            domain_files[domain] = []
        
        domain_files[domain].append({
            "file": file_path,
            "dependents_count": dependents_count,
        })
    
    # Sort each domain by dependents count and limit
    for domain in domain_files:
        domain_files[domain] = sorted(
            domain_files[domain],
            key=lambda x: x["dependents_count"],
            reverse=True,
        )[:5]
    
    return domain_files


def format_session_context(
    patterns: list[dict[str, Any]],
    domain_files: dict[str, list[dict[str, Any]]],
) -> str:
    """
    Format dynamic expertise context for session start.
    
    Args:
        patterns: Recent patterns from KotaDB
        domain_files: Key files organized by domain
    
    Returns:
        Formatted markdown context string
    """
    lines = ["## Dynamic Expertise Context", ""]
    
    has_patterns = patterns and len(patterns) > 0
    has_domain_files = domain_files and any(files for files in domain_files.values())
    
    if not has_patterns and not has_domain_files:
        return ""  # No context to inject
    
    # Recent patterns section
    if has_patterns:
        lines.append("### Recent Patterns (last 7 days)")
        for p in patterns[:10]:
            pattern_type = p.get("pattern_type", "unknown")
            file_path = p.get("file", "")
            description = p.get("description", p.get("name", ""))
            if len(description) > 60:
                description = description[:57] + "..."
            lines.append(f"- [{pattern_type}] in {file_path}: {description}")
        lines.append("")
    
    # Key files by domain section
    if has_domain_files:
        lines.append("### Key Files by Domain")
        
        for domain in sorted(domain_files.keys()):
            files = domain_files[domain]
            if not files:
                continue
            
            lines.append(f"**{domain}**:")
            for f in files:
                file_path = f["file"]
                count = f["dependents_count"]
                if count > 0:
                    lines.append(f"- {file_path} ({count} dependents)")
                else:
                    lines.append(f"- {file_path}")
            lines.append("")
    
    return "\n".join(lines)


def main() -> None:
    """Main hook entry point."""
    logger = HookLogger("session-expertise")
    logger.start()
    
    try:
        # Create 15-second budget for this hook
        budget = TimeoutBudget(15.0)
        
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
        
        # Query for recent patterns with timeout
        pattern_timeout = budget.timeout_for_operation(max_timeout=2.0)
        logger.log("QUERY", f"Querying patterns with {pattern_timeout:.1f}s timeout")
        patterns_result = run_kotadb_search_patterns(limit=10, timeout=pattern_timeout)
        patterns = patterns_result.get("results", [])
        
        # Log warning if pattern search failed but continue
        if patterns_result.get("error"):
            logger.log("WARN", f"Pattern search failed: {patterns_result['error']}", level="WARN")
        else:
            logger.log("PATTERNS", f"Found {len(patterns)} patterns")
        
        # Check remaining budget
        if budget.is_exhausted():
            logger.budget_exhausted()
            logger.end()
            output_continue()
            return
        
        # Get key files by domain using async execution
        logger.log("DOMAIN_QUERY", "Querying domain files in parallel")
        domain_files = asyncio.run(get_key_files_by_domain(budget, logger))
        
        total_domain_files = sum(len(files) for files in domain_files.values())
        logger.log("DOMAIN_RESULTS", f"Found {total_domain_files} files across {len(domain_files)} domains")
        
        # Format and output context
        context = format_session_context(patterns, domain_files)
        
        if context:
            logger.context_provided(f"{len(patterns)} patterns, {total_domain_files} domain files")
            logger.end()
            output_context(context)
        else:
            logger.log("NO_CONTEXT", "No context to inject")
            logger.end()
            output_continue()
        
    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}")
        logger.end(status="ERROR")
        output_continue()  # Always exit 0


if __name__ == "__main__":
    main()
