"""Git command helpers used by ADW workflows."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from .utils import project_root


class GitError(RuntimeError):
    """Raised when a git command fails."""


@dataclass(frozen=True)
class GitCommandResult:
    """Typed container for git command output."""

    args: Sequence[str]
    stdout: str
    stderr: str
    returncode: int

    @property
    def ok(self) -> bool:
        return self.returncode == 0


def _run_git(args: Iterable[str], cwd: Path | None = None, check: bool = True) -> GitCommandResult:
    """Execute a git command and optionally raise on failure."""

    cmd = ["git", *args]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd or project_root())
    git_result = GitCommandResult(args=tuple(args), stdout=result.stdout.strip(), stderr=result.stderr.strip(), returncode=result.returncode)

    if check and result.returncode != 0:
        raise GitError(f"git {' '.join(args)} failed: {git_result.stderr}")
    return git_result


def get_current_branch(cwd: Path | None = None) -> str:
    """Return the active git branch."""

    result = _run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd)
    return result.stdout


def ensure_clean_worktree(cwd: Path | None = None) -> bool:
    """Return True if the worktree has no staged or unstaged changes."""

    status = _run_git(["status", "--porcelain"], cwd=cwd, check=False)
    return status.stdout.strip() == ""


def ensure_branch(branch_name: str, base: str | None = None, cwd: Path | None = None) -> str:
    """Ensure a branch exists locally, creating it from base if necessary."""

    args = ["rev-parse", "--verify", branch_name]
    exists = _run_git(args, cwd=cwd, check=False).ok
    if exists:
        return branch_name

    create_args = ["checkout", "-b", branch_name]
    if base:
        create_args.append(base)
    _run_git(create_args, cwd=cwd)
    return branch_name


def checkout_branch(branch_name: str, create: bool = False, base: str | None = None, cwd: Path | None = None) -> None:
    """Checkout a branch, optionally creating it first."""

    if create:
        ensure_branch(branch_name, base=base, cwd=cwd)
    _run_git(["checkout", branch_name], cwd=cwd)


def stage_paths(paths: Sequence[str] | None = None, cwd: Path | None = None) -> None:
    """Stage one or more paths, or everything if omitted."""

    args = ["add"]
    if not paths:
        args.append("--all")
    else:
        args.extend(paths)
    _run_git(args, cwd=cwd)


def commit(message: str, allow_empty: bool = False, cwd: Path | None = None) -> GitCommandResult:
    """Create a git commit with the given message."""

    args = ["commit", "-m", message]
    if allow_empty:
        args.append("--allow-empty")
    return _run_git(args, cwd=cwd, check=False)


def push(branch_name: str, remote: str = "origin", force: bool = False, cwd: Path | None = None) -> GitCommandResult:
    """Push the branch to the remote."""

    args = ["push", remote, branch_name]
    if force:
        args.insert(2, "--force-with-lease")
    return _run_git(args, cwd=cwd, check=False)


def finalize_git_operations(
    branch_name: str,
    commit_message: str,
    stage_all: bool = True,
    push_branch: bool = True,
    cwd: Path | None = None,
) -> None:
    """Stage, commit, and optionally push changes for the workflow.

    The detailed behaviour (e.g. PR creation) will be implemented in later phases.
    """

    if stage_all:
        stage_paths(cwd=cwd)
    commit_result = commit(commit_message, cwd=cwd)
    if not commit_result.ok:
        raise GitError(commit_result.stderr or "git commit failed")
    if push_branch:
        push_result = push(branch_name, cwd=cwd)
        if not push_result.ok:
            raise GitError(push_result.stderr or "git push failed")


__all__ = [
    "GitCommandResult",
    "GitError",
    "checkout_branch",
    "commit",
    "ensure_branch",
    "ensure_clean_worktree",
    "finalize_git_operations",
    "get_current_branch",
    "push",
    "stage_paths",
]
