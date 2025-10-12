#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic"]
# ///

"""Test phase for the AI Developer Workflow."""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import sys
from dataclasses import asdict
from pathlib import Path

from adws.adw_modules.github import extract_repo_path, fetch_issue, get_repo_url, make_issue_comment
from adws.adw_modules.state import ADWState, StateNotFoundError
from adws.adw_modules.ts_commands import validation_commands
from adws.adw_modules.utils import load_adw_env
from adws.adw_modules.workflow_ops import (
    AGENT_TESTER,
    classify_issue,
    format_issue_message,
    lockfile_changed,
    persist_issue_snapshot,
    run_validation_commands,
    serialize_validation,
    start_logger,
    summarize_validation_results,
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


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Bun validation commands for an ADW run")
    parser.add_argument("issue_number", help="GitHub issue number")
    parser.add_argument("adw_id", nargs="?", help="Existing ADW identifier")
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="Skip automatic dependency install even if lockfiles changed",
    )
    return parser.parse_args(argv[1:])


def load_existing_state(adw_id: str) -> ADWState:
    try:
        return ADWState.load(adw_id)
    except StateNotFoundError:
        raise SystemExit(f"No state found for ADW ID {adw_id}. Run adws/adw_plan.py first.")


def main() -> None:
    load_adw_env()
    args = parse_args(sys.argv)
    adw_id = args.adw_id

    if not adw_id:
        print("adw_id is required for test phase (use value from planning stage).", file=sys.stderr)
        sys.exit(1)

    logger = start_logger(adw_id, "adw_test")
    logger.info(f"Test phase start | issue #{args.issue_number} | adw_id={adw_id}")

    state = load_existing_state(adw_id)
    if state.issue_number:
        issue_number = state.issue_number
    else:
        issue_number = args.issue_number
        state.update(issue_number=issue_number)
    state.save()

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

    issue = fetch_issue(issue_number, repo_path)
    persist_issue_snapshot(state, issue)
    state.save()

    if not state.issue_class:
        issue_command, error = classify_issue(issue, adw_id, logger)
        if issue_command:
            state.update(issue_class=issue_command)
            state.save()

    lockfile_dirty = lockfile_changed(cwd=worktree_path)
    commands = validation_commands(lockfile_dirty and not args.skip_install)
    serialized_commands = serialize_validation(commands)

    make_issue_comment(
        issue_number,
        f"{format_issue_message(adw_id, 'ops', '✅ Starting validation run')}\\n"
        f"Commands:\\n" + "\\n".join(f"- `{entry['cmd']}`" for entry in serialized_commands),
    )

    results = run_validation_commands(commands, cwd=worktree_path)
    success, summary = summarize_validation_results(results)

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, AGENT_TESTER, summary),
    )

    if not success:
        logger.error("Validation run failed")
        sys.exit(1)

    # Persist latest status for downstream phases
    state.update(
        last_validation=json.dumps([asdict(result) for result in results], indent=2),
        last_validation_success=True,
    )
    state.save()

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", "✅ Validation phase completed"),
    )
    make_issue_comment(
        issue_number,
        f"{format_issue_message(adw_id, 'ops', '📋 Test phase state')}\\n```json\\n{json.dumps(state.data, indent=2)}\\n```",
    )
    logger.info("Validation completed successfully")


if __name__ == "__main__":
    main()
