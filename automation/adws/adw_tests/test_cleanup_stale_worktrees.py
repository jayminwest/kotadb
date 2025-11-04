"""Tests for stale worktree cleanup script.

These tests verify the staleness detection logic and dry-run behavior
without executing actual git operations. Real git worktree management
is tested in test_git_ops_worktree.py.
"""

from __future__ import annotations

import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Import functions from cleanup script by adding scripts directory to path
import sys
import importlib.util

# Load cleanup script as a module
script_path = Path(__file__).resolve().parents[1] / "scripts" / "cleanup-stale-worktrees.py"
spec = importlib.util.spec_from_file_location("cleanup_stale_worktrees", script_path)
cleanup_module = importlib.util.module_from_spec(spec)
sys.modules["cleanup_stale_worktrees"] = cleanup_module
spec.loader.exec_module(cleanup_module)

# Import functions from loaded module
extract_adw_id_from_worktree = cleanup_module.extract_adw_id_from_worktree
find_stale_worktrees = cleanup_module.find_stale_worktrees


def test_extract_adw_id_from_worktree_valid():
    """Test ADW ID extraction from valid worktree names."""
    assert extract_adw_id_from_worktree("chore-208-fea7b5a8") == "fea7b5a8"
    assert extract_adw_id_from_worktree("feat-42-a1b2c3d4") == "a1b2c3d4"
    assert extract_adw_id_from_worktree("bug-100-12345678") == "12345678"


def test_extract_adw_id_from_worktree_invalid():
    """Test ADW ID extraction from invalid worktree names."""
    # Too short - missing ADW ID
    assert extract_adw_id_from_worktree("chore-208") is None

    # Invalid format - ADW ID not 8 characters
    assert extract_adw_id_from_worktree("chore-208-short") is None
    assert extract_adw_id_from_worktree("chore-208-toolongid123") is None

    # Invalid format - no separators
    assert extract_adw_id_from_worktree("invalidworktreename") is None


def test_find_stale_worktrees_empty_directory():
    """Test staleness detection with no worktrees."""
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_root = Path(tmpdir)

        # Mock project_root to return temp directory structure
        trees_root = temp_root / "automation" / "trees"
        trees_root.mkdir(parents=True, exist_ok=True)

        with patch("cleanup_stale_worktrees.project_root", return_value=temp_root):
            stale = find_stale_worktrees(max_age_days=7)
            assert stale == []


def test_find_stale_worktrees_fresh_worktree():
    """Test that recently modified worktrees are NOT marked stale."""
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_root = Path(tmpdir)

        # Create worktree directory
        trees_root = temp_root / "automation" / "trees"
        trees_root.mkdir(parents=True, exist_ok=True)
        worktree_dir = trees_root / "chore-208-fea7b5a8"
        worktree_dir.mkdir()

        # Create fresh state file (modified today)
        agents_root = temp_root / "automation" / "agents"
        agents_root.mkdir(parents=True, exist_ok=True)
        state_dir = agents_root / "fea7b5a8"
        state_dir.mkdir()
        state_file = state_dir / "adw_state.json"
        state_file.write_text(json.dumps({"adw_id": "fea7b5a8"}))

        with patch("cleanup_stale_worktrees.project_root", return_value=temp_root):
            with patch("cleanup_stale_worktrees.agents_root", return_value=agents_root):
                stale = find_stale_worktrees(max_age_days=7)
                assert stale == []


