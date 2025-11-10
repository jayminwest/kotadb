# ADW Exit Codes

This document describes the exit code convention used across ADW phases to enable better debugging and error handling.

## Exit Code Ranges

Exit codes are organized into ranges by failure category:

| Range | Category | Description |
|-------|----------|-------------|
| 0 | Success | Operation completed successfully |
| 1-9 | Blockers | Missing preconditions that prevent execution |
| 10-19 | Validation Failures | Code review failures, test failures, quality issues |
| 20-29 | Execution Failures | Agent execution errors, timeouts, parsing errors |
| 30-39 | Resource Failures | Git errors, file I/O errors, infrastructure issues |

## Blocker Exit Codes (1-9)

Blockers indicate missing preconditions that must be resolved before the phase can execute. These are not failures of the current phase, but rather missing prerequisites from earlier phases or environmental setup.

| Code | Constant | Description | Example Recovery |
|------|----------|-------------|------------------|
| 1 | `EXIT_BLOCKER_MISSING_ENV` | Missing environment variables or executables | Set `ANTHROPIC_API_KEY`, install Claude CLI |
| 2 | `EXIT_BLOCKER_MISSING_STATE` | Missing workflow state | Run plan/build phase first to generate state |
| 3 | `EXIT_BLOCKER_MISSING_WORKTREE` | Worktree not found or invalid | Re-run plan phase to create worktree |
| 4 | `EXIT_BLOCKER_MISSING_SPEC` | Plan/spec file not found | Run planning phase to generate spec |
| 5 | `EXIT_BLOCKER_INVALID_ARGS` | Invalid command-line arguments | Check usage and provide required arguments |
| 6 | `EXIT_BLOCKER_DEPENDENCY_UNMET` | Unresolved dependencies | Close blocking issues first |
| 7 | `EXIT_BLOCKER_RESOURCE_UNAVAILABLE` | Required resource unavailable | Check GitHub API, network connectivity |

## Validation Failure Exit Codes (10-19)

Validation failures indicate that the review or validation step found issues with the code quality, test results, or security.

| Code | Constant | Description | Example Recovery |
|------|----------|-------------|------------------|
| 10 | `EXIT_VALIDATION_BLOCKERS_DETECTED` | Review found blocking issues | Address blockers in worktree and re-run review |
| 11 | `EXIT_VALIDATION_TESTS_FAILED` | Test suite failures | Fix failing tests and re-run validation |
| 12 | `EXIT_VALIDATION_LINT_FAILED` | Linting failures | Run `bun run lint --fix`, fix remaining issues |
| 13 | `EXIT_VALIDATION_TYPECHECK_FAILED` | Type-checking failures | Fix TypeScript errors and re-run `bunx tsc --noEmit` |
| 14 | `EXIT_VALIDATION_SECURITY_ISSUE` | Security vulnerabilities detected | Address security issues and re-scan |

## Execution Failure Exit Codes (20-29)

Execution failures indicate that the agent or phase script encountered an error during execution.

| Code | Constant | Description | Example Recovery |
|------|----------|-------------|------------------|
| 20 | `EXIT_EXEC_AGENT_FAILED` | Agent execution failed | Check agent logs, verify prompt/input validity |
| 21 | `EXIT_EXEC_TIMEOUT` | Agent execution timeout | Increase timeout or simplify task |
| 22 | `EXIT_EXEC_PARSE_ERROR` | Failed to parse agent output | Check agent output format, update parser |
| 23 | `EXIT_EXEC_UNEXPECTED_ERROR` | Unexpected runtime error | Check logs, investigate stack trace |

## Resource Failure Exit Codes (30-39)

Resource failures indicate infrastructure or external service errors.

