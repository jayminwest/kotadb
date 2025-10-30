"""Git command helpers used by ADW workflows."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, Sequence

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


def has_changes(cwd: Path | None = None) -> bool:
    """Check if the working tree has any modifications (staged or unstaged).

    Returns:
        True if there are changes to commit, False if working tree is clean
    """
    status = _run_git(["status", "--porcelain"], cwd=cwd, check=False)
    return status.stdout.strip() != ""


def verify_file_in_index(file_path: str, cwd: Path | None = None) -> tuple[bool, Optional[str]]:
    """Verify that a file is tracked in the git index.

    Args:
        file_path: Path to the file (relative to cwd)
        cwd: Working directory for git command

    Returns:
        Tuple of (is_tracked: bool, error_message: Optional[str])
    """
    result = _run_git(["ls-files", "--error-unmatch", file_path], cwd=cwd, check=False)
    if result.ok:
        return True, None
    return False, f"File not tracked by git: {file_path}"


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


def create_branch(branch_name: str, base: str | None = None, cwd: Path | None = None) -> tuple[bool, Optional[str]]:
    """Create and check out a branch, returning a success flag and optional error message."""

    try:
        checkout_branch(branch_name, create=True, base=base, cwd=cwd)
        return True, None
    except GitError as exc:
        return False, str(exc)


def stage_paths(paths: Sequence[str] | None = None, cwd: Path | None = None) -> None:
    """Stage one or more paths, or everything if omitted."""

    args = ["add"]
    if not paths:
        args.append("--all")
    else:
        args.extend(paths)
    _run_git(args, cwd=cwd)


def commit(message: str, allow_empty: bool = False, cwd: Path | None = None) -> GitCommandResult:
    """Create a git commit with the given message.

    Returns:
        GitCommandResult with enhanced error messages when commit fails
    """
    args = ["commit", "-m", message]
    if allow_empty:
        args.append("--allow-empty")
    result = _run_git(args, cwd=cwd, check=False)

    # Provide clearer error message when nothing to commit
    if not result.ok and not result.stderr:
        # Empty stderr usually means nothing to commit
        return GitCommandResult(
            args=result.args,
            stdout=result.stdout,
            stderr="No changes to commit",
            returncode=result.returncode,
        )
    return result


def commit_all(message: str, allow_empty: bool = False, cwd: Path | None = None) -> tuple[bool, Optional[str]]:
    """Stage all changes and commit them.

    Returns:
        Tuple of (success: bool, error_message: Optional[str])
    """
    # Check if there are changes to commit (unless allow_empty is True)
    if not allow_empty and not has_changes(cwd=cwd):
        return False, "No changes to commit in worktree"

    try:
        stage_paths(cwd=cwd)
    except GitError as exc:
        return False, str(exc)

    result = commit(message, allow_empty=allow_empty, cwd=cwd)
    if not result.ok:
        return False, result.stderr or "git commit failed"
    return True, None


def push(branch_name: str, remote: str = "origin", force: bool = False, cwd: Path | None = None) -> GitCommandResult:
    """Push the branch to the remote."""

    args = ["push", remote, branch_name]
    if force:
        args.insert(2, "--force-with-lease")
    return _run_git(args, cwd=cwd, check=False)


def classify_push_error(stderr: str) -> str:
    """Classify push error type from stderr output.

    Args:
        stderr: Git push error output

    Returns:
        Error type: "email_privacy", "network", "auth", or "unknown"
    """
    stderr_lower = stderr.lower()

    # GitHub email privacy error (GH007)
    if "gh007" in stderr_lower or "push declined due to email privacy" in stderr_lower:
        return "email_privacy"

    # Network errors
    if any(pattern in stderr_lower for pattern in [
        "could not resolve host",
        "failed to connect",
        "connection timed out",
        "connection refused",
        "network is unreachable",
        "temporary failure",
    ]):
        return "network"

    # Authentication errors
    if any(pattern in stderr_lower for pattern in [
        "authentication failed",
        "permission denied",
        "could not read from remote repository",
        "fatal: unable to access",
    ]):
        return "auth"

    return "unknown"


def push_branch(branch_name: str, remote: str = "origin", force: bool = False, cwd: Path | None = None, max_retries: int = 3) -> dict:
    """Push the branch to the remote with automatic retry for transient errors.

    Args:
        branch_name: Branch name to push
        remote: Remote name (default: "origin")
        force: Use --force-with-lease (default: False)
        cwd: Working directory for git command
        max_retries: Maximum retry attempts for network errors (default: 3)

    Returns:
        Dict with keys:
        - success (bool): Whether push succeeded
        - error_type (str | None): Error classification if failed
        - error_message (str | None): Full error message if failed
    """
    import time

    # Exponential backoff delays (seconds)
    retry_delays = [1, 3, 5]

    for attempt in range(max_retries):
        result = push(branch_name, remote=remote, force=force, cwd=cwd)

        if result.ok:
            return {"success": True, "error_type": None, "error_message": None}

        # Classify error type
        error_type = classify_push_error(result.stderr)
        error_message = result.stderr or "git push failed"

        # Non-retryable errors: fail immediately
        if error_type in ("email_privacy", "auth"):
            return {
                "success": False,
                "error_type": error_type,
                "error_message": error_message,
            }

        # Network errors: retry with exponential backoff
        if error_type == "network" and attempt < max_retries - 1:
            delay = retry_delays[attempt]
            time.sleep(delay)
            continue

        # Unknown errors or exhausted retries: fail
        return {
            "success": False,
            "error_type": error_type,
            "error_message": error_message,
        }

    # Should never reach here, but for type safety
    return {
        "success": False,
        "error_type": "unknown",
        "error_message": "Push failed after all retry attempts",
    }


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


def create_worktree(worktree_name: str, base_branch: str, base_path: str = "automation/trees") -> Path:
    """Create a git worktree in the specified base path.

    Args:
        worktree_name: Name for the worktree directory and branch
        base_branch: Base branch to branch from (e.g., 'develop')
        base_path: Base directory for worktrees (default: 'automation/trees')

    Returns:
        Path to the created worktree

    Raises:
        GitError: If worktree creation fails
    """
    worktree_path = project_root() / base_path / worktree_name

    # Create base path if it doesn't exist
    worktree_path.parent.mkdir(parents=True, exist_ok=True)

    # Create worktree with new branch
    args = ["worktree", "add", str(worktree_path), "-b", worktree_name, base_branch]
    _run_git(args)

    return worktree_path


def cleanup_worktree(worktree_name: str, base_path: str = "automation/trees", delete_branch: bool = True) -> bool:
    """Remove a git worktree and optionally delete its branch.

    Args:
        worktree_name: Name of the worktree to remove
        base_path: Base directory for worktrees (default: 'automation/trees')
        delete_branch: Whether to delete the associated branch (default: True)

    Returns:
        True if cleanup successful, False otherwise
    """
    worktree_path = project_root() / base_path / worktree_name

    # Check if worktree exists before attempting removal
    if not worktree_exists(worktree_name, base_path):
        return False

    success = True

    # Remove worktree (force flag handles uncommitted changes)
    result = _run_git(["worktree", "remove", str(worktree_path), "--force"], check=False)
    if not result.ok:
        success = False

    # Prune stale worktree metadata
    _run_git(["worktree", "prune"], check=False)  # Non-critical, ignore result

    # Delete associated branch if requested
    if delete_branch:
        result = _run_git(["branch", "-D", worktree_name], check=False)
        if not result.ok:
            success = False

    return success


def list_worktrees() -> list[dict]:
    """List all git worktrees with their metadata.

    Returns:
        List of worktree dictionaries with keys: worktree, HEAD, branch
    """
    result = _run_git(["worktree", "list", "--porcelain"], check=False)
    if not result.ok:
        return []

    worktrees = []
    current_worktree: dict[str, str] = {}

    for line in result.stdout.splitlines():
        if not line.strip():
            if current_worktree:
                worktrees.append(current_worktree)
                current_worktree = {}
            continue

        if line.startswith("worktree "):
            current_worktree["worktree"] = line.split(" ", 1)[1]
        elif line.startswith("HEAD "):
            current_worktree["HEAD"] = line.split(" ", 1)[1]
        elif line.startswith("branch "):
            current_worktree["branch"] = line.split(" ", 1)[1]

    # Add last worktree if not empty
    if current_worktree:
        worktrees.append(current_worktree)

    return worktrees


def worktree_exists(worktree_name: str, base_path: str = "automation/trees") -> bool:
    """Check if a worktree exists at the expected path.

    Args:
        worktree_name: Name of the worktree to check
        base_path: Base directory for worktrees (default: 'automation/trees')

    Returns:
        True if worktree exists, False otherwise
    """
    worktrees = list_worktrees()
    expected_suffix = f"{base_path}/{worktree_name}"

    for wt in worktrees:
        wt_path = wt.get("worktree", "")
        # Check if the worktree path ends with base_path/worktree_name
        # This handles both absolute paths and different root directories (e.g., in tests)
        if wt_path.endswith(expected_suffix):
            return True

    return False


__all__ = [
    "GitCommandResult",
    "GitError",
    "checkout_branch",
    "cleanup_worktree",
    "commit",
    "commit_all",
    "create_branch",
    "create_worktree",
    "ensure_branch",
    "ensure_clean_worktree",
    "finalize_git_operations",
    "get_current_branch",
    "has_changes",
    "list_worktrees",
    "push",
    "push_branch",
    "stage_paths",
    "verify_file_in_index",
    "worktree_exists",
]
