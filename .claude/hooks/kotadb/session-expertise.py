#!/usr/bin/env python3
"""
SessionStart hook for injecting dynamic expertise context at session start.

This hook is triggered when a Claude Code session begins. It queries KotaDB
for recent patterns and key files to provide domain-aware context that helps
the agent understand the codebase state and recent activity.

Hook Configuration (in .claude/settings.json):
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "python3 .claude/hooks/kotadb/session-expertise.py"
      }]
    }]
  }
}

Output (stdout):
Dynamic expertise context including recent patterns and key files by domain.

Exit codes:
- 0: Success (always - don't block session start)
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.hook_helpers import (
    output_continue,
    output_context,
    get_kotadb_command,
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


def run_kotadb_search_patterns(limit: int = 10) -> dict[str, Any]:
    """
    Query KotaDB for recent patterns via MCP HTTP endpoint.
    
    Args:
        limit: Maximum number of patterns to retrieve
    
    Returns:
        Dict with results or error
    """
    try:
        import urllib.request
        import urllib.error
        
        mcp_url = os.environ.get("KOTADB_MCP_URL", "http://localhost:3000/mcp")
        
        request_data = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": "search_patterns",
                "arguments": {"limit": limit},
            },
            "id": 1,
        }
        
        req = urllib.request.Request(
            mcp_url,
            data=json.dumps(request_data).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        
        with urllib.request.urlopen(req, timeout=5) as response:
            result = json.loads(response.read().decode("utf-8"))
            
            if "error" in result:
                return {"error": result["error"].get("message", "Unknown error")}
            
            content = result.get("result", {}).get("content", [])
            if content and isinstance(content, list) and len(content) > 0:
                text = content[0].get("text", "{}")
                return json.loads(text)
            
            return {"results": []}
    
    except Exception as e:
        return {"error": str(e)}


def get_recent_git_files(days: int = 7, limit: int = 20) -> list[str]:
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
            timeout=10,
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


def get_key_files_by_domain() -> dict[str, list[dict[str, Any]]]:
    """
    Get key files organized by domain using KotaDB dependency data.
    
    Returns:
        Dict mapping domain names to list of {file, dependents_count}
    """
    domain_files: dict[str, list[dict[str, Any]]] = {}
    
    # Get recently changed files
    recent_files = get_recent_git_files(days=7, limit=30)
    
    if not recent_files:
        # Fall back to common entry points
        recent_files = [
            "app/src/db/sqlite/index.ts",
            "app/src/api/routes.ts",
            "app/src/mcp/server.ts",
            "app/src/indexer/bun-indexer.ts",
        ]
    
    # Query dependencies for each file and categorize by domain
    for file_path in recent_files:
        # Determine domain
        domain = "other"
        for prefix, domain_name in DOMAIN_PREFIXES.items():
            if file_path.startswith(prefix):
                domain = domain_name
                break
        
        if domain == "other":
            continue  # Skip files outside known domains
        
        # Query KotaDB for dependents count
        deps_result = run_kotadb_deps_count(file_path)
        
        if domain not in domain_files:
            domain_files[domain] = []
        
        domain_files[domain].append({
            "file": file_path,
            "dependents_count": deps_result.get("dependents_count", 0),
        })
    
    # Sort each domain by dependents count and limit
    for domain in domain_files:
        domain_files[domain] = sorted(
            domain_files[domain],
            key=lambda x: x["dependents_count"],
            reverse=True,
        )[:5]
    
    return domain_files


def run_kotadb_deps_count(file_path: str) -> dict[str, Any]:
    """
    Get dependency count for a file via KotaDB CLI.
    
    Args:
        file_path: Path to the file
    
    Returns:
        Dict with dependents_count or error
    """
    try:
        cmd = get_kotadb_command()
        cmd.extend(["deps", "--file", file_path, "--format", "json", "--depth", "1"])
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=5,
            cwd=os.getcwd(),
        )
        
        if result.returncode != 0:
            return {"dependents_count": 0}
        
        data = json.loads(result.stdout)
        dependents = data.get("dependents", [])
        
        return {"dependents_count": len(dependents)}
    
    except Exception:
        return {"dependents_count": 0}


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
    # Query for recent patterns
    patterns_result = run_kotadb_search_patterns(limit=10)
    patterns = patterns_result.get("results", [])
    
    # Log warning if pattern search failed but continue
    if patterns_result.get("error"):
        sys.stderr.write(f"[kotadb-session] Warning: Pattern search failed: {patterns_result['error']}\n")
    
    # Get key files by domain
    domain_files = get_key_files_by_domain()
    
    # Format and output context
    context = format_session_context(patterns, domain_files)
    
    if context:
        output_context(context)
    else:
        output_continue()


if __name__ == "__main__":
    main()
