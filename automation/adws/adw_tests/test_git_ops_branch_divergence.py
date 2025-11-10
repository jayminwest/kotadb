"""Tests for branch_differs_from_base() function in git_ops module."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from adw_modules import git_ops  # noqa: E402


@pytest.fixture
def test_worktree(tmp_path: Path) -> Path:
    """Create a minimal git repository for testing branch divergence.

    Returns:
        Path to the test repository
    """
    repo = tmp_path / "test_repo"
    repo.mkdir()

    # Initialize git repo
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True, capture_output=True)

    # Create initial commit on develop
    (repo / "README.md").write_text("# Test Repository\n")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=repo, check=True, capture_output=True)

    # Create develop branch
    subprocess.run(["git", "branch", "-M", "develop"], cwd=repo, check=True, capture_output=True)

    return repo


def test_branch_differs_from_base_with_commits(test_worktree: Path) -> None:
    """Test that branch_differs_from_base returns True when branch has unique commits."""
    # Create feature branch
    subprocess.run(["git", "checkout", "-b", "feature-branch"], cwd=test_worktree, check=True, capture_output=True)

    # Add and commit changes to feature branch
    (test_worktree / "feature.txt").write_text("New feature\n")
    subprocess.run(["git", "add", "."], cwd=test_worktree, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "Add feature"], cwd=test_worktree, check=True, capture_output=True)

    # Assert branch has diverged
    assert git_ops.branch_differs_from_base("feature-branch", "develop", cwd=test_worktree) is True


def test_branch_differs_from_base_without_commits(test_worktree: Path) -> None:
    """Test that branch_differs_from_base returns False when branch is identical to base."""
    # Create feature branch without any new commits
    subprocess.run(["git", "checkout", "-b", "feature-branch"], cwd=test_worktree, check=True, capture_output=True)

    # Assert branch has not diverged (no commits)
    assert git_ops.branch_differs_from_base("feature-branch", "develop", cwd=test_worktree) is False


def test_branch_differs_from_base_behind_base(test_worktree: Path) -> None:
    """Test that branch_differs_from_base returns False when branch is behind base."""
    # Create feature branch
    subprocess.run(["git", "checkout", "-b", "feature-branch"], cwd=test_worktree, check=True, capture_output=True)

    # Go back to develop and add commits
    subprocess.run(["git", "checkout", "develop"], cwd=test_worktree, check=True, capture_output=True)
    (test_worktree / "develop-feature.txt").write_text("Develop feature\n")
    subprocess.run(["git", "add", "."], cwd=test_worktree, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "Add develop feature"], cwd=test_worktree, check=True, capture_output=True)

    # Assert feature-branch is behind and has not diverged
    assert git_ops.branch_differs_from_base("feature-branch", "develop", cwd=test_worktree) is False


def test_branch_differs_from_base_invalid_branch(test_worktree: Path) -> None:
    """Test that branch_differs_from_base returns False for invalid branch names."""
    # Assert invalid branch returns False
    assert git_ops.branch_differs_from_base("nonexistent-branch", "develop", cwd=test_worktree) is False


def test_branch_differs_from_base_invalid_base(test_worktree: Path) -> None:
    """Test that branch_differs_from_base returns False when base branch doesn't exist."""
    # Create feature branch
    subprocess.run(["git", "checkout", "-b", "feature-branch"], cwd=test_worktree, check=True, capture_output=True)
    (test_worktree / "feature.txt").write_text("New feature\n")
    subprocess.run(["git", "add", "."], cwd=test_worktree, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "Add feature"], cwd=test_worktree, check=True, capture_output=True)

    # Assert invalid base returns False
    assert git_ops.branch_differs_from_base("feature-branch", "nonexistent-base", cwd=test_worktree) is False


def test_branch_differs_from_base_multiple_commits(test_worktree: Path) -> None:
    """Test that branch_differs_from_base returns True when branch has multiple commits."""
    # Create feature branch
    subprocess.run(["git", "checkout", "-b", "feature-branch"], cwd=test_worktree, check=True, capture_output=True)

    # Add first commit
    (test_worktree / "feature1.txt").write_text("Feature 1\n")
    subprocess.run(["git", "add", "."], cwd=test_worktree, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "Add feature 1"], cwd=test_worktree, check=True, capture_output=True)

    # Add second commit
    (test_worktree / "feature2.txt").write_text("Feature 2\n")
    subprocess.run(["git", "add", "."], cwd=test_worktree, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "Add feature 2"], cwd=test_worktree, check=True, capture_output=True)

    # Assert branch has diverged with multiple commits
    assert git_ops.branch_differs_from_base("feature-branch", "develop", cwd=test_worktree) is True
