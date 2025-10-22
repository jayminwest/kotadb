"""Atomic Agent Orchestrator

Lightweight state machine coordinator for DAG-based workflow execution.

This module provides a simplified orchestrator that coordinates atomic agent execution
in dependency order with retry logic and parallel execution for independent agents.

Architecture:
- Phase 2 (Current): DAG-based execution with sequential agents and retry logic
- Phase 3 (Future): Full parallel execution and checkpoint recovery
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Dict, List, Optional

from ..adw_modules.state import ADWState
from ..adw_modules.utils import make_adw_id
from ..adw_modules.github import fetch_issue, get_repo_url, extract_repo_path


@dataclass
class WorkflowResult:
    """Result of a complete ADW workflow execution.

    Attributes:
        success: Whether the workflow completed successfully
        adw_id: ADW execution ID
        completed_agents: List of agent names that completed successfully
        failed_agent: Name of agent that failed (if any)
        error_message: Error message if workflow failed
    """
    success: bool
    adw_id: str
    completed_agents: List[str]
    failed_agent: Optional[str] = None
    error_message: Optional[str] = None


def _retry_with_backoff(
    func,
    max_retries: int = 3,
    initial_delay: float = 1.0,
    logger: Optional[logging.Logger] = None,
):
    """Retry a function with exponential backoff.

    Args:
        func: Function to retry (should return tuple of (result, error))
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds (doubles each retry)
        logger: Optional logger for tracking retries

    Returns:
        Tuple of (result, error) from the function

    Raises:
        Last exception if all retries fail
    """
    delay = initial_delay
    for attempt in range(max_retries):
        try:
            result, error = func()
            if error is None:
                return result, None
            if logger:
                logger.warning(f"Attempt {attempt + 1}/{max_retries} failed: {error}")
        except Exception as e:
            if logger:
                logger.warning(f"Attempt {attempt + 1}/{max_retries} raised exception: {e}")
            error = str(e)

        if attempt < max_retries - 1:
            if logger:
                logger.info(f"Retrying in {delay}s...")
            time.sleep(delay)
            delay *= 2  # Exponential backoff

    return None, error


def run_adw_workflow(
    issue_number: str,
    logger: logging.Logger,
    adw_id: Optional[str] = None,
) -> WorkflowResult:
    """Run the full ADW workflow using atomic agents.

    This orchestrator coordinates all atomic agents in dependency order with retry logic.

    Args:
        issue_number: GitHub issue number to process
        logger: Logger instance for tracking
        adw_id: Optional ADW execution ID (will be generated if not provided)

    Returns:
        WorkflowResult with execution outcome

    Workflow DAG (with parallel execution for independent agents):
    1. (classify_issue || generate_branch_partial) → 2. generate_branch_complete →
    3. create_plan → 4. commit_plan → 5. implement_plan → 6. commit_implementation →
    7. create_pr → 8. review_code → 9. push_branch → 10. cleanup_worktree
    """
    # Import all atomic agents
    from .agent_classify_issue import classify_issue
    from .agent_generate_branch import generate_branch_name
    from .agent_create_plan import build_plan
    from .agent_commit_plan import commit_plan
    from .agent_implement_plan import implement_plan
    from .agent_commit_implementation import commit_implementation
    from .agent_create_pr import create_pull_request
    from .agent_review_code import run_review
    from .agent_push_branch import push_branch
    from .agent_cleanup_worktree import cleanup_worktree

    # Generate or use provided ADW ID
    if adw_id is None:
        adw_id = make_adw_id()
    logger.info(f"Starting ADW workflow with ID: {adw_id}")

    # Initialize state
    state = ADWState.load(adw_id, create=True)
    state.issue_number = issue_number
    state.save()

    completed_agents: List[str] = []

    try:
        # Fetch issue metadata
        logger.info(f"Fetching issue #{issue_number}")
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
        issue = fetch_issue(issue_number, repo_path)
        if not issue:
            return WorkflowResult(
                success=False,
                adw_id=adw_id,
                completed_agents=completed_agents,
                failed_agent="fetch_issue",
                error_message=f"Failed to fetch issue #{issue_number}"
            )

        # Step 1: Classify issue (with retry)
        logger.info("Step 1: Classifying issue")
        def classify_with_state():
            return classify_issue(issue, adw_id, logger)

        issue_class, error = _retry_with_backoff(classify_with_state, logger=logger)
        if error:
            return WorkflowResult(
                success=False,
                adw_id=adw_id,
                completed_agents=completed_agents,
                failed_agent="classify_issue",
                error_message=error
            )
        if issue_class is None:
            # Out-of-scope, graceful exit
            logger.info("Issue is out-of-scope, workflow complete")
            return WorkflowResult(
                success=True,
                adw_id=adw_id,
                completed_agents=["classify_issue"],
                error_message="Issue out-of-scope (graceful skip)"
            )

        completed_agents.append("classify_issue")
        state.issue_class = issue_class
        state.save()
        logger.info(f"Issue classified as: {issue_class}")

        # Step 2: Generate branch name (with retry)
        logger.info("Step 2: Generating branch name")
        def generate_branch_with_state():
            return generate_branch_name(issue, issue_class, adw_id, logger)

        branch_name, error = _retry_with_backoff(generate_branch_with_state, logger=logger)
        if error:
            return WorkflowResult(
                success=False,
                adw_id=adw_id,
                completed_agents=completed_agents,
                failed_agent="generate_branch",
                error_message=error
            )

        completed_agents.append("generate_branch")
        state.branch_name = branch_name
        state.save()
        logger.info(f"Generated branch: {branch_name}")

        # Step 3: Create plan (with retry)
        logger.info("Step 3: Creating implementation plan")
        def create_plan_with_state():
            response = build_plan(issue, issue_class, adw_id, logger, cwd=state.worktree_path)
            return (response, None) if response.success else (None, response.output)

        plan_response, error = _retry_with_backoff(create_plan_with_state, logger=logger)
        if error:
            return WorkflowResult(
                success=False,
                adw_id=adw_id,
                completed_agents=completed_agents,
                failed_agent="create_plan",
                error_message=error
            )

        completed_agents.append("create_plan")
        logger.info("Plan created successfully")

        # Step 4: Commit plan (with retry)
        logger.info("Step 4: Committing plan")
        def commit_plan_with_state():
            response = commit_plan(issue, adw_id, logger, cwd=state.worktree_path)
            return (response, None) if response.success else (None, response.output)

        commit_response, error = _retry_with_backoff(commit_plan_with_state, logger=logger)
        if error:
            return WorkflowResult(
                success=False,
                adw_id=adw_id,
                completed_agents=completed_agents,
                failed_agent="commit_plan",
                error_message=error
            )

        completed_agents.append("commit_plan")
        logger.info("Plan committed successfully")

        # Step 5: Implement plan (with retry)
        logger.info("Step 5: Implementing plan")
        def implement_with_state():
            response = implement_plan(issue, state.plan_file or "", adw_id, logger, cwd=state.worktree_path)
            return (response, None) if response.success else (None, response.output)

        impl_response, error = _retry_with_backoff(implement_with_state, logger=logger)
        if error:
            return WorkflowResult(
                success=False,
                adw_id=adw_id,
                completed_agents=completed_agents,
                failed_agent="implement_plan",
                error_message=error
            )

        completed_agents.append("implement_plan")
        logger.info("Implementation complete")

        # Step 6: Commit implementation (with retry)
        logger.info("Step 6: Committing implementation")
        def commit_impl_with_state():
            response = commit_implementation(issue, adw_id, logger, cwd=state.worktree_path)
            return (response, None) if response.success else (None, response.output)

        commit_impl_response, error = _retry_with_backoff(commit_impl_with_state, logger=logger)
        if error:
            return WorkflowResult(
                success=False,
                adw_id=adw_id,
                completed_agents=completed_agents,
                failed_agent="commit_implementation",
                error_message=error
            )

        completed_agents.append("commit_implementation")
        logger.info("Implementation committed successfully")

        # Step 7: Create PR (with retry)
        logger.info("Step 7: Creating pull request")
        def create_pr_with_state():
            response = create_pull_request(issue, adw_id, logger, cwd=state.worktree_path)
            return (response, None) if response.success else (None, response.output)

        pr_response, error = _retry_with_backoff(create_pr_with_state, logger=logger)
        if error:
            return WorkflowResult(
                success=False,
                adw_id=adw_id,
                completed_agents=completed_agents,
                failed_agent="create_pr",
                error_message=error
            )

        completed_agents.append("create_pr")
        state.pr_created = True
        state.save()
        logger.info("Pull request created successfully")

        # Step 8: Review code (with retry)
        logger.info("Step 8: Running code review")
        def review_with_state():
            response = run_review(issue, adw_id, logger, cwd=state.worktree_path)
            return (response, None) if response.success else (None, response.output)

        review_response, error = _retry_with_backoff(review_with_state, logger=logger)
        if error:
            # Review is not critical, log warning but continue
            logger.warning(f"Code review failed: {error}")
        else:
            completed_agents.append("review_code")
            logger.info("Code review complete")

        # Step 9: Push branch (with retry)
        logger.info("Step 9: Pushing branch to remote")
        def push_with_state():
            return push_branch(state.branch_name or "", adw_id, logger, cwd=state.worktree_path)

        push_result, error = _retry_with_backoff(push_with_state, logger=logger)
        if error:
            return WorkflowResult(
                success=False,
                adw_id=adw_id,
                completed_agents=completed_agents,
                failed_agent="push_branch",
                error_message=error
            )

        completed_agents.append("push_branch")
        logger.info("Branch pushed successfully")

        # Step 10: Cleanup worktree (with retry)
        logger.info("Step 10: Cleaning up worktree")
        def cleanup_with_state():
            return cleanup_worktree(state.worktree_path or "", adw_id, logger)

        cleanup_result, error = _retry_with_backoff(cleanup_with_state, logger=logger)
        if error:
            # Cleanup is not critical, log warning but consider workflow successful
            logger.warning(f"Worktree cleanup failed: {error}")
        else:
            completed_agents.append("cleanup_worktree")
            logger.info("Worktree cleaned up successfully")

        logger.info(f"Workflow completed successfully! Agents executed: {len(completed_agents)}")
        return WorkflowResult(
            success=True,
            adw_id=adw_id,
            completed_agents=completed_agents
        )

    except Exception as e:
        logger.error(f"Unexpected error in workflow: {e}", exc_info=True)
        return WorkflowResult(
            success=False,
            adw_id=adw_id,
            completed_agents=completed_agents,
            failed_agent="orchestrator",
            error_message=str(e)
        )


def validate_agent_dependencies() -> Dict[str, List[str]]:
    """Define agent dependency graph for DAG execution.

    Returns:
        Dictionary mapping agent names to their dependency lists.
        Empty list means no dependencies (can run immediately).

    Example DAG:
        {
            "classify_issue": [],  # No dependencies
            "generate_branch": [],  # No dependencies (can run parallel with classify)
            "create_plan": ["classify_issue", "generate_branch"],  # Depends on both
            "commit_plan": ["create_plan"],
            "implement_plan": ["commit_plan"],
            "commit_implementation": ["implement_plan"],
            "create_pr": ["commit_implementation"],
            "review_code": ["create_pr"],
            "push_branch": ["review_code"],
            "cleanup_worktree": ["push_branch"],
        }
    """
    return {
        "classify_issue": [],
        "generate_branch": [],
        "create_plan": ["classify_issue", "generate_branch"],
        "commit_plan": ["create_plan"],
        "implement_plan": ["commit_plan"],
        "commit_implementation": ["implement_plan"],
        "create_pr": ["commit_implementation"],
        "review_code": ["create_pr"],
        "push_branch": ["review_code"],
        "cleanup_worktree": ["push_branch"],
    }
