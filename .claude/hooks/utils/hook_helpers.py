#!/usr/bin/env python3
"""
Hook helper utilities for KotaDB Claude Code hooks.

Provides shared functions for:
- Parsing stdin JSON (tool_input from Claude Code)
- Running CLI commands with timeout budgets
- Async/parallel execution for multi-file operations
- MCP server health checks
- Structured logging for observability
- Formatting output (under 500 tokens)
- Error handling (exit 0, warn on stderr)

Usage:
    from hook_helpers import (
        TimeoutBudget,
        HookLogger,
        parse_stdin,
        run_kotadb_deps,
        check_mcp_server_health,
    )
"""

import asyncio
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Optional


# ============================================================================
# Timeout Budget and Logging Infrastructure
# ============================================================================

class TimeoutBudget:
    """Manages total time budget for hook execution."""
    
    def __init__(self, total_seconds: float):
        self.total_seconds = total_seconds
        self.start_time = time.time()
        
    def remaining(self) -> float:
        """Get remaining budget in seconds."""
        elapsed = time.time() - self.start_time
        return max(0, self.total_seconds - elapsed)
    
    def is_exhausted(self) -> bool:
        """Check if budget is exhausted."""
        return self.remaining() <= 0
    
    def timeout_for_operation(self, max_timeout: float = 5.0) -> float:
        """Get timeout for next operation (min of remaining or max)."""
        return min(self.remaining(), max_timeout)


class HookLogger:
    """Structured logging for hook execution."""
    
    def __init__(self, hook_name: str):
        self.hook_name = hook_name
        self.start_time = time.time()
    
    def log(self, event: str, details: str = "", level: str = "INFO"):
        """
        Log hook event to stderr.
        
        Format: [kotadb-hook:{hook_name}] {timestamp} +{elapsed}ms {level} {event}: {details}
        """
        elapsed_ms = int((time.time() - self.start_time) * 1000)
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        
        message = f"[kotadb-hook:{self.hook_name}] {timestamp} +{elapsed_ms}ms {level} {event}"
        if details:
            message += f": {details}"
        message += "\n"
        
        sys.stderr.write(message)
    
    def start(self):
        """Log hook start."""
        self.log("START", "Hook execution started")
    
    def end(self, status: str = "SUCCESS"):
        """Log hook end with total duration."""
        elapsed_ms = int((time.time() - self.start_time) * 1000)
        self.log("END", f"Hook execution completed in {elapsed_ms}ms", level=status)
    
    def timeout(self, operation: str):
        """Log timeout occurrence."""
        self.log("TIMEOUT", f"Operation timed out: {operation}", level="WARN")
    
    def error(self, error_msg: str):
        """Log error."""
        self.log("ERROR", error_msg, level="ERROR")
    
    def mcp_unavailable(self):
        """Log MCP server unavailability."""
        self.log("MCP_UNAVAILABLE", "MCP server health check failed", level="WARN")
    
    def context_provided(self, summary: str):
        """Log context injection."""
        self.log("CONTEXT", summary)
    
    def budget_exhausted(self):
        """Log budget exhaustion."""
        self.log("BUDGET_EXHAUSTED", "Time budget exhausted", level="WARN")


# ============================================================================
# MCP Health Check Functions
# ============================================================================

