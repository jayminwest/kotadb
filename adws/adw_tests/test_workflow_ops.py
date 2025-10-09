from __future__ import annotations

from types import SimpleNamespace
from typing import List

import pytest

from adws.adw_modules.workflow_ops import (
    DEFAULT_VALIDATION_SEQUENCE,
    ValidationCommandResult,
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
