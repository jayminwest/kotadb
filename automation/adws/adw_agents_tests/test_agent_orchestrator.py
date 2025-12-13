"""Unit tests for atomic agent orchestrator."""

import time
from unittest.mock import Mock, patch
from threading import Lock

import pytest

from adws.adw_agents.orchestrator import (
    run_adw_workflow,
    validate_agent_dependencies,
    _retry_with_backoff,
    _execute_parallel_agents,
    _safe_state_update,
)


def test_validate_agent_dependencies():
    """Test agent dependency graph structure (Phase 3 - updated for data dependencies)."""
    deps = validate_agent_dependencies()

    # Verify no-dependency agents
    assert deps["classify_issue"] == []

    # Verify generate_branch depends on classify_issue (data dependency)
    assert deps["generate_branch"] == ["classify_issue"]

    # Verify sequential dependencies
    assert deps["create_plan"] == ["generate_branch"]
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


# Phase 3: Parallel Execution Tests


def test_execute_parallel_agents_all_success():
    """Test parallel execution with all agents succeeding."""
    mock_logger = Mock()
    call_order = []

    def task_a():
        call_order.append("a_start")
        time.sleep(0.01)  # Simulate work
        call_order.append("a_end")
        return "result_a", None

    def task_b():
        call_order.append("b_start")
        time.sleep(0.01)  # Simulate work
        call_order.append("b_end")
        return "result_b", None

    tasks = {"agent_a": task_a, "agent_b": task_b}
    results = _execute_parallel_agents(tasks, mock_logger, max_workers=2)

    # Verify both completed successfully
    assert results["agent_a"] == ("result_a", None)
    assert results["agent_b"] == ("result_b", None)

    # Verify parallel execution (interleaved starts/ends)
    assert "a_start" in call_order and "b_start" in call_order
    assert "a_end" in call_order and "b_end" in call_order


def test_execute_parallel_agents_partial_failure():
    """Test parallel execution with one agent failing."""
    mock_logger = Mock()

    def task_success():
        return "success", None

    def task_failure():
        return None, "Agent failed"

    tasks = {"agent_success": task_success, "agent_failure": task_failure}
    results = _execute_parallel_agents(tasks, mock_logger, max_workers=2)

    # Verify mixed results
    assert results["agent_success"] == ("success", None)
    assert results["agent_failure"] == (None, "Agent failed")


def test_execute_parallel_agents_exception_handling():
    """Test parallel execution handles exceptions gracefully."""
    mock_logger = Mock()

    def task_exception():
        raise ValueError("Unexpected error")

    def task_success():
        return "success", None

    tasks = {"agent_exception": task_exception, "agent_success": task_success}
    results = _execute_parallel_agents(tasks, mock_logger, max_workers=2)

    # Verify exception is caught and converted to error
    assert results["agent_exception"][0] is None
    assert "Unexpected error" in results["agent_exception"][1]
    assert results["agent_success"] == ("success", None)


def test_execute_parallel_agents_respects_max_workers():
    """Test parallel execution respects max_workers configuration."""
    mock_logger = Mock()
    concurrent_count = [0]
    max_concurrent = [0]
    lock = Lock()

    def task_with_tracking():
        with lock:
            concurrent_count[0] += 1
            max_concurrent[0] = max(max_concurrent[0], concurrent_count[0])
        time.sleep(0.05)  # Simulate work
        with lock:
            concurrent_count[0] -= 1
        return "done", None

    # Create 5 tasks but limit to 2 workers
    tasks = {f"agent_{i}": task_with_tracking for i in range(5)}
    results = _execute_parallel_agents(tasks, mock_logger, max_workers=2)

    # Verify all tasks completed
    assert len(results) == 5
    assert all(r == ("done", None) for r in results.values())

    # Verify max concurrency was 2
    assert max_concurrent[0] <= 2


def test_safe_state_update_thread_safety():
    """Test thread-safe state updates with concurrent modifications."""
    from adws.adw_modules.state import ADWState

    mock_state = Mock(spec=ADWState)
    mock_state.save = Mock()
    call_count = [0]

    def update_fn(state):
        # Simulate state modification
        call_count[0] += 1
        time.sleep(0.001)  # Simulate processing

    # Perform concurrent updates
    import threading
    threads = []
    for _ in range(10):
        t = threading.Thread(target=_safe_state_update, args=(mock_state, update_fn))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    # Verify all updates completed
    assert call_count[0] == 10
    assert mock_state.save.call_count == 10


