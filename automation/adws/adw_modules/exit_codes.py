"""Exit code constants for ADW phases.

This module defines distinct exit codes for different failure scenarios
to enable better debugging and error handling in the ADW pipeline.

Exit Code Ranges:
    0: Success
    1-9: Blockers (missing preconditions, environment issues)
    10-19: Validation failures (code review failures, test failures)
    20-29: Execution failures (agent execution errors, timeouts)
    30-39: Resource failures (git errors, file I/O errors)
"""

from __future__ import annotations

# Success
EXIT_SUCCESS = 0

# Blockers (1-9): Missing preconditions that prevent execution
EXIT_BLOCKER_MISSING_ENV = 1  # Missing environment variables or executables
EXIT_BLOCKER_MISSING_STATE = 2  # Missing workflow state (run plan/build first)
EXIT_BLOCKER_MISSING_WORKTREE = 3  # Worktree not found or invalid
EXIT_BLOCKER_MISSING_SPEC = 4  # Plan/spec file not found
EXIT_BLOCKER_INVALID_ARGS = 5  # Invalid command-line arguments
EXIT_BLOCKER_RESOURCE_UNAVAILABLE = 7  # Required resource unavailable (GitHub API, etc.)

# Validation Failures (10-19): Code review or validation failures
EXIT_VALIDATION_BLOCKERS_DETECTED = 10  # Review found blocking issues
EXIT_VALIDATION_TESTS_FAILED = 11  # Test suite failures
EXIT_VALIDATION_LINT_FAILED = 12  # Linting failures
EXIT_VALIDATION_TYPECHECK_FAILED = 13  # Type-checking failures
EXIT_VALIDATION_SECURITY_ISSUE = 14  # Security vulnerabilities detected

# Execution Failures (20-29): Agent execution errors
EXIT_EXEC_AGENT_FAILED = 20  # Agent execution failed
EXIT_EXEC_TIMEOUT = 21  # Agent execution timeout
EXIT_EXEC_PARSE_ERROR = 22  # Failed to parse agent output
EXIT_EXEC_UNEXPECTED_ERROR = 23  # Unexpected runtime error

# Resource Failures (30-39): Git, file I/O, and infrastructure errors
EXIT_RESOURCE_GIT_ERROR = 30  # Git operation failed
EXIT_RESOURCE_FILE_ERROR = 31  # File I/O error
EXIT_RESOURCE_NETWORK_ERROR = 32  # Network/API error
EXIT_RESOURCE_REPO_ERROR = 33  # Repository resolution error


def get_exit_code_description(code: int) -> str:
    """Get human-readable description for an exit code.

    Args:
        code: Exit code to describe

    Returns:
        Description string for the exit code

    Examples:
        >>> get_exit_code_description(EXIT_BLOCKER_MISSING_ENV)
        'Blocker: Missing environment variables or executables'
        >>> get_exit_code_description(EXIT_VALIDATION_BLOCKERS_DETECTED)
        'Validation Failure: Review found blocking issues'
        >>> get_exit_code_description(99)
        'Unknown exit code: 99'
    """
    descriptions = {
        EXIT_SUCCESS: "Success",
        # Blockers
        EXIT_BLOCKER_MISSING_ENV: "Blocker: Missing environment variables or executables",
        EXIT_BLOCKER_MISSING_STATE: "Blocker: Missing workflow state (run plan/build first)",
        EXIT_BLOCKER_MISSING_WORKTREE: "Blocker: Worktree not found or invalid",
        EXIT_BLOCKER_MISSING_SPEC: "Blocker: Plan/spec file not found",
        EXIT_BLOCKER_INVALID_ARGS: "Blocker: Invalid command-line arguments",
        EXIT_BLOCKER_RESOURCE_UNAVAILABLE: "Blocker: Required resource unavailable",
        # Validation Failures
        EXIT_VALIDATION_BLOCKERS_DETECTED: "Validation Failure: Review found blocking issues",
        EXIT_VALIDATION_TESTS_FAILED: "Validation Failure: Test suite failures",
        EXIT_VALIDATION_LINT_FAILED: "Validation Failure: Linting failures",
        EXIT_VALIDATION_TYPECHECK_FAILED: "Validation Failure: Type-checking failures",
        EXIT_VALIDATION_SECURITY_ISSUE: "Validation Failure: Security vulnerabilities detected",
        # Execution Failures
        EXIT_EXEC_AGENT_FAILED: "Execution Failure: Agent execution failed",
        EXIT_EXEC_TIMEOUT: "Execution Failure: Agent execution timeout",
        EXIT_EXEC_PARSE_ERROR: "Execution Failure: Failed to parse agent output",
        EXIT_EXEC_UNEXPECTED_ERROR: "Execution Failure: Unexpected runtime error",
        # Resource Failures
        EXIT_RESOURCE_GIT_ERROR: "Resource Failure: Git operation failed",
        EXIT_RESOURCE_FILE_ERROR: "Resource Failure: File I/O error",
        EXIT_RESOURCE_NETWORK_ERROR: "Resource Failure: Network/API error",
        EXIT_RESOURCE_REPO_ERROR: "Resource Failure: Repository resolution error",
    }
    return descriptions.get(code, f"Unknown exit code: {code}")


def is_blocker(code: int) -> bool:
    """Check if exit code represents a blocker (missing precondition).

    Args:
        code: Exit code to check

    Returns:
        True if code is in blocker range (1-9), False otherwise

    Examples:
        >>> is_blocker(EXIT_BLOCKER_MISSING_ENV)
        True
        >>> is_blocker(EXIT_VALIDATION_BLOCKERS_DETECTED)
        False
    """
    return 1 <= code <= 9


def is_validation_failure(code: int) -> bool:
    """Check if exit code represents a validation failure.

    Args:
        code: Exit code to check

    Returns:
        True if code is in validation failure range (10-19), False otherwise

    Examples:
        >>> is_validation_failure(EXIT_VALIDATION_BLOCKERS_DETECTED)
        True
        >>> is_validation_failure(EXIT_BLOCKER_MISSING_ENV)
        False
    """
    return 10 <= code <= 19


def is_execution_failure(code: int) -> bool:
    """Check if exit code represents an execution failure.

    Args:
        code: Exit code to check

    Returns:
        True if code is in execution failure range (20-29), False otherwise

    Examples:
        >>> is_execution_failure(EXIT_EXEC_AGENT_FAILED)
        True
        >>> is_execution_failure(EXIT_VALIDATION_BLOCKERS_DETECTED)
        False
    """
    return 20 <= code <= 29


def is_resource_failure(code: int) -> bool:
    """Check if exit code represents a resource failure.

    Args:
        code: Exit code to check

    Returns:
        True if code is in resource failure range (30-39), False otherwise

    Examples:
        >>> is_resource_failure(EXIT_RESOURCE_GIT_ERROR)
        True
        >>> is_resource_failure(EXIT_EXEC_AGENT_FAILED)
        False
    """
    return 30 <= code <= 39
