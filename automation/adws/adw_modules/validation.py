"""Output validation functions for ADW workflows.

This module provides validation for ADW-generated outputs to prevent malformed content
from entering git history or creating reviewer burden. Validation includes:

- Commit message format checking (Conventional Commits compliance)
- PR description completeness verification
- File staging validation against plan files

Validation rules are designed to catch common issues observed in historical bad outputs
while minimizing false positives through comprehensive testing.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import List, Optional, Tuple


# Conventional Commits pattern with type and optional scope
# Format: <type>(<scope>): <subject>
# Subject must be 1-72 characters to stay within commit message best practices
COMMIT_MESSAGE_PATTERN = re.compile(
    r'^(feat|fix|chore|docs|test|refactor|perf|ci|build|style)(\(.+\))?: .{1,72}',
    re.MULTILINE
)

# Meta-commentary patterns that indicate agent reasoning leakage
# These patterns signal the agent is explaining the commit rather than providing it
META_COMMENTARY_PATTERNS = [
    r'\bbased on\b',
    r'\bthe commit should\b',
    r'\bhere is\b',
    r'\bthis commit\b',
    r'\bi can see\b',
    r'\blooking at\b',
    r'\bthe changes\b',
    r'\blet me\b',
]


def validate_commit_message(message: str) -> Tuple[bool, Optional[str]]:
    """Validate commit message follows Conventional Commits format.

    Checks:
    1. Message starts with valid conventional commit type
    2. Optional scope in parentheses after type
    3. Colon and space after type/scope
    4. Subject line is 1-72 characters
    5. No meta-commentary or agent reasoning patterns

    Args:
        message: Commit message to validate

    Returns:
        Tuple of (is_valid, error_message)
        - is_valid: True if message is valid
        - error_message: Descriptive error if invalid, None if valid

    Examples:
        >>> validate_commit_message("feat: add user authentication")
        (True, None)

        >>> validate_commit_message("Based on the changes, the commit should...")
        (False, "Commit message contains meta-commentary...")
    """
    if not message or not message.strip():
        return False, "Commit message is empty"

    # Get first line for format checking
    first_line = message.strip().split('\n')[0]

    # Check for meta-commentary patterns in first line only (higher signal of agent confusion)
    # Body text can legitimately contain these phrases in context
    for pattern in META_COMMENTARY_PATTERNS:
        if re.search(pattern, first_line, re.IGNORECASE):
            return False, (
                f"Commit message contains meta-commentary pattern '{pattern}'. "
                f"Expected valid Conventional Commit format like: 'feat: add new feature'"
            )

    # Check Conventional Commits format
    if not COMMIT_MESSAGE_PATTERN.match(first_line):
        return False, (
            f"Commit message does not follow Conventional Commits format. "
            f"Expected format: '<type>(<scope>): <subject>' where type is one of: "
            f"feat, fix, chore, docs, test, refactor, perf, ci, build, style. "
            f"Received: '{first_line}'"
        )

    return True, None


def validate_pr_description(description: str, staged_files: Optional[List[str]] = None) -> Tuple[bool, Optional[str]]:
    """Validate PR description includes required sections and metadata.

    Checks:
    1. Contains "Validation Evidence" or "### Validation" section
    2. File count in description matches staged files count (if provided)
    3. Description is not empty

    Args:
        description: PR description text to validate
        staged_files: Optional list of staged file paths for count validation

    Returns:
        Tuple of (is_valid, error_message)
        - is_valid: True if description is valid
        - error_message: Descriptive error if invalid, None if valid

    Examples:
        >>> validate_pr_description("## Validation Evidence\\nAll tests pass")
        (True, None)

        >>> validate_pr_description("Just some changes")
        (False, "PR description missing validation evidence section...")
    """
    if not description or not description.strip():
        return False, "PR description is empty"

    # Check for validation evidence section
    # Must be in a header or as specific phrase "Validation Evidence"
    validation_patterns = [
        r'##\s+Validation\s+Evidence',  # ## Validation Evidence
        r'###\s+Validation',             # ### Validation
        r'Validation\s+Evidence',        # "Validation Evidence" (not in a word)
    ]

    has_validation_section = any(
        re.search(pattern, description, re.IGNORECASE)
        for pattern in validation_patterns
    )

    if not has_validation_section:
        return False, (
            "PR description missing validation evidence section. "
            "Expected section like '## Validation Evidence' with command output and test results."
        )

    # If staged files provided, verify file count is mentioned
    if staged_files is not None:
        expected_count = len(staged_files)
        # Look for file count patterns like "4 files changed" or "modified 4 files"
        count_pattern = re.compile(r'\b(\d+)\s+files?\s+(changed|modified|updated)', re.IGNORECASE)
        match = count_pattern.search(description)

        if match:
            described_count = int(match.group(1))
            if described_count != expected_count:
                return False, (
                    f"PR description file count mismatch. "
                    f"Description mentions {described_count} files, but {expected_count} files are staged."
                )

    return True, None


def verify_staged_files(plan_file_path: str, cwd: str) -> Tuple[bool, Optional[str]]:
    """Verify files mentioned in plan are properly staged in git.

    Extracts file references from the plan document and compares against
    git staged files. This catches issues where agents create files but
    don't properly stage them for commit.

    Args:
        plan_file_path: Path to plan markdown file (relative to cwd)
        cwd: Working directory (worktree path) for git operations

    Returns:
        Tuple of (is_valid, error_message)
        - is_valid: True if all mentioned files are staged
        - error_message: List of missing files if invalid, None if valid

    Examples:
        >>> verify_staged_files("docs/specs/plan.md", "/path/to/worktree")
        (True, None)
    """
    # Read plan file
    plan_path = Path(cwd) / plan_file_path
    if not plan_path.exists():
        return False, f"Plan file not found: {plan_file_path}"

    try:
        plan_content = plan_path.read_text()
    except Exception as e:
        return False, f"Failed to read plan file: {e}"

    # Extract file references from plan using regex
    # Matches paths in backticks: `path/to/file.ext`
    # Supports common extensions: py, ts, tsx, js, md, json
    file_pattern = re.compile(r'`([a-zA-Z0-9_/.-]+\.(py|ts|tsx|js|md|json|yaml|yml))`')
    mentioned_files = set(file_pattern.findall(plan_content))
    mentioned_paths = {path for path, _ in mentioned_files}

    if not mentioned_paths:
        # No file references found - not necessarily an error
        return True, None

    # Get staged files from git
    try:
        result = subprocess.run(
            ['git', 'diff', '--cached', '--name-only'],
            capture_output=True,
            text=True,
            cwd=cwd,
            check=True
        )
        staged_files = set(result.stdout.strip().split('\n'))
        staged_files.discard('')  # Remove empty strings
    except subprocess.CalledProcessError as e:
        return False, f"Failed to get staged files: {e.stderr}"

    # Find mentioned files that aren't staged
    missing_files = mentioned_paths - staged_files

    if missing_files:
        missing_list = '\n  - '.join(sorted(missing_files))
        return False, (
            f"Plan mentions files that are not staged for commit:\n  - {missing_list}\n"
            f"These files should be staged with 'git add' before committing."
        )

    return True, None


__all__ = [
    'validate_commit_message',
    'validate_pr_description',
    'verify_staged_files',
]
