#!/usr/bin/env python3
"""PostToolUse hook to validate agent edits.

Triggered after Write or Edit operations on agent files.
Validates frontmatter and suggests registry regeneration.
"""

import os
import sys
import re
import subprocess
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.hook_helpers import (
    HookLogger,
    read_hook_input,
    output_result,
    get_file_path_from_input,
    get_project_root,
)


def is_agent_file(file_path: str) -> bool:
    """Check if file is an agent definition."""
    return (
        file_path.endswith('.md') and
        '/.claude/agents/' in file_path and
        '/README.md' not in file_path
    )


def validate_frontmatter(file_path: Path) -> list[str]:
    """Quick validation of frontmatter in agent file."""
    errors = []
    
    try:
        content = file_path.read_text()
        
        # Check for frontmatter existence
        if not content.startswith('---'):
            errors.append("No frontmatter found")
            return errors
        
        match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
        if not match:
            errors.append("Malformed frontmatter")
            return errors
        
        frontmatter_text = match.group(1)
        
        # Quick checks for required fields
        if 'name:' not in frontmatter_text:
            errors.append("Missing required field: name")
        if 'description:' not in frontmatter_text:
            errors.append("Missing required field: description")
        if 'tools:' not in frontmatter_text:
            errors.append("Missing required field: tools")
        
        # Check for colons in description (common mistake)
        for line in frontmatter_text.split('\n'):
            if line.startswith('description:'):
                desc_value = line.split(':', 1)[1].strip()
                if ':' in desc_value:
                    errors.append("Description contains colon (not allowed)")
        
    except Exception as e:
        errors.append(f"Validation error: {e}")
    
    return errors


def main() -> None:
    """Validate agent edit."""
    logger = HookLogger("validate-agent-edit")
    logger.start()
    
    try:
        hook_input = read_hook_input()
        file_path = get_file_path_from_input(hook_input)
        
        if not file_path:
            logger.log("NO_FILE", "No file path in input")
            output_result("continue")
            return
        
        # Only validate agent files
        if not is_agent_file(file_path):
            logger.log("SKIP", f"Not an agent file: {file_path}")
            output_result("continue")
            return
        
        logger.log("FILE", f"Validating {file_path}")
        
        path_obj = Path(file_path)
        if not path_obj.exists():
            logger.log("NO_FILE", "File does not exist")
            output_result("continue")
            return
        
        errors = validate_frontmatter(path_obj)
        
        if errors:
            message = f"Agent validation failed for {path_obj.name}:\n" + "\n".join(f"  • {e}" for e in errors)
            logger.error(message)
            logger.end(status="ERROR")
            output_result("fail", message)
        else:
            sys.stdout.write(f"Agent validated: {path_obj.name}\n")
            sys.stdout.write("Note: Run generate-registry.py to update agent-registry.json\n")
            logger.log("VALIDATED", f"Agent {path_obj.name} is valid")
            logger.end()
            output_result("continue")
            
    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}")
        logger.end(status="ERROR")
        output_result("fail", f"Validation error: {e}")


if __name__ == "__main__":
    main()
