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
import subprocess
import sys
import time
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
    PhaseMetricsCollector,
    classify_issue,
    create_commit_message,
    create_pull_request,
    ensure_plan_exists,
    format_issue_message,
    implement_plan,
    persist_issue_snapshot,
    start_logger,
)


def get_changed_files_count(worktree_path: Path) -> int:
    """Count the number of changed files in the worktree.

    Args:
        worktree_path: Path to worktree directory

    Returns:
        Number of modified, added, or deleted files
    """
    import subprocess

    result = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True,
        text=True,
        cwd=worktree_path,
    )

    if result.returncode != 0:
        return 0

    # Count non-empty lines (each line represents a changed file)
    changed_files = [line for line in result.stdout.splitlines() if line.strip()]
    return len(changed_files)


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


def parse_args(argv: list[str]) -> tuple[str, str | None]:
    if len(argv) < 2:
        sys.stderr.write("Usage: uv run adws/adw_build.py <issue-number> [adw-id]" + "\n")
        sys.exit(1)
    issue_number = argv[1]
    adw_id = argv[2] if len(argv) > 2 else None
    return issue_number, adw_id


def load_state(issue_number: str, adw_id: str | None, logger: logging.Logger) -> ADWState:
    """Load ADW state by explicit ID or auto-discover from issue number.

    Args:
        issue_number: GitHub issue number
        adw_id: Explicit ADW ID (takes precedence) or None for auto-discovery
        logger: Logger instance

    Returns:
        ADWState instance

    Raises:
        SystemExit: If state cannot be found or loaded
    """
    if adw_id:
        # Explicit adw_id provided - use it directly
        try:
            state = ADWState.load(adw_id)
            logger.info(f"Loaded state for explicit adw_id: {adw_id}")
            return state
        except StateNotFoundError:
            logger.error(f"No state found for ADW ID {adw_id}. Run adws/adw_plan.py first.")
            sys.exit(1)
    else:
        # Auto-discover adw_id from issue number
        found_state = ADWState.find_by_issue(issue_number)
        if not found_state:
            logger.error(f"No ADW state found for issue #{issue_number}. Run adws/adw_plan.py first or provide explicit adw_id.")
            sys.exit(1)
        logger.info(f"Auto-discovered adw_id: {found_state.adw_id} for issue #{issue_number}")
        return found_state


