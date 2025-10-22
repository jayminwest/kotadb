"""Unit tests for atomic agent orchestrator."""

from unittest.mock import Mock, patch

import pytest

from adws.adw_agents.orchestrator import run_adw_workflow, validate_agent_dependencies, _retry_with_backoff


def test_validate_agent_dependencies():
    """Test agent dependency graph structure."""
    deps = validate_agent_dependencies()

    # Verify no-dependency agents
    assert deps["classify_issue"] == []
    assert deps["generate_branch"] == []

    # Verify sequential dependencies
    assert "classify_issue" in deps["create_plan"]
    assert "generate_branch" in deps["create_plan"]
    assert deps["commit_plan"] == ["create_plan"]
    assert deps["implement_plan"] == ["commit_plan"]


def test_retry_with_backoff_success():
    """Test retry succeeds on first attempt."""
    mock_func = Mock(return_value=("result", None))
    result, error = _retry_with_backoff(mock_func, max_retries=3)

    assert result == "result"
    assert error is None
    assert mock_func.call_count == 1


def test_retry_with_backoff_eventual_success():
    """Test retry succeeds after failures."""
    attempts = [0]
    def failing_func():
        attempts[0] += 1
        if attempts[0] < 3:
            return None, "Error"
        return "success", None

    result, error = _retry_with_backoff(failing_func, max_retries=3, initial_delay=0.01)

    assert result == "success"
    assert error is None
    assert attempts[0] == 3


def test_retry_with_backoff_all_fail():
    """Test retry exhausts all attempts."""
    mock_func = Mock(return_value=(None, "Persistent error"))
    result, error = _retry_with_backoff(mock_func, max_retries=3, initial_delay=0.01)

    assert result is None
    assert error == "Persistent error"
    assert mock_func.call_count == 3


@patch("adws.adw_agents.orchestrator.fetch_issue")
@patch("adws.adw_agents.orchestrator.get_repo_url")
@patch("adws.adw_agents.orchestrator.extract_repo_path")
def test_run_adw_workflow_fetch_issue_failure(mock_extract, mock_get_url, mock_fetch):
    """Test workflow fails gracefully when issue fetch fails."""
    mock_logger = Mock()
    mock_get_url.return_value = "https://github.com/test/repo"
    mock_extract.return_value = "test/repo"
    mock_fetch.return_value = None  # Simulate fetch failure

    result = run_adw_workflow("123", mock_logger, adw_id="test-adw-123")

    assert result.success is False
    assert result.failed_agent == "fetch_issue"
    assert "Failed to fetch issue" in result.error_message
