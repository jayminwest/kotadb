"""Tests for git worktree management functions."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import pytest

from adws.adw_modules.git_ops import (
    GitError,
    cleanup_worktree,
    commit_all,
    create_worktree,
    has_changes,
    list_worktrees,
    stage_paths,
    verify_file_in_index,
    worktree_exists,
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

        # Create develop branch
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


def test_create_worktree_success(temp_git_repo):
    """Test successful worktree creation."""
    worktree_name = "test-feature-123"

    worktree_path = create_worktree(worktree_name, "develop", base_path="trees")

    assert worktree_path.exists()
    assert worktree_path.name == worktree_name
    assert (worktree_path / "README.md").exists()


def test_create_worktree_creates_base_path(temp_git_repo):
    """Test that base path directory is created if it doesn't exist."""
    worktree_name = "test-feature-456"
    base_path = "custom-trees"

    worktree_path = create_worktree(worktree_name, "develop", base_path=base_path)

    assert worktree_path.parent.name == base_path
    assert worktree_path.exists()


def test_create_worktree_invalid_base_branch(temp_git_repo):
    """Test worktree creation fails with invalid base branch."""
    with pytest.raises(GitError):
        create_worktree("test-feature-789", "nonexistent-branch")


def test_create_worktree_duplicate_name(temp_git_repo):
    """Test worktree creation fails when worktree name already exists."""
    worktree_name = "duplicate-worktree"

    # Create first worktree
    create_worktree(worktree_name, "develop")

    # Attempt to create duplicate should fail
    with pytest.raises(GitError):
        create_worktree(worktree_name, "develop")


def test_list_worktrees_empty(temp_git_repo):
    """Test listing worktrees when only main worktree exists."""
    worktrees = list_worktrees()

    # Should have at least the main worktree
    assert len(worktrees) >= 1
    assert any(str(temp_git_repo) in wt.get("worktree", "") for wt in worktrees)


def test_list_worktrees_with_additional(temp_git_repo):
    """Test listing worktrees after creating additional worktrees."""
    worktree_name1 = "test-wt-1"
    worktree_name2 = "test-wt-2"

    create_worktree(worktree_name1, "develop")
    create_worktree(worktree_name2, "develop")

    worktrees = list_worktrees()

    # Should have main worktree + 2 additional
    assert len(worktrees) >= 3

    # Check that our worktrees are in the list
    worktree_paths = [wt.get("worktree", "") for wt in worktrees]
    assert any(worktree_name1 in path for path in worktree_paths)
    assert any(worktree_name2 in path for path in worktree_paths)


def test_worktree_exists_true(temp_git_repo):
    """Test worktree_exists returns True for existing worktree."""
    worktree_name = "existing-worktree"

    create_worktree(worktree_name, "develop")

    assert worktree_exists(worktree_name) is True


def test_worktree_exists_false(temp_git_repo):
    """Test worktree_exists returns False for non-existing worktree."""
    assert worktree_exists("nonexistent-worktree") is False


def test_cleanup_worktree_success(temp_git_repo):
    """Test successful worktree cleanup."""
    worktree_name = "cleanup-test"

    worktree_path = create_worktree(worktree_name, "develop")
    assert worktree_path.exists()

    # Cleanup
    result = cleanup_worktree(worktree_name)

    assert result is True
    assert not worktree_path.exists()

    # Verify branch is deleted
    branch_check = subprocess.run(
        ["git", "rev-parse", "--verify", worktree_name],
        cwd=temp_git_repo,
        capture_output=True,
    )
    assert branch_check.returncode != 0


def test_cleanup_worktree_with_uncommitted_changes(temp_git_repo):
    """Test cleanup handles uncommitted changes with --force flag."""
    worktree_name = "dirty-worktree"

    worktree_path = create_worktree(worktree_name, "develop")

    # Add uncommitted changes
    (worktree_path / "new_file.txt").write_text("uncommitted content")

    # Cleanup should still succeed due to --force flag
    result = cleanup_worktree(worktree_name)

    assert result is True
    assert not worktree_path.exists()


def test_cleanup_worktree_without_deleting_branch(temp_git_repo):
    """Test cleanup can preserve the branch when delete_branch=False."""
    worktree_name = "preserve-branch"

    worktree_path = create_worktree(worktree_name, "develop")
    assert worktree_path.exists()

    # Cleanup without deleting branch
    result = cleanup_worktree(worktree_name, delete_branch=False)

    assert result is True
    assert not worktree_path.exists()

    # Verify branch still exists
    branch_check = subprocess.run(
        ["git", "rev-parse", "--verify", worktree_name],
        cwd=temp_git_repo,
        capture_output=True,
    )
    assert branch_check.returncode == 0


def test_cleanup_worktree_nonexistent(temp_git_repo):
    """Test cleanup of non-existent worktree returns False but doesn't raise."""
    result = cleanup_worktree("nonexistent-cleanup-worktree")

    # Should return False since worktree doesn't exist
    assert result is False


