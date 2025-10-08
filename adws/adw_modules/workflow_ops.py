"""Shared workflow helpers for the modular ADW surface."""

from __future__ import annotations

import subprocess
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

from . import agent as agent_ops
from . import github as github_ops
from . import state as state_ops
from . import ts_commands
from . import utils
from .data_types import AgentPromptResponse, AgentTemplateRequest, GitHubIssue, IssueClassSlashCommand
from .git_ops import GitError


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


DEFAULT_VALIDATION_SEQUENCE = [
    ts_commands.BUN_LINT,
    ts_commands.BUN_TYPECHECK,
    ts_commands.BUN_TEST,
    ts_commands.BUN_BUILD,
]


def ensure_state(adw_id: str | None, issue_number: str | None = None) -> Tuple[str, state_ops.ADWState]:
    """Initialise or load workflow state for an ADW run."""

    resolved_adw_id = state_ops.ensure_adw_id(adw_id)
    adw_state = state_ops.ADWState.load(resolved_adw_id, create=True)
    if issue_number and adw_state.issue_number != issue_number:
        adw_state.update(issue_number=issue_number)
    return resolved_adw_id, adw_state


def start_logger(adw_id: str, phase: str) -> logging.Logger:
    """Create a logger scoped to the phase."""

    return utils.setup_logger(adw_id, trigger_type=phase)


def fetch_and_classify_issue(
    issue_number: str,
    repo_path: str,
    adw_id: str,
    logger: utils.logging.Logger,
) -> Tuple[GitHubIssue, Optional[IssueClassSlashCommand], Optional[str]]:
    """Fetch the GitHub issue and attempt to classify it via the classifier agent."""

    issue = github_ops.fetch_issue(issue_number, repo_path)
    request = AgentTemplateRequest(
        agent_name="issue_classifier",
        slash_command="/classify_issue",
        args=[issue.model_dump_json(indent=2, by_alias=True)],
        adw_id=adw_id,
        model="sonnet",
    )
    response = agent_ops.execute_template(request)
    logger.debug(f"classifier response: {response.model_dump_json(indent=2)}")
    if not response.success:
        return issue, None, response.output

    command = response.output.strip()
    if command not in {"/chore", "/bug", "/feature"}:
        return issue, None, f"Unsupported classification command: {command}"
    return issue, command, None


def format_issue_message(adw_id: str, agent_name: str, message: str, session_id: str | None = None) -> str:
    """Prefix a message with the ADW metadata used by GitHub automations."""

    prefix = f"{adw_id}_{agent_name}"
    if session_id:
        prefix = f"{prefix}_{session_id}"
    return f"{prefix}: {message}"


def run_validation_commands(commands: Iterable[ts_commands.Command], cwd: Path | None = None) -> List[ValidationCommandResult]:
    """Execute validation commands and capture their results."""

    results: List[ValidationCommandResult] = []
    for command in commands:
        process = subprocess.run(command.argv, capture_output=True, text=True, cwd=cwd or utils.project_root())
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


def ensure_branch_via_agent(
    issue: GitHubIssue,
    issue_class: IssueClassSlashCommand,
    adw_id: str,
) -> AgentPromptResponse:
    """Ask the branch generator agent to propose a branch name."""

    request = AgentTemplateRequest(
        agent_name="branch_generator",
        slash_command="/generate_branch_name",
        args=[issue_class.replace("/", ""), adw_id, issue.model_dump_json(by_alias=True)],
        adw_id=adw_id,
    )
    return agent_ops.execute_template(request)


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
                lines.append(f"> {entry.stderr.splitlines()[:5][0]}")
            break
    return success, "\n".join(lines)


def record_git_failure(logger: logging.Logger, error: GitError) -> None:
    """Log git failures consistently so callers can hook into it."""

    logger.error(f"Git operation failed: {error}")


__all__ = [
    "DEFAULT_VALIDATION_SEQUENCE",
    "ValidationCommandResult",
    "ensure_branch_via_agent",
    "ensure_state",
    "fetch_and_classify_issue",
    "format_issue_message",
    "record_git_failure",
    "run_validation_commands",
    "start_logger",
    "summarize_validation_results",
]