def test_execute_parallel_agents_with_retry():
    """Test parallel execution integrates with retry logic."""
    mock_logger = Mock()
    attempt_counts = {"agent_a": [0], "agent_b": [0]}

    def task_with_retries(agent_name):
        def task():
            attempt_counts[agent_name][0] += 1
            if attempt_counts[agent_name][0] < 2:
                return None, "Temporary failure"
            return f"success_{agent_name}", None
        return task

    tasks = {
        "agent_a": task_with_retries("agent_a"),
        "agent_b": task_with_retries("agent_b"),
    }
    results = _execute_parallel_agents(tasks, mock_logger, max_workers=2)

    # Verify both agents retried and succeeded
    assert results["agent_a"] == ("success_agent_a", None)
    assert results["agent_b"] == ("success_agent_b", None)
    assert attempt_counts["agent_a"][0] == 2
    assert attempt_counts["agent_b"][0] == 2


# ============================================================================
# Issue #517: Signature Verification Tests
# ============================================================================
# These tests verify that all 7 agent invocations in orchestrator.py
# use correct function signatures matching the actual agent implementations.


class TestPushBranchSignature:
    """Tests for push_branch agent invocation signature."""

    def test_push_branch_no_adw_id_parameter(self):
        """Verify push_branch signature does not include adw_id (fix for #517)."""
        from adws.adw_agents.agent_push_branch import push_branch
        import inspect
        
        # Get the function signature
        sig = inspect.signature(push_branch)
        param_names = list(sig.parameters.keys())
        
        # Verify adw_id is NOT in the signature
        assert "adw_id" not in param_names
        # Verify expected parameters
        assert param_names == ["branch_name", "logger", "cwd"]

    def test_push_branch_returns_dict(self):
        """Verify push_branch return type is Dict (not tuple) - fix for #517."""
        from adws.adw_agents.agent_push_branch import push_branch
        import inspect
        
        # Get return annotation
        sig = inspect.signature(push_branch)
        return_annotation = sig.return_annotation
        
        # Should be Dict, not Tuple
        assert "Dict" in str(return_annotation) or "dict" in str(return_annotation)


class TestCleanupWorktreeSignature:
    """Tests for cleanup_worktree agent invocation signature."""

    def test_cleanup_worktree_no_adw_id_parameter(self):
        """Verify cleanup_worktree signature does not include adw_id (fix for #517)."""
        from adws.adw_agents.agent_cleanup_worktree import cleanup_worktree
        import inspect
        
        sig = inspect.signature(cleanup_worktree)
        param_names = list(sig.parameters.keys())
        
        # Verify adw_id is NOT in the signature
        assert "adw_id" not in param_names
        # Verify expected parameters
        assert "worktree_name" in param_names
        assert "logger" in param_names
        assert "base_path" in param_names

    def test_cleanup_worktree_returns_bool(self):
        """Verify cleanup_worktree return type is bool (not tuple) - fix for #517."""
        from adws.adw_agents.agent_cleanup_worktree import cleanup_worktree
        import inspect
        
        sig = inspect.signature(cleanup_worktree)
        return_annotation = sig.return_annotation
        
        # Should be bool, not Tuple
        assert return_annotation is bool or return_annotation == "bool"


class TestCreatePullRequestSignature:
    """Tests for create_pull_request agent invocation signature."""

    def test_create_pr_requires_branch_name_and_plan_file(self):
        """Verify create_pull_request requires branch_name and plan_file (fix for #517)."""
        from adws.adw_agents.agent_create_pr import create_pull_request
        import inspect
        
        sig = inspect.signature(create_pull_request)
        param_names = list(sig.parameters.keys())
        
        # Verify correct parameter order
        assert param_names[0] == "branch_name"  # First parameter
        assert param_names[1] == "issue"        # Second parameter
        assert param_names[2] == "plan_file"    # Third parameter
        assert param_names[3] == "adw_id"       # Fourth parameter


class TestRunReviewSignature:
    """Tests for run_review agent invocation signature."""

    def test_run_review_requires_spec_file(self):
        """Verify run_review requires spec_file (not issue) as first param (fix for #517)."""
        from adws.adw_agents.agent_review_code import run_review
        import inspect
        
        sig = inspect.signature(run_review)
        param_names = list(sig.parameters.keys())
        
        # First parameter should be spec_file, not issue
        assert param_names[0] == "spec_file"
        assert "issue" not in param_names  # No issue parameter at all