def test_cleanup_worktree_custom_base_path(temp_git_repo):
    """Test cleanup with custom base path."""
    worktree_name = "custom-base-cleanup"
    base_path = "custom-trees"

    worktree_path = create_worktree(worktree_name, "develop", base_path=base_path)
    assert worktree_path.exists()

    # Cleanup with same base path
    result = cleanup_worktree(worktree_name, base_path=base_path)

    assert result is True
    assert not worktree_path.exists()


def test_worktree_lifecycle_integration(temp_git_repo):
    """Test complete worktree lifecycle: create, verify, use, cleanup."""
    worktree_name = "lifecycle-test"

    # Create
    worktree_path = create_worktree(worktree_name, "develop")
    assert worktree_path.exists()

    # Verify existence
    assert worktree_exists(worktree_name) is True

    # List should include our worktree
    worktrees = list_worktrees()
    worktree_paths = [wt.get("worktree", "") for wt in worktrees]
    assert any(worktree_name in path for path in worktree_paths)

    # Use worktree (add a file)
    test_file = worktree_path / "feature.txt"
    test_file.write_text("new feature")
    assert test_file.exists()

    # Cleanup
    result = cleanup_worktree(worktree_name)
    assert result is True

    # Verify cleanup
    assert not worktree_path.exists()
    assert worktree_exists(worktree_name) is False


def test_worktree_name_generation_uniqueness(temp_git_repo):
    """Test that multiple worktrees with unique names can coexist."""
    worktrees_to_create = [
        "feat-101-abc12345",
        "bug-202-def67890",
        "chore-303-ghi11111",
    ]

    # Create all worktrees
    created_paths = []
    for wt_name in worktrees_to_create:
        path = create_worktree(wt_name, "develop")
        created_paths.append(path)
        assert path.exists()

    # Verify all exist simultaneously
    for wt_name in worktrees_to_create:
        assert worktree_exists(wt_name) is True

    # Cleanup all
    for wt_name in worktrees_to_create:
        result = cleanup_worktree(wt_name)
        assert result is True

    # Verify all cleaned up
    for wt_name in worktrees_to_create:
        assert worktree_exists(wt_name) is False


def test_worktree_file_staging_and_commit_cycle(temp_git_repo):
    """Test file creation → staging → commit cycle in worktree context.

    This test validates the scenario described in issue #83 where plan files
    are created by agents in worktrees and need to be staged and committed.
    """
    worktree_name = "test-file-staging"

    # Create worktree
    worktree_path = create_worktree(worktree_name, "develop")
    assert worktree_path.exists()

    # Verify no changes initially
    assert has_changes(cwd=worktree_path) is False

    # Create a new file (simulating agent creating plan file)
    test_file = worktree_path / "docs" / "specs" / "plan.md"
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text("# Test Plan\n\nThis is a test plan file.")

    # Verify has_changes() returns True after file creation
    assert has_changes(cwd=worktree_path) is True, "has_changes() should return True after creating new file"

    # Verify file is NOT yet tracked (before staging)
    tracked_before, _ = verify_file_in_index("docs/specs/plan.md", cwd=worktree_path)
    assert tracked_before is False, "File should not be tracked before staging"

    # Stage the file
    stage_paths(["docs/specs/plan.md"], cwd=worktree_path)

    # Verify file is NOW tracked (after staging)
    tracked_after, error = verify_file_in_index("docs/specs/plan.md", cwd=worktree_path)
    assert tracked_after is True, f"File should be tracked after staging. Error: {error}"

    # Verify has_changes() still returns True (staged but not committed)
    assert has_changes(cwd=worktree_path) is True, "has_changes() should return True for staged changes"

    # Commit the changes
    committed, commit_error = commit_all("chore: add test plan file", cwd=worktree_path)
    assert committed is True, f"Commit should succeed. Error: {commit_error}"

    # Verify no changes after commit
    assert has_changes(cwd=worktree_path) is False, "has_changes() should return False after commit"

    # Verify file still exists and is tracked
    assert test_file.exists()
    tracked_final, _ = verify_file_in_index("docs/specs/plan.md", cwd=worktree_path)
    assert tracked_final is True, "File should remain tracked after commit"

    # Cleanup
    cleanup_worktree(worktree_name)


def test_worktree_commit_without_changes_fails(temp_git_repo):
    """Test that commit_all() fails when there are no changes in worktree."""
    worktree_name = "test-no-changes"

    # Create worktree
    worktree_path = create_worktree(worktree_name, "develop")
    assert worktree_path.exists()

    # Verify no changes
    assert has_changes(cwd=worktree_path) is False

    # Attempt to commit without changes should fail
    committed, commit_error = commit_all("chore: empty commit", cwd=worktree_path)
    assert committed is False, "Commit should fail when no changes exist"
    assert commit_error is not None, "Error message should be provided"
    assert "No changes to commit" in commit_error, f"Error should mention no changes. Got: {commit_error}"

    # Cleanup
    cleanup_worktree(worktree_name)
