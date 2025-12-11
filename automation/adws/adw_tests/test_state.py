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
    assert (tmp_path / "automation" / "agents" / adw_id / "adw_state.json").exists()


def test_state_ensure_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from adws.adw_modules import state as state_module
    from adws.adw_modules import workflow_ops

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)
    adw_id, state = workflow_ops.ensure_state(None, "456")
    assert state.issue_number == "456"
    assert state.adw_id == adw_id
    assert (tmp_path / "automation" / "agents" / adw_id / "adw_state.json").exists()


def test_agents_root_path_includes_automation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify agents_root() includes automation/ directory component."""
    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)
    agents_path = state_module.agents_root()
    assert agents_path == tmp_path / "automation" / "agents"


def test_find_by_issue_single_match(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test finding ADW state by issue number with single match."""
    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)

    from adws.adw_modules.state import ADWState

    # Create state for issue 123
    state1 = ADWState.load("test_id_1", create=True)
    state1.update(issue_number="123", branch_name="feat/test-123")

    # Find by issue number
    found = ADWState.find_by_issue("123")
    assert found is not None
    assert found.issue_number == "123"
    assert found.adw_id == "test_id_1"
    assert found.branch_name == "feat/test-123"


def test_find_by_issue_multiple_matches_returns_latest(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test finding ADW state returns most recent when multiple matches exist."""
    import time

    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)

    from adws.adw_modules.state import ADWState

    # Create first state for issue 456
    state1 = ADWState.load("test_id_2a", create=True)
    state1.update(issue_number="456", branch_name="feat/old")

    # Wait a bit to ensure different modification times
    time.sleep(0.01)

    # Create second (newer) state for same issue
    state2 = ADWState.load("test_id_2b", create=True)
    state2.update(issue_number="456", branch_name="feat/new")

    # Find by issue number - should return most recent
    found = ADWState.find_by_issue("456")
    assert found is not None
    assert found.issue_number == "456"
    assert found.adw_id == "test_id_2b"
    assert found.branch_name == "feat/new"


def test_find_by_issue_no_match(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test finding ADW state returns None when no match exists."""
    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)

    from adws.adw_modules.state import ADWState

    # Create state for issue 789
    state1 = ADWState.load("test_id_3", create=True)
    state1.update(issue_number="789", branch_name="feat/test-789")

    # Try to find non-existent issue
    found = ADWState.find_by_issue("999")
    assert found is None


def test_find_by_issue_ignores_invalid_states(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test finding ADW state gracefully handles invalid state files."""
    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)

    from adws.adw_modules.state import ADWState

    # Create valid state
    state1 = ADWState.load("test_id_4", create=True)
    state1.update(issue_number="111", branch_name="feat/test-111")

    # Create invalid state file (corrupted JSON)
    invalid_state_dir = tmp_path / "automation" / "agents" / "invalid_id"
    invalid_state_dir.mkdir(parents=True, exist_ok=True)
    (invalid_state_dir / "adw_state.json").write_text("{ invalid json }")

    # Should still find valid state, ignoring invalid one
    found = ADWState.find_by_issue("111")
    assert found is not None
    assert found.adw_id == "test_id_4"


def test_find_by_issue_with_no_issue_number(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test finding ADW state ignores states without issue_number."""
    from adws.adw_modules import state as state_module

    monkeypatch.setattr(state_module, "project_root", lambda: tmp_path)

    from adws.adw_modules.state import ADWState

    # Create state without issue number
    state1 = ADWState.load("test_id_5a", create=True)
    state1.update(branch_name="feat/test-no-issue")

    # Create state with issue number
    state2 = ADWState.load("test_id_5b", create=True)
    state2.update(issue_number="222", branch_name="feat/test-222")

    # Should find the one with issue number
    found = ADWState.find_by_issue("222")
    assert found is not None
    assert found.adw_id == "test_id_5b"

    # Should not find issue that doesn't exist
    found_none = ADWState.find_by_issue("999")
    assert found_none is None
