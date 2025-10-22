"""Unit tests for agent_create_plan atomic agent."""

from unittest.mock import Mock, patch

import pytest

from adws.adw_agents.agent_create_plan import build_plan
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


@patch("adws.adw_agents.agent_create_plan.execute_template")
def test_build_plan_success(mock_execute, sample_issue, mock_logger):
    """Test successful plan creation."""
    mock_execute.return_value = AgentPromptResponse(success=True, output="Plan created: docs/specs/feat-123.md")

    response = build_plan(sample_issue, "/feature", "abc123", mock_logger)

    assert response.success is True
    assert "docs/specs/feat-123.md" in response.output


@patch("adws.adw_agents.agent_create_plan.execute_template")
def test_build_plan_failure(mock_execute, sample_issue, mock_logger):
    """Test plan creation failure."""
    mock_execute.return_value = AgentPromptResponse(success=False, output="Plan generation failed")

    response = build_plan(sample_issue, "/feature", "abc123", mock_logger)

    assert response.success is False
    assert "failed" in response.output.lower()


@patch("adws.adw_agents.agent_create_plan.execute_template")
def test_build_plan_with_cwd(mock_execute, sample_issue, mock_logger):
    """Test plan creation with custom working directory."""
    mock_execute.return_value = AgentPromptResponse(success=True, output="Plan created")

    response = build_plan(sample_issue, "/feature", "abc123", mock_logger, cwd="/path/to/worktree")

    assert response.success is True
