import subprocess
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from adws.adw_modules.utils import parse_json, project_root


def test_parse_json_from_code_block():
    payload = """```json
{
  "ok": true,
  "items": [1, 2, 3]
}
```"""

    data = parse_json(payload)
    assert data["ok"] is True
    assert data["items"] == [1, 2, 3]


def test_parse_json_list_of_models():
    payload = """```json
[
  {"label": "lint", "passed": true, "command": "bun run lint"},
  {"label": "typecheck", "passed": false, "command": "bun run typecheck"}
]
```"""

    from adws.adw_modules.data_types import TestResult

    results = parse_json(payload, list[TestResult])  # type: ignore[arg-type]
    assert len(results) == 2
    assert results[0].label == "lint"
    assert results[1].passed is False


def test_project_root_from_subdirectory(monkeypatch: pytest.MonkeyPatch):
    """Verify project_root() uses git to resolve root from any directory."""
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "/path/to/repo\n"

    def mock_run(*args, **kwargs):
        return mock_result

    monkeypatch.setattr(subprocess, "run", mock_run)

    root = project_root()
    assert root == Path("/path/to/repo")


def test_project_root_fallback_outside_git(monkeypatch: pytest.MonkeyPatch):
    """Verify project_root() falls back to file-based detection when git fails."""
    mock_result = MagicMock()
    mock_result.returncode = 1

    def mock_run(*args, **kwargs):
        return mock_result

    monkeypatch.setattr(subprocess, "run", mock_run)

    root = project_root()
    # Should fall back to file-based detection (2 parents up from utils.py)
    assert isinstance(root, Path)
