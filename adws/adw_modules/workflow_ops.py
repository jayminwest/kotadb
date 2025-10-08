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
    GitHubIssue,
    IssueClassSlashCommand,
)
from .git_ops import GitError
from .github import ADW_BOT_IDENTIFIER
from .state import ADWState, ensure_adw_id as core_ensure_adw_id
from .ts_commands import Command, validation_commands
from .utils import project_root, setup_logger

AGENT_PLANNER = "sdlc_planner"
AGENT_IMPLEMENTOR = "sdlc_implementor"
AGENT_CLASSIFIER = "issue_classifier"
AGENT_PLAN_FINDER = "plan_finder"
AGENT_BRANCH_GENERATOR = "branch_generator"
AGENT_PR_CREATOR = "pr_creator"

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


@dataclass
class ValidationCommandResult:
    """Outcome of running a validation command."""

    label: str
    command: Sequence[str]
    returncode: int
    stdout: str
    stderr: str

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


def build_plan(issue: GitHubIssue, command: str, adw_id: str, logger: logging.Logger) -> AgentPromptResponse:
    """Generate an implementation plan using the planner agent."""

    request = AgentTemplateRequest(
        agent_name=AGENT_PLANNER,
        slash_command=command,
        args=[f"{issue.title}: {issue.body}"],
        adw_id=adw_id,
        model="sonnet",
    )
    logger.debug(f"build_plan request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"build_plan response: {response.model_dump_json(indent=2)}")
    return response


def locate_plan_file(plan_output: str, adw_id: str, logger: logging.Logger) -> Tuple[Optional[str], Optional[str]]:
    """Use the plan finder agent to convert planner output into a concrete file path."""

    request = AgentTemplateRequest(
        agent_name=AGENT_PLAN_FINDER,
        slash_command="/find_plan_file",
        args=[plan_output],
        adw_id=adw_id,
        model="sonnet",
    )
    logger.debug(f"locate_plan_file request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"locate_plan_file response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    plan_path = response.output.strip()
    if plan_path == "0":
        return None, "No plan file returned"
    if "/" not in plan_path:
        return None, f"Invalid plan path returned: {plan_path}"
    return plan_path, None


def implement_plan(plan_file: str, adw_id: str, logger: logging.Logger, agent_name: str | None = None) -> AgentPromptResponse:
    """Run the implementor agent against the generated plan."""

    request = AgentTemplateRequest(
        agent_name=agent_name or AGENT_IMPLEMENTOR,
        slash_command="/implement",
        args=[plan_file],
        adw_id=adw_id,
        model="sonnet",
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
) -> Tuple[Optional[str], Optional[str]]:
    """Ask Claude to draft a commit message tailored to the current phase."""

    request = AgentTemplateRequest(
        agent_name=f"{agent_name}_committer",
        slash_command="/commit",
        args=[agent_name, issue_class.replace("/", ""), minimal_issue_payload(issue)],
        adw_id=adw_id,
        model="sonnet",
    )
    logger.debug(f"create_commit_message request: {request.model_dump_json(indent=2, by_alias=True)}")
    response = execute_template(request)
    logger.debug(f"create_commit_message response: {response.model_dump_json(indent=2)}")

    if not response.success:
        return None, response.output

    message = response.output.strip()
    if not message:
        return None, "Empty commit message returned"
    return message, None


def create_pull_request(
    branch_name: str,
    issue: GitHubIssue,
    plan_file: str,
    adw_id: str,
    logger: logging.Logger,
) -> Tuple[Optional[str], Optional[str]]:
    """Ask Claude to create a pull request summary for the work."""

    request = AgentTemplateRequest(
        agent_name=AGENT_PR_CREATOR,
        slash_command="/pull_request",
        args=[branch_name, minimal_issue_payload(issue), plan_file, adw_id],
        adw_id=adw_id,
        model="sonnet",
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


def run_validation_commands(commands: Iterable[Command], cwd: Path | None = None) -> List[ValidationCommandResult]:
    """Execute validation commands and capture their results."""

    results: List[ValidationCommandResult] = []
    for command in commands:
        process = subprocess.run(
            command.argv,
            capture_output=True,
            text=True,
            cwd=cwd or project_root(),
        )
        results.append(
            ValidationCommandResult(
                label=command.label,
                command=command.argv,
                returncode=process.returncode,
                stdout=process.stdout.strip(),
                stderr=process.stderr.strip(),
            )
        )
        if process.returncode != 0:
            break
    return results


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


__all__ = [
    "AGENT_BRANCH_GENERATOR",
    "AGENT_CLASSIFIER",
    "AGENT_IMPLEMENTOR",
    "AGENT_PLAN_FINDER",
    "AGENT_PLANNER",
    "AGENT_PR_CREATOR",
    "AVAILABLE_ADW_WORKFLOWS",
    "DEFAULT_VALIDATION_SEQUENCE",
    "ValidationCommandResult",
    "build_plan",
    "classify_issue",
    "create_commit_message",
    "create_pull_request",
    "ensure_plan_exists",
    "ensure_state",
    "format_issue_message",
    "generate_branch_name",
    "implement_plan",
    "locate_plan_file",
    "persist_issue_snapshot",
    "record_git_failure",
    "run_validation_commands",
    "start_logger",
    "summarize_validation_results",
]
