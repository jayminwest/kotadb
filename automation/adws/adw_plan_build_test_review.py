#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic"]
# ///

"""Composite workflow that runs planning, build, tests, and review."""

from __future__ import annotations

import sys
from typing import Optional

from adws.adw_modules.orchestrators import PhaseExecutionError, run_sequence
from adws.adw_modules.utils import load_adw_env
from adws.adw_modules.workflow_ops import ensure_state, start_logger


def parse_args(argv: list[str]) -> tuple[str, Optional[str]]:
    if len(argv) < 2:
        print("Usage: uv run adws/adw_plan_build_test_review.py <issue-number> [adw-id]", file=sys.stderr)
        sys.exit(1)
    issue_number = argv[1]
    adw_id = argv[2] if len(argv) > 2 else None
    return issue_number, adw_id


def main() -> None:
    load_adw_env()
    issue_number, provided_adw_id = parse_args(sys.argv)
    adw_id, _ = ensure_state(provided_adw_id, issue_number)
    logger = start_logger(adw_id, "adw_plan_build_test_review")
    logger.info(f"Starting plan+build+test+review composite | issue #{issue_number} | adw_id={adw_id}")

    steps = ("adw_plan.py", "adw_build.py", "adw_test.py", "adw_review.py")
    try:
        run_sequence(steps, issue_number, adw_id, logger)
    except PhaseExecutionError as exc:
        logger.error(str(exc))
        sys.exit(exc.returncode)

    logger.info("Plan + build + test + review workflow completed successfully")


if __name__ == "__main__":
    main()
