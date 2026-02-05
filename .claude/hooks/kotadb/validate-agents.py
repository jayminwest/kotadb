#!/usr/bin/env python3
"""Pre-commit hook to validate agent files.

Validates:
- Agent frontmatter against schema
- Expertise.yaml files against size limits
- Agent registry consistency

Blocks commit on errors, warns on size issues.
"""

import os
import sys
import subprocess
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.hook_helpers import (
    HookLogger,
    read_hook_input,
    output_result,
    get_project_root,
)


def run_script(script_path: str, *args: str) -> tuple[int, str, str]:
    """Run a Python script and return (exit_code, stdout, stderr)."""
    try:
        result = subprocess.run(
            ["python3", script_path, *args],
            capture_output=True,
            text=True,
            timeout=30
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return 1, "", "Script timeout after 30s"
    except Exception as e:
        return 1, "", str(e)


def main() -> None:
    """Validate agents before commit."""
    logger = HookLogger("validate-agents")
    logger.start()
    
    try:
        project_root = get_project_root()
        scripts_dir = project_root / ".claude" / "scripts"
        
        errors = []
        warnings = []
        
        # 1. Validate frontmatter
        validate_script = scripts_dir / "validate-frontmatter.py"
        if validate_script.exists():
            logger.log("VALIDATE", "Running frontmatter validation")
            exit_code, stdout, stderr = run_script(str(validate_script), "--all")
            if exit_code != 0:
                errors.append("Agent frontmatter validation failed")
                if stderr:
                    errors.append(f"  {stderr}")
            elif "warning" in stdout.lower():
                warnings.append("Frontmatter warnings (see output)")
        
        # 2. Check expertise sizes
        expertise_script = scripts_dir / "check-expertise-size.py"
        if expertise_script.exists():
            logger.log("CHECK_SIZE", "Checking expertise file sizes")
            exit_code, stdout, stderr = run_script(str(expertise_script))
            if exit_code != 0:
                # Exit code 1 means errors (files exceed 750 lines)
                errors.append("Expertise files exceed size limit (750 lines)")
                if stderr:
                    errors.append(f"  {stderr}")
            elif "warning" in stdout.lower():
                # Warnings for files 600-750 lines
                warnings.append("Expertise files approaching size limit (600+ lines)")
        
        # 3. Regenerate registry (always runs)
        registry_script = scripts_dir / "generate-registry.py"
        if registry_script.exists():
            logger.log("REGISTRY", "Regenerating agent registry")
            exit_code, stdout, stderr = run_script(str(registry_script))
            if exit_code != 0:
                errors.append("Failed to regenerate agent registry")
                if stderr:
                    errors.append(f"  {stderr}")
        
        # Determine result
        if errors:
            message = "Agent validation failed:\n" + "\n".join(errors)
            if warnings:
                message += "\n\nWarnings:\n" + "\n".join(warnings)
            logger.error("Validation failed")
            logger.end(status="ERROR")
            output_result("fail", message)
        elif warnings:
            message = "Agent validation passed with warnings:\n" + "\n".join(warnings)
            logger.log("WARNINGS", f"{len(warnings)} warnings")
            logger.end()
            output_result("continue", message)
        else:
            logger.log("SUCCESS", "All validations passed")
            logger.end()
            output_result("continue", "Agent validation passed")
            
    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}")
        logger.end(status="ERROR")
        output_result("fail", f"Validation error: {e}")


if __name__ == "__main__":
    main()
