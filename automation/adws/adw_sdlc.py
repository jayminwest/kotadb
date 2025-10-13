#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic"]
# ///

"""End-to-end SDLC workflow orchestrator."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

# Add automation directory to Python path for local imports
automation_dir = Path(__file__).parent.parent
if str(automation_dir) not in sys.path:
    sys.path.insert(0, str(automation_dir))

from adws.adw_modules.orchestrators import PhaseExecutionError, run_sequence
from adws.adw_modules.utils import load_adw_env
from adws.adw_modules.workflow_ops import ensure_state, start_logger


def parse_args(argv: list[str]) -> tuple[str, Optional[str]]:
    if len(argv) < 2:
        sys.stderr.write("Usage: uv run adws/adw_sdlc.py <issue-number> [adw-id]" + "\n")
        sys.exit(1)
    issue_number = argv[1]
    adw_id = argv[2] if len(argv) > 2 else None
    return issue_number, adw_id


def main() -> None:
    import os

    load_adw_env()
    issue_number, provided_adw_id = parse_args(sys.argv)
    adw_id, _ = ensure_state(provided_adw_id, issue_number)
    logger = start_logger(adw_id, "adw_sdlc")
    logger.info(f"Starting full SDLC composite | issue #{issue_number} | adw_id={adw_id}")

    # Create environment for multi-phase execution
    # Skip worktree cleanup in plan phase since subsequent phases need the worktree
    sdlc_env = os.environ.copy()
    sdlc_env["ADW_SKIP_PLAN_CLEANUP"] = "true"
    logger.info("Multi-phase mode: worktree cleanup deferred to final phase")

    steps = ("adw_phases/adw_plan.py", "adw_phases/adw_build.py", "adw_phases/adw_test.py", "adw_phases/adw_review.py", "adw_phases/adw_document.py")
    try:
        run_sequence(steps, issue_number, adw_id, logger, env=sdlc_env)
    except PhaseExecutionError as exc:
        logger.error(str(exc))
        sys.exit(exc.returncode)

    logger.info("Full SDLC workflow completed successfully")


if __name__ == "__main__":
    main()
