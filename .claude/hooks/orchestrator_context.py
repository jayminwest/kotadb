#!/usr/bin/env python3
"""
UserPromptSubmit hook for orchestrator context detection.

Detects /do and orchestrator commands, sets CLAUDE_ORCHESTRATOR_CONTEXT
environment variable, and persists context to state file for the guard hook.

Per KotaDB logging standards: uses sys.stdout.write(), never print().
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hooks.utils.hook_helpers import (
    output_result,
    read_hook_input,
)

# Patterns that trigger orchestrator context
ORCHESTRATOR_PATTERNS: list[tuple[str, str]] = [
    (r"^/do\b", "do-router"),
    (r"^/workflows/orchestrator\b", "workflow-orchestrator"),
    (r"^/experts/orchestrators/", "expert-orchestrator"),
    (r"\borchestrator\b.*\bcommand\b", "command-orchestrator"),
]

# State file location
STATE_DIR = Path(".claude/data")
STATE_FILE = STATE_DIR / "orchestrator_context.json"


def get_prompt_from_input(hook_input: dict[str, Any]) -> str:
    """
    Extract prompt content from hook input.

    Args:
        hook_input: Parsed hook input dictionary

    Returns:
        Prompt text if found, empty string otherwise
    """
    # UserPromptSubmit provides prompt in different locations
    if "prompt" in hook_input:
        return hook_input["prompt"]

    if "content" in hook_input:
        return hook_input["content"]

    # May be nested in user_input
    user_input = hook_input.get("user_input", {})
    if isinstance(user_input, str):
        return user_input
    if isinstance(user_input, dict):
        return user_input.get("content", "") or user_input.get("prompt", "")

    return ""


def detect_orchestrator_context(prompt: str) -> tuple[bool, str]:
    """
    Detect if prompt triggers orchestrator context.

    Args:
        prompt: User prompt text

    Returns:
        Tuple of (is_orchestrator, context_name)
    """
    if not prompt:
        return False, ""

    prompt_lower = prompt.lower().strip()

    for pattern, context_name in ORCHESTRATOR_PATTERNS:
        if re.search(pattern, prompt_lower, re.IGNORECASE):
            return True, context_name

    return False, ""


def persist_context(context_name: str, prompt: str) -> None:
    """
    Persist orchestrator context to state file.

    Args:
        context_name: Name of the orchestrator context
        prompt: Original prompt (truncated)
    """
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    state = {
        "context_name": context_name,
        "prompt_preview": prompt[:200] if prompt else "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "active": True,
    }

    # Atomic write: write to temp file then rename
    temp_file = STATE_FILE.with_suffix(".tmp")
    temp_file.write_text(json.dumps(state, indent=2))
    temp_file.rename(STATE_FILE)


def clear_context() -> None:
    """
    Clear orchestrator context from state file.
    """
    if STATE_FILE.exists():
        try:
            STATE_FILE.unlink()
        except OSError:
            pass  # Ignore errors during cleanup


def set_environment_context(context_name: str) -> None:
    """
    Set CLAUDE_ORCHESTRATOR_CONTEXT environment variable.

    Note: This affects the current process. The guard hook reads from
    the state file since it runs in a separate process.

    Args:
        context_name: Name of the orchestrator context
    """
    os.environ["CLAUDE_ORCHESTRATOR_CONTEXT"] = context_name


def clear_environment_context() -> None:
    """
    Clear CLAUDE_ORCHESTRATOR_CONTEXT environment variable.
    """
    os.environ.pop("CLAUDE_ORCHESTRATOR_CONTEXT", None)


def main() -> None:
    """Main entry point for the orchestrator context hook."""
    hook_input = read_hook_input()

    prompt = get_prompt_from_input(hook_input)

    if not prompt:
        output_result("continue")
        return

    is_orchestrator, context_name = detect_orchestrator_context(prompt)

    if is_orchestrator:
        # Set context
        set_environment_context(context_name)
        persist_context(context_name, prompt)

        message = f"[orchestrator-context] Active: {context_name}"
        output_result("continue", message)
    else:
        # Clear context for non-orchestrator commands
        clear_environment_context()
        clear_context()
        output_result("continue")


if __name__ == "__main__":
    main()
