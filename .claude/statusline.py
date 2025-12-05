#!/usr/bin/env python3
"""
Custom status line for Claude Code.
Displays: Model | Lines (+added/-removed) | Git branch | Project
Uses ANSI colors for visual styling.
"""
import json
import os
import subprocess
import sys


# ANSI color codes
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"

    # Foreground colors
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"

    # Bright variants
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_CYAN = "\033[96m"


def get_git_branch() -> str | None:
    """Get current git branch name."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=1,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def format_lines(added: int, removed: int) -> str:
    """Format lines added/removed with colors."""
    parts = []
    if added > 0:
        parts.append(f"{Colors.BRIGHT_GREEN}+{added}{Colors.RESET}")
    if removed > 0:
        parts.append(f"{Colors.BRIGHT_RED}-{removed}{Colors.RESET}")

    if parts:
        return " ".join(parts)
    return f"{Colors.DIM}no changes{Colors.RESET}"


def get_model_color(model_name: str) -> str:
    """Return appropriate color for model name."""
    name_lower = model_name.lower()
    if "opus" in name_lower:
        return Colors.BRIGHT_MAGENTA
    elif "sonnet" in name_lower:
        return Colors.BRIGHT_CYAN
    elif "haiku" in name_lower:
        return Colors.BRIGHT_YELLOW
    return Colors.WHITE


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        print("statusline: invalid input")
        return

    # Extract data with safe defaults
    model_info = data.get("model", {})
    model_name = model_info.get("display_name", "Unknown")
    model_color = get_model_color(model_name)

    workspace = data.get("workspace", {})
    project_dir = workspace.get("project_dir", workspace.get("current_dir", ""))
    project_name = os.path.basename(project_dir) if project_dir else "unknown"

    cost_info = data.get("cost", {})
    lines_added = cost_info.get("total_lines_added", 0)
    lines_removed = cost_info.get("total_lines_removed", 0)

    # Get git branch
    git_branch = get_git_branch()

    # Build status line components
    sep = f" {Colors.DIM}|{Colors.RESET} "

    parts = [
        f"{model_color}{Colors.BOLD}{model_name}{Colors.RESET}",
        format_lines(lines_added, lines_removed),
    ]

    if git_branch:
        # Color branch based on common patterns
        branch_color = Colors.BRIGHT_YELLOW
        if git_branch in ("main", "master"):
            branch_color = Colors.BRIGHT_RED
        elif git_branch.startswith("develop"):
            branch_color = Colors.BRIGHT_GREEN
        elif git_branch.startswith("feature/"):
            branch_color = Colors.BRIGHT_CYAN
        elif git_branch.startswith("fix/") or git_branch.startswith("hotfix/"):
            branch_color = Colors.BRIGHT_MAGENTA

        parts.append(f"{branch_color}{git_branch}{Colors.RESET}")

    parts.append(f"{Colors.BLUE}{project_name}{Colors.RESET}")

    print(sep.join(parts))


if __name__ == "__main__":
    main()
