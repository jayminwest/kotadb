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
from typing import Optional

from adws.adw_modules import git_ops
from adws.adw_modules.git_ops import GitError
from adws.adw_modules.github import extract_repo_path, fetch_issue, get_repo_url, make_issue_comment
from adws.adw_modules.state import ADWState, StateNotFoundError
from adws.adw_modules.utils import load_adw_env
from adws.adw_modules.workflow_ops import (
    AGENT_REVIEWER,
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
        sys.exit(1)


def parse_args(argv: list[str]) -> tuple[str, Optional[str]]:
    if len(argv) < 2:
        print("Usage: uv run adws/adw_review.py <issue-number> [adw-id]", file=sys.stderr)
        sys.exit(1)
    issue_number = argv[1]
    adw_id = argv[2] if len(argv) > 2 else None
    return issue_number, adw_id


def load_state(adw_id: str) -> ADWState:
    try:
        return ADWState.load(adw_id)
    except StateNotFoundError:
        raise SystemExit(
            f"No workflow state found for ADW ID '{adw_id}'. Run plan/build phases before review."
        )


def main() -> None:
    load_adw_env()
    issue_number, provided_adw_id = parse_args(sys.argv)

    if not provided_adw_id:
        raise SystemExit("adw_id is required for review phase. Re-run plan/build to obtain it.")

    state = load_state(provided_adw_id)
    issue_number = state.issue_number or issue_number
    state.update(issue_number=issue_number)

    logger = start_logger(state.adw_id, "adw_review")
    logger.info(f"Review phase start | issue #{issue_number} | adw_id={state.adw_id}")

    check_env(logger)

    try:
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
    except ValueError as exc:
        logger.error(f"Unable to resolve repository: {exc}")
        sys.exit(1)

    if not state.branch_name:
        logger.error("No branch name stored in state. Run build phase before review.")
        make_issue_comment(
            issue_number,
            format_issue_message(state.adw_id, "ops", "❌ Review blocked: missing branch information."),
        )
        sys.exit(1)

    try:
        git_ops.checkout_branch(state.branch_name)
    except GitError as exc:
        logger.error(f"Failed to checkout branch {state.branch_name}: {exc}")
        make_issue_comment(
            issue_number,
            format_issue_message(
                state.adw_id,
                "ops",
                f"❌ Review blocked: unable to checkout branch {state.branch_name}: {exc}",
            ),
        )
        sys.exit(1)

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
        sys.exit(1)

    make_issue_comment(
        issue_number,
        format_issue_message(state.adw_id, "ops", f"✅ Starting review using spec `{spec_file}`"),
    )

    review_result, error = run_review(spec_file, state.adw_id, logger)
    if error or not review_result:
        logger.error(f"Review execution failed: {error}")
        make_issue_comment(
            issue_number,
            format_issue_message(state.adw_id, AGENT_REVIEWER, f"❌ Review failed: {error}"),
        )
        sys.exit(1)

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
        sys.exit(1)

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
