#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic"]
# ///

"""Review phase for the AI Developer Workflow."""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Optional

# Add automation directory to Python path for local imports
automation_dir = Path(__file__).parent.parent.parent
if str(automation_dir) not in sys.path:
    sys.path.insert(0, str(automation_dir))

from adws.adw_modules.exit_codes import (
    EXIT_BLOCKER_MISSING_ENV,
    EXIT_BLOCKER_MISSING_SPEC,
    EXIT_BLOCKER_MISSING_STATE,
    EXIT_BLOCKER_MISSING_WORKTREE,
    EXIT_EXEC_AGENT_FAILED,
    EXIT_RESOURCE_REPO_ERROR,
    EXIT_SUCCESS,
    EXIT_VALIDATION_BLOCKERS_DETECTED,
)
from adws.adw_modules.github import extract_repo_path, fetch_issue, get_repo_url, make_issue_comment
from adws.adw_modules.state import ADWState, StateNotFoundError
from adws.adw_modules.utils import load_adw_env
from adws.adw_modules.workflow_ops import (
    AGENT_REVIEWER,
    PhaseMetricsCollector,
    find_spec_file,
    format_issue_message,
    run_review,
    start_logger,
    summarize_review_result,
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
        sys.exit(EXIT_BLOCKER_MISSING_ENV)


def parse_args(argv: list[str]) -> tuple[str, Optional[str]]:
    if len(argv) < 2:
        sys.stderr.write("Usage: uv run adws/adw_review.py <issue-number> [adw-id]" + "\n")
        sys.exit(EXIT_BLOCKER_MISSING_ENV)
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
            logger.error(f"No workflow state found for ADW ID '{adw_id}'. Run plan/build phases before review.")
            sys.exit(EXIT_BLOCKER_MISSING_STATE)
    else:
        # Auto-discover adw_id from issue number
        found_state = ADWState.find_by_issue(issue_number)
        if not found_state:
            logger.error(f"No ADW state found for issue #{issue_number}. Run plan/build phases first or provide explicit adw_id.")
            sys.exit(EXIT_BLOCKER_MISSING_STATE)
        logger.info(f"Auto-discovered adw_id: {found_state.adw_id} for issue #{issue_number}")
        return found_state


def main() -> None:
    load_adw_env()
    issue_number, provided_adw_id = parse_args(sys.argv)

    # Create temporary logger for state loading
    temp_logger = logging.getLogger('temp_state_loader')
    temp_logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    temp_logger.addHandler(handler)

    # Load state (auto-discover if adw_id not provided)
    state = load_state(issue_number, provided_adw_id, temp_logger)
    issue_number = state.issue_number or issue_number
    state.update(issue_number=issue_number)

    logger = start_logger(state.adw_id, "adw_review")
    logger.info(f"Review phase start | issue #{issue_number} | adw_id={state.adw_id}")

    check_env(logger)

    # Wrap main logic in metrics collector
    with PhaseMetricsCollector(state.adw_id, "adw_review", logger) as metrics:
        try:
            repo_url = get_repo_url()
            repo_path = extract_repo_path(repo_url)
        except ValueError as exc:
            logger.error(f"Unable to resolve repository: {exc}")
            sys.exit(EXIT_RESOURCE_REPO_ERROR)

        # Load worktree metadata from state
        if not state.worktree_name or not state.worktree_path:
            logger.error("No worktree information in state. Run plan/build phase before review.")
            make_issue_comment(
                issue_number,
                format_issue_message(state.adw_id, "ops", "❌ Review blocked: missing worktree information."),
            )
            sys.exit(EXIT_BLOCKER_MISSING_STATE)

        # Verify worktree exists
        worktree_path = Path(state.worktree_path)
        if not worktree_path.exists():
            logger.error(f"Worktree not found at: {worktree_path}")
            make_issue_comment(
                issue_number,
                format_issue_message(state.adw_id, "ops", f"❌ Worktree not found: {worktree_path}"),
            )
            sys.exit(EXIT_BLOCKER_MISSING_WORKTREE)

        logger.info(f"Using worktree: {state.worktree_name} at {worktree_path}")

        issue = fetch_issue(str(issue_number), repo_path)
        issue_payload = issue.model_dump(mode="json") if hasattr(issue, "model_dump") else issue.dict()
        state.update(issue=issue_payload)
        state.save()

        spec_file = find_spec_file(state, logger)
        if not spec_file:
            make_issue_comment(
                issue_number,
                format_issue_message(
                    state.adw_id,
                    "ops",
                    "❌ Review blocked: no plan/spec file found. Run planning phase or attach a spec.",
                ),
            )
            sys.exit(EXIT_BLOCKER_MISSING_SPEC)

        make_issue_comment(
            issue_number,
            format_issue_message(state.adw_id, "ops", f"✅ Starting review using spec `{spec_file}`"),
        )

        # Track agent invocation: run_review
        start_time = time.time()
        review_result, error = run_review(spec_file, state.adw_id, logger)
        metrics.record_agent_invocation(duration=time.time() - start_time)
        if error or not review_result:
            logger.error(f"Review execution failed: {error}")
            make_issue_comment(
                issue_number,
                format_issue_message(state.adw_id, AGENT_REVIEWER, f"❌ Review failed: {error}"),
            )
            sys.exit(EXIT_EXEC_AGENT_FAILED)

        summary = summarize_review_result(review_result)
        make_issue_comment(issue_number, format_issue_message(state.adw_id, AGENT_REVIEWER, summary))

        state.update(
            last_review=json.dumps(
                review_result.model_dump() if hasattr(review_result, "model_dump") else review_result.dict()
            )
        )
        state.save()

        blockers = [issue for issue in review_result.review_issues if issue.issue_severity == "blocker"]
        if blockers:
            make_issue_comment(
                issue_number,
                format_issue_message(
                    state.adw_id,
                    "ops",
                    "⚠️ Blockers detected during review. Please address the reported issues before approval.",
                ),
            )
            sys.exit(EXIT_VALIDATION_BLOCKERS_DETECTED)

        make_issue_comment(
            issue_number,
            format_issue_message(state.adw_id, "ops", "✅ Review phase completed"),
        )
        make_issue_comment(
            issue_number,
            f"{format_issue_message(state.adw_id, "ops", "📋 Review state snapshot")}\n```json\n{json.dumps(state.data, indent=2)}\n```",
        )
        logger.info("Review phase completed successfully")


if __name__ == "__main__":
    main()
