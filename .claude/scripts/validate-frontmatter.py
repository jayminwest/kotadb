#!/usr/bin/env python3
"""Validate agent frontmatter against JSON Schema.

Usage:
    python3 validate-frontmatter.py <agent-file.md>
    python3 validate-frontmatter.py --all
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional

import jsonschema
import yaml


def get_project_root() -> Path:
    """Find project root by looking for .git directory."""
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / ".git").exists():
            return parent
    raise RuntimeError("Could not find project root (.git directory)")


def parse_frontmatter(content: str) -> Optional[dict]:
    """Extract and parse YAML frontmatter from markdown content."""
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not match:
        return None
    
    try:
        return yaml.safe_load(match.group(1))
    except yaml.YAMLError as e:
        print(f"YAML parse error: {e}", file=sys.stderr)
        return None


def load_schema() -> dict:
    """Load agent frontmatter JSON Schema."""
    project_root = get_project_root()
    schema_path = project_root / ".claude" / "schemas" / "agent-frontmatter.schema.json"
    
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema not found: {schema_path}")
    
    return json.loads(schema_path.read_text())


def validate_agent_file(file_path: Path, schema: dict) -> List[str]:
    """Validate single agent file, return list of errors."""
    errors = []
    
    try:
        content = file_path.read_text()
        frontmatter = parse_frontmatter(content)
        
        if frontmatter is None:
            return ["No valid frontmatter found"]
        
        # Validate against schema
        jsonschema.validate(instance=frontmatter, schema=schema)
        
    except jsonschema.ValidationError as e:
        errors.append(f"Schema validation failed: {e.message}")
    except Exception as e:
        errors.append(f"Validation error: {e}")
    
    return errors


def validate_all_agents(schema: dict) -> Dict[str, List[str]]:
    """Validate all agent files, return dict of file -> errors."""
    project_root = get_project_root()
    agents_dir = project_root / ".claude" / "agents"
    
    results = {}
    
    for md_file in agents_dir.rglob("*.md"):
        if md_file.name == "README.md":
            continue
        
        errors = validate_agent_file(md_file, schema)
        if errors:
            rel_path = md_file.relative_to(project_root)
            results[str(rel_path)] = errors
    
    return results


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Validate agent frontmatter against JSON Schema"
    )
    parser.add_argument(
        "file",
        nargs="?",
        help="Agent file to validate"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Validate all agent files"
    )
    args = parser.parse_args()
    
    try:
        schema = load_schema()
        
        if args.all:
            results = validate_all_agents(schema)
            
            if not results:
                sys.stdout.write("All agent files valid\n")
                return 0
            
            sys.stdout.write(f"{len(results)} files with validation errors:\n\n")
            for file_path, errors in results.items():
                sys.stdout.write(f"{file_path}:\n")
                for error in errors:
                    sys.stdout.write(f"  • {error}\n")
                sys.stdout.write("\n")
            
            return 1
        
        elif args.file:
            file_path = Path(args.file)
            if not file_path.exists():
                print(f"Error: File not found: {file_path}", file=sys.stderr)
                return 1
            
            errors = validate_agent_file(file_path, schema)
            
            if not errors:
                sys.stdout.write(f"{file_path.name} is valid\n")
                return 0
            
            sys.stdout.write(f"Validation errors in {file_path.name}:\n")
            for error in errors:
                sys.stdout.write(f"  • {error}\n")
            
            return 1
        
        else:
            parser.print_help()
            return 1
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