def main() -> None:
    load_adw_env()
    issue_number, parsed_adw_id = parse_args(sys.argv)

    # Load state (auto-discover if adw_id not provided)
    # Create temporary logger for state loading
    temp_logger = logging.getLogger('temp_state_loader')
    temp_logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    temp_logger.addHandler(handler)

    state = load_state(issue_number, parsed_adw_id, temp_logger)

    # Extract adw_id from state (guaranteed to exist)
    adw_id = state.adw_id

    # Now create the proper logger with the discovered/provided adw_id
    logger = start_logger(adw_id, "adw_build")
    logger.info(f"Build phase start | issue #{issue_number} | adw_id={adw_id}")
    if state.issue_number:
        issue_number = state.issue_number

    check_env(logger)

    # Wrap main logic in metrics collector
    with PhaseMetricsCollector(adw_id, "adw_build", logger) as metrics:
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

        # Track agent invocation: implement_plan
        start_time = time.time()
        implement_response = implement_plan(plan_file, adw_id, logger, cwd=str(worktree_path))
        metrics.record_agent_invocation(duration=time.time() - start_time)
        if not implement_response.success:
            logger.error(f"Implementation failed: {implement_response.output}")
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, AGENT_IMPLEMENTOR, f"❌ Error implementing plan: {implement_response.output}"),
            )
            sys.exit(1)

        # Don't post "Solution implemented" yet - wait to check if changes were made
        logger.info("Implementation agent completed, checking for changes...")

        issue_command = state.issue_class
        if not issue_command:
            start_time = time.time()
            issue_command, error = classify_issue(issue, adw_id, logger)
            metrics.record_agent_invocation(duration=time.time() - start_time)

            # Handle out-of-scope classification (graceful skip - not an error)
            if error is None and issue_command is None:
                logger.info("Issue classified as out-of-scope, exiting gracefully")
                sys.exit(0)

            if error or not issue_command:
                logger.warning(f"Classification unavailable, defaulting to /feature: {error}")
                issue_command = "/feature"  # type: ignore[assignment]
            else:
                state.update(issue_class=issue_command)
                state.save()

        # Check if there are any uncommitted changes to commit
        has_uncommitted_changes = not git_ops.ensure_clean_worktree(cwd=worktree_path)

        if has_uncommitted_changes:
            # Track agent invocation: create_commit_message
            start_time = time.time()
            commit_message, error = create_commit_message(AGENT_IMPLEMENTOR, issue, issue_command, adw_id, logger, cwd=str(worktree_path))
            metrics.record_agent_invocation(duration=time.time() - start_time)
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

            # Track git operation: commit_all
            start_time = time.time()
            committed, commit_error = git_ops.commit_all(commit_message, cwd=worktree_path)
            metrics.record_git_operation(duration=time.time() - start_time)
            if not committed:
                logger.error(f"Implementation commit failed: {commit_error}")
                make_issue_comment(
                    issue_number,
                    format_issue_message(adw_id, AGENT_IMPLEMENTOR, f"❌ Error committing implementation: {commit_error}"),
                )
                sys.exit(1)

            # Post outcome-specific message with file count
            changed_count = get_changed_files_count(worktree_path)
            if changed_count > 0:
                make_issue_comment(
                    issue_number,
                    format_issue_message(adw_id, AGENT_IMPLEMENTOR, f"✅ Implementation complete ({changed_count} files changed)"),
                )
            else:
                # This shouldn't happen (we already checked has_uncommitted_changes), but handle gracefully
                make_issue_comment(
                    issue_number,
                    format_issue_message(adw_id, AGENT_IMPLEMENTOR, "✅ Implementation committed"),
                )
        else:
            logger.info("No uncommitted changes detected")

        # Check if PR already exists (idempotency)
        if state.pr_created:
            logger.info("Pull request already exists, skipping push and PR creation")
            state.save()
            make_issue_comment(
                issue_number,
                f"{format_issue_message(adw_id, 'ops', '📋 Final build state')}\n```json\n{json.dumps(state.data, indent=2)}\n```",
            )
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", "✅ Build phase completed (PR already exists)"),
            )
            logger.info("Build phase completed successfully (PR already exists)")
            return

        # Check if branch has diverged from base (has commits to PR)
        branch_has_commits = git_ops.branch_differs_from_base(
            branch=state.worktree_name,
            base="develop",
            cwd=worktree_path,
        )

        if not branch_has_commits:
            logger.info("No commits on branch, nothing to PR - implementation already complete or no modifications needed")
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, AGENT_IMPLEMENTOR, "⏭️ No implementation needed (test issue or already complete)"),
            )
            state.save()
            make_issue_comment(
                issue_number,
                f"{format_issue_message(adw_id, 'ops', '📋 Final build state')}\n```json\n{json.dumps(state.data, indent=2)}\n```",
            )
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", "✅ Build phase completed (no changes needed)"),
            )
            logger.info("Build phase completed successfully (no changes needed)")
            return

        # Branch has commits, proceed with push and PR creation
        # Track git operation: push_branch
        start_time = time.time()
        push_result = git_ops.push_branch(state.worktree_name, cwd=worktree_path)
        metrics.record_git_operation(duration=time.time() - start_time)
        pushed = push_result["success"]

        if not pushed:
            push_error = push_result["error_message"]
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

        if pushed and state.plan_file:
            # Track agent invocation: create_pull_request
            start_time = time.time()
            pr_url, pr_error = create_pull_request(state.worktree_name, issue, state.plan_file, adw_id, logger, cwd=str(worktree_path))
            metrics.record_agent_invocation(duration=time.time() - start_time)
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

                # Enable auto-merge if feature flag is set
                auto_merge_enabled = os.getenv("ADW_AUTO_MERGE", "false").lower() == "true"
                if auto_merge_enabled:
                    # Extract PR number from URL
                    pr_number = pr_url.split('/')[-1]
                    logger.info(f"Enabling auto-merge for PR #{pr_number}")

                    # Enable auto-merge with squash and branch deletion
                    merge_result = subprocess.run(
                        ["gh", "pr", "merge", pr_number, "--auto", "--squash", "--delete-branch"],
                        capture_output=True,
                        text=True,
                        cwd=worktree_path,
                    )

                    if merge_result.returncode == 0:
                        logger.info(f"Auto-merge enabled for PR #{pr_number}")
                        state.update(auto_merge_enabled=True)
                        state.update_merge_status("pending")
                        make_issue_comment(
                            issue_number,
                            format_issue_message(adw_id, "ops", "✅ Auto-merge enabled - PR will merge after CI validation passes"),
                        )
                    else:
                        logger.warning(f"Failed to enable auto-merge: {merge_result.stderr}")
                        state.update(auto_merge_enabled=False)
                        make_issue_comment(
                            issue_number,
                            format_issue_message(adw_id, "ops", f"⚠️ Auto-merge failed to enable: {merge_result.stderr}"),
                        )
                else:
                    logger.info("Auto-merge feature flag disabled, skipping auto-merge enablement")

        state.save()
        make_issue_comment(
            issue_number,
            f"{format_issue_message(adw_id, 'ops', '📋 Final build state')}\n```json\n{json.dumps(state.data, indent=2)}\n```",
        )

        # Final message with outcome summary
        final_changed_count = get_changed_files_count(worktree_path)
        if final_changed_count > 0:
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", f"✅ Build phase completed ({final_changed_count} files changed)"),
            )
            logger.info(f"Build phase completed successfully ({final_changed_count} files changed)")
        else:
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", "✅ Build phase completed"),
            )
            logger.info("Build phase completed successfully")


if __name__ == "__main__":
    main()
