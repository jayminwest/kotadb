#!/usr/bin/env python3
"""
PostToolUse hook for auto-linting TypeScript/JavaScript files.

Triggers after Write|Edit operations on .ts, .tsx, .js, .jsx files.
Runs Biome linter with auto-fix enabled.

Per KotaDB logging standards: uses sys.stdout.write(), never print().
"""

import os
import shutil
import subprocess
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hooks.utils.hook_helpers import (
    get_file_path_from_input,
    get_project_root,
    is_js_ts_file,
    output_result,
    read_hook_input,
)


def find_biome_config(file_path: str, project_root: str) -> str | None:
    """
    Find the biome.json config file for the given file.

    Searches upward from the file's directory to find biome.json.

    Args:
        file_path: Path to the file being linted
        project_root: Project root directory

    Returns:
        Path to biome.json if found, None otherwise
    """
    current_dir = os.path.dirname(file_path)

    while current_dir.startswith(project_root):
        config_path = os.path.join(current_dir, "biome.json")
        if os.path.exists(config_path):
            return config_path
        parent = os.path.dirname(current_dir)
        if parent == current_dir:
            break
        current_dir = parent

    return None


def run_biome_lint(file_path: str, project_root: str) -> tuple[bool, str]:
    """
    Run Biome linter on the specified file.

    Args:
        file_path: Path to the file to lint
        project_root: Project root directory

    Returns:
        Tuple of (success, message)
    """
    # Check if bunx is available
    if not shutil.which("bunx"):
        return False, "bunx not found in PATH"

    # Find biome config
    config_path = find_biome_config(file_path, project_root)
    if not config_path:
        return False, "No biome.json config found"

    config_dir = os.path.dirname(config_path)

    try:
        result = subprocess.run(
            ["bunx", "biome", "check", "--write", file_path],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=config_dir,
        )

        if result.returncode == 0:
            return True, "Lint passed (0 errors)"
        else:
            # Extract error count from output if available
            stderr = result.stderr.strip()
            stdout = result.stdout.strip()
            output = stderr or stdout

            # Try to extract useful info from output
            if "error" in output.lower():
                lines = output.split("\n")
                error_lines = [l for l in lines if "error" in l.lower()][:3]
                if error_lines:
                    return False, f"Lint issues: {'; '.join(error_lines)}"

            return False, f"Lint found issues (exit code {result.returncode})"

    except subprocess.TimeoutExpired:
        return False, "Lint timed out (30s limit)"
    except FileNotFoundError:
        return False, "Biome not installed"
    except Exception as e:
        return False, f"Lint error: {str(e)}"


def main() -> None:
    """Main entry point for the auto-linter hook."""
    hook_input = read_hook_input()

    # Extract file path from tool input
    file_path = get_file_path_from_input(hook_input)

    if not file_path:
        output_result("continue", "No file path in hook input")
        return

    # Only process JS/TS files
    if not is_js_ts_file(file_path):
        output_result("continue")
        return

    # Verify file exists
    if not os.path.exists(file_path):
        output_result("continue", f"File not found: {file_path}")
        return

    project_root = get_project_root()

    # Run linter
    success, message = run_biome_lint(file_path, project_root)

    if success:
        output_result("continue", f"[auto-lint] {message}")
    else:
        output_result("continue", f"[auto-lint] {message}")


if __name__ == "__main__":
    main()
