#!/usr/bin/env python3
"""AST-based print() to sys.stdout.write() converter using Python 3.9+ ast.unparse()."""
import ast
import sys
from pathlib import Path


class PrintToWriteTransformer(ast.NodeTransformer):
    """Transform print() calls to sys.stdout.write() or sys.stderr.write()."""

    def __init__(self):
        self.has_sys_import = False
        self.replacements = 0

    def visit_Import(self, node):
        for alias in node.names:
            if alias.name == 'sys':
                self.has_sys_import = True
        return node

    def visit_ImportFrom(self, node):
        if node.module and 'sys' in node.module:
            self.has_sys_import = True
        for alias in node.names:
            if alias.name == 'sys':
                self.has_sys_import = True
        return node

    def visit_Call(self, node):
        # Check if this is a print() call
        if isinstance(node.func, ast.Name) and node.func.id == 'print':
            self.replacements += 1

            # Check for file=sys.stderr keyword argument
            is_stderr = False
            filtered_keywords = []
            for keyword in node.keywords:
                if keyword.arg == 'file':
                    # Check if it's sys.stderr
                    if isinstance(keyword.value, ast.Attribute):
                        if (isinstance(keyword.value.value, ast.Name) and
                            keyword.value.value.id == 'sys' and
                            keyword.value.attr == 'stderr'):
                            is_stderr = True
                            # Don't include this keyword in new call
                            continue
                filtered_keywords.append(keyword)

            # Build the new call: sys.stdout.write() or sys.stderr.write()
            write_target = 'stderr' if is_stderr else 'stdout'

            # Get the positional arguments (message to print)
            if node.args:
                # Join all args with space (like print does)
                if len(node.args) == 1:
                    message_node = node.args[0]
                else:
                    # Multiple args - need to join with space
                    message_parts = []
                    for i, arg in enumerate(node.args):
                        if i > 0:
                            message_parts.append(ast.Constant(value=" "))
                        message_parts.append(arg)

                    # Build chain of BinOp nodes
                    message_node = message_parts[0]
                    for part in message_parts[1:]:
                        message_node = ast.BinOp(
                            left=message_node,
                            op=ast.Add(),
                            right=part
                        )

                # Add newline
                new_message = ast.BinOp(
                    left=message_node,
                    op=ast.Add(),
                    right=ast.Constant(value="\n")
                )
            else:
                # No arguments, just print newline
                new_message = ast.Constant(value="\n")

            # Create sys.stdout.write() or sys.stderr.write() call
            new_call = ast.Call(
                func=ast.Attribute(
                    value=ast.Attribute(
                        value=ast.Name(id='sys', ctx=ast.Load()),
                        attr=write_target,
                        ctx=ast.Load()
                    ),
                    attr='write',
                    ctx=ast.Load()
                ),
                args=[new_message],
                keywords=[]
            )

            return new_call

        # Not a print call, continue traversing
        return self.generic_visit(node)


def add_sys_import(tree):
    """Add 'import sys' at the top if not present."""
    # Check if sys is already imported
    for node in tree.body:
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == 'sys':
                    return tree
        elif isinstance(node, ast.ImportFrom):
            if node.module and 'sys' in node.module:
                return tree
            for alias in node.names:
                if alias.name == 'sys':
                    return tree

    # Find position to insert (after docstring and __future__ imports)
    insert_pos = 0
    for i, node in enumerate(tree.body):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant):
            # Skip docstring
            insert_pos = i + 1
        elif isinstance(node, ast.ImportFrom) and node.module == '__future__':
            # Skip __future__ imports
            insert_pos = i + 1
        else:
            break

    # Insert import sys
    import_sys = ast.Import(names=[ast.alias(name='sys', asname=None)])
    tree.body.insert(insert_pos, import_sys)
    return tree


def transform_file(filepath):
    """Transform print() calls in a single file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            source = f.read()
    except Exception as e:
        sys.stderr.write(f"Error reading {filepath}: {e}\n")
        return 0

    try:
        tree = ast.parse(source, filename=str(filepath))
    except SyntaxError as e:
        sys.stderr.write(f"Syntax error in {filepath}: {e}\n")
        return 0

    transformer = PrintToWriteTransformer()
    new_tree = transformer.visit(tree)

    if transformer.replacements == 0:
        return 0

    # Add sys import if needed and replacements were made
    if transformer.replacements > 0:
        new_tree = add_sys_import(new_tree)

    # Convert back to source code
    try:
        ast.fix_missing_locations(new_tree)
        new_source = ast.unparse(new_tree)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_source)
        sys.stdout.write(f"✓ {filepath.name}: {transformer.replacements} replacements\n")
        return transformer.replacements
    except Exception as e:
        sys.stderr.write(f"✗ Error writing {filepath}: {e}\n")
        return 0


def main():
    """Process all target files."""
    base_dir = Path(__file__).parent.parent

    files_to_process = [
        base_dir / "adw_tests" / "test_diagnostic_logging.py",
        base_dir / "adw_triggers" / "adw_trigger_cron_homeserver.py",
        base_dir / "adw_triggers" / "adw_trigger_api_tasks.py",
        base_dir / "adw_modules" / "mcp_bridge.py",
        base_dir / "scripts" / "analyze_logs.py",
        base_dir / "scripts" / "analyze_github_workflow_patterns.py",
        base_dir / "adw_plan_implement_update_homeserver_task.py",
        base_dir / "adw_build_update_homeserver_task.py",
    ]

    total = 0
    sys.stdout.write("=" * 80 + "\n")
    sys.stdout.write("Converting print() to sys.stdout.write() / sys.stderr.write()\n")
    sys.stdout.write("=" * 80 + "\n\n")

    for filepath in files_to_process:
        if not filepath.exists():
            sys.stdout.write(f"  Skipped {filepath.name}: not found\n")
            continue

        count = transform_file(filepath)
        total += count

    sys.stdout.write("\n" + "=" * 80 + "\n")
    sys.stdout.write(f"Total replacements: {total}\n")
    sys.stdout.write("=" * 80 + "\n")

    return 0 if total > 0 else 1


if __name__ == '__main__':
    sys.exit(main())
