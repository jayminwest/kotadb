"""Integration tests for agent worktree git isolation.

Tests verify that Claude Code agents executing in worktrees do not affect
the root repository's branch state, ensuring proper isolation via GIT_DIR
and GIT_WORK_TREE environment variables.
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import pytest

from adws.adw_modules.agent import get_claude_env
from adws.adw_modules.git_ops import (
    create_worktree,
    get_current_branch,
)


@pytest.fixture
def temp_git_repo(monkeypatch):
    """Create a temporary git repository for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir)

        # Initialize git repository
        subprocess.run(["git", "init"], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(
            ["git", "config", "user.name", "Test User"],
            cwd=repo_path,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "user.email", "test@example.com"],
            cwd=repo_path,
            check=True,
            capture_output=True,
        )

        # Create initial commit
        (repo_path / "README.md").write_text("# Test Repo\n")
        subprocess.run(["git", "add", "README.md"], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Initial commit"],
            cwd=repo_path,
            check=True,
            capture_output=True,
        )

        # Create develop branch (typical base branch)
        subprocess.run(
            ["git", "checkout", "-b", "develop"],
            cwd=repo_path,
            check=True,
            capture_output=True,
        )

        # Monkeypatch project_root to return our temp repo
        import adws.adw_modules.git_ops as git_ops_module
        monkeypatch.setattr(git_ops_module, "project_root", lambda: repo_path)

        yield repo_path


def test_get_claude_env_without_cwd():
    """Test that get_claude_env() without cwd does not set GIT_DIR/GIT_WORK_TREE."""
    env = get_claude_env()

    assert "ANTHROPIC_API_KEY" in env or env.get("ANTHROPIC_API_KEY") is None
    assert "GIT_DIR" not in env
    assert "GIT_WORK_TREE" not in env


def test_get_claude_env_with_valid_cwd(temp_git_repo):
    """Test that get_claude_env() with valid cwd sets worktree isolation env vars."""
    worktree_name = "test-isolation-worktree"
    worktree_path = create_worktree(worktree_name, "develop", base_path="trees")

    env = get_claude_env(cwd=str(worktree_path))

    assert env["GIT_DIR"] == f"{worktree_path}/.git"
    assert env["GIT_WORK_TREE"] == str(worktree_path)


def test_get_claude_env_with_nonexistent_cwd():
    """Test that get_claude_env() with non-existent cwd does not set isolation vars."""
    with tempfile.TemporaryDirectory() as tmpdir:
        nonexistent_path = Path(tmpdir) / "nonexistent"

        env = get_claude_env(cwd=str(nonexistent_path))

        # Should not set isolation vars for invalid path
        assert "GIT_DIR" not in env
        assert "GIT_WORK_TREE" not in env


def test_worktree_git_isolation_prevents_root_branch_change(temp_git_repo):
    """Test that git operations in worktree with isolation env vars don't affect root branch."""
    worktree_name = "test-branch-isolation"
    worktree_path = create_worktree(worktree_name, "develop", base_path="trees")

    # Capture root branch before worktree operations
    root_branch_before = get_current_branch(cwd=temp_git_repo)

    # Get environment with worktree isolation
    env = get_claude_env(cwd=str(worktree_path))

    # Simulate git operations in worktree context with isolation env vars
    # Create a test commit in the worktree
    test_file = worktree_path / "test_file.txt"
    test_file.write_text("test content")

    # These git commands should operate on the worktree, not root
    env_for_subprocess = {**subprocess.os.environ, **env}
    subprocess.run(
        ["git", "add", "test_file.txt"],
        cwd=worktree_path,
        env=env_for_subprocess,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "Test commit in worktree"],
        cwd=worktree_path,
        env=env_for_subprocess,
        check=True,
        capture_output=True,
    )

    # Verify root branch unchanged
    root_branch_after = get_current_branch(cwd=temp_git_repo)
    assert root_branch_before == root_branch_after, "Root branch should remain unchanged"


def test_worktree_branch_operations_isolated(temp_git_repo):
    """Test that branch operations in worktree don't affect root repository."""
    worktree_name = "test-branch-ops"
    worktree_path = create_worktree(worktree_name, "develop", base_path="trees")

    # Capture root branch
    root_branch = get_current_branch(cwd=temp_git_repo)

    # Get environment with worktree isolation
    env = get_claude_env(cwd=str(worktree_path))
    env_for_subprocess = {**subprocess.os.environ, **env}

    # Verify worktree is on its own branch
    worktree_branch = get_current_branch(cwd=worktree_path)
    assert worktree_branch == worktree_name

    # Perform branch operations in worktree
    subprocess.run(
        ["git", "status"],
        cwd=worktree_path,
        env=env_for_subprocess,
        check=True,
        capture_output=True,
    )

    # Verify root branch unchanged
    root_branch_after = get_current_branch(cwd=temp_git_repo)
    assert root_branch == root_branch_after


def test_multiple_concurrent_worktree_executions(temp_git_repo):
    """Test that multiple worktrees can operate concurrently without conflicts."""
    worktree_names = ["concurrent-wt-1", "concurrent-wt-2", "concurrent-wt-3"]
    worktree_paths = []

    # Create multiple worktrees
    for name in worktree_names:
        path = create_worktree(name, "develop", base_path="trees")
        worktree_paths.append(path)

    # Capture root branch
    root_branch_before = get_current_branch(cwd=temp_git_repo)

    # Simulate concurrent operations in each worktree
    for i, worktree_path in enumerate(worktree_paths):
        env = get_claude_env(cwd=str(worktree_path))
        env_for_subprocess = {**subprocess.os.environ, **env}

        # Create unique file in each worktree
        test_file = worktree_path / f"file_{i}.txt"
        test_file.write_text(f"content {i}")

        subprocess.run(
            ["git", "add", f"file_{i}.txt"],
            cwd=worktree_path,
            env=env_for_subprocess,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", f"Commit {i}"],
            cwd=worktree_path,
            env=env_for_subprocess,
            check=True,
            capture_output=True,
        )

    # Verify root branch unchanged after all operations
    root_branch_after = get_current_branch(cwd=temp_git_repo)
    assert root_branch_before == root_branch_after


def test_worktree_isolation_with_git_log(temp_git_repo):
    """Test that git log in worktree with isolation shows correct commit history."""
    worktree_name = "test-git-log"
    worktree_path = create_worktree(worktree_name, "develop", base_path="trees")

    # Get environment with worktree isolation
    env = get_claude_env(cwd=str(worktree_path))
    env_for_subprocess = {**subprocess.os.environ, **env}

    # Add a commit in worktree
    test_file = worktree_path / "log_test.txt"
    test_file.write_text("log test content")

    subprocess.run(
        ["git", "add", "log_test.txt"],
        cwd=worktree_path,
        env=env_for_subprocess,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "Log test commit"],
        cwd=worktree_path,
        env=env_for_subprocess,
        check=True,
        capture_output=True,
    )

    # Run git log in worktree context
    result = subprocess.run(
        ["git", "log", "--oneline", "-n", "1"],
        cwd=worktree_path,
        env=env_for_subprocess,
        check=True,
        capture_output=True,
        text=True,
    )

    # Should show the worktree commit
    assert "Log test commit" in result.stdout

    # Verify root doesn't have this commit on its branch
    root_log = subprocess.run(
        ["git", "log", "--oneline", "-n", "1"],
        cwd=temp_git_repo,
        check=True,
        capture_output=True,
        text=True,
    )
    assert "Log test commit" not in root_log.stdout
