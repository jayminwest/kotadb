"""Integration tests for beads ADW workflow integration (Phase 2).

This test module validates beads MCP tool integration with ADW workflows:
- Work selection from beads (ready list)
- Atomic claim operations (in_progress status)
- Dependency graph queries
- GitHub API fallback when beads unavailable

Test Philosophy:
- Real beads database via CLI commands (no mocks)
- Uses temporary test workspace for isolation
- Validates dual-source strategy (beads + GitHub API)

Note: Full test suite pending Phase 2 completion (issue #303).
Current stub validates basic beads CLI integration only.
"""

import pytest
import subprocess
import tempfile
from pathlib import Path

from adw_modules.beads_ops import (
    query_ready_issues_cli,
    get_issue_details_cli,
    update_issue_status_cli,
    list_open_issues_cli,
)


@pytest.fixture
def test_workspace(tmp_path):
    """Create temporary workspace with initialized beads database."""
    workspace = tmp_path / "test-workspace"
    workspace.mkdir()

    # Initialize beads with test prefix
    try:
        result = subprocess.run(
            ["bd", "init", "--prefix", "test"],
            cwd=workspace,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            pytest.skip(f"Beads CLI initialization failed: {result.stderr}")

    except FileNotFoundError:
        pytest.skip("Beads CLI not available in PATH")
    except Exception as e:
        pytest.skip(f"Beads CLI initialization error: {e}")

    return workspace


class TestBeadsWorkSelection:
    """Test beads work selection queries (Phase 2, Task 1)."""

    def test_query_ready_issues_cli(self, test_workspace):
        """Query ready issues with no blockers."""
        # Create test issue in beads
        subprocess.run(
            ["bd", "create", "Test ready issue", "--priority", "1", "--type", "task"],
            cwd=test_workspace,
            capture_output=True,
            text=True,
            check=True,
        )

        # Query ready issues
        issues = query_ready_issues_cli(workspace_root=str(test_workspace), limit=10)

        assert issues is not None
        assert len(issues) >= 1
        assert any("Test ready issue" in issue.get("title", "") for issue in issues)

    def test_query_ready_issues_with_priority_filter(self, test_workspace):
        """Query ready issues filtered by priority."""
        # Create high-priority issue
        subprocess.run(
            ["bd", "create", "High priority task", "--priority", "1", "--type", "task"],
            cwd=test_workspace,
            capture_output=True,
            text=True,
            check=True,
        )

        # Query only priority 1 issues
        issues = query_ready_issues_cli(
            workspace_root=str(test_workspace),
            priority=1,
            limit=10,
        )

        assert issues is not None
        assert len(issues) >= 1

    def test_query_ready_issues_fallback_when_cli_unavailable(self):
        """Test graceful fallback when beads CLI unavailable."""
        # Use non-existent workspace to trigger FileNotFoundError
        issues = query_ready_issues_cli(workspace_root="/nonexistent/path", limit=10)

        # Should return None (enables GitHub API fallback)
        assert issues is None


class TestBeadsIssueDetails:
    """Test beads issue detail queries (Phase 2, Task 2)."""

    def test_get_issue_details_cli(self, test_workspace):
        """Get detailed information about specific issue."""
        # Create test issue
        result = subprocess.run(
            [
                "bd",
                "create",
                "Detail test issue",
                "--description",
                "Test description",
                "--priority",
                "2",
                "--type",
                "bug",
                "--json",
            ],
            cwd=test_workspace,
            capture_output=True,
            text=True,
            check=True,
        )

        import json
        created_issue = json.loads(result.stdout)
        issue_id = created_issue["id"]

        # Get issue details
        details = get_issue_details_cli(issue_id, workspace_root=str(test_workspace))

        assert details is not None
        assert details["id"] == issue_id
        assert details["title"] == "Detail test issue"
        assert details["priority"] == 2


class TestBeadsStatusUpdates:
    """Test beads status update operations (Phase 2, Task 3)."""

    def test_update_issue_status_atomic_claim(self, test_workspace):
        """Test atomic work claim via status update."""
        # Create issue
        result = subprocess.run(
            ["bd", "create", "Claimable task", "--priority", "1", "--type", "task", "--json"],
            cwd=test_workspace,
            capture_output=True,
            text=True,
            check=True,
        )

        import json
        created_issue = json.loads(result.stdout)
        issue_id = created_issue["id"]

        # Claim work atomically
        success = update_issue_status_cli(
            issue_id,
            "in_progress",
            workspace_root=str(test_workspace),
            assignee="claude",
        )

        assert success is True

        # Verify status changed
        details = get_issue_details_cli(issue_id, workspace_root=str(test_workspace))
        assert details["status"] == "in_progress"
        assert details["assignee"] == "claude"


class TestBeadsListOperations:
    """Test beads list queries for prioritization (Phase 2, Task 4)."""

    def test_list_open_issues_cli(self, test_workspace):
        """List all open issues from beads."""
        # Create multiple issues
        for i in range(3):
            subprocess.run(
                ["bd", "create", f"List test issue {i}", "--priority", str(i + 1), "--type", "task"],
                cwd=test_workspace,
                capture_output=True,
                text=True,
                check=True,
            )

        # List open issues
        issues = list_open_issues_cli(
            workspace_root=str(test_workspace),
            status="open",
            limit=10,
        )

        assert issues is not None
        assert len(issues) >= 3


# TODO: Add Phase 2 complete test suite
# - Test concurrent claim operations (SQLite locking)
# - Test dependency graph queries (bd show with recursive traversal)
# - Test discovered issue creation (bd create + bd dep)
# - Test GitHub API fallback scenarios
# - Test beads sync validation (JSONL freshness checks)
# - Performance benchmarks (beads vs GitHub API latency)
# - Integration tests with orchestrator state updates
# - End-to-end workflow tests (plan → build → review with beads tracking)