def check_mcp_server_health(timeout: float = 0.5) -> bool:
    """
    Quick health check for KotaDB MCP server.
    
    Args:
        timeout: Maximum time to wait (default 0.5s)
        
    Returns:
        True if server is available, False otherwise
    """
    mcp_url = os.environ.get("KOTADB_MCP_URL", "http://localhost:3000/mcp")
    
    try:
        # Simple ping with minimal timeout
        req = urllib.request.Request(
            mcp_url,
            data=json.dumps({
                "jsonrpc": "2.0",
                "method": "ping",
                "id": 1,
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status == 200
    except (urllib.error.URLError, urllib.error.HTTPError, Exception):
        return False


def call_mcp_tool_with_health_check(
    tool_name: str,
    params: dict[str, Any],
    timeout: float = 5.0,
) -> dict[str, Any]:
    """
    Call MCP tool with preliminary health check.
    
    Args:
        tool_name: Name of the MCP tool
        params: Tool parameters
        timeout: Request timeout
        
    Returns:
        Tool result or error dict
    """
    # Quick health check first (0.5s)
    if not check_mcp_server_health(timeout=0.5):
        return {"error": "MCP server not available (health check failed)"}
    
    # Proceed with actual call
    return call_mcp_tool(tool_name, params, timeout)


# ============================================================================
# Async Execution Functions
# ============================================================================

async def run_kotadb_deps_async(
    file_path: str,
    timeout: float = 5.0,
) -> dict[str, Any]:
    """Run kotadb deps command asynchronously."""
    loop = asyncio.get_event_loop()
    
    cmd = get_kotadb_command()
    cmd.extend(["deps", "--file", file_path, "--format", "json", "--depth", "1"])
    
    def run_in_thread():
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=os.getcwd(),
            )
            if result.returncode != 0:
                try:
                    return json.loads(result.stdout)
                except json.JSONDecodeError:
                    return {"file": file_path, "dependents": [], "error": "Command failed"}
            return json.loads(result.stdout)
        except Exception as e:
            return {"file": file_path, "dependents": [], "error": str(e)}
    
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = loop.run_in_executor(executor, run_in_thread)
        return await future


async def query_multiple_files(
    file_paths: list[str],
    budget: TimeoutBudget,
) -> list[dict[str, Any]]:
    """Query dependency info for multiple files in parallel with budget."""
    if budget.is_exhausted():
        return []
    
    # Create tasks with remaining budget
    timeout = budget.timeout_for_operation(max_timeout=5.0)
    tasks = [run_kotadb_deps_async(fp, timeout) for fp in file_paths]
    
    try:
        # Run all tasks in parallel with overall timeout
        results = await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=True),
            timeout=budget.remaining(),
        )
        
        # Filter out exceptions
        return [r for r in results if isinstance(r, dict)]
    except asyncio.TimeoutError:
        sys.stderr.write("[kotadb-hook] Budget exhausted during parallel queries\n")
        return []


# ============================================================================
# Validation Hook Compatibility Functions
# ============================================================================

def read_hook_input() -> dict[str, Any]:
    """Alias for parse_stdin() for backward compatibility."""
    return parse_stdin()


def get_file_path_from_input(hook_input: dict[str, Any]) -> Optional[str]:
    """Alias for extract_file_path() for backward compatibility."""
    return extract_file_path(hook_input)


def get_project_root() -> Path:
    """
    Get project root directory.
    
    Returns:
        Path to project root (where .git directory exists)
    """
    current = Path.cwd()
    while current != current.parent:
        if (current / ".git").exists():
            return current
        current = current.parent
    
    return Path.cwd()


def output_result(status: str, message: str = ""):
    """
    Output hook result with status.
    
    Args:
        status: "continue" or "fail"
        message: Optional message to display
    """
    if status == "continue":
        if message:
            sys.stdout.write(message + "\n")
        sys.exit(0)
    else:  # fail
        if message:
            sys.stderr.write(message + "\n")
        sys.exit(0)  # Still exit 0 to not block


# ============================================================================
# Input Parsing Functions
# ============================================================================

def parse_stdin() -> dict[str, Any]:
    """
    Parse JSON input from stdin.
    
    Claude Code sends tool input as JSON on stdin for hooks.
    Returns empty dict if no input or parse error.
    """
    try:
        data = sys.stdin.read()
        if not data.strip():
            return {}
        return json.loads(data)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"[kotadb-hook] Warning: Failed to parse stdin JSON: {e}\n")
        return {}
    except Exception as e:
        sys.stderr.write(f"[kotadb-hook] Warning: Error reading stdin: {e}\n")
        return {}


