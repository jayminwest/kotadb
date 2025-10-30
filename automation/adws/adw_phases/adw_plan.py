#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic"]
# ///

"""Plan phase for the AI Developer Workflow (simplified 5-step flow).

Creates plan document and commits to branch. PR creation deferred to build phase.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add automation directory to Python path for local imports
automation_dir = Path(__file__).parent.parent.parent
if str(automation_dir) not in sys.path:
    sys.path.insert(0, str(automation_dir))

from adws.adw_agents.agent_create_plan import build_plan
from adws.adw_modules import git_ops
from adws.adw_modules.github import extract_repo_path, fetch_issue, get_repo_url, make_issue_comment
from adws.adw_modules.utils import load_adw_env
from adws.adw_modules.workflow_ops import (
    AGENT_PLANNER,
    PhaseMetricsCollector,
    classify_issue,
    create_commit_message,
    ensure_state,
    format_issue_message,
    generate_branch_name,
    generate_worktree_name,
    persist_issue_snapshot,
    start_logger,
)


def get_push_troubleshooting_guidance(error_type: str) -> str:
    """Return troubleshooting guidance based on push error type.

    Args:
        error_type: Error classification from push_branch

    Returns:
        Markdown-formatted troubleshooting guidance
    """
    guidance = {
        "email_privacy": """
**Email Privacy Restriction**
GitHub is blocking this push because your git email is private.

**Fix options:**
1. Allow push with private email: Settings → Emails → Uncheck "Block command line pushes that expose my email"
2. Configure git to use GitHub noreply email:
   ```
   git config user.email "USERNAME@users.noreply.github.com"
   ```
""",
        "auth": """
**Authentication Failed**
Unable to authenticate with the remote repository.

**Fix options:**
1. Verify GitHub CLI authentication: `gh auth status`
2. Re-authenticate: `gh auth login`
3. Check SSH key configuration if using SSH remote
""",
        "network": """
**Network Error**
Failed to connect to remote repository (retries exhausted).

**Fix options:**
1. Check internet connectivity
2. Verify GitHub status: https://www.githubstatus.com/
3. Retry manually: `git push origin <branch>`
""",
        "unknown": """
**Push Failed**
Git push failed with an unrecognized error.

