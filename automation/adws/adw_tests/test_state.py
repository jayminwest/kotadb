from __future__ import annotations

from pathlib import Path

import pytest


def test_state_persistence(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)

    from adws.adw_modules.state import ADWState, ensure_adw_id

    adw_id = ensure_adw_id()
    state = ADWState.load(adw_id, create=True)
    state.update(issue_number="123", branch_name="feat/test", plan_file="specs/plan.md")

    reloaded = ADWState.load(adw_id)
    assert reloaded.issue_number == "123"
    assert reloaded.branch_name == "feat/test"
    assert reloaded.plan_file == "specs/plan.md"
    assert (tmp_path / "agents" / adw_id / "adw_state.json").exists()


def test_state_ensure_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from adws.adw_modules import state as state_module
    from adws.adw_modules import workflow_ops

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)
    adw_id, state = workflow_ops.ensure_state(None, "456")
    assert state.issue_number == "456"
    assert state.adw_id == adw_id
    assert (tmp_path / "agents" / adw_id / "adw_state.json").exists()
