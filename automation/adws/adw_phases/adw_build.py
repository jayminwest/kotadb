#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic"]
# ///

"""Build phase for the AI Developer Workflow (simplified 5-step flow).

Implements plan, commits changes, pushes branch, and creates PR after successful implementation.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
from pathlib import Path

# Add automation directory to Python path for local imports
automation_dir = Path(__file__).parent.parent.parent
if str(automation_dir) not in sys.path:
    sys.path.insert(0, str(automation_dir))

from adws.adw_modules import git_ops
from adws.adw_modules.github import extract_repo_path, fetch_issue, get_repo_url, make_issue_comment
from adws.adw_modules.state import ADWState, StateNotFoundError
from adws.adw_modules.utils import load_adw_env
from adws.adw_modules.workflow_ops import (
    AGENT_IMPLEMENTOR,
    classify_issue,
    create_commit_message,
    create_pull_request,
    ensure_plan_exists,
    format_issue_message,
    implement_plan,
    persist_issue_snapshot,
    start_logger,
)


def check_env(logger: logging.Logger) -> None:
    """Ensure required environment variables and executables are present."""

    required = ["ANTHROPIC_API_KEY"]
    missing = [var for var in required if not os.getenv(var)]

    claude_path = (os.getenv("CLAUDE_CODE_PATH") or "claude").strip()
    if not shutil.which(claude_path):
        missing.append(f"CLAUDE_CODE_PATH (CLI not found at '{claude_path}')")

    if missing:
        for item in missing:
            logger.error(f"Missing prerequisite: {item}")
        sys.exit(1)


def parse_args(argv: list[str]) -> tuple[str, str]:
    if len(argv) < 3:
        sys.stderr.write("Usage: uv run adws/adw_build.py <issue-number> <adw-id>" + "\n")
        sys.exit(1)
    return argv[1], argv[2]


def load_state(adw_id: str, logger: logging.Logger) -> ADWState:
    try:
        return ADWState.load(adw_id)
    except StateNotFoundError:
        logger.error(f"No state found for ADW ID {adw_id}. Run adws/adw_plan.py first.")
        sys.exit(1)


def main() -> None:
    load_adw_env()
    issue_number, adw_id = parse_args(sys.argv)
    logger = start_logger(adw_id, "adw_build")
    logger.info(f"Build phase start | issue #{issue_number} | adw_id={adw_id}")

    state = load_state(adw_id, logger)
    if state.issue_number:
        issue_number = state.issue_number

    check_env(logger)

    try:
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
    except ValueError as exc:
        logger.error(f"Unable to resolve repository: {exc}")
        sys.exit(1)

    # Load worktree metadata from state
    if not state.worktree_name or not state.worktree_path:
        logger.error("No worktree information in state. Run adws/adw_plan.py first.")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", "❌ Missing worktree information. Run planning first."),
        )
        sys.exit(1)

    # Verify worktree exists
    worktree_path = Path(state.worktree_path)
    if not worktree_path.exists():
        logger.error(f"Worktree not found at: {worktree_path}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"❌ Worktree not found: {worktree_path}"),
        )
        sys.exit(1)

    logger.info(f"Using worktree: {state.worktree_name} at {worktree_path}")
    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", f"✅ Working in isolated worktree: {state.worktree_name}"),
    )

    plan_file = ensure_plan_exists(state, issue_number)
    # Check plan file exists in worktree (plan_file is relative path)
    plan_file_full_path = worktree_path / plan_file
    if not plan_file_full_path.exists():
        logger.error(f"Plan file missing: {plan_file} (absolute: {plan_file_full_path})")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"❌ Plan file missing: {plan_file}"),
        )
        sys.exit(1)

    issue = fetch_issue(issue_number, repo_path)
    persist_issue_snapshot(state, issue)
    state.save()

    make_issue_comment(issue_number, format_issue_message(adw_id, "ops", "✅ Starting implementation phase"))

    implement_response = implement_plan(plan_file, adw_id, logger, cwd=str(worktree_path))
    if not implement_response.success:
        logger.error(f"Implementation failed: {implement_response.output}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_IMPLEMENTOR, f"❌ Error implementing plan: {implement_response.output}"),
        )
        sys.exit(1)

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, AGENT_IMPLEMENTOR, "✅ Solution implemented"),
    )

    issue_command = state.issue_class
    if not issue_command:
        issue_command, error = classify_issue(issue, adw_id, logger)
        if error or not issue_command:
            logger.warning(f"Classification unavailable, defaulting to /feature: {error}")
            issue_command = "/feature"  # type: ignore[assignment]
        else:
            state.update(issue_class=issue_command)
            state.save()

    # Check if there are any changes to commit
    has_changes = not git_ops.ensure_clean_worktree(cwd=worktree_path)

    if not has_changes:
        logger.info("No changes detected - implementation already complete or no modifications needed")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_IMPLEMENTOR, "ℹ️ No changes needed - implementation already complete"),
        )
        # Skip commit, push, and PR creation since there's nothing to commit
        state.save()
        make_issue_comment(
            issue_number,
            f"{format_issue_message(adw_id, 'ops', '📋 Final build state')}\\n```json\\n{json.dumps(state.data, indent=2)}\\n```",
        )
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", "✅ Build phase completed (no changes needed)"),
        )
        logger.info("Build phase completed successfully (no changes needed)")
        return

    commit_message, error = create_commit_message(AGENT_IMPLEMENTOR, issue, issue_command, adw_id, logger, cwd=str(worktree_path))
    if error or not commit_message:
        logger.error(f"Implementation commit message failure: {error}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_IMPLEMENTOR, f"❌ Error drafting commit: {error}"),
        )
        sys.exit(1)

    # Log git status before commit for debugging
    status_result = git_ops._run_git(["status", "--porcelain"], cwd=worktree_path, check=False)
    logger.info(f"Git status before commit:\n{status_result.stdout}")

    committed, commit_error = git_ops.commit_all(commit_message, cwd=worktree_path)
    if not committed:
        logger.error(f"Implementation commit failed: {commit_error}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_IMPLEMENTOR, f"❌ Error committing implementation: {commit_error}"),
        )
        sys.exit(1)

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, AGENT_IMPLEMENTOR, "✅ Implementation committed"),
    )

    pushed, push_error = git_ops.push_branch(state.worktree_name, cwd=worktree_path)
    if not pushed:
        logger.error(f"Branch push failed: {push_error}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"❌ Error pushing branch: {push_error}"),
        )
    else:
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"✅ Branch pushed: {state.worktree_name}"),
        )

    if pushed and state.plan_file and not state.pr_created:
        pr_url, pr_error = create_pull_request(state.worktree_name, issue, state.plan_file, adw_id, logger, cwd=str(worktree_path))
        if pr_error:
            logger.error(f"Pull request creation failed: {pr_error}")
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", f"❌ Error creating pull request: {pr_error}"),
            )
        elif pr_url:
            logger.info(f"Pull request created: {pr_url}")
            state.update(pr_created=True)
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", f"✅ Pull request created: {pr_url}"),
            )
    elif state.pr_created:
        logger.info("Pull request already exists, skipping creation")

    state.save()
    make_issue_comment(
        issue_number,
        f"{format_issue_message(adw_id, 'ops', '📋 Final build state')}\\n```json\\n{json.dumps(state.data, indent=2)}\\n```",
    )
    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", "✅ Build phase completed"),
    )
    logger.info("Build phase completed successfully")


if __name__ == "__main__":
    main()
