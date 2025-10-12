#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic"]
# ///

"""Patch phase for the AI Developer Workflow."""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
from pathlib import Path
from typing import Optional

from adws.adw_modules import git_ops
from adws.adw_modules.github import (
    extract_repo_path,
    fetch_issue,
    find_keyword_from_comment,
    get_repo_url,
    make_issue_comment,
)
from adws.adw_modules.utils import load_adw_env
from adws.adw_modules.workflow_ops import (
    AGENT_IMPLEMENTOR,
    classify_issue,
    create_commit_message,
    create_pull_request,
    ensure_state,
    format_issue_message,
    implement_plan,
    persist_issue_snapshot,
    start_logger,
)


def check_env(logger: logging.Logger) -> None:
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
        print("Usage: uv run adws/adw_patch.py <issue-number> [adw-id]", file=sys.stderr)
        sys.exit(1)
    issue_number = argv[1]
    adw_id = argv[2] if len(argv) > 2 else None
    return issue_number, adw_id



def main() -> None:
    load_adw_env()
    issue_number, provided_adw_id = parse_args(sys.argv)

    adw_id, state = ensure_state(provided_adw_id, issue_number)
    logger = start_logger(adw_id, "adw_patch")
    logger.info(f"Patch phase start | issue #{issue_number} | adw_id={adw_id}")

    check_env(logger)

    try:
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
    except ValueError as exc:
        logger.error(f"Unable to resolve repository: {exc}")
        sys.exit(1)

    issue = fetch_issue(str(issue_number), repo_path)
    persist_issue_snapshot(state, issue)
    state.save()

    keyword_comment = find_keyword_from_comment("adw_patch", issue)
    if keyword_comment:
        patch_source = keyword_comment.body
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", "✅ Using latest 'adw_patch' comment for patch instructions."),
        )
    elif "adw_patch" in (issue.body or ""):
        patch_source = issue.body
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", "✅ Using issue body for patch instructions."),
        )
    else:
        make_issue_comment(
            issue_number,
            format_issue_message(
                adw_id,
                "ops",
                "❌ Patch workflow requires the keyword 'adw_patch' in the issue body or a comment.",
            ),
        )
        sys.exit(1)

    if not state.issue_class:
        issue_command, error = classify_issue(issue, adw_id, logger)
        if issue_command:
            state.update(issue_class=issue_command)
            state.save()
        else:
            logger.warning(f"Issue classification unavailable: {error}")

    # Load worktree metadata from state
    if not state.worktree_name or not state.worktree_path:
        logger.error("No worktree information in state. Run plan/build phase before patch.")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", "❌ Patch blocked: missing worktree information. Run planning first."),
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

    patch_dir = state.base_dir / "patch_requests"
    patch_dir.mkdir(parents=True, exist_ok=True)
    patch_file = patch_dir / "request.md"
    patch_file.write_text(patch_source.strip(), encoding="utf-8")

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, AGENT_IMPLEMENTOR, "✅ Applying patch instructions"),
    )

    implement_response = implement_plan(str(patch_file), adw_id, logger)
    if not implement_response.success:
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_IMPLEMENTOR, f"❌ Patch application failed: {implement_response.output}"),
        )
        sys.exit(1)

    # Check if there are any changes to commit
    has_changes = not git_ops.ensure_clean_worktree(cwd=worktree_path)

    if not has_changes:
        logger.info("No changes detected - patch already applied or no modifications needed")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_IMPLEMENTOR, "ℹ️ No changes needed - patch already applied"),
        )
        # Skip commit and push since there's nothing to commit, but continue with state save
    else:
        commit_message, error = create_commit_message(
            AGENT_IMPLEMENTOR,
            issue,
            state.issue_class or "/feature",  # type: ignore[arg-type]
            adw_id,
            logger,
        )
        if error or not commit_message:
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, AGENT_IMPLEMENTOR, f"❌ Failed to draft patch commit message: {error}"),
            )
            sys.exit(1)

        committed, git_error = git_ops.commit_all(commit_message, cwd=worktree_path)
        if not committed:
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, AGENT_IMPLEMENTOR, f"❌ Patch commit failed: {git_error}"),
            )
            sys.exit(1)

    pushed, push_error = git_ops.push_branch(state.worktree_name, cwd=worktree_path)
    if not pushed:
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"❌ Error pushing branch: {push_error}"),
        )
    else:
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"✅ Branch pushed: {state.worktree_name}"),
        )
        if state.plan_file:
            pr_url, pr_error = create_pull_request(state.worktree_name, issue, state.plan_file, adw_id, logger)
            if pr_error:
                make_issue_comment(
                    issue_number,
                    format_issue_message(adw_id, "ops", f"❌ Error creating pull request: {pr_error}"),
                )
            elif pr_url:
                make_issue_comment(
                    issue_number,
                    format_issue_message(adw_id, "ops", f"✅ Pull request updated: {pr_url}"),
                )

    state.update(
        last_patch=json.dumps({
            "patch_file": str(patch_file),
            "comment_id": getattr(keyword_comment, "id", None),
        })
    )
    state.save()

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", "✅ Patch phase completed"),
    )
    make_issue_comment(
        issue_number,
        f"{format_issue_message(adw_id, "ops", "📋 Patch state snapshot")}\n```json\n{json.dumps(state.data, indent=2)}\n```",
    )
    logger.info("Patch phase completed successfully")


if __name__ == "__main__":
    main()
