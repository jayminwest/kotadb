"""
Tests for orchestrator hooks.

Validates tool restrictions and pattern detection for orchestrator contexts.
"""

import pytest
from pathlib import Path
import sys

# Add .claude/hooks to path for imports
hooks_path = Path(__file__).parent.parent.parent.parent / ".claude" / "hooks"
sys.path.insert(0, str(hooks_path))

from orchestrator_guard import BLOCKED_TOOLS, ALLOWED_TOOLS


class TestToolRestrictions:
    """Test that tool restrictions are properly defined."""

    def test_blocked_tools_contains_write(self):
        """Write tool should be blocked."""
        assert "Write" in BLOCKED_TOOLS

    def test_blocked_tools_contains_edit(self):
        """Edit tool should be blocked."""
        assert "Edit" in BLOCKED_TOOLS

    def test_blocked_tools_contains_multiedit(self):
        """MultiEdit tool should be blocked."""
        assert "MultiEdit" in BLOCKED_TOOLS

    def test_blocked_tools_contains_notebookedit(self):
        """NotebookEdit tool should be blocked."""
        assert "NotebookEdit" in BLOCKED_TOOLS

    def test_allowed_tools_contains_read(self):
        """Read tool should be allowed."""
        assert "Read" in ALLOWED_TOOLS

    def test_allowed_tools_contains_grep(self):
        """Grep tool should be allowed."""
        assert "Grep" in ALLOWED_TOOLS

    def test_allowed_tools_contains_glob(self):
        """Glob tool should be allowed."""
        assert "Glob" in ALLOWED_TOOLS

    def test_allowed_tools_contains_task(self):
        """Task tool should be allowed for delegation."""
        assert "Task" in ALLOWED_TOOLS

    def test_allowed_tools_contains_bash(self):
        """Bash tool should be allowed."""
        assert "Bash" in ALLOWED_TOOLS

    def test_no_overlap_between_blocked_and_allowed(self):
        """Tools should not appear in both sets."""
        overlap = BLOCKED_TOOLS & ALLOWED_TOOLS
        assert len(overlap) == 0, f"Overlap found: {overlap}"