def extract_file_path(hook_input: dict[str, Any]) -> Optional[str]:
    """
    Extract file path from hook input.
    
    For PreToolUse hooks, the file path is in:
    - tool_input.file_path (Edit/Write)
    - tool_input.files[0].file_path (MultiEdit)
    
    Returns None if no file path found.
    """
    tool_input = hook_input.get("tool_input", {})
    
    # Try direct file_path (Edit, Write)
    if "file_path" in tool_input:
        return tool_input["file_path"]
    
    # Try files array (MultiEdit)
    files = tool_input.get("files", [])
    if files and isinstance(files, list) and len(files) > 0:
        first_file = files[0]
        if isinstance(first_file, dict) and "file_path" in first_file:
            return first_file["file_path"]
    
    return None


def extract_agent_info(hook_input: dict[str, Any]) -> dict[str, Any]:
    """
    Extract agent info from SubagentStart hook input.
    
    Returns dict with:
    - agent_type: Type of agent being spawned
    - prompt: The prompt/task for the agent
    - files: Any files mentioned in the task
    """
    return {
        "agent_type": hook_input.get("agent_type", "unknown"),
        "prompt": hook_input.get("prompt", ""),
        "cwd": hook_input.get("cwd", ""),
    }


# ============================================================================
# KotaDB CLI Functions
# ============================================================================

def get_kotadb_command() -> list[str]:
    """
    Get the command to run kotadb.
    
    In development (when app/src/cli.ts exists), use bun run.
    In production, use bunx kotadb.
    """
    # Check if we're in the kotadb repo
    cwd = os.getcwd()
    dev_cli = os.path.join(cwd, "app", "src", "cli.ts")
    
    if os.path.exists(dev_cli):
        return ["bun", "run", dev_cli]
    else:
        return ["bunx", "kotadb"]


def run_kotadb_deps(file_path: str, format: str = "json", depth: int = 1, timeout: float = 10) -> dict[str, Any]:
    """
    Run kotadb deps command and return parsed result.
    
    Args:
        file_path: Path to the file to analyze
        format: Output format ("json" or "text")
        depth: Dependency traversal depth (1-5)
        timeout: Command timeout in seconds
    
    Returns:
        Dict with deps result or error
    """
    try:
        cmd = get_kotadb_command()
        cmd.extend(["deps", "--file", file_path, "--format", "json", "--depth", str(depth)])
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=os.getcwd(),
        )
        
        if result.returncode != 0:
            # Command failed, try to parse error from stderr or stdout
            # The CLI outputs JSON even on error
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return {
                    "file": file_path,
                    "dependents": [],
                    "dependencies": [],
                    "testFiles": [],
                    "error": result.stderr.strip() or "Command failed",
                }
        
        # Parse JSON output
        return json.loads(result.stdout)
    
    except subprocess.TimeoutExpired:
        return {
            "file": file_path,
            "dependents": [],
            "dependencies": [],
            "testFiles": [],
            "error": "Timeout: kotadb deps took too long",
        }
    except json.JSONDecodeError as e:
        return {
            "file": file_path,
            "dependents": [],
            "dependencies": [],
            "testFiles": [],
            "error": f"Failed to parse kotadb output: {e}",
        }
    except FileNotFoundError:
        return {
            "file": file_path,
            "dependents": [],
            "dependencies": [],
            "testFiles": [],
            "error": "kotadb not found. Run: bunx kotadb --help",
        }
    except Exception as e:
        return {
            "file": file_path,
            "dependents": [],
            "dependencies": [],
            "testFiles": [],
            "error": str(e),
        }


# ============================================================================
# Formatting Functions
# ============================================================================

