#!/usr/bin/env python3
"""
PreToolUse hook for orchestrator pattern enforcement.

Blocks file modification tools (Write, Edit, MultiEdit, NotebookEdit)
when orchestrator context is active. Orchestrators must delegate file
modifications to build agents via the Task tool.

Per KotaDB logging standards: uses sys.stdout.write(), never print().
"""

import json
import os
import sys
from pathlib import Path
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hooks.utils.hook_helpers import (
    output_result,
    read_hook_input,
)

# Tools that are blocked in orchestrator context
BLOCKED_TOOLS: set[str] = {
    "Write",
    "Edit",
    "MultiEdit",
    "NotebookEdit",
}

# Tools explicitly allowed in orchestrator context
ALLOWED_TOOLS: set[str] = {
    "Read",
    "Grep",
    "Glob",
    "Bash",
    "Task",
    "SlashCommand",
    "AskUserQuestion",
    "TodoWrite",
    "WebFetch",
    "WebSearch",
    "mcp__kotadb__search_code",
    "mcp__kotadb__search_dependencies",
    "mcp__kotadb__analyze_change_impact",
    "mcp__kotadb__validate_implementation_spec",
    "mcp__supabase__execute_sql",
    "mcp__supabase__search_docs",
}

# State file location (must match orchestrator_context.py)
STATE_FILE = Path(".claude/data/orchestrator_context.json")


def get_tool_name_from_input(hook_input: dict[str, Any]) -> str:
    """
    Extract tool name from hook input.

    Args:
        hook_input: Parsed hook input dictionary

    Returns:
        Tool name if found, empty string otherwise
    """
    # PreToolUse provides tool_name directly
    if "tool_name" in hook_input:
        return hook_input["tool_name"]

    # May be nested in tool
    tool = hook_input.get("tool", {})
    if isinstance(tool, dict):
        return tool.get("name", "")

    return ""


def get_tool_params_from_input(hook_input: dict[str, Any]) -> dict[str, Any]:
    """
    Extract tool parameters from hook input.

    Args:
        hook_input: Parsed hook input dictionary

    Returns:
        Tool parameters dictionary
    """
    if "tool_input" in hook_input:
        return hook_input["tool_input"]

    tool = hook_input.get("tool", {})
    if isinstance(tool, dict):
        return tool.get("input", {})

    return {}


def read_orchestrator_context() -> tuple[bool, str]:
    """
    Read orchestrator context from state file.

    Returns:
        Tuple of (is_active, context_name)
    """
    # First check environment variable (same process)
    env_context = os.environ.get("CLAUDE_ORCHESTRATOR_CONTEXT")
    if env_context:
        return True, env_context

    # Then check state file (cross-process)
    if not STATE_FILE.exists():
        return False, ""

    try:
        state = json.loads(STATE_FILE.read_text())
        if state.get("active", False):
            return True, state.get("context_name", "unknown")
    except (json.JSONDecodeError, OSError):
        pass

    return False, ""


def build_block_message(tool_name: str, context_name: str, tool_params: dict[str, Any]) -> str:
    """
    Build a helpful error message for blocked tool usage.

    Args:
        tool_name: Name of the blocked tool
        context_name: Active orchestrator context name
        tool_params: Parameters passed to the tool

    Returns:
        Formatted error message
    """
    file_path = tool_params.get("file_path", tool_params.get("path", "<target file>"))

    allowed_list = ", ".join(sorted(ALLOWED_TOOLS)[:10])

    message = f"""
[BLOCKED] Tool '{tool_name}' is not allowed in orchestrator context.

Context: {context_name}
Target: {file_path}

Orchestrators must delegate file modifications to build agents.

To proceed:
1. Use the Task tool to spawn a build-agent with your file requirements
2. Or use SlashCommand to delegate to an implementation workflow

Example delegation:
  Use Task tool with subagent_type='build-agent':
  "Create/modify {file_path} with: [your specification]"

Allowed tools in orchestrator context:
  {allowed_list}...

To disable enforcement, clear the orchestrator context.
""".strip()

    return message


def main() -> None:
    """Main entry point for the orchestrator guard hook."""
    hook_input = read_hook_input()

    tool_name = get_tool_name_from_input(hook_input)

    if not tool_name:
        output_result("continue")
        return

    # Check if orchestrator context is active
    is_active, context_name = read_orchestrator_context()

    if not is_active:
        # No orchestrator context, allow all tools
        output_result("continue")
        return

    # Check if tool is blocked
    if tool_name in BLOCKED_TOOLS:
        tool_params = get_tool_params_from_input(hook_input)
        message = build_block_message(tool_name, context_name, tool_params)
        output_result("block", message)
        return

    # Tool is allowed
    output_result("continue")


if __name__ == "__main__":
    main()
