#!/usr/bin/env python3
"""Convert all print() calls to sys.stdout.write() or sys.stderr.write() in automation/adws/ Python files.

This script automates the replacement of print() calls following these rules:
1. print(message) -> sys.stdout.write(f"{message}\n")
2. print(message, file=sys.stderr) -> sys.stderr.write(f"{message}\n")
3. Ensures "import sys" is present at the top of each file
4. Preserves all logic and error handling
5. Maintains proper newline handling
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple


def ensure_sys_import(content: str) -> str:
    """Ensure 'import sys' is present in the file imports."""
    # Check if sys is already imported
    if re.search(r'^import sys\s*$', content, re.MULTILINE):
        return content

    if re.search(r'^from .* import .*sys.*$', content, re.MULTILINE):
        return content

    # Find the first import statement
    import_match = re.search(r'^(from __future__|import |from )', content, re.MULTILINE)
    if import_match:
        # Find the end of the import block
        lines = content.split('\n')
        insert_index = 0
        in_import_block = False

        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith('from __future__') or stripped.startswith('import ') or stripped.startswith('from '):
                in_import_block = True
                insert_index = i + 1
            elif in_import_block and stripped and not stripped.startswith('#'):
                # End of import block
                break

        # Insert after the last import
        lines.insert(insert_index, 'import sys')
        return '\n'.join(lines)
    else:
        # No imports found, add at the beginning after docstring
        if content.startswith('"""') or content.startswith("'''"):
            # Find end of docstring
            quote_type = '"""' if content.startswith('"""') else "'''"
            end_index = content.find(quote_type, 3)
            if end_index != -1:
                return content[:end_index + 3] + '\n\nimport sys\n' + content[end_index + 3:]

        # Add at the very beginning
        return 'import sys\n\n' + content


def convert_print_calls(content: str) -> Tuple[str, int]:
    """Convert print() calls to sys.stdout.write() or sys.stderr.write().

    Returns:
        Tuple of (converted_content, number_of_replacements)
    """
    replacements = 0

    # Pattern 1: print(..., file=sys.stderr) - these become sys.stderr.write()
    def replace_stderr(match):
        nonlocal replacements
        replacements += 1
        message = match.group(1).strip()
        # Check if message is already an f-string
        if message.startswith('f"') or message.startswith("f'"):
            return f'sys.stderr.write({message}\\n")'
        elif '"' in message or "'" in message:
            # Has quotes, wrap in f-string
            return f'sys.stderr.write(f"{{{message}}}\\n")'
        else:
            return f'sys.stderr.write(f"{message}\\n")'

    # More specific pattern for file=sys.stderr with various whitespace
    content = re.sub(
        r'print\((.*?),\s*file\s*=\s*sys\.stderr\)',
        replace_stderr,
        content
    )

    # Pattern 2: Regular print() calls - these become sys.stdout.write()
    def replace_stdout(match):
        nonlocal replacements
        replacements += 1
        message = match.group(1).strip()

        # Handle empty print()
        if not message:
            return 'sys.stdout.write("\\n")'

        # Check if message is already an f-string
        if message.startswith('f"') or message.startswith("f'"):
            # Already an f-string, just add newline
            if message.endswith('"'):
                return f'sys.stdout.write({message[:-1]}\\n")'
            elif message.endswith("'"):
                return f"sys.stdout.write({message[:-1]}\\n')"
            else:
                return f'sys.stdout.write({message} + "\\n")'
        else:
            # Wrap in f-string
            return f'sys.stdout.write(f"{message}\\n")'

    # Match print statements with various content
    content = re.sub(
        r'print\((.*?)\)(?!\s*#)',  # Avoid matching commented lines
        replace_stdout,
        content
    )

    return content, replacements


def process_file(file_path: Path) -> Tuple[int, bool]:
    """Process a single Python file.

    Returns:
        Tuple of (number_of_replacements, success)
    """
    try:
        # Read file
        original_content = file_path.read_text(encoding='utf-8')

        # Ensure sys import
        content = ensure_sys_import(original_content)

        # Convert print calls
        content, replacements = convert_print_calls(content)

        # Write back only if changes were made
        if content != original_content:
            file_path.write_text(content, encoding='utf-8')
            sys.stdout.write(f"✓ Processed {file_path.name}: {replacements} replacements\n")
            return replacements, True
        else:
            sys.stdout.write(f"  Skipped {file_path.name}: no changes needed\n")
            return 0, True

    except Exception as e:
        sys.stderr.write(f"✗ Error processing {file_path.name}: {e}\n")
        return 0, False


def main():
    """Main entry point."""
    # Find all Python files with print() calls
    adws_dir = Path(__file__).parent.parent

    files_to_process = [
        adws_dir / "adw_tests" / "test_diagnostic_logging.py",
        adws_dir / "adw_triggers" / "adw_trigger_cron_homeserver.py",
        adws_dir / "adw_triggers" / "adw_trigger_api_tasks.py",
        adws_dir / "scripts" / "migrate_beads_schema.py",
        adws_dir / "adw_modules" / "mcp_bridge.py",
        adws_dir / "scripts" / "analyze_logs.py",
        adws_dir / "adw_modules" / "beads_ops.py",
        adws_dir / "scripts" / "analyze_github_workflow_patterns.py",
        adws_dir / "scripts" / "test_atomic_workflow.py",
        adws_dir / "adw_plan_implement_update_homeserver_task.py",
        adws_dir / "adw_modules" / "tasks_api.py",
        adws_dir / "adw_build_update_homeserver_task.py",
    ]

    total_replacements = 0
    total_files = 0
    failed_files = []

    sys.stdout.write("=" * 80 + "\n")
    sys.stdout.write("Converting print() to sys.stdout.write() / sys.stderr.write()\n")
    sys.stdout.write("=" * 80 + "\n\n")

    for file_path in files_to_process:
        if not file_path.exists():
            sys.stdout.write(f"  Skipped {file_path.name}: file not found\n")
            continue

        replacements, success = process_file(file_path)
        total_replacements += replacements
        if success and replacements > 0:
            total_files += 1
        elif not success:
            failed_files.append(file_path.name)

    sys.stdout.write("\n" + "=" * 80 + "\n")
    sys.stdout.write("Summary\n")
    sys.stdout.write("=" * 80 + "\n")
    sys.stdout.write(f"Files modified: {total_files}\n")
    sys.stdout.write(f"Total replacements: {total_replacements}\n")

    if failed_files:
        sys.stdout.write(f"Failed files: {', '.join(failed_files)}\n")
        return 1
    else:
        sys.stdout.write("All files processed successfully!\n")
        return 0


if __name__ == "__main__":
    sys.exit(main())