def test_find_stale_worktrees_old_worktree():
    """Test that old worktrees (>max_age_days) are marked stale."""
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_root = Path(tmpdir)

        # Create worktree directory
        trees_root = temp_root / "automation" / "trees"
        trees_root.mkdir(parents=True, exist_ok=True)
        worktree_dir = trees_root / "chore-208-fea7b5a8"
        worktree_dir.mkdir()

        # Create old state file (modified 8 days ago)
        agents_root = temp_root / "automation" / "agents"
        agents_root.mkdir(parents=True, exist_ok=True)
        state_dir = agents_root / "fea7b5a8"
        state_dir.mkdir()
        state_file = state_dir / "adw_state.json"
        state_file.write_text(json.dumps({"adw_id": "fea7b5a8"}))

        # Mock state file modification time to 8 days ago
        old_time = datetime.now() - timedelta(days=8)

        # Save original stat method
        original_stat = Path.stat

        def mock_stat_method(self, *, follow_symlinks=True):
            # For state file, return mocked mtime
            if str(self).endswith("adw_state.json"):
                mock = MagicMock()
                mock.st_mtime = old_time.timestamp()
                import stat as stat_module
                mock.st_mode = stat_module.S_IFREG | 0o644
                return mock
            # For other paths, use original stat
            return original_stat(self, follow_symlinks=follow_symlinks)

        with patch("cleanup_stale_worktrees.project_root", return_value=temp_root):
            with patch("cleanup_stale_worktrees.agents_root", return_value=agents_root):
                with patch.object(Path, "stat", mock_stat_method):
                    stale = find_stale_worktrees(max_age_days=7)
                    assert len(stale) == 1
                    assert stale[0][0] == "chore-208-fea7b5a8"
                    assert stale[0][2] == "fea7b5a8"


def test_find_stale_worktrees_orphaned():
    """Test that orphaned worktrees (no state file) are marked stale."""
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_root = Path(tmpdir)

        # Create worktree directory
        trees_root = temp_root / "automation" / "trees"
        trees_root.mkdir(parents=True, exist_ok=True)
        worktree_dir = trees_root / "chore-208-fea7b5a8"
        worktree_dir.mkdir()

        # No state file created - orphaned worktree
        agents_root = temp_root / "automation" / "agents"
        agents_root.mkdir(parents=True, exist_ok=True)

        with patch("cleanup_stale_worktrees.project_root", return_value=temp_root):
            with patch("cleanup_stale_worktrees.agents_root", return_value=agents_root):
                stale = find_stale_worktrees(max_age_days=7)
                assert len(stale) == 1
                assert stale[0][0] == "chore-208-fea7b5a8"
                assert stale[0][1] is None  # No last_modified time
                assert stale[0][2] == "fea7b5a8"


def test_find_stale_worktrees_invalid_name_format():
    """Test that worktrees with invalid name format are marked as orphaned."""
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_root = Path(tmpdir)

        # Create worktree with invalid name format
        trees_root = temp_root / "automation" / "trees"
        trees_root.mkdir(parents=True, exist_ok=True)
        worktree_dir = trees_root / "invalid-worktree"
        worktree_dir.mkdir()

        agents_root = temp_root / "automation" / "agents"
        agents_root.mkdir(parents=True, exist_ok=True)

        with patch("cleanup_stale_worktrees.project_root", return_value=temp_root):
            with patch("cleanup_stale_worktrees.agents_root", return_value=agents_root):
                stale = find_stale_worktrees(max_age_days=7)
                assert len(stale) == 1
                assert stale[0][0] == "invalid-worktree"
                assert stale[0][1] is None  # No last_modified time
                assert stale[0][2] is None  # No ADW ID extracted