**Fix options:**
1. Check error details above
2. Retry manually: `git push origin <branch>`
3. Verify remote repository exists and is accessible
""",
    }
    return guidance.get(error_type, guidance["unknown"])


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
        sys.stderr.write("Usage: uv run adws/adw_plan.py <issue-number> [adw-id]" + "\n")
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

    # Wrap main logic in metrics collector
    with PhaseMetricsCollector(adw_id, "adw_plan", logger) as metrics:
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
            f"{format_issue_message(adw_id, 'ops', '📋 Run state snapshot')}\n```json\n{json.dumps(state.data, indent=2)}\n```",
        )

        # Track agent invocation: classify_issue
        start_time = time.time()
        issue_command, error = classify_issue(issue, adw_id, logger)
        metrics.record_agent_invocation(duration=time.time() - start_time)

        # Handle out-of-scope classification (graceful skip - not an error)
        if error is None and issue_command is None:
            logger.info("Issue classified as out-of-scope, exiting gracefully")
            sys.exit(0)

        # Handle classification errors
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

        # Track agent invocation: generate_branch_name
        start_time = time.time()
        branch_name, error = generate_branch_name(issue, issue_command, adw_id, logger)
        metrics.record_agent_invocation(duration=time.time() - start_time)
        if error or not branch_name:
            logger.error(f"Branch generation failed: {error}")
            make_issue_comment(issue_number, format_issue_message(adw_id, "ops", f"❌ Error generating branch: {error}"))
            sys.exit(1)

        # Generate worktree name
        worktree_base_path = os.getenv("ADW_WORKTREE_BASE_PATH", "automation/trees")
        worktree_name = generate_worktree_name(issue_command, issue_number, adw_id)
        logger.info(f"Generated worktree name: {worktree_name}")

        # Create worktree with isolated branch
        # Track git operation: create_worktree
        try:
            start_time = time.time()
            worktree_path = git_ops.create_worktree(worktree_name, "develop", base_path=worktree_base_path)
            metrics.record_git_operation(duration=time.time() - start_time)
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

        # Track agent invocation: build_plan
        start_time = time.time()
        plan_response = build_plan(issue, issue_command, adw_id, logger, cwd=str(worktree_path))
        metrics.record_agent_invocation(duration=time.time() - start_time)
        if not plan_response.success:
            logger.error(f"Plan generation failed: {plan_response.output}")
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, AGENT_PLANNER, f"❌ Error building plan: {plan_response.output}"),
            )
            sys.exit(1)

        make_issue_comment(issue_number, format_issue_message(adw_id, AGENT_PLANNER, "✅ Implementation plan created"))

        # Enhanced diagnostics: Log git status immediately after agent execution
        logger.info("=" * 80)
        logger.info("DIAGNOSTIC: Git status after agent execution")
        status_after_agent = git_ops._run_git(["status", "--porcelain"], cwd=worktree_path, check=False)
        logger.info(f"Git status output:\n{status_after_agent.stdout if status_after_agent.stdout else '(empty)'}")
        logger.info("=" * 80)

        # Extract plan file path directly from planner response
        # The planner now returns the path directly instead of using a separate find_plan_file agent
        plan_file = plan_response.output.strip()

        # Defensive parsing: extract from markdown code blocks if present
        code_blocks = re.findall(r'```\s*([^\n`]+)\s*```', plan_file)
        if code_blocks:
            plan_file = code_blocks[-1].strip()  # Use last code block

        # Strip git status prefixes like "?? ", "M ", "A ", etc.
        git_status_prefix = re.match(r'^[?MAD!]{1,2}\s+', plan_file)
        if git_status_prefix:
            plan_file = plan_file[git_status_prefix.end():].strip()

        # Validate the plan file path
        if plan_file == "0":
            logger.error("Plan file not found - planner returned '0'")
            make_issue_comment(issue_number, format_issue_message(adw_id, "ops", "❌ No plan file returned by planner"))
            sys.exit(1)
        if "/" not in plan_file:
            logger.error(f"Invalid plan path returned: {plan_file}")
            make_issue_comment(issue_number, format_issue_message(adw_id, "ops", f"❌ Invalid plan path: {plan_file}"))
            sys.exit(1)

        logger.info(f"Plan file path extracted from planner: {plan_file}")

        # Check plan file existence in worktree context
        plan_file_full_path = worktree_path / plan_file

        # Enhanced diagnostics: Log file paths (absolute and relative)
        logger.info("=" * 80)
        logger.info("DIAGNOSTIC: Plan file path information")
        logger.info(f"  Relative path (from agent): {plan_file}")
        logger.info(f"  Absolute path (computed): {plan_file_full_path}")
        logger.info(f"  Worktree path: {worktree_path}")
        logger.info(f"  File exists on disk: {plan_file_full_path.exists()}")

        if not plan_file_full_path.exists():
            logger.error(f"Plan file missing on disk: {plan_file_full_path}")
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", f"❌ Plan file missing on disk: {plan_file}"),
            )
            sys.exit(1)

        logger.info(f"Plan file exists on disk: {plan_file_full_path}")

        # Enhanced diagnostics: Check git ls-files for plan file
        ls_files_result = git_ops._run_git(["ls-files", plan_file], cwd=worktree_path, check=False)
        logger.info(f"  git ls-files output: {ls_files_result.stdout if ls_files_result.stdout else '(file not tracked)'}")
        logger.info("=" * 80)

        # NOTE: We do NOT stage the file here. Staging will happen AFTER commit message generation
        # to avoid the issue where agent invocation clears the git staging area (issue #86).

        state.update(plan_file=plan_file)
        state.save()
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"✅ Plan file created: {plan_file}"),
        )

        # CRITICAL FIX (#86): Generate commit message BEFORE staging to prevent staging loss
        # Agent invocation between staging and commit causes git staging area to be cleared.
        # By generating the message first, we can stage and commit immediately without
        # any intervening agent calls that might affect git state.
        logger.info("=" * 80)
        logger.info("FIX #86: Generating commit message BEFORE staging operations")
        logger.info("=" * 80)

        # Track agent invocation: create_commit_message
        start_time = time.time()
        commit_message, error = create_commit_message(AGENT_PLANNER, issue, issue_command, adw_id, logger, cwd=str(worktree_path))
        metrics.record_agent_invocation(duration=time.time() - start_time)
        if error or not commit_message:
            logger.error(f"Plan commit message failure: {error}")
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, AGENT_PLANNER, f"❌ Error creating plan commit: {error}"),
            )
            sys.exit(1)

        logger.info(f"Commit message generated successfully (length: {len(commit_message)} chars)")

        # Now stage the file immediately after generating commit message (no agent calls in between)
        logger.info("Staging plan file immediately after commit message generation")
        # Track git operation: stage_paths
        try:
            start_time = time.time()
            git_ops.stage_paths([plan_file], cwd=worktree_path)
            metrics.record_git_operation(duration=time.time() - start_time)
            logger.info(f"Plan file staged: {plan_file}")

            # Verify staging worked
            tracked_after, _ = git_ops.verify_file_in_index(plan_file, cwd=worktree_path)
            if not tracked_after:
                raise git_ops.GitError(f"File staging verification failed for {plan_file}")
            logger.info("Staging verification: SUCCESS")
        except git_ops.GitError as exc:
            logger.error(f"Failed to stage plan file: {exc}")
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", f"❌ Error staging plan file: {exc}"),
            )
            sys.exit(1)

        # Enhanced diagnostics: Comprehensive git state before commit
        logger.info("=" * 80)
        logger.info("DIAGNOSTIC: Git state before commit attempt")
        status_result = git_ops._run_git(["status", "--porcelain"], cwd=worktree_path, check=False)
        logger.info(f"  git status --porcelain:\n{status_result.stdout if status_result.stdout else '(empty)'}")

        # Check has_changes
        has_changes = git_ops.has_changes(cwd=worktree_path)
        logger.info(f"  has_changes() result: {has_changes}")

        # Check diff-index
        diff_index_result = git_ops._run_git(["diff-index", "--cached", "HEAD"], cwd=worktree_path, check=False)
        logger.info(f"  git diff-index --cached HEAD:\n{diff_index_result.stdout if diff_index_result.stdout else '(empty)'}")

        # List tracked files
        ls_files_all = git_ops._run_git(["ls-files"], cwd=worktree_path, check=False)
        logger.info(f"  git ls-files (all tracked):\n{ls_files_all.stdout if ls_files_all.stdout else '(empty)'}")
        logger.info("=" * 80)

        # Track git operation: commit_all
        start_time = time.time()
        committed, commit_error = git_ops.commit_all(commit_message, cwd=worktree_path)
        metrics.record_git_operation(duration=time.time() - start_time)
        if not committed:
            logger.error(f"Plan commit failed: {commit_error}")

            # Enhanced diagnostics: Additional debug info on commit failure
            logger.error("=" * 80)
            logger.error("DIAGNOSTIC: Additional debug info on commit failure")
            logger.error(f"  Commit error message: {commit_error}")
            logger.error(f"  Worktree path exists: {worktree_path.exists()}")
            logger.error(f"  Plan file exists: {plan_file_full_path.exists()}")
            final_status = git_ops._run_git(["status"], cwd=worktree_path, check=False)
            logger.error(f"  git status (full):\n{final_status.stdout}")
            logger.error("=" * 80)

            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, AGENT_PLANNER, f"❌ Error committing plan: {commit_error}"),
            )
            sys.exit(1)

        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_PLANNER, "✅ Plan committed"),
        )

        # Track git operation: push_branch
        start_time = time.time()
        push_result = git_ops.push_branch(worktree_name, cwd=worktree_path)
        metrics.record_git_operation(duration=time.time() - start_time)

        if not push_result["success"]:
            # Push failed - post error with troubleshooting guidance and exit
            error_type = push_result["error_type"]
            error_message = push_result["error_message"]
            logger.error(f"Branch push failed: {error_message} (type: {error_type})")

            troubleshooting = get_push_troubleshooting_guidance(error_type)
            make_issue_comment(
                issue_number,
                format_issue_message(
                    adw_id,
                    "ops",
                    f"❌ Error pushing branch: {error_message}\n\n{troubleshooting}"
                ),
            )
            # Exit with failure code (do NOT post "Planning phase completed" on push failure)
            sys.exit(1)

        logger.info("Branch pushed successfully. PR will be created after implementation.")
        state.update(pr_created=False)
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", "✅ Branch pushed (PR pending implementation)"),
        )

        # Worktree cleanup after plan phase
        # NOTE: Cleanup is disabled when ADW_SKIP_PLAN_CLEANUP=true (e.g., during multi-phase SDLC workflows)
        # PR creation moved to build phase, so worktree should be preserved by default
        skip_plan_cleanup = os.getenv("ADW_SKIP_PLAN_CLEANUP", "true").lower() == "true"

        if skip_plan_cleanup:
            logger.info("Skipping worktree cleanup (ADW_SKIP_PLAN_CLEANUP=true, preserving for subsequent phases)")
        elif pushed:
            cleanup_enabled = os.getenv("ADW_CLEANUP_WORKTREES", "true").lower() == "true"
            if cleanup_enabled:
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
            f"{format_issue_message(adw_id, 'ops', '📋 Final planning state')}\n```json\n{json.dumps(state.data, indent=2)}\n```",
        )
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", "✅ Planning phase completed"),
        )
        logger.info("Planning phase completed successfully")


if __name__ == "__main__":
    main()
