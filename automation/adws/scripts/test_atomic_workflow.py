"""Side-by-side testing for atomic agent vs legacy phase workflows.

This script runs the same GitHub issue through both workflow implementations
and compares results for validation.

Usage:
    python automation/adws/scripts/test_atomic_workflow.py --issue 123 --mode both
    python automation/adws/scripts/test_atomic_workflow.py --issue 123 --mode atomic
    python automation/adws/scripts/test_atomic_workflow.py --issue 123 --mode legacy

Environment Variables:
    ADW_USE_ATOMIC_AGENTS: Set to 'true' for atomic agents, 'false' for legacy phases
"""

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

# Add parent directory to Python path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from adws.adw_modules.utils import make_adw_id


@dataclass
class WorkflowTestResult:
    """Result of a single workflow execution test.

    Attributes:
        issue_number: GitHub issue number tested
        mode: Workflow mode (atomic or legacy)
        adw_id: ADW execution ID
        success: Whether workflow completed successfully
        execution_time_seconds: Total execution time
        pr_url: Pull request URL if created
        error_message: Error message if failed
        files_changed: Number of files changed
        commits_created: Number of commits created
        worktree_cleaned: Whether worktree was cleaned up
    """

    issue_number: str
    mode: str  # "atomic" or "legacy"
    adw_id: str
    success: bool
    execution_time_seconds: float
    pr_url: Optional[str] = None
    error_message: Optional[str] = None
    files_changed: Optional[int] = None
    commits_created: Optional[int] = None
    worktree_cleaned: bool = False


def run_workflow_test(
    issue_number: str, mode: str, logger: logging.Logger
) -> WorkflowTestResult:
    """Run ADW workflow in specified mode and collect results.

    Args:
        issue_number: GitHub issue number to process
        mode: Workflow mode ('atomic' or 'legacy')
        logger: Logger instance

    Returns:
        WorkflowTestResult with execution metrics

    TODO (Phase 4):
        - Implement actual workflow execution
        - Parse workflow logs for metrics
        - Extract PR URL from git operations
        - Verify worktree cleanup
    """
    logger.info(f"Running workflow test: issue={issue_number}, mode={mode}")

    # Generate unique ADW ID for this test run
    adw_id = make_adw_id()

    # Set environment variable based on mode
    os.environ["ADW_USE_ATOMIC_AGENTS"] = "true" if mode == "atomic" else "false"

    start_time = time.time()

    try:
        # TODO (Phase 4): Execute workflow
        # For now, return placeholder result
        logger.warning("Workflow execution not yet implemented (Phase 4)")

        # Placeholder: simulate workflow execution
        time.sleep(0.1)

        execution_time = time.time() - start_time

        return WorkflowTestResult(
            issue_number=issue_number,
            mode=mode,
            adw_id=adw_id,
            success=True,
            execution_time_seconds=execution_time,
            pr_url=f"https://github.com/example/repo/pull/{issue_number}",
            files_changed=5,
            commits_created=2,
            worktree_cleaned=True,
        )

    except Exception as e:
        execution_time = time.time() - start_time
        logger.error(f"Workflow test failed: {e}", exc_info=True)

        return WorkflowTestResult(
            issue_number=issue_number,
            mode=mode,
            adw_id=adw_id,
            success=False,
            execution_time_seconds=execution_time,
            error_message=str(e),
        )


def compare_results(
    atomic_result: WorkflowTestResult, legacy_result: WorkflowTestResult
) -> dict:
    """Compare atomic agent vs legacy workflow results.

    Args:
        atomic_result: Result from atomic agent workflow
        legacy_result: Result from legacy phase workflow

    Returns:
        Dictionary with comparison metrics

    Comparison Metrics:
        - success_match: Both succeeded or both failed
        - execution_time_diff: Time difference (atomic - legacy)
        - speedup_percent: Percentage speedup (negative if slower)
        - both_created_pr: Both workflows created PRs
        - worktree_cleanup_match: Both cleaned up worktrees
    """
    comparison = {
        "success_match": atomic_result.success == legacy_result.success,
        "atomic_success": atomic_result.success,
        "legacy_success": legacy_result.success,
        "execution_time_diff": atomic_result.execution_time_seconds
        - legacy_result.execution_time_seconds,
        "speedup_percent": 0.0,
        "both_created_pr": bool(atomic_result.pr_url and legacy_result.pr_url),
        "worktree_cleanup_match": atomic_result.worktree_cleaned
        == legacy_result.worktree_cleaned,
    }

    # Calculate speedup percentage
    if legacy_result.execution_time_seconds > 0:
        speedup = (
            (legacy_result.execution_time_seconds - atomic_result.execution_time_seconds)
            / legacy_result.execution_time_seconds
            * 100
        )
        comparison["speedup_percent"] = speedup

    return comparison


def main():
    """Main entry point for side-by-side workflow testing."""
    parser = argparse.ArgumentParser(
        description="Test atomic agent vs legacy workflow implementations"
    )
    parser.add_argument(
        "--issue", "-i", required=True, help="GitHub issue number to test"
    )
    parser.add_argument(
        "--mode",
        "-m",
        choices=["atomic", "legacy", "both"],
        default="both",
        help="Workflow mode to test (default: both)",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output file for results (JSON format)",
        default=None,
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose logging"
    )

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    logger = logging.getLogger(__name__)

    results = {}

    # Run atomic agent workflow
    if args.mode in ["atomic", "both"]:
        logger.info("Running atomic agent workflow...")
        atomic_result = run_workflow_test(args.issue, "atomic", logger)
        results["atomic"] = asdict(atomic_result)

    # Run legacy phase workflow
    if args.mode in ["legacy", "both"]:
        logger.info("Running legacy phase workflow...")
        legacy_result = run_workflow_test(args.issue, "legacy", logger)
        results["legacy"] = asdict(legacy_result)

    # Compare results if both modes tested
    if args.mode == "both":
        comparison = compare_results(atomic_result, legacy_result)
        results["comparison"] = comparison

        logger.info("=== Comparison Results ===")
        logger.info(f"Success match: {comparison['success_match']}")
        logger.info(
            f"Execution time diff: {comparison['execution_time_diff']:.2f}s"
        )
        logger.info(f"Speedup: {comparison['speedup_percent']:.1f}%")

    # Save results to file if specified
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(results, f, indent=2)
        logger.info(f"Results saved to {output_path}")
    else:
        # Print results to stdout
        print(json.dumps(results, indent=2))

    # Exit with failure if any workflow failed
    if args.mode == "both":
        if not atomic_result.success or not legacy_result.success:
            sys.exit(1)
    elif args.mode == "atomic":
        if not atomic_result.success:
            sys.exit(1)
    elif args.mode == "legacy":
        if not legacy_result.success:
            sys.exit(1)


if __name__ == "__main__":
    main()
