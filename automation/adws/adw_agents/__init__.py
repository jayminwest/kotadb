"""Atomic agent catalog for AI Developer Workflows.

This package contains decomposed agents following the "one agent, one task, one prompt" philosophy.
Each agent is a standalone function that performs a single logical operation in the ADW lifecycle.

Agent Catalog:
- agent_classify_issue: Classify GitHub issues by type (feat/bug/chore)
- agent_generate_branch: Generate conventional branch names
- agent_create_plan: Create implementation plans using slash commands
- agent_commit_plan: Generate commit messages for plans
- agent_implement_plan: Implement plans via /workflows:implement
- agent_commit_implementation: Generate commit messages for implementations
- agent_create_pr: Create pull requests via /pull_request
- agent_review_code: Review code changes via /review
- agent_push_branch: Push branches to remote with retry logic
- agent_cleanup_worktree: Clean up git worktrees after completion

Orchestrator:
- orchestrator: DAG-based workflow coordinator for atomic agent execution
"""

from . import agent_classify_issue
from . import agent_generate_branch
from . import agent_create_plan
from . import agent_commit_plan
from . import agent_implement_plan
from . import agent_commit_implementation
from . import agent_create_pr
from . import agent_review_code
from . import agent_push_branch
from . import agent_cleanup_worktree
from . import orchestrator

__all__ = [
    "agent_classify_issue",
    "agent_generate_branch",
    "agent_create_plan",
    "agent_commit_plan",
    "agent_implement_plan",
    "agent_commit_implementation",
    "agent_create_pr",
    "agent_review_code",
    "agent_push_branch",
    "agent_cleanup_worktree",
    "orchestrator",
]