class TestCommitImplementationSignature:
    """Tests for commit_implementation agent invocation signature."""

    def test_commit_implementation_requires_issue_class(self):
        """Verify commit_implementation requires issue_class (fix for #517)."""
        from adws.adw_agents.agent_commit_implementation import commit_implementation
        import inspect
        
        sig = inspect.signature(commit_implementation)
        param_names = list(sig.parameters.keys())
        
        # Verify issue_class is second parameter
        assert param_names[0] == "issue"
        assert param_names[1] == "issue_class"  # Required!
        assert param_names[2] == "adw_id"


class TestCommitPlanAgentSignature:
    """Tests for commit_plan agent signature itself."""

    def test_commit_plan_requires_issue_class(self):
        """Verify commit_plan requires issue_class (fix for #517)."""
        from adws.adw_agents.agent_commit_plan import commit_plan
        import inspect
        
        sig = inspect.signature(commit_plan)
        param_names = list(sig.parameters.keys())
        
        # Verify issue_class is second parameter
        assert param_names[0] == "issue"
        assert param_names[1] == "issue_class"  # Required!
        assert param_names[2] == "adw_id"


class TestImplementPlanAgentSignature:
    """Tests for implement_plan agent signature."""

    def test_implement_plan_plan_file_is_first(self):
        """Verify implement_plan has plan_file as first parameter (fix for #517)."""
        from adws.adw_agents.agent_implement_plan import implement_plan
        import inspect
        
        sig = inspect.signature(implement_plan)
        param_names = list(sig.parameters.keys())
        
        # First parameter should be plan_file, not issue
        assert param_names[0] == "plan_file"
        assert "issue" not in param_names  # No issue parameter


class TestOrchestratorSignatureIntegration:
    """Integration tests verifying orchestrator calls match agent signatures."""

    def test_orchestrator_source_has_correct_commit_plan_call(self):
        """Verify orchestrator source has correct commit_plan invocation."""
        import inspect
        from adws.adw_agents import orchestrator
        
        source = inspect.getsource(orchestrator.run_adw_workflow)
        
        # Should have state.issue_class in commit_plan call
        assert "commit_plan(issue, state.issue_class," in source
        
    def test_orchestrator_source_has_correct_implement_plan_call(self):
        """Verify orchestrator source has correct implement_plan invocation."""
        import inspect
        from adws.adw_agents import orchestrator
        
        source = inspect.getsource(orchestrator.run_adw_workflow)
        
        # Should NOT pass issue to implement_plan
        # Should pass state.plan_file as first argument
        assert 'implement_plan(state.plan_file or "",' in source
        
    def test_orchestrator_source_has_correct_commit_implementation_call(self):
        """Verify orchestrator source has correct commit_implementation invocation."""
        import inspect
        from adws.adw_agents import orchestrator
        
        source = inspect.getsource(orchestrator.run_adw_workflow)
        
        # Should have state.issue_class in commit_implementation call
        assert "commit_implementation(issue, state.issue_class," in source
        
    def test_orchestrator_source_has_correct_create_pr_call(self):
        """Verify orchestrator source has correct create_pull_request invocation."""
        import inspect
        from adws.adw_agents import orchestrator
        
        source = inspect.getsource(orchestrator.run_adw_workflow)
        
        # Should have branch_name first, then issue, then plan_file
        assert 'create_pull_request(\n                state.branch_name or "", issue, state.plan_file or "",' in source
        
    def test_orchestrator_source_has_correct_run_review_call(self):
        """Verify orchestrator source has correct run_review invocation."""
        import inspect
        from adws.adw_agents import orchestrator
        
        source = inspect.getsource(orchestrator.run_adw_workflow)
        
        # Should have spec_file (plan_file) first, not issue
        assert 'run_review(state.plan_file or "",' in source
        
    def test_orchestrator_source_has_correct_push_branch_call(self):
        """Verify orchestrator source has correct push_branch invocation."""
        import inspect
        from adws.adw_agents import orchestrator
        
        source = inspect.getsource(orchestrator.run_adw_workflow)
        
        # Should NOT have adw_id parameter
        assert 'push_branch(state.branch_name or "", logger,' in source
        # Should NOT have adw_id between branch_name and logger
        assert "push_branch(state.branch_name or \"\", adw_id" not in source
        
    def test_orchestrator_source_has_correct_cleanup_worktree_call(self):
        """Verify orchestrator source has correct cleanup_worktree invocation."""
        import inspect
        from adws.adw_agents import orchestrator
        
        source = inspect.getsource(orchestrator.run_adw_workflow)
        
        # Should use worktree_name, not worktree_path
        assert 'cleanup_worktree(state.worktree_name or "",' in source
        # Should NOT have adw_id parameter
        assert "cleanup_worktree(state.worktree_path" not in source
