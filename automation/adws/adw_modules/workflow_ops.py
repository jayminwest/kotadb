"""Shared workflow helpers for the modular ADW surface."""

from __future__ import annotations

import json
import logging
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

from .agent import execute_template
from .data_types import (
    AgentPromptResponse,
    AgentTemplateRequest,
    DocumentationResult,
    GitHubIssue,
    IssueClassSlashCommand,
    ReviewResult,
)
from .git_ops import GitError
from .github import ADW_BOT_IDENTIFIER
from .state import ADWState, ensure_adw_id as core_ensure_adw_id
from .ts_commands import Command, serialize_commands, validation_commands
from .utils import parse_json, project_root, setup_logger
from .validation import validate_commit_message

AGENT_PLANNER = "sdlc_planner"
AGENT_IMPLEMENTOR = "sdlc_implementor"
AGENT_CLASSIFIER = "issue_classifier"
AGENT_PLAN_FINDER = "plan_finder"
AGENT_BRANCH_GENERATOR = "branch_generator"
AGENT_PR_CREATOR = "pr_creator"
AGENT_TESTER = "test_runner"
AGENT_REVIEWER = "sdlc_reviewer"
AGENT_DOCUMENTOR = "documentation_writer"
AGENT_PATCHER = "patch_runner"

AVAILABLE_ADW_WORKFLOWS = [
    "adw_plan",
    "adw_build",
    "adw_test",
    "adw_review",
    "adw_document",
    "adw_patch",
    "adw_plan_build",
    "adw_plan_build_test",
    "adw_plan_build_review",
    "adw_plan_build_test_review",
    "adw_plan_build_document",
    "adw_sdlc",
]

LOCKFILE_NAMES = ("bun.lock", "package-lock.json", "yarn.lock", "pnpm-lock.yaml")


@dataclass
class ValidationCommandResult:
    """Outcome of running a validation command.

    Attributes:
        label: Human-readable command label (e.g., "Lint", "Type Check")
        command: Command argv list
        returncode: Exit code from process execution
        stdout: Standard output from command
        stderr: Standard error from command
        resolution_attempted: Whether agent resolution was attempted for this failure
    """

    label: str
    command: Sequence[str]
    returncode: int
    stdout: str
    stderr: str
    resolution_attempted: bool = False

    @property
    def ok(self) -> bool:
        return self.returncode == 0


DEFAULT_VALIDATION_SEQUENCE = validation_commands()


def ensure_state(adw_id: str | None, issue_number: str | None = None) -> Tuple[str, ADWState]:
    """Initialise or load workflow state for an ADW run."""

    resolved_adw_id = core_ensure_adw_id(adw_id)
    state = ADWState.load(resolved_adw_id, create=True)
    if issue_number and state.issue_number != issue_number:
        state.update(issue_number=issue_number)
    return resolved_adw_id, state


def start_logger(adw_id: str, phase: str) -> logging.Logger:
    """Create a logger scoped to the phase."""

    return setup_logger(adw_id, trigger_type=phase)


def format_issue_message(adw_id: str, agent_name: str, message: str, session_id: str | None = None) -> str:
    """Prefix a message with ADW metadata to align with TAC automation parsers."""

    prefix = f"{adw_id}_{agent_name}"
    if session_id:
        prefix = f"{prefix}_{session_id}"
    return f"{ADW_BOT_IDENTIFIER} {prefix}: {message}"


def minimal_issue_payload(issue: GitHubIssue) -> str:
    """Return a tightly scoped JSON payload for prompts."""

    return issue.model_dump_json(by_alias=True, include={"number", "title", "body"})


def _extract_slash_command(output: str, allowed: Sequence[str]) -> Optional[str]:
    pattern = "|".join(re.escape(cmd) for cmd in allowed)
    match = re.search(rf"({pattern})", output)
    if match:
        return match.group(1)
    stripped = output.strip()
    return stripped if stripped in allowed else None


