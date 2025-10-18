"""Test suite for GitHub comment formatting with proper line breaks.

This module verifies that ADW bot comments contain actual newline characters
instead of escaped newline sequences (\\n), ensuring proper markdown rendering
in GitHub issue comments.
"""

import json
from unittest.mock import patch, MagicMock

from adws.adw_modules.github import make_issue_comment
from adws.adw_modules.workflow_ops import format_issue_message


def test_state_snapshot_formatting():
    """Verify JSON state snapshots use actual newlines, not escape sequences."""
    with patch("adws.adw_modules.github.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        # Simulate the exact pattern used in adw_plan.py line 93
        adw_id = "test-adw-123"
        state = {"phase": "plan", "status": "completed", "nested": {"key": "value"}}
        comment = f"{format_issue_message(adw_id, 'ops', '📋 Run state snapshot')}\n```json\n{json.dumps(state, indent=2)}\n```"

        make_issue_comment("123", comment)

        # Extract the actual comment body passed to subprocess
        call_args = mock_run.call_args
        cmd_list = call_args[0][0]
        body_index = cmd_list.index("--body") + 1
        actual_body = cmd_list[body_index]

        # Assert actual newlines exist (not literal backslash-n)
        assert "\n```json\n" in actual_body, "Code fence should have actual newlines"
        assert "\\n" not in actual_body, "Should not contain escaped newline sequences"

        # Verify JSON block is multi-line
        lines = actual_body.split("\n")
        assert len(lines) > 3, "Comment should span multiple lines"
        assert "```json" in lines, "Should have JSON code fence opening"
        assert "```" in lines[-1] or lines[-1] == "", "Should have code fence closing"


def test_command_list_formatting():
    """Verify command lists use actual newlines for proper bullet rendering."""
    with patch("adws.adw_modules.github.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        # Simulate the exact pattern used in adw_test.py line 255-256
        adw_id = "test-adw-456"
        commands = [
            {"cmd": "bun run lint"},
            {"cmd": "bun run typecheck"},
            {"cmd": "bun test"}
        ]
        comment = (
            f"{format_issue_message(adw_id, 'ops', '✅ Starting validation run')}\n"
            f"Commands:\n" + "\n".join(f"- `{entry['cmd']}`" for entry in commands)
        )

        make_issue_comment("456", comment)

        # Extract the actual comment body
        call_args = mock_run.call_args
        cmd_list = call_args[0][0]
        body_index = cmd_list.index("--body") + 1
        actual_body = cmd_list[body_index]

        # Assert actual newlines exist
        assert "\nCommands:\n" in actual_body, "Should have newlines around 'Commands:' header"
        assert "\\n" not in actual_body, "Should not contain escaped newline sequences"

        # Verify bullet list is multi-line
        lines = actual_body.split("\n")
        bullet_lines = [line for line in lines if line.startswith("- `")]
        assert len(bullet_lines) == 3, "Should have 3 bullet-pointed commands"


def test_error_message_formatting():
    """Verify error messages with multi-line content render correctly."""
    with patch("adws.adw_modules.github.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        # Simulate the exact pattern used in adw_test.py line 340
        adw_id = "test-adw-789"
        error_details = [
            "Command failed: bun test",
            "Exit code: 1",
            "```",
            "Error: Test suite failed",
            "  Expected: 5",
            "  Received: 3",
            "```"
        ]
        error_message = "\n".join(error_details)
        comment = f"{format_issue_message(adw_id, 'ops', '❌ Validation command failed')}\n\n{error_message}"

        make_issue_comment("789", comment)

        # Extract the actual comment body
        call_args = mock_run.call_args
        cmd_list = call_args[0][0]
        body_index = cmd_list.index("--body") + 1
        actual_body = cmd_list[body_index]

        # Assert actual newlines exist
        assert "\n\n" in actual_body, "Should have double newline after header"
        assert "\\n" not in actual_body, "Should not contain escaped newline sequences"

        # Verify multi-line error structure
        lines = actual_body.split("\n")
        assert "Command failed: bun test" in lines, "Should preserve error message lines"
        assert "Exit code: 1" in lines, "Should preserve multi-line structure"


def test_adw_bot_prefix_preserved():
    """Verify [ADW-BOT] prefix format is preserved for automation parsing."""
    with patch("adws.adw_modules.github.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        adw_id = "test-adw-999"
        state = {"phase": "build"}
        comment = f"{format_issue_message(adw_id, 'ops', '📋 State')}\n```json\n{json.dumps(state)}\n```"

        make_issue_comment("999", comment)

        # Extract the actual comment body
        call_args = mock_run.call_args
        cmd_list = call_args[0][0]
        body_index = cmd_list.index("--body") + 1
        actual_body = cmd_list[body_index]

        # Verify ADW-BOT prefix is at the start
        assert actual_body.startswith("[ADW-BOT]"), "Should preserve [ADW-BOT] prefix"
        assert f"{adw_id}_ops" in actual_body, "Should include ADW ID and agent name"