| Code | Constant | Description | Example Recovery |
|------|----------|-------------|------------------|
| 30 | `EXIT_RESOURCE_GIT_ERROR` | Git operation failed | Check git status, resolve conflicts |
| 31 | `EXIT_RESOURCE_FILE_ERROR` | File I/O error | Check permissions, disk space |
| 32 | `EXIT_RESOURCE_NETWORK_ERROR` | Network/API error | Check connectivity, retry after delay |
| 33 | `EXIT_RESOURCE_REPO_ERROR` | Repository resolution error | Verify remote URL, check GitHub access |

## Usage in ADW Phases

### Review Phase (`adw_review.py`)

The review phase uses distinct exit codes to differentiate between:

**Blockers** (must be resolved before review can run):
- Exit 1: Missing environment variables (`ANTHROPIC_API_KEY`, Claude CLI)
- Exit 2: Missing workflow state (no plan/build execution before review)
- Exit 3: Worktree not found (worktree deleted or invalid path)
- Exit 4: Spec file not found (planning phase incomplete)
- Exit 33: Repository resolution error (cannot determine repo URL)

**Validation Failures** (review found issues):
- Exit 10: Review detected blocking issues in the code

**Execution Failures** (review agent crashed):
- Exit 20: Review agent execution failed (API error, timeout, etc.)

### Example: Debugging with Exit Codes

When a review phase fails, check the exit code to understand the failure category:

```bash
uv run automation/adws/adw_phases/adw_review.py 123 abc-123-xyz
echo $?  # Check exit code
```

**Exit code interpretation:**
- `0`: Review completed successfully, no blockers found
- `1-9`: Blocker - fix prerequisite before retrying
- `10-19`: Validation failure - address code issues
- `20-29`: Execution failure - check agent logs
- `30-39`: Resource failure - check infrastructure

## Integration with Orchestrator

The orchestrator can use exit codes to determine retry strategies:

```python
exit_code = subprocess.run(["uv", "run", "adws/adw_review.py", issue, adw_id]).returncode

if exit_code == 0:
    # Success - continue to next phase
    proceed_to_next_phase()
elif 1 <= exit_code <= 9:
    # Blocker - do not retry, requires manual intervention
    save_checkpoint_with_error("blocker", exit_code)
    notify_user_of_missing_prerequisite(exit_code)
elif 10 <= exit_code <= 19:
    # Validation failure - do not retry, requires code changes
    save_checkpoint_with_error("validation_failure", exit_code)
    notify_user_to_fix_code(exit_code)
elif 20 <= exit_code <= 29:
    # Execution failure - may retry with backoff
    if retry_count < max_retries:
        retry_with_backoff()
    else:
        save_checkpoint_with_error("execution_failure", exit_code)
elif 30 <= exit_code <= 39:
    # Resource failure - may retry with backoff
    if retry_count < max_retries:
        retry_with_backoff()
    else:
        save_checkpoint_with_error("resource_failure", exit_code)
```

## Helper Functions

The `adw_modules/exit_codes.py` module provides helper functions for working with exit codes:

```python
from adw_modules.exit_codes import (
    get_exit_code_description,
    is_blocker,
    is_validation_failure,
    is_execution_failure,
    is_resource_failure,
)

# Get human-readable description
description = get_exit_code_description(10)
# "Validation Failure: Review found blocking issues"

# Check exit code category
if is_blocker(exit_code):
    # Handle blocker scenario (no retry)
    pass
elif is_validation_failure(exit_code):
    # Handle validation failure (requires code changes)
    pass
elif is_execution_failure(exit_code) or is_resource_failure(exit_code):
    # Handle transient failure (may retry)
    pass
```

## Future Enhancements

Planned improvements to the exit code system:

1. **Extend to all phases**: Apply distinct exit codes to plan and build phases
2. **Exit code logging**: Add exit code to structured logs for analytics
3. **Automatic recovery**: Implement retry logic based on exit code category
4. **CI/CD integration**: Use exit codes in GitHub Actions for better error reporting

## References

- **Implementation**: `automation/adws/adw_modules/exit_codes.py`
- **Review Phase**: `automation/adws/adw_phases/adw_review.py`
- **Issue**: #179 - Clarify ADW review phase exit codes