def classify_issue(issue: GitHubIssue, adw_id: str, logger: logging.Logger) -> Tuple[Optional[IssueClassSlashCommand], Optional[str]]:
    """Ask the classifier agent for a slash command classification."""

    request = AgentTemplateRequest(
        agent_name=AGENT_CLASSIFIER,
        slash_command="/classify_issue",
        args=[minimal_issue_payload(issue)],
        adw_id=adw_id,
        model="sonnet",
    )
    logger.debug(f"classify_issue request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"classify_issue response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    command = _extract_slash_command(response.output, ["/chore", "/bug", "/feature"])
    if not command:
        return None, f"Unrecognised classification: {response.output}"
    return command, None  # type: ignore[return-value]


def generate_branch_name(
    issue: GitHubIssue,
    issue_class: IssueClassSlashCommand,
    adw_id: str,
    logger: logging.Logger,
) -> Tuple[Optional[str], Optional[str]]:
    """Generate a descriptive branch name using the branch generator agent."""

    request = AgentTemplateRequest(
        agent_name=AGENT_BRANCH_GENERATOR,
        slash_command="/generate_branch_name",
        args=[issue_class.replace("/", ""), adw_id, minimal_issue_payload(issue)],
        adw_id=adw_id,
        model="sonnet",
    )
    logger.debug(f"generate_branch_name request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"generate_branch_name response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    branch_name = response.output.strip()
    if not branch_name:
        return None, "Empty branch name returned"
    logger.info(f"Generated branch: {branch_name}")
    return branch_name, None


def generate_worktree_name(issue_class: str, issue_number: str, adw_id: str) -> str:
    """Generate a unique worktree name for the workflow.

    Args:
        issue_class: Issue class (feat, bug, chore)
        issue_number: Issue number as string
        adw_id: ADW execution ID

    Returns:
        Worktree name in format: {issue_class}-{issue_number}-{adw_id[:8]}

    Example:
        >>> generate_worktree_name("feat", "65", "abc123def456")
        'feat-65-abc123de'
    """
    # Remove leading slash if present
    clean_class = issue_class.lstrip("/")
    # Use first 8 chars of ADW ID for uniqueness without excessive length
    adw_short = adw_id[:8]
    return f"{clean_class}-{issue_number}-{adw_short}"


def build_plan(issue: GitHubIssue, command: str, adw_id: str, logger: logging.Logger, cwd: Optional[str] = None) -> AgentPromptResponse:
    """Generate an implementation plan using the planner agent."""

    request = AgentTemplateRequest(
        agent_name=AGENT_PLANNER,
        slash_command=command,
        args=[f"{issue.title}: {issue.body}"],
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"build_plan request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"build_plan response: {response.model_dump_json(indent=2)}")
    logger.info("Plan generation complete, checking for created files...")
    return response


def locate_plan_file(plan_output: str, adw_id: str, logger: logging.Logger, cwd: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """Use the plan finder agent to convert planner output into a concrete file path."""

    request = AgentTemplateRequest(
        agent_name=AGENT_PLAN_FINDER,
        slash_command="/find_plan_file",
        args=[plan_output],
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"locate_plan_file request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"locate_plan_file response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    # Extract path from response, handling markdown code blocks
    plan_path = response.output.strip()

    # Try to extract from markdown code blocks - use the LAST one (most specific)
    # Agents often include git output in first block and the final path in last block
    code_blocks = re.findall(r'```\s*([^\n`]+)\s*```', plan_path)
    if code_blocks:
        plan_path = code_blocks[-1].strip()  # Use last code block

    # Strip git status prefixes like "?? ", "M ", "A ", etc.
    git_status_prefix = re.match(r'^[?MAD!]{1,2}\s+', plan_path)
    if git_status_prefix:
        plan_path = plan_path[git_status_prefix.end():].strip()

    if plan_path == "0":
        return None, "No plan file returned"
    if "/" not in plan_path:
        return None, f"Invalid plan path returned: {plan_path}"

    # Log the absolute path for debugging
    if cwd:
        from pathlib import Path
        absolute_path = Path(cwd) / plan_path
        logger.info(f"Plan file located: {plan_path} (absolute: {absolute_path})")
    else:
        logger.info(f"Plan file located: {plan_path}")

    return plan_path, None


def implement_plan(plan_file: str, adw_id: str, logger: logging.Logger, agent_name: str | None = None, cwd: Optional[str] = None) -> AgentPromptResponse:
    """Run the implementor agent against the generated plan."""

    request = AgentTemplateRequest(
        agent_name=agent_name or AGENT_IMPLEMENTOR,
        slash_command="/implement",
        args=[plan_file],
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"implement_plan request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"implement_plan response: {response.model_dump_json(indent=2)}")
    return response


def create_commit_message(
    agent_name: str,
    issue: GitHubIssue,
    issue_class: IssueClassSlashCommand,
    adw_id: str,
    logger: logging.Logger,
    cwd: Optional[str] = None,
    max_retries: int = 3,
) -> Tuple[Optional[str], Optional[str]]:
    """Ask Claude to draft a commit message tailored to the current phase.

    Args:
        agent_name: Agent name for the commit (e.g., "sdlc_planner")
        issue: GitHub issue payload
        issue_class: Issue classification slash command (e.g., "/chore")
        adw_id: ADW execution ID
        logger: Logger instance for tracking
        cwd: Working directory (worktree path) for git operations
        max_retries: Maximum retry attempts on validation failure (default: 3)

    Returns:
        Tuple of (commit_message, error_message):
        - commit_message: Valid commit message string if successful
        - error_message: Error description if failed after all retries

    Behavior:
        - On validation failure, feeds error back to agent with instructions to fix
        - Retries up to max_retries times before giving up
        - Logs all retry attempts and validation failures for debugging
    """
    from .agent import AgentPromptRequest, prompt_claude_code
    from pathlib import Path

    previous_error: Optional[str] = None
    previous_invalid_message: Optional[str] = None

    for attempt in range(max_retries):
        if attempt > 0:
            logger.info(f"Retry attempt {attempt + 1}/{max_retries} for commit message generation")

        # Build request - use retry prompt if we have a previous validation error
        if attempt > 0 and previous_error and previous_invalid_message:
            # Construct a retry prompt with validation feedback
            retry_prompt = f"""Your previous commit message failed validation:

Invalid message: {previous_invalid_message}

Validation error: {previous_error}

Please generate a new commit message that follows the required format:
- Format: <type>(<scope>): <subject>
- Type must be one of: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- Subject must be 1-72 characters
- Do NOT include meta-commentary like "based on", "the commit should", "here is", etc.
- Example: "chore: 86 - fix git staging validation"

Review the git diff (run git diff HEAD to see what changed) and provide ONLY the corrected commit message, nothing else."""

            logger.info("Feeding validation error back to agent via direct prompt")

            # Use prompt_claude_code directly for retry with custom prompt
            from .utils import run_logs_dir
            run_dir = run_logs_dir(adw_id) / f"{agent_name}_committer" / f"retry_{attempt}"
            run_dir.mkdir(parents=True, exist_ok=True)
            output_file = run_dir / "raw_output.jsonl"

            retry_request = AgentPromptRequest(
                prompt=retry_prompt,
                adw_id=adw_id,
                agent_name=f"{agent_name}_committer",
                model="sonnet",
                dangerously_skip_permissions=True,
                output_file=str(output_file),
                slash_command="/commit_retry",
                cwd=cwd,
            )
            response = prompt_claude_code(retry_request)

            if not response.success:
                logger.warning(f"Retry agent execution failed (attempt {attempt + 1}): {response.output}")
                if attempt < max_retries - 1:
                    continue
                return None, response.output

            raw_message = response.output.strip()

            # Post-process retry response (same as main path)
            if '\n' in raw_message:
                lines = [line.strip() for line in raw_message.splitlines() if line.strip()]
                commit_pattern = r'^(feat|fix|chore|docs|test|refactor|perf|ci|build|style)(\(.+?\))?:\s*.+'
                for line in lines:
                    if re.match(commit_pattern, line):
                        logger.info(f"[Retry] Extracted commit message from multi-line response: {line}")
                        message = line
                        break
                else:
                    message = lines[-1] if lines else raw_message
                    logger.info(f"[Retry] Used last line from multi-line response: {message}")
            else:
                message = raw_message
        else:
            # First attempt - use standard commit template
            request = AgentTemplateRequest(
                agent_name=f"{agent_name}_committer",
                slash_command="/commit",
                args=[agent_name, issue_class.replace("/", ""), minimal_issue_payload(issue)],
                adw_id=adw_id,
                model="sonnet",
                cwd=cwd,
            )
            logger.debug(f"create_commit_message request (attempt {attempt + 1}): {request.model_dump_json(indent=2, by_alias=True)}")
            if attempt == 0:
                logger.info(f"Preparing commit in worktree: {cwd if cwd else 'default'}")

            response = execute_template(request)
            logger.debug(f"create_commit_message response (attempt {attempt + 1}): {response.model_dump_json(indent=2)}")

            if not response.success:
                if attempt < max_retries - 1:
                    logger.warning(f"Agent execution failed (attempt {attempt + 1}): {response.output}")
                    continue
                return None, response.output

            message = response.output.strip()

        # Post-process: Strip meta-commentary if present (thinking tokens workaround)
        # Extract the last line that looks like a commit message if multi-line response
        if '\n' in message:
            lines = [line.strip() for line in message.splitlines() if line.strip()]
            # Find the first line that matches conventional commit format
            commit_pattern = r'^(feat|fix|chore|docs|test|refactor|perf|ci|build|style)(\(.+?\))?:\s*.+'
            for line in lines:
                if re.match(commit_pattern, line):
                    logger.info(f"Extracted commit message from multi-line response: {line}")
                    message = line
                    break
            else:
                # If no valid commit found, use the last non-empty line
                message = lines[-1] if lines else message
                logger.info(f"Used last line from multi-line response: {message}")

        # Check if message is empty
        if not message:
            if attempt < max_retries - 1:
                logger.warning(f"Empty commit message returned (attempt {attempt + 1})")
                continue
            return None, "Empty commit message returned after all retries"

        # Validate commit message format
        is_valid, validation_error = validate_commit_message(message)
        if not is_valid:
            logger.warning(f"Commit message validation failed (attempt {attempt + 1}/{max_retries}): {validation_error}")
            logger.warning(f"Invalid message was: {message}")

            if attempt < max_retries - 1:
                # Store error for next iteration
                previous_error = validation_error
                previous_invalid_message = message
                logger.info("Will retry with validation feedback in next iteration")
                continue
            else:
                # Exhausted all retries
                return None, f"Commit message validation failed after {max_retries} attempts. Last error: {validation_error}"

        logger.info(f"Commit message validated successfully on attempt {attempt + 1}")
        return message, None

    # Should never reach here, but just in case
    return None, f"Commit message generation failed after {max_retries} attempts"


def create_pull_request(
    branch_name: str,
    issue: GitHubIssue,
    plan_file: str,
    adw_id: str,
    logger: logging.Logger,
    cwd: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Ask Claude to create a pull request summary for the work."""

    request = AgentTemplateRequest(
        agent_name=AGENT_PR_CREATOR,
        slash_command="/pull_request",
        args=[branch_name, minimal_issue_payload(issue), plan_file, adw_id],
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"create_pull_request request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"create_pull_request response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    pr_url = response.output.strip()
    if not pr_url:
        return None, "Empty PR URL returned"
    return pr_url, None


def ensure_plan_exists(state: ADWState, issue_number: str | None = None) -> str:
    """Ensure a plan file is recorded in state and return it."""

    if state.plan_file:
        return state.plan_file
    if state.get("plan_file"):
        return state.get("plan_file")
    if issue_number:
        raise ValueError(f"No plan file found for issue #{issue_number}. Run adw_plan first.")
    raise ValueError("No plan file found in ADW state.")


def run_validation_commands(commands: Iterable[Command], cwd: Path | None = None, logger: logging.Logger | None = None) -> List[ValidationCommandResult]:
    """Execute validation commands and capture their results.

    Collects all validation failures instead of exiting on first failure (continue-on-error).
    This enables comprehensive failure reporting and agent resolution of multiple issues.

    Args:
        commands: Iterable of Command objects to execute
        cwd: Working directory for command execution
        logger: Optional logger for detailed command execution logging

    Returns:
        List of ValidationCommandResult objects with command outcomes for all executed commands
    """

    results: List[ValidationCommandResult] = []
    for command in commands:
        if logger:
            logger.info(f"Running validation command: {command.label} ({' '.join(command.argv)})")

        process = subprocess.run(
            command.argv,
            capture_output=True,
            text=True,
            cwd=cwd or project_root(),
        )

        result = ValidationCommandResult(
            label=command.label,
            command=command.argv,
            returncode=process.returncode,
            stdout=process.stdout.strip(),
            stderr=process.stderr.strip(),
        )
        results.append(result)

        if process.returncode != 0:
            if logger:
                # Log detailed error information for diagnostics
                stdout_snippet = result.stdout[:500] if result.stdout else "(empty)"
                stderr_snippet = result.stderr[:500] if result.stderr else "(empty)"
                logger.error(
                    f"Validation command failed: {command.label}\n"
                    f"  Exit code: {process.returncode}\n"
                    f"  Command: {' '.join(command.argv)}\n"
                    f"  Stdout (first 500 chars): {stdout_snippet}\n"
                    f"  Stderr (first 500 chars): {stderr_snippet}"
                )
            # Continue to next command instead of breaking (continue-on-error pattern)
    return results


def run_validation_with_resolution(
    commands: Iterable[Command],
    worktree_path: Path,
    adw_id: str,
    issue_number: str,
    logger: logging.Logger,
    max_attempts: int = 3,
) -> Tuple[List[ValidationCommandResult], bool]:
    """Execute validation commands with agent resolution retry loop for failures.

    Implements resilience pattern: run validations, attempt agent resolution on failures,
    re-run validations, repeat up to max_attempts. Uses smart bailout (exits early if
    agent can't resolve anything).

    Args:
        commands: Iterable of Command objects to execute
        worktree_path: Path to git worktree for file operations
        adw_id: ADW execution ID for tracking
        issue_number: GitHub issue number for context
        logger: Logger instance for tracking retry attempts
        max_attempts: Maximum retry attempts (default: 3)

    Returns:
        Tuple of (results, success):
        - results: List of ValidationCommandResult objects from final attempt
        - success: True if all validations passed, False otherwise

    Behavior:
        - Attempt 1: Run all validations, collect failures
        - If failures exist: invoke agent resolution for each failed command
        - Attempts 2-N: Re-run validations, track newly resolved failures
        - Smart bailout: Exit early if resolved_count == 0 (agent can't fix)
        - Track resolution attempts in result objects via resolution_attempted flag
    """
    from .agent_resolution import resolve_validation_failure, track_resolution_attempt
    from .state import ADWState

    state = ADWState.load(adw_id)

    for attempt in range(1, max_attempts + 1):
        logger.info(f"Validation attempt {attempt}/{max_attempts}")

        # Run all validation commands (continue-on-error)
        results = run_validation_commands(commands, cwd=worktree_path, logger=logger)

        # Check if all passed
        failed_results = [r for r in results if not r.ok]
        if not failed_results:
            logger.info(f"All validations passed on attempt {attempt}")
            return results, True

        # If this is the last attempt, don't try resolution
        if attempt >= max_attempts:
            logger.warning(f"Validation failed after {max_attempts} attempts")
            return results, False

        # Attempt agent resolution for each failure
        logger.info(f"Found {len(failed_results)} failed validations, attempting agent resolution")
        resolved_count = 0

        for failed_result in failed_results:
            logger.info(f"Attempting resolution for: {failed_result.label}")

            resolution_success = resolve_validation_failure(
                result=failed_result,
                adw_id=adw_id,
                worktree_path=worktree_path,
                logger=logger,
            )

            # Mark that resolution was attempted
            failed_result.resolution_attempted = True

            # Track resolution attempt in state
            track_resolution_attempt(
                state=state,
                result=failed_result,
                resolution_success=resolution_success,
                logger=logger,
            )

            if resolution_success:
                resolved_count += 1

        logger.info(f"Agent resolution: {resolved_count}/{len(failed_results)} attempts succeeded")

        # Smart bailout: if agent couldn't resolve anything, exit early
        if resolved_count == 0:
            logger.warning("Smart bailout: agent resolved 0 failures, stopping retry loop")
            return results, False

        logger.info(f"Proceeding to attempt {attempt + 1} after resolution")

    # Should never reach here due to loop logic, but provide fallback
    return results, False


def find_spec_file(state: ADWState, logger: logging.Logger) -> Optional[str]:
    """Locate the specification or plan file associated with the run."""

    if state.plan_file and Path(state.plan_file).exists():
        return state.plan_file

    if state.get("plan_file") and Path(state.get("plan_file")).exists():
        return state.get("plan_file")

    issue_number = state.issue_number
    if issue_number:
        specs_dir = project_root() / "specs"
        if specs_dir.exists():
            matches = sorted(specs_dir.glob(f"*{issue_number}*.md"))
            if matches:
                logger.info(f"Discovered spec file via glob: {matches[0]}")
                return str(matches[0])
    logger.warning("No spec file found for review/documentation phase")
    return None


def run_review(spec_file: str, adw_id: str, logger: logging.Logger, cwd: Optional[str] = None) -> Tuple[Optional[ReviewResult], Optional[str]]:
    """Execute the reviewer agent against the provided spec file."""

    request = AgentTemplateRequest(
        agent_name=AGENT_REVIEWER,
        slash_command="/review",
        args=[adw_id, spec_file, AGENT_REVIEWER],
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"review request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"review response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    try:
        result = parse_json(response.output, ReviewResult)
    except ValueError as exc:
        return None, f"Failed to parse review result: {exc}"
    return result, None


def summarize_review_result(result: ReviewResult) -> str:
    """Produce a Markdown summary for review findings."""

    lines = ["## ✅ Review Summary" if result.success else "## ⚠️ Review Findings", result.review_summary.strip()]
    if result.review_issues:
        lines.append("")
        lines.append("### Reported Issues")
        for issue in result.review_issues:
            status = "❌" if issue.issue_severity == "blocker" else "⚠️"
            lines.append(f"- {status} Issue #{issue.review_issue_number}: {issue.issue_description}")
            lines.append(f"  - Suggested resolution: {issue.issue_resolution}")
    return "\n".join(lines)


def create_and_implement_patch(
    adw_id: str,
    review_change_request: str,
    logger: logging.Logger,
    agent_name_planner: str = AGENT_PATCHER,
    agent_name_implementor: str = AGENT_IMPLEMENTOR,
    spec_path: Optional[str] = None,
    cwd: Optional[str] = None,
) -> Tuple[Optional[str], AgentPromptResponse]:
    """Create a patch plan using the patch agent and immediately implement it."""

    args = [adw_id, review_change_request]
    args.append(spec_path or "")
    args.append(agent_name_planner)

    request = AgentTemplateRequest(
        agent_name=agent_name_planner,
        slash_command="/patch",
        args=args,
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"patch plan request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"patch plan response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, AgentPromptResponse(output=response.output, success=False)

    patch_file = response.output.strip()
    if not patch_file:
        return None, AgentPromptResponse(output="Patch agent returned empty path", success=False)

    implement_response = implement_plan(patch_file, adw_id, logger, agent_name_implementor, cwd=cwd)
    return patch_file, implement_response


def document_changes(
    issue: GitHubIssue,
    adw_id: str,
    logger: logging.Logger,
    command: str = "/document",
    cwd: Optional[str] = None,
) -> Tuple[Optional[DocumentationResult], Optional[str]]:
    """Invoke the documenter agent to produce documentation updates."""

    request = AgentTemplateRequest(
        agent_name=AGENT_DOCUMENTOR,
        slash_command=command,
        args=[issue.model_dump_json(by_alias=True), adw_id],
        adw_id=adw_id,
        model="sonnet",
        cwd=cwd,
    )
    logger.debug(f"documentation request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"documentation response: {response.model_dump_json(indent=2)}")

    if not response.success:
        if command == "/document":
            logger.info("Retrying documentation with /docs-update")
            return document_changes(issue, adw_id, logger, command="/docs-update", cwd=cwd)
        return None, response.output

    try:
        result = parse_json(response.output, DocumentationResult)
    except ValueError as exc:
        return None, f"Failed to parse documentation result: {exc}"
    return result, None


def summarize_validation_results(results: Sequence[ValidationCommandResult]) -> Tuple[bool, str]:
    """Summarise validation outcomes for GitHub comments."""

    if not results:
        return True, "No validation commands executed."

    lines = []
    success = True
    for entry in results:
        status = "✅" if entry.ok else "❌"
        lines.append(f"{status} `{entry.label}` (`{' '.join(entry.command)}`)")
        if not entry.ok:
            success = False
            if entry.stderr:
                snippet = entry.stderr.splitlines()[0]
                lines.append(f"> {snippet}")
            break
    return success, "\n".join(lines)


def record_git_failure(logger: logging.Logger, error: GitError) -> None:
    """Log git failures consistently so callers can hook into it."""

    logger.error(f"Git operation failed: {error}")


def persist_issue_snapshot(state: ADWState, issue: GitHubIssue) -> None:
    """Store a minimal issue payload in state for downstream phases."""

    state.update(issue=json.loads(minimal_issue_payload(issue)))


def lockfile_changed(cwd: Path | None = None) -> bool:
    """Return True if any recognised lockfile has modifications."""

    result = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True,
        text=True,
        cwd=cwd or project_root(),
    )
    if result.returncode != 0:
        return False

    for line in result.stdout.splitlines():
        if len(line) < 4:
            continue
        filename = line[3:].strip()
        if not filename:
            continue
        if Path(filename).name in LOCKFILE_NAMES:
            return True
    return False


def serialize_validation(commands: Iterable[Command]) -> List[dict[str, str]]:
    """Serialize validation commands for agent prompts or logging."""

    return serialize_commands(commands)


__all__ = [
    "AGENT_BRANCH_GENERATOR",
    "AGENT_CLASSIFIER",
    "AGENT_IMPLEMENTOR",
    "AGENT_TESTER",
    "AGENT_REVIEWER",
    "AGENT_DOCUMENTOR",
    "AGENT_PATCHER",
    "AGENT_PLAN_FINDER",
    "AGENT_PLANNER",
    "AGENT_PR_CREATOR",
    "AVAILABLE_ADW_WORKFLOWS",
    "LOCKFILE_NAMES",
    "DEFAULT_VALIDATION_SEQUENCE",
    "ValidationCommandResult",
    "build_plan",
    "classify_issue",
    "create_commit_message",
    "create_pull_request",
    "create_and_implement_patch",
    "document_changes",
    "ensure_plan_exists",
    "ensure_state",
    "format_issue_message",
    "find_spec_file",
    "generate_branch_name",
    "generate_worktree_name",
    "implement_plan",
    "locate_plan_file",
    "lockfile_changed",
    "persist_issue_snapshot",
    "record_git_failure",
    "run_validation_commands",
    "run_validation_with_resolution",
    "serialize_validation",
    "start_logger",
    "run_review",
    "summarize_validation_results",
    "summarize_review_result",
]
