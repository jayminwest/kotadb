#!/usr/bin/env uv run
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "schedule",
#     "python-dotenv",
#     "pydantic",
# ]
# ///

"""Cron-based trigger for the KotaDB ADW workflow."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, Optional, Set

import schedule
from dotenv import load_dotenv

from github import (
    extract_repo_path,
    fetch_issue_comments,
    fetch_open_issues,
    get_repo_url,
)

load_dotenv()

GITHUB_PAT = os.getenv("GITHUB_PAT")

try:
    GITHUB_REPO_URL = get_repo_url()
    REPO_PATH = extract_repo_path(GITHUB_REPO_URL)
except ValueError as exc:
    print(f"ERROR: {exc}", file=sys.stderr)
    sys.exit(1)

processed_issues: Set[int] = set()
issue_last_comment: Dict[int, Optional[int]] = {}
shutdown_requested = False


def signal_handler(signum: int, _frame: object) -> None:
    """Request graceful shutdown when receiving termination signals."""

    global shutdown_requested
    print(f"INFO: Received signal {signum}; shutting down after current cycle.")
    shutdown_requested = True


def should_process_issue(issue_number: int) -> bool:
    """Return True if the issue should trigger ADW processing."""

    comments = fetch_issue_comments(REPO_PATH, issue_number)
    if not comments:
        print(f"INFO: Issue #{issue_number} has no comments; scheduling workflow run.")
        return True

    latest_comment = comments[-1]
    comment_body = (latest_comment.get("body") or "").strip().lower()
    comment_id = latest_comment.get("id")

    if issue_last_comment.get(issue_number) == comment_id:
        return False

    if comment_body == "adw":
        issue_last_comment[issue_number] = comment_id
        print(f"INFO: Issue #{issue_number} received 'adw' command; scheduling workflow run.")
        return True

    return False


def trigger_adw_workflow(issue_number: int) -> bool:
    """Invoke the plan/build workflow for a qualifying issue."""

    script_path = Path(__file__).resolve().parent / "adw_plan_build.py"
    project_root = script_path.parent
    cmd = ["uv", "run", str(script_path), str(issue_number)]

    print(f"INFO: Launching workflow for issue #{issue_number} → {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=project_root,
            env=os.environ.copy(),
        )
    except Exception as exc:  # noqa: BLE001 - propagate failure for visibility
        print(f"ERROR: Exception while triggering issue #{issue_number}: {exc}", file=sys.stderr)
        return False

    if result.returncode == 0:
        print(f"INFO: Workflow completed for issue #{issue_number}.")
        return True

    if result.stdout.strip():
        print(f"ERROR: Workflow stdout for issue #{issue_number}:\n{result.stdout}", file=sys.stderr)
    if result.stderr.strip():
        print(f"ERROR: Workflow stderr for issue #{issue_number}:\n{result.stderr}", file=sys.stderr)
    else:
        print(f"ERROR: Workflow failed for issue #{issue_number} with exit code {result.returncode}", file=sys.stderr)
    return False


def check_and_process_issues() -> None:
    """Poll GitHub for qualifying issues and trigger workflows."""

    if shutdown_requested:
        print("INFO: Shutdown requested; skipping poll cycle.")
        return

    start_time = time.time()
    print("INFO: Starting poll cycle…")

    issues = fetch_open_issues(REPO_PATH)
    if not issues:
        print("INFO: No open issues detected.")
        return

    qualifying = [issue.number for issue in issues if should_process_issue(issue.number)]

    if qualifying:
        print(f"INFO: Found {len(qualifying)} qualifying issues: {qualifying}")

    for issue_number in qualifying:
        if shutdown_requested:
            print("INFO: Shutdown requested mid-cycle; stopping triggers.")
            break

        if issue_number in processed_issues:
            continue

        if trigger_adw_workflow(issue_number):
            processed_issues.add(issue_number)
        else:
            print(f"WARN: Issue #{issue_number} will be retried next cycle.")

    duration = time.time() - start_time
    print(f"INFO: Poll cycle finished in {duration:.2f}s; total processed this run: {len(processed_issues)}")


def main() -> None:
    """Entry point to start the cron trigger loop."""

    print("INFO: Starting KotaDB ADW cron trigger")
    print(f"INFO: Repository: {REPO_PATH}")
    print("INFO: Poll interval: 20 seconds")

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    schedule.every(20).seconds.do(check_and_process_issues)
    check_and_process_issues()

    print("INFO: Entering scheduler loop")
    while not shutdown_requested:
        schedule.run_pending()
        time.sleep(1)

    print("INFO: Cron trigger shut down cleanly")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in {"-h", "--help"}:
        print(__doc__)
        sys.exit(0)
    main()
