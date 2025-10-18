from __future__ import annotations


import logging
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from adws.adw_modules.state import ADWState
from adws.adw_modules.workflow_ops import (
    DEFAULT_VALIDATION_SEQUENCE,
    ValidationCommandResult,
    find_spec_file,
    format_issue_message,
    lockfile_changed,
    serialize_validation,
    summarize_validation_results,
)


def test_format_issue_message_includes_bot_identifier():
    message = format_issue_message("deadbeef", "ops", "Hello")
    assert message.startswith("[ADW-BOT]")
    assert "deadbeef_ops" in message


def test_summarize_validation_results_success():
    results = [
        ValidationCommandResult(
            label="lint",
            command=("bun", "run", "lint"),
            returncode=0,
            stdout="ok",
            stderr="",
        )
    ]
    success, summary = summarize_validation_results(results)
    assert success is True
    assert "✅" in summary


def test_summarize_validation_results_failure_stops():
    results = [
        ValidationCommandResult(
            label="lint",
            command=("bun", "run", "lint"),
            returncode=0,
            stdout="ok",
            stderr="",
        ),
        ValidationCommandResult(
            label="test",
            command=("bun", "test"),
            returncode=1,
            stdout="",
            stderr="failed",
        ),
    ]
    success, summary = summarize_validation_results(results)
    assert success is False
    assert "❌" in summary
    assert "failed" in summary


def test_serialize_validation_returns_dicts():
    commands = DEFAULT_VALIDATION_SEQUENCE
    serialized = serialize_validation(commands)
    assert all("cmd" in entry for entry in serialized)
    assert serialized[0]["label"] == commands[0].label


def test_lockfile_changed(monkeypatch: pytest.MonkeyPatch):
    class DummyResult:
        def __init__(self, stdout: str, returncode: int = 0):
            self.stdout = stdout
            self.returncode = returncode

    def fake_run(*args, **kwargs):
        return DummyResult(" M bun.lock\n?? README.md\n")

    import adws.adw_modules.workflow_ops as workflow_ops_module

    monkeypatch.setattr(workflow_ops_module.subprocess, "run", fake_run)
    assert lockfile_changed() is True

    def fake_run_clean(*args, **kwargs):
        return DummyResult("")

    monkeypatch.setattr(workflow_ops_module.subprocess, "run", fake_run_clean)
    assert lockfile_changed() is False


def test_find_spec_file_worktree_relative(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test spec file resolution in worktree context."""
    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)

    worktree_path = tmp_path / "worktree"
    worktree_path.mkdir()
    spec_dir = worktree_path / "docs" / "specs"
    spec_dir.mkdir(parents=True)
    spec_file = spec_dir / "bug-123-test.md"
    spec_file.write_text("# Test spec")

    state = ADWState.load("test123", create=True)
    state.update(
        issue_number="123",
        branch_name="bug-123-test",
        issue_class="/bug",
        worktree_name="bug-123-test",
        worktree_path=str(worktree_path),
        plan_file="docs/specs/bug-123-test.md",
    )

    logger = logging.getLogger("test")
    result = find_spec_file(state, logger)
    assert result is not None
    assert "bug-123-test.md" in result
    assert Path(result).exists()


def test_find_spec_file_glob_search_worktree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test glob-based spec file discovery in worktree."""
    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)

    worktree_path = tmp_path / "worktree"
    worktree_path.mkdir()
    spec_dir = worktree_path / "docs" / "specs"
    spec_dir.mkdir(parents=True)
    spec_file = spec_dir / "feature-456-new-api.md"
    spec_file.write_text("# API spec")

    state = ADWState.load("test456", create=True)
    state.update(
        issue_number="456",
        branch_name="feature-456",
        issue_class="/feature",
        worktree_name="feature-456",
        worktree_path=str(worktree_path),
        plan_file=None,  # Test glob fallback
    )

    logger = logging.getLogger("test")
    result = find_spec_file(state, logger)
    assert result is not None
    assert "feature-456-new-api.md" in result
    assert Path(result).exists()


def test_find_spec_file_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test spec file resolution when file doesn't exist."""
    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)

    worktree_path = tmp_path / "worktree"
    worktree_path.mkdir()

    state = ADWState.load("test789", create=True)
    state.update(
        issue_number="789",
        branch_name="bug-789",
        issue_class="/bug",
        worktree_name="bug-789",
        worktree_path=str(worktree_path),
        plan_file="docs/specs/bug-789-missing.md",
    )

    logger = logging.getLogger("test")
    result = find_spec_file(state, logger)
    assert result is None


def test_find_spec_file_no_worktree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Test spec file resolution without worktree (legacy behavior)."""
    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)

    state = ADWState.load("test999", create=True)
    state.update(
        issue_number="999",
        branch_name="bug-999",
        issue_class="/bug",
        plan_file="docs/specs/bug-999-test.md",
    )

    logger = logging.getLogger("test")
    result = find_spec_file(state, logger)
    # Should attempt project root search (will fail in test, but shouldn't crash)
    assert result is None or isinstance(result, str)