def format_dependency_alert(deps_result: dict[str, Any], max_files: int = 10) -> str:
    """
    Format dependency result as a concise alert (under 500 tokens).
    
    Args:
        deps_result: Result from run_kotadb_deps
        max_files: Max number of dependent files to show
    
    Returns:
        Formatted markdown alert string
    """
    file_path = deps_result.get("file", "unknown")
    dependents = deps_result.get("dependents", [])
    test_files = deps_result.get("testFiles", [])
    error = deps_result.get("error")
    
    if error:
        return f"[kotadb] Warning: {error}"
    
    if not dependents:
        return ""  # No alert needed if no dependents
    
    lines = [
        f"## Dependency Alert for {file_path}",
        "",
        f"This file has **{len(dependents)} dependent file(s)** that may need updates:",
    ]
    
    # Show limited number of dependents
    for dep in dependents[:max_files]:
        lines.append(f"- {dep}")
    
    if len(dependents) > max_files:
        lines.append(f"- ... and {len(dependents) - max_files} more")
    
    # Add test files hint
    if test_files:
        lines.append("")
        lines.append(f"**Test files** ({len(test_files)}): {', '.join(test_files[:3])}")
        if len(test_files) > 3:
            lines.append(f"  ... and {len(test_files) - 3} more")
    
    lines.append("")
    lines.append("Consider checking these files after your changes.")
    
    return "\n".join(lines)


def format_agent_context(deps_results: list[dict[str, Any]], max_files: int = 15) -> str:
    """
    Format dependency results for agent context injection.
    
    Args:
        deps_results: List of results from run_kotadb_deps
        max_files: Max total files to show
    
    Returns:
        Formatted context string for agent prompt
    """
    if not deps_results:
        return ""
    
    lines = [
        "## KotaDB Context",
        "",
        "Files you may work with and their dependencies:",
        "",
    ]
    
    total_shown = 0
    for result in deps_results:
        if total_shown >= max_files:
            break
        
        file_path = result.get("file", "unknown")
        dependents = result.get("dependents", [])
        
        if dependents:
            lines.append(f"**{file_path}** ({len(dependents)} dependents)")
            for dep in dependents[:3]:
                lines.append(f"  - {dep}")
                total_shown += 1
            if len(dependents) > 3:
                lines.append(f"  - ... and {len(dependents) - 3} more")
            lines.append("")
    
    if not any(r.get("dependents") for r in deps_results):
        return ""  # No context needed if no dependencies found
    
    return "\n".join(lines)


# ============================================================================
# Output Functions
# ============================================================================

def output_continue() -> None:
    """Output empty to continue without blocking."""
    sys.exit(0)


def output_context(context: str) -> None:
    """Output context to stdout and exit successfully."""
    if context:
        print(context)
    sys.exit(0)


# ============================================================================
# Memory Layer Helper Functions
# ============================================================================

