#!/usr/bin/env python3
"""
UserPromptSubmit hook for context enrichment.

Analyzes user prompts and provides relevant file suggestions based on keywords.
Designed to be lightweight (< 1 second execution).

Per KotaDB logging standards: uses sys.stdout.write(), never print().
"""

import os
import re
import sys
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hooks.utils.hook_helpers import (
    output_result,
    read_hook_input,
)


# Keyword to file suggestions mapping
CONTEXT_SUGGESTIONS: dict[str, list[str]] = {
    "test": [
        "See /testing:testing-guide for antimocking philosophy",
        "See /docs:anti-mock for test patterns",
    ],
    "database": [
        "See /docs:database for schema and migrations",
        "See /docs:architecture for Supabase integration",
    ],
    "migration": [
        "See /docs:database for migration sync requirements",
        "Keep app/src/db/migrations/ and app/supabase/migrations/ in sync",
    ],
    "api": [
        "See /docs:workflow for endpoint documentation",
        "See /docs:architecture for path aliases",
    ],
    "auth": [
        "See /docs:workflow for authentication flow",
        "See app/src/auth/ for auth middleware",
    ],
    "mcp": [
        "See /docs:mcp-integration for MCP server architecture",
        "See /docs:mcp-usage-guidance for decision matrix",
    ],
    "ci": [
        "See /ci:ci-configuration for GitHub Actions setup",
        "See /ci:ci-investigate for debugging failures",
    ],
    "deploy": [
        "See /docs:automated-deployments for deployment flow",
        "See /release:release for production releases",
    ],
    "lint": [
        "See /testing:logging-standards for logging requirements",
        "See /app:pre-commit-hooks for hook configuration",
    ],
    "hook": [
        "See .claude/hooks/ for automation hooks",
        "Hooks use sys.stdout.write() per logging standards",
    ],
    "index": [
        "See /docs:workflow for indexing endpoint",
        "See app/src/indexer/ for indexing logic",
    ],
    "rate": [
        "See /docs:workflow for rate limiting",
        "See app/src/api/middleware/rate-limit.ts",
    ],
    "queue": [
        "See app/src/queue/ for job queue implementation",
        "See /docs:architecture for queue patterns",
    ],
    "validation": [
        "See app/src/validation/ for validation logic",
        "See /workflows:validate-implementation for validation levels",
    ],
}


def extract_keywords(prompt: str) -> list[str]:
    """
    Extract relevant keywords from the prompt.

    Args:
        prompt: User prompt text

    Returns:
        List of matched keywords
    """
    if not prompt:
        return []

    prompt_lower = prompt.lower()
    matched = []

    for keyword in CONTEXT_SUGGESTIONS:
        # Use word boundaries to avoid partial matches
        pattern = rf"\b{re.escape(keyword)}\w*\b"
        if re.search(pattern, prompt_lower):
            matched.append(keyword)

    return matched


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


def build_context_message(keywords: list[str]) -> str:
    """
    Build context message from matched keywords.

    Args:
        keywords: List of matched keywords

    Returns:
        Formatted context message
    """
    if not keywords:
        return ""

    suggestions: list[str] = []
    seen: set[str] = set()

    for keyword in keywords[:3]:  # Limit to 3 keywords
        for suggestion in CONTEXT_SUGGESTIONS.get(keyword, []):
            if suggestion not in seen:
                suggestions.append(suggestion)
                seen.add(suggestion)

    if not suggestions:
        return ""

    # Limit total suggestions
    suggestions = suggestions[:4]

    return "[context-hint] Relevant docs:\n" + "\n".join(f"  - {s}" for s in suggestions)


def main() -> None:
    """Main entry point for the context builder hook."""
    hook_input = read_hook_input()

    prompt = get_prompt_from_input(hook_input)

    if not prompt:
        output_result("continue")
        return

    keywords = extract_keywords(prompt)

    if not keywords:
        output_result("continue")
        return

    message = build_context_message(keywords)

    if message:
        output_result("continue", message)
    else:
        output_result("continue")


if __name__ == "__main__":
    main()
