#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic"]
# ///

"""Simplified 3-phase SDLC workflow orchestrator (plan → build → review).

Simplified ADW flow focuses on core functionality:
- Plan phase: create implementation plan and commit to branch
- Build phase: implement plan, commit changes, push branch, create PR
- Review phase: automated code review and feedback

Test and documentation phases deferred until core flow stabilizes (80% success rate target).
"""

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


def parse_args(argv: list[str]) -> tuple[str, Optional[str], bool]:
    """Parse command line arguments.
    
    Args:
        argv: Command line arguments
        
    Returns:
        Tuple of (issue_number, adw_id, stream_tokens)
    """
    if len(argv) < 2:
        sys.stderr.write("Usage: uv run adws/adw_sdlc.py <issue-number> [adw-id] [--stream-tokens]" + "\n")
        sys.exit(1)
    
    # Parse positional args
    issue_number = argv[1]
    adw_id = None
    stream_tokens = False
    
    # Parse remaining args
    for arg in argv[2:]:
        if arg == "--stream-tokens":
            stream_tokens = True
        elif adw_id is None and not arg.startswith("--"):
            adw_id = arg
    
    return issue_number, adw_id, stream_tokens


def main() -> None:
    import os

    load_adw_env()
    issue_number, provided_adw_id, stream_tokens = parse_args(sys.argv)
    adw_id, _ = ensure_state(provided_adw_id, issue_number)
    logger = start_logger(adw_id, "adw_sdlc")
    logger.info(f"Starting simplified SDLC workflow | issue #{issue_number} | adw_id={adw_id}")

    # Check for atomic agent orchestrator feature flag (Phase 2)
    use_atomic_agents = os.environ.get("ADW_USE_ATOMIC_AGENTS", "false").lower() == "true"

    if use_atomic_agents:
        logger.info("Using atomic agent orchestrator (ADW_USE_ATOMIC_AGENTS=true)")
        from adws.adw_agents.orchestrator import run_adw_workflow

        result = run_adw_workflow(issue_number, logger, adw_id=adw_id, stream_tokens=stream_tokens)

        if not result.success:
            logger.error(f"Atomic agent workflow failed at {result.failed_agent}: {result.error_message}")
            sys.exit(1)

        logger.info(f"Atomic agent workflow completed successfully ({len(result.completed_agents)} agents executed)")
        return

    # Legacy 3-phase workflow (backwards compatibility)
    logger.info("Using legacy 3-phase workflow (ADW_USE_ATOMIC_AGENTS=false)")

    # Create environment for multi-phase execution
    # Skip worktree cleanup in plan phase since subsequent phases need the worktree
    sdlc_env = os.environ.copy()
    sdlc_env["ADW_SKIP_PLAN_CLEANUP"] = "true"
    logger.info("Multi-phase mode: worktree cleanup deferred to final phase")

    # Simplified 3-phase flow: plan → build → review
    # Test and document phases removed until basics stabilize
    steps = ("adw_phases/adw_plan.py", "adw_phases/adw_build.py", "adw_phases/adw_review.py")
    try:
        run_sequence(steps, issue_number, adw_id, logger, env=sdlc_env)
    except PhaseExecutionError as exc:
        logger.error(str(exc))
        sys.exit(exc.returncode)

    logger.info("Simplified SDLC workflow completed successfully")


if __name__ == "__main__":
    main()
