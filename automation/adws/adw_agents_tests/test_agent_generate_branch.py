"""Unit tests for agent_generate_branch atomic agent."""

from unittest.mock import Mock, patch

import pytest

from adws.adw_agents.agent_generate_branch import generate_branch_name
from adws.adw_modules.data_types import AgentPromptResponse, GitHubIssue


@pytest.fixture
def mock_logger():
    return Mock()


@pytest.fixture
def sample_issue():
    return GitHubIssue(number=123, title="Add authentication", body="Implement JWT auth")


@patch("adws.adw_agents.agent_generate_branch.execute_template")
def test_generate_branch_name_success(mock_execute, sample_issue, mock_logger):
    """Test successful branch name generation."""
    mock_execute.return_value = AgentPromptResponse(success=True, output="feat/123-add-authentication")

    result, error = generate_branch_name(sample_issue, "/feature", "abc123", mock_logger)

    assert result == "feat/123-add-authentication"
    assert error is None


@patch("adws.adw_agents.agent_generate_branch.execute_template")
def test_generate_branch_name_empty(mock_execute, sample_issue, mock_logger):
    """Test empty branch name failure."""
    mock_execute.return_value = AgentPromptResponse(success=True, output="")

    result, error = generate_branch_name(sample_issue, "/feature", "abc123", mock_logger)

    assert result is None
    assert "Empty branch name" in error


@patch("adws.adw_agents.agent_generate_branch.execute_template")
def test_generate_branch_name_failure(mock_execute, sample_issue, mock_logger):
    """Test branch generation failure."""
    mock_execute.return_value = AgentPromptResponse(success=False, output="Agent execution failed")

    result, error = generate_branch_name(sample_issue, "/feature", "abc123", mock_logger)

    assert result is None
    assert error == "Agent execution failed"
