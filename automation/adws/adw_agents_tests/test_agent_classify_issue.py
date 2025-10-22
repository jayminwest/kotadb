"""Unit tests for agent_classify_issue atomic agent."""

from unittest.mock import Mock, patch

import pytest

from adws.adw_agents.agent_classify_issue import classify_issue
from adws.adw_modules.data_types import AgentPromptResponse, GitHubIssue


@pytest.fixture
def mock_logger():
    return Mock()


@pytest.fixture
def sample_issue():
    from datetime import datetime, timezone
    return GitHubIssue(
        number=123,
        title="Add authentication",
        body="Implement JWT auth",
        state="open",
        author={"login": "testuser"},
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        url="https://github.com/test/repo/issues/123"
    )


@patch("adws.adw_agents.agent_classify_issue.execute_template")
def test_classify_issue_success(mock_execute, sample_issue, mock_logger):
    """Test successful issue classification."""
    mock_execute.return_value = AgentPromptResponse(success=True, output="/feature")

    result, error = classify_issue(sample_issue, "abc123", mock_logger)

    assert result == "/feature"
    assert error is None


@patch("adws.adw_agents.agent_classify_issue.execute_template")
def test_classify_issue_out_of_scope(mock_execute, sample_issue, mock_logger):
    """Test out-of-scope classification (graceful skip)."""
    mock_execute.return_value = AgentPromptResponse(success=True, output="0")

    result, error = classify_issue(sample_issue, "abc123", mock_logger)

    assert result is None
    assert error is None


@patch("adws.adw_agents.agent_classify_issue.execute_template")
def test_classify_issue_failure(mock_execute, sample_issue, mock_logger):
    """Test classification failure."""
    mock_execute.return_value = AgentPromptResponse(success=False, output="Agent execution failed")

    result, error = classify_issue(sample_issue, "abc123", mock_logger)

    assert result is None
    assert error == "Agent execution failed"