def call_mcp_tool(tool_name: str, params: dict[str, Any], timeout: int = 5) -> dict[str, Any]:
    """
    Call a KotaDB MCP tool via HTTP.
    
    Args:
        tool_name: Name of the MCP tool (e.g., 'search_failures')
        params: Tool parameters as a dict
        timeout: Request timeout in seconds
    
    Returns:
        Dict with tool result or error
    """
    # MCP endpoint
    mcp_url = os.environ.get("KOTADB_MCP_URL", "http://localhost:3000/mcp")
    
    # Build JSON-RPC request for tools/call
    request_data = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": params,
        },
        "id": 1,
    }
    
    try:
        req = urllib.request.Request(
            mcp_url,
            data=json.dumps(request_data).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
            
            if "error" in result:
                return {"error": result["error"].get("message", "Unknown error")}
            
            # MCP result is in result.result.content[0].text (JSON string)
            content = result.get("result", {}).get("content", [])
            if content and isinstance(content, list) and len(content) > 0:
                text = content[0].get("text", "{}")
                return json.loads(text)
            
            return {"error": "No content in MCP response"}
    
    except urllib.error.URLError as e:
        return {"error": f"MCP server not available: {e}"}
    except urllib.error.HTTPError as e:
        return {"error": f"MCP request failed: {e.code}"}
    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse MCP response: {e}"}
    except Exception as e:
        return {"error": str(e)}


def run_kotadb_search_failures(query: str, limit: int = 5, timeout: float = 5.0) -> dict[str, Any]:
    """
    Search for past failures using KotaDB MCP tool.
    
    Args:
        query: Search query for failures
        limit: Maximum number of results
        timeout: Request timeout
    
    Returns:
        Dict with results array or error
    """
    return call_mcp_tool("search_failures", {"query": query, "limit": limit}, timeout)


def run_kotadb_search_decisions(query: str, limit: int = 5, timeout: float = 5.0) -> dict[str, Any]:
    """
    Search for past decisions using KotaDB MCP tool.
    
    Args:
        query: Search query for decisions
        limit: Maximum number of results
        timeout: Request timeout
    
    Returns:
        Dict with results array or error
    """
    return call_mcp_tool("search_decisions", {"query": query, "limit": limit}, timeout)


def extract_search_terms_from_path(file_path: str) -> list[str]:
    """
    Extract relevant search terms from a file path.
    
    Args:
        file_path: Path to extract terms from
    
    Returns:
        List of search terms (keywords)
    """
    import re
    
    terms = []
    
    # Get the filename without extension
    filename = os.path.basename(file_path)
    name_without_ext = os.path.splitext(filename)[0]
    
    # Remove common suffixes like .test, .spec
    name_without_ext = re.sub(r'\.(test|spec)$', '', name_without_ext)
    
    # Split camelCase and kebab-case
    words = re.split(r'[-_]|(?<=[a-z])(?=[A-Z])', name_without_ext)
    words = [w.lower() for w in words if w and len(w) > 2]
    
    # Add meaningful words as terms
    for word in words:
        if word not in ['index', 'main', 'app', 'src', 'lib', 'utils', 'helpers']:
            terms.append(word)
    
    # Extract directory context
    dir_path = os.path.dirname(file_path)
    if dir_path:
        # Get immediate parent directory
        parent_dir = os.path.basename(dir_path)
        if parent_dir and parent_dir not in ['src', 'lib', 'app', 'tests', '__tests__']:
            terms.append(parent_dir.lower())
    
    # Deduplicate while preserving order
    seen = set()
    unique_terms = []
    for term in terms:
        if term not in seen:
            seen.add(term)
            unique_terms.append(term)
    
    return unique_terms[:3]  # Max 3 terms


def format_memory_context(
    failures: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
    max_failures: int = 5,
    max_decisions: int = 5,
) -> str:
    """
    Format memory search results as context for the agent.
    
    Args:
        failures: List of failure results
        decisions: List of decision results
        max_failures: Maximum failures to show
        max_decisions: Maximum decisions to show
    
    Returns:
        Formatted markdown context string
    """
    lines = []
    
    has_failures = failures and len(failures) > 0
    has_decisions = decisions and len(decisions) > 0
    
    if not has_failures and not has_decisions:
        return ""
    
    lines.append("## Memory Context")
    lines.append("")
    
    if has_failures:
        lines.append("**Relevant Past Failures:**")
        for f in failures[:max_failures]:
            title = f.get("title", "Unknown")
            reason = f.get("failure_reason", "")
            # Truncate reason to keep output concise
            if len(reason) > 80:
                reason = reason[:77] + "..."
            lines.append(f"- {title}: {reason}")
        lines.append("")
    
    if has_decisions:
        lines.append("**Relevant Decisions:**")
        for d in decisions[:max_decisions]:
            title = d.get("title", "Unknown")
            rationale = d.get("rationale") or d.get("decision", "")
            # Truncate rationale to keep output concise
            if len(rationale) > 80:
                rationale = rationale[:77] + "..."
            lines.append(f"- {title}: {rationale}")
        lines.append("")
    
    lines.append("Consider these learnings before proceeding.")
    
    return "\n".join(lines)