def test_find_stale_worktrees_mixed_scenarios():
    """Test multiple worktrees with different staleness states."""
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_root = Path(tmpdir)

        # Create worktree directories
        trees_root = temp_root / "automation" / "trees"
        trees_root.mkdir(parents=True, exist_ok=True)

        # Fresh worktree
        fresh_dir = trees_root / "feat-1-aaaaaaaa"
        fresh_dir.mkdir()

        # Old worktree
        old_dir = trees_root / "bug-2-bbbbbbbb"
        old_dir.mkdir()

        # Orphaned worktree
        orphaned_dir = trees_root / "chore-3-cccccccc"
        orphaned_dir.mkdir()

        # Create state files
        agents_root = temp_root / "automation" / "agents"
        agents_root.mkdir(parents=True, exist_ok=True)

        # Fresh state file
        fresh_state_dir = agents_root / "aaaaaaaa"
        fresh_state_dir.mkdir()
        fresh_state_file = fresh_state_dir / "adw_state.json"
        fresh_state_file.write_text(json.dumps({"adw_id": "aaaaaaaa"}))

        # Old state file
        old_state_dir = agents_root / "bbbbbbbb"
        old_state_dir.mkdir()
        old_state_file = old_state_dir / "adw_state.json"
        old_state_file.write_text(json.dumps({"adw_id": "bbbbbbbb"}))

        # No state file for orphaned worktree

        # Mock state file modification times
        fresh_time = datetime.now()
        old_time = datetime.now() - timedelta(days=10)

        # Save original stat method
        original_stat = Path.stat

        def mock_stat_method(self, *, follow_symlinks=True):
            import stat as stat_module
            # For state files, return mocked mtime based on adw_id
            if str(self).endswith("adw_state.json"):
                mock = MagicMock()
                mock.st_mode = stat_module.S_IFREG | 0o644
                if "aaaaaaaa" in str(self):
                    mock.st_mtime = fresh_time.timestamp()
                elif "bbbbbbbb" in str(self):
                    mock.st_mtime = old_time.timestamp()
                return mock
            # For other paths, use original stat
            return original_stat(self, follow_symlinks=follow_symlinks)

        with patch("cleanup_stale_worktrees.project_root", return_value=temp_root):
            with patch("cleanup_stale_worktrees.agents_root", return_value=agents_root):
                with patch.object(Path, "stat", mock_stat_method):
                    stale = find_stale_worktrees(max_age_days=7)

                    # Should find 2 stale worktrees: old and orphaned
                    assert len(stale) == 2

                    stale_names = {wt[0] for wt in stale}
                    assert "bug-2-bbbbbbbb" in stale_names
                    assert "chore-3-cccccccc" in stale_names
                    assert "feat-1-aaaaaaaa" not in stale_names


def test_find_stale_worktrees_custom_threshold():
    """Test custom staleness threshold (14 days instead of 7)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_root = Path(tmpdir)

        # Create worktree directory
        trees_root = temp_root / "automation" / "trees"
        trees_root.mkdir(parents=True, exist_ok=True)
        worktree_dir = trees_root / "chore-208-fea7b5a8"
        worktree_dir.mkdir()

        # Create state file modified 10 days ago
        agents_root = temp_root / "automation" / "agents"
        agents_root.mkdir(parents=True, exist_ok=True)
        state_dir = agents_root / "fea7b5a8"
        state_dir.mkdir()
        state_file = state_dir / "adw_state.json"
        state_file.write_text(json.dumps({"adw_id": "fea7b5a8"}))

        # Mock state file modification time to 10 days ago
        old_time = datetime.now() - timedelta(days=10)

        # Save original stat method
        original_stat = Path.stat

        def mock_stat_method(self, *, follow_symlinks=True):
            # For state file, return mocked mtime
            if str(self).endswith("adw_state.json"):
                mock = MagicMock()
                mock.st_mtime = old_time.timestamp()
                import stat as stat_module
                mock.st_mode = stat_module.S_IFREG | 0o644
                return mock
            # For other paths, use original stat
            return original_stat(self, follow_symlinks=follow_symlinks)

        with patch("cleanup_stale_worktrees.project_root", return_value=temp_root):
            with patch("cleanup_stale_worktrees.agents_root", return_value=agents_root):
                with patch.object(Path, "stat", mock_stat_method):
                    # With 7-day threshold, should be stale
                    stale_7days = find_stale_worktrees(max_age_days=7)
                    assert len(stale_7days) == 1

                    # With 14-day threshold, should NOT be stale
                    stale_14days = find_stale_worktrees(max_age_days=14)
                    assert len(stale_14days) == 0
