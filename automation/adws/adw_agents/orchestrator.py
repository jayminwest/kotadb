"""Atomic Agent Orchestrator

Lightweight state machine coordinator for DAG-based workflow execution.

This module provides a simplified orchestrator that coordinates atomic agent execution
in dependency order. Future enhancements will include parallel execution for independent
agents and fine-grained retry logic.

Architecture:
- Phase 1 (Current): Sequential execution calling atomic agents
- Phase 2 (Future): DAG-based execution with parallel independent agents
- Phase 3 (Future): Agent-level retry and checkpoint recovery
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

from ..adw_modules.state import ADWState


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


def run_adw_workflow(
    issue_number: str,
    logger: logging.Logger,
    adw_id: Optional[str] = None,
) -> WorkflowResult:
    """Run the full ADW workflow using atomic agents.

    This is a placeholder implementation for Phase 1. The actual orchestration
    logic will be implemented in Phase 2 after atomic agents are validated.

    Args:
        issue_number: GitHub issue number to process
        logger: Logger instance for tracking
        adw_id: Optional ADW execution ID (will be generated if not provided)

    Returns:
        WorkflowResult with execution outcome

    Workflow DAG (sequential for Phase 1):
    1. classify_issue → 2. generate_branch → 3. create_plan → 4. commit_plan →
    5. implement_plan → 6. commit_implementation → 7. create_pr → 8. review_code →
    9. push_branch → 10. cleanup_worktree

    Future enhancements (Phase 2+):
    - Parallel execution: (classify_issue || generate_branch)
    - Agent-level retry with exponential backoff
    - Checkpoint recovery for resume-after-failure
    """
    logger.warning(
        "Atomic agent orchestrator is not yet implemented (Phase 2). "
        "Using legacy phase scripts for now."
    )
    raise NotImplementedError(
        "Atomic agent orchestrator requires Phase 2 implementation. "
        "Set ADW_USE_ATOMIC_AGENTS=false to use legacy phase scripts."
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
