#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic"]
# ///

"""Plan phase for the AI Developer Workflow."""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add automation directory to Python path for local imports
automation_dir = Path(__file__).parent.parent.parent
if str(automation_dir) not in sys.path:
    sys.path.insert(0, str(automation_dir))

from adws.adw_modules import git_ops
from adws.adw_modules.github import extract_repo_path, fetch_issue, get_repo_url, make_issue_comment
from adws.adw_modules.utils import load_adw_env, resolve_worktree_path
from adws.adw_modules.workflow_ops import (
    AGENT_PLANNER,
    build_plan,
    classify_issue,
    create_commit_message,
    create_pull_request,
    ensure_state,
    format_issue_message,
    generate_branch_name,
    generate_worktree_name,
    locate_plan_file,
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


def parse_args(argv: list[str]) -> tuple[str, Optional[str]]:
    if len(argv) < 2:
        print("Usage: uv run adws/adw_plan.py <issue-number> [adw-id]", file=sys.stderr)
        sys.exit(1)
    issue_number = argv[1]
    adw_id = argv[2] if len(argv) > 2 else None
    return issue_number, adw_id


def main() -> None:
    load_adw_env()
    issue_number, provided_adw_id = parse_args(sys.argv)
    adw_id, state = ensure_state(provided_adw_id, issue_number)
    logger = start_logger(adw_id, "adw_plan")
    logger.info(f"Planning phase start | issue #{issue_number} | adw_id={adw_id}")

    check_env(logger)

    try:
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
    except ValueError as exc:
        logger.error(f"Unable to resolve repository: {exc}")
        sys.exit(1)

    issue = fetch_issue(issue_number, repo_path)
    persist_issue_snapshot(state, issue)
    state.save()

    make_issue_comment(issue_number, format_issue_message(adw_id, "ops", "✅ Starting planning phase"))
    make_issue_comment(
        issue_number,
        f"{format_issue_message(adw_id, 'ops', '📋 Run state snapshot')}\\n```json\\n{json.dumps(state.data, indent=2)}\\n```",
    )

    issue_command, error = classify_issue(issue, adw_id, logger)
    if error or not issue_command:
        logger.error(f"Classification failed: {error}")
        make_issue_comment(issue_number, format_issue_message(adw_id, "ops", f"❌ Error classifying issue: {error}"))
        sys.exit(1)

    state.update(issue_class=issue_command)
    state.save()
    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", f"✅ Issue classified as: {issue_command}"),
    )

    branch_name, error = generate_branch_name(issue, issue_command, adw_id, logger)
    if error or not branch_name:
        logger.error(f"Branch generation failed: {error}")
        make_issue_comment(issue_number, format_issue_message(adw_id, "ops", f"❌ Error generating branch: {error}"))
        sys.exit(1)

    # Generate worktree name
    worktree_base_path = os.getenv("ADW_WORKTREE_BASE_PATH", "trees")
    worktree_name = generate_worktree_name(issue_command, issue_number, adw_id)
    logger.info(f"Generated worktree name: {worktree_name}")

    # Create worktree with isolated branch
    try:
        worktree_path = git_ops.create_worktree(worktree_name, "develop", base_path=worktree_base_path)
        logger.info(f"Created worktree at: {worktree_path}")

        # Store worktree metadata in state
        state.update(
            branch_name=worktree_name,  # The worktree creates its own branch
            worktree_name=worktree_name,
            worktree_path=str(worktree_path),
            worktree_created_at=datetime.now().isoformat(),
        )
        state.save()

        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"✅ Created isolated worktree: {worktree_name}"),
        )
    except git_ops.GitError as exc:
        logger.error(f"Worktree creation failed: {exc}")
        make_issue_comment(issue_number, format_issue_message(adw_id, "ops", f"❌ Error creating worktree: {exc}"))
        sys.exit(1)

    plan_response = build_plan(issue, issue_command, adw_id, logger, cwd=str(worktree_path))
    if not plan_response.success:
        logger.error(f"Plan generation failed: {plan_response.output}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_PLANNER, f"❌ Error building plan: {plan_response.output}"),
        )
        sys.exit(1)

    make_issue_comment(issue_number, format_issue_message(adw_id, AGENT_PLANNER, "✅ Implementation plan created"))

    plan_file, error = locate_plan_file(plan_response.output, adw_id, logger, cwd=str(worktree_path))
    if error or not plan_file:
        logger.error(f"Plan file resolution failed: {error}")
        make_issue_comment(issue_number, format_issue_message(adw_id, "ops", f"❌ Error locating plan file: {error}"))
        sys.exit(1)

    # Check plan file existence in worktree context
    plan_file_full_path = worktree_path / plan_file
    if not plan_file_full_path.exists():
        logger.error(f"Plan file missing on disk: {plan_file_full_path}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"❌ Plan file missing on disk: {plan_file}"),
        )
        sys.exit(1)

    state.update(plan_file=plan_file)
    state.save()
    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", f"✅ Plan file created: {plan_file}"),
    )

    commit_message, error = create_commit_message(AGENT_PLANNER, issue, issue_command, adw_id, logger, cwd=str(worktree_path))
    if error or not commit_message:
        logger.error(f"Plan commit message failure: {error}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_PLANNER, f"❌ Error creating plan commit: {error}"),
        )
        sys.exit(1)

    committed, commit_error = git_ops.commit_all(commit_message, cwd=worktree_path)
    if not committed:
        logger.error(f"Plan commit failed: {commit_error}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_PLANNER, f"❌ Error committing plan: {commit_error}"),
        )
        sys.exit(1)

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, AGENT_PLANNER, "✅ Plan committed"),
    )

    pushed, push_error = git_ops.push_branch(worktree_name, cwd=worktree_path)
    if not pushed:
        logger.error(f"Branch push failed: {push_error}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"❌ Error pushing branch: {push_error}"),
        )
    else:
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"✅ Branch pushed: {worktree_name}"),
        )

    pr_created = False
    if pushed:
        pr_url, pr_error = create_pull_request(worktree_name, issue, plan_file, adw_id, logger, cwd=str(worktree_path))
        if pr_error:
            logger.error(f"Pull request creation failed: {pr_error}")
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", f"❌ Error creating pull request: {pr_error}"),
            )
        elif pr_url:
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", f"✅ Pull request created: {pr_url}"),
            )
            pr_created = True

    # Cleanup worktree after successful PR creation (respects ADW_CLEANUP_WORKTREES env var)
    cleanup_enabled = os.getenv("ADW_CLEANUP_WORKTREES", "true").lower() == "true"
    if pr_created and cleanup_enabled:
        logger.info(f"Cleaning up worktree: {worktree_name}")
        cleanup_success = git_ops.cleanup_worktree(worktree_name, base_path=worktree_base_path, delete_branch=False)
        if cleanup_success:
            logger.info("Worktree cleanup completed")
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", "✅ Worktree cleaned up"),
            )
        else:
            logger.warning(f"Worktree cleanup failed, manual cleanup may be required: trees/{worktree_name}")
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", f"⚠️ Worktree cleanup incomplete: trees/{worktree_name}"),
            )

    state.save()
    make_issue_comment(
        issue_number,
        f"{format_issue_message(adw_id, 'ops', '📋 Final planning state')}\\n```json\\n{json.dumps(state.data, indent=2)}\\n```",
    )
    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", "✅ Planning phase completed"),
    )
    logger.info("Planning phase completed successfully")


if __name__ == "__main__":
    main()
