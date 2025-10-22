"""Tests for COMMANDS_ROOT path resolution in agent.py."""

from pathlib import Path

from adws.adw_modules.agent import COMMANDS_ROOT, command_template_path
from adws.adw_modules.utils import project_root


def test_commands_root_resolves_to_repo_root():
    """Verify COMMANDS_ROOT resolves to .claude/commands at repository root."""
    expected_path = project_root() / ".claude" / "commands"
    assert COMMANDS_ROOT == expected_path
    assert COMMANDS_ROOT.is_absolute()


def test_commands_root_directory_exists():
    """Verify .claude/commands directory exists at resolved path."""
    assert COMMANDS_ROOT.exists()
    assert COMMANDS_ROOT.is_dir()


def test_commands_root_contains_command_templates():
    """Verify COMMANDS_ROOT contains expected command template directories."""
    # Check for known subdirectories from .claude/commands/
    expected_subdirs = ["workflows", "docs", "issues"]

    for subdir in expected_subdirs:
        subdir_path = COMMANDS_ROOT / subdir
        assert subdir_path.exists(), f"Expected subdirectory {subdir} not found in COMMANDS_ROOT"
        assert subdir_path.is_dir(), f"Expected subdirectory {subdir} is not a directory"


def test_command_template_path_resolves_correctly():
    """Verify command_template_path() can find existing command templates."""
    # Test with a known command that should exist
    # Using /create which maps to .claude/commands/tasks/create.md
    template_path = command_template_path("/create")

    assert template_path is not None
    assert template_path.exists()
    assert template_path.suffix == ".md"
    assert template_path.is_relative_to(COMMANDS_ROOT)
    # Verify it found the file in a subdirectory (not at root)
    assert template_path.parent != COMMANDS_ROOT


def test_commands_root_not_in_parent_directory():
    """Verify COMMANDS_ROOT is NOT incorrectly navigating to parent of repo root."""
    # The bug was using project_root().parent which went UP from repo root
    # This test ensures we're not in the parent directory
    incorrect_path = project_root().parent / ".claude" / "commands"
    assert COMMANDS_ROOT != incorrect_path

    # Verify COMMANDS_ROOT is actually a child of project_root
    assert COMMANDS_ROOT.is_relative_to(project_root())
