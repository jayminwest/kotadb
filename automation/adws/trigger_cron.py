#!/usr/bin/env uv run
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "schedule",
#     "python-dotenv",
#     "pydantic",
# ]
# ///

"""Cron-based trigger for the modular ADW workflows."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, Optional, Set

import schedule

from adws.adw_modules.github import (
    ADW_BOT_IDENTIFIER,
    extract_repo_path,
    fetch_issue_comments,
    fetch_open_issues,
    get_repo_url,
)
from adws.adw_modules.utils import load_adw_env

load_adw_env()

try:
    REPO_URL = get_repo_url()
    REPO_PATH = extract_repo_path(REPO_URL)
except ValueError as exc:  # pragma: no cover - misconfigured environment
    sys.stderr.write(f"ERROR: {exc}\n")
    sys.exit(1)

processed_issues: Set[int] = set()
issue_last_comment: Dict[int, Optional[int]] = {}
shutdown_requested = False


def signal_handler(signum: int, _frame: object) -> None:
    global shutdown_requested
    sys.stdout.write(f"INFO: Received signal {signum}; shutting down after current cycle.\n")
    shutdown_requested = True


def should_process_issue(issue_number: int) -> bool:
    comments = fetch_issue_comments(REPO_PATH, issue_number)
    if not comments:
        return True

    latest = comments[-1]
    comment_body = (latest.get("body") or "").strip().lower()
    comment_id = latest.get("id")

    if issue_last_comment.get(issue_number) == comment_id:
        return False

    if ADW_BOT_IDENTIFIER.lower() in comment_body:
        return False

    if comment_body == "adw":
        issue_last_comment[issue_number] = comment_id
        return True

    return False


def trigger_workflow(issue_number: int) -> bool:
    script = Path(__file__).resolve().parent / "adw_plan_build_test.py"
    cmd = ["uv", "run", str(script), str(issue_number)]

    sys.stdout.write(f"INFO: Launching workflow for issue #{issue_number} → {' '.join(cmd)}\n")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=Path(__file__).resolve().parent,
            env=os.environ.copy(),
        )
    except Exception as exc:  # noqa: BLE001 - propagate failure for visibility
        sys.stderr.write(f"ERROR: Exception while triggering issue #{issue_number}: {exc}\n")
        return False

    if result.returncode == 0:
        sys.stdout.write(f"INFO: Workflow completed for issue #{issue_number}.\n")
        return True

    if result.stdout.strip():
        sys.stderr.write(f"ERROR: Workflow stdout for issue #{issue_number}:\n{result.stdout}\n")
    if result.stderr.strip():
        sys.stderr.write(f"ERROR: Workflow stderr for issue #{issue_number}:\n{result.stderr}\n")
    return False


def check_and_process_issues() -> None:
    if shutdown_requested:
        sys.stdout.write("INFO: Shutdown requested; skipping poll cycle.\n")
        return

    sys.stdout.write("INFO: Starting poll cycle…\n")
    start = time.time()

    issues = fetch_open_issues(REPO_PATH)
    if not issues:
        sys.stdout.write("INFO: No open issues detected.\n")
        return

    qualifying = [issue.number for issue in issues if should_process_issue(issue.number)]

    for issue_number in qualifying:
        if shutdown_requested:
            sys.stdout.write("INFO: Shutdown requested mid-cycle; stopping triggers.\n")
            break

        if issue_number in processed_issues:
            continue

        if trigger_workflow(issue_number):
            processed_issues.add(issue_number)
        else:
            sys.stdout.write(f"WARN: Issue #{issue_number} will be retried next cycle.\n")

    duration = time.time() - start
    sys.stdout.write(f"INFO: Poll cycle finished in {duration:.2f}s; total processed this run: {len(processed_issues)}\n")


def main() -> None:
    sys.stdout.write("INFO: Starting ADW cron trigger\n")
    sys.stdout.write(f"INFO: Repository: {REPO_PATH}\n")
    sys.stdout.write("INFO: Poll interval: 20 seconds\n")

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    schedule.every(20).seconds.do(check_and_process_issues)

    while not shutdown_requested:
        schedule.run_pending()
        time.sleep(1)

    sys.stdout.write("INFO: Cron trigger exiting\n")


if __name__ == "__main__":
    main()
