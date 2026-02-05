#!/usr/bin/env python3
"""Check expertise.yaml files against size limits.

Thresholds:
    - Warning: 600 lines
    - Error: 750 lines

Usage:
    python3 check-expertise-size.py              # Check all expertise files
    python3 check-expertise-size.py --fix        # Show extraction suggestions
"""

import argparse
import sys
from pathlib import Path


WARN_THRESHOLD = 600
ERROR_THRESHOLD = 750


def get_project_root() -> Path:
    """Find project root by looking for .git directory."""
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / ".git").exists():
            return parent
    raise RuntimeError("Could not find project root (.git directory)")


def count_lines(file_path: Path) -> int:
    """Count non-empty lines in file."""
    try:
        content = file_path.read_text()
        return len([line for line in content.splitlines() if line.strip()])
    except Exception as e:
        print(f"Error reading {file_path}: {e}", file=sys.stderr)
        return 0


def check_file_size(path: Path) -> tuple[int, str]:
    """Check file size against thresholds.
    
    Returns:
        (line_count, status) where status is 'ok' | 'warning' | 'error'
    """
    line_count = count_lines(path)
    
    if line_count >= ERROR_THRESHOLD:
        return line_count, "error"
    elif line_count >= WARN_THRESHOLD:
        return line_count, "warning"
    else:
        return line_count, "ok"


def suggest_extraction(path: Path, line_count: int) -> str:
    """Suggest what to extract when file is too large."""
    content = path.read_text()
    
    suggestions = []
    
    # Check for large example blocks
    example_count = content.count("```")
    if example_count > 10:
        suggestions.append(
            f"  • Extract {example_count // 2} code examples to {path.parent}/examples/"
        )
    
    # Check for repetitive patterns
    if "##" in content:
        section_count = content.count("\n##")
        if section_count > 15:
            suggestions.append(
                f"  • Consolidate {section_count} sections into broader categories"
            )
    
    # Check for list items
    list_item_count = content.count("\n- ")
    if list_item_count > 50:
        suggestions.append(
            f"  • Reduce {list_item_count} list items by removing redundant entries"
        )
    
    if not suggestions:
        suggestions.append("  • Review for verbose descriptions and outdated learnings")
    
    return "\n".join(suggestions)


def check_all_expertise(show_suggestions: bool = False) -> list[dict]:
    """Check all expertise.yaml files, return issues."""
    project_root = get_project_root()
    experts_dir = project_root / ".claude" / "agents" / "experts"
    
    if not experts_dir.exists():
        print(f"Error: Experts directory not found: {experts_dir}", file=sys.stderr)
        return []
    
    issues = []
    
    for expertise_file in experts_dir.rglob("expertise.yaml"):
        line_count, status = check_file_size(expertise_file)
        
        if status != "ok":
            rel_path = expertise_file.relative_to(project_root)
            issue = {
                "path": str(rel_path),
                "line_count": line_count,
                "status": status,
                "threshold": ERROR_THRESHOLD if status == "error" else WARN_THRESHOLD
            }
            issues.append(issue)
            
            # Print issue
            symbol = "ERROR" if status == "error" else "WARNING"
            sys.stdout.write(f"{symbol}: {rel_path}: {line_count} lines (limit: {issue['threshold']})\n")
            
            if show_suggestions:
                sys.stdout.write(suggest_extraction(expertise_file, line_count) + "\n\n")
    
    return issues


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Check expertise.yaml files against size limits"
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Show extraction suggestions for oversized files"
    )
    args = parser.parse_args()
    
    try:
        issues = check_all_expertise(show_suggestions=args.fix)
        
        if not issues:
            sys.stdout.write("All expertise files within size limits\n")
            return 0
        
        # Count errors vs warnings
        errors = [i for i in issues if i["status"] == "error"]
        warnings = [i for i in issues if i["status"] == "warning"]
        
        sys.stdout.write(f"\nSummary: {len(errors)} errors, {len(warnings)} warnings\n")
        
        if errors:
            sys.stdout.write("\nFiles exceeding error threshold must be reduced before commit.\n")
            return 1
        else:
            sys.stdout.write("\nWarnings should be addressed in next iteration.\n")
            return 0
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
