"""Unit tests for atomic agent orchestrator."""

from unittest.mock import Mock

import pytest

from adws.adw_agents.orchestrator import run_adw_workflow, validate_agent_dependencies


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


def test_run_adw_workflow_not_implemented():
    """Test that orchestrator raises NotImplementedError in Phase 1."""
    mock_logger = Mock()

    with pytest.raises(NotImplementedError, match="Phase 2 implementation"):
        run_adw_workflow("123", mock_logger)


def test_run_adw_workflow_logs_warning():
    """Test that orchestrator logs warning about Phase 2 implementation."""
    mock_logger = Mock()

    try:
        run_adw_workflow("123", mock_logger)
    except NotImplementedError:
        pass

    mock_logger.warning.assert_called_once()
    assert "Phase 2" in str(mock_logger.warning.call_args)
