
from adws.adw_modules.utils import parse_json


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
