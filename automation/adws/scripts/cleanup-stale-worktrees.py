#!/usr/bin/env python3
"""Cleanup script for stale ADW worktrees.

Detects and removes worktrees in automation/trees/ that have not been modified
within a configurable staleness threshold (default: 7 days). Checks state file
modification times in automation/agents/{adw_id}/adw_state.json to determine
activity. Orphaned worktrees (no state file) are marked stale immediately.

Safety mechanisms:
- Dry-run mode enabled by default (use --no-dry-run to execute)
- Configurable staleness threshold via --max-age-days
- Structured logging with timestamps for audit trail
- Continues on individual failures (non-blocking)

Usage:
    # Preview stale worktrees (dry-run)
    python automation/adws/scripts/cleanup-stale-worktrees.py

    # Execute cleanup with 7-day threshold
    python automation/adws/scripts/cleanup-stale-worktrees.py --no-dry-run

    # Custom staleness threshold (14 days)
    python automation/adws/scripts/cleanup-stale-worktrees.py --max-age-days 14 --no-dry-run

    # Delete associated branches during cleanup
    python automation/adws/scripts/cleanup-stale-worktrees.py --no-dry-run --delete-branches
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Tuple

# Add parent directories to path for module imports
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from adw_modules.git_ops import cleanup_worktree
from adw_modules.state import agents_root
from adw_modules.utils import project_root


def extract_adw_id_from_worktree(worktree_name: str) -> str | None:
    """Extract ADW ID from worktree name.

    Worktree naming convention: {issue_class}-{issue_number}-{adw_id}
    Examples: chore-208-fea7b5a8, feat-42-a1b2c3d4

    Args:
        worktree_name: Worktree directory name

    Returns:
        ADW ID (8-character suffix) if valid format, None otherwise
    """
    parts = worktree_name.split("-")
    if len(parts) >= 3:
        # Last part should be 8-character ADW ID
        adw_id_candidate = parts[-1]
        if len(adw_id_candidate) == 8:
            return adw_id_candidate
    return None


def find_stale_worktrees(max_age_days: int = 7) -> List[Tuple[str, datetime | None, str | None]]:
    """Find worktrees that exceed staleness threshold.

    Staleness determined by state file modification time at:
        automation/agents/{adw_id}/adw_state.json

    A worktree is considered stale if:
    - State file modification time > max_age_days
    - State file does not exist (orphaned worktree)

    Args:
        max_age_days: Maximum age in days before worktree is stale

    Returns:
        List of tuples: (worktree_name, last_modified_datetime, adw_id)
        last_modified_datetime is None for orphaned worktrees
    """
    trees_root = project_root() / "automation" / "trees"

    if not trees_root.exists():
        sys.stdout.write(f"Worktree directory not found: {trees_root}\n")
        return []

    stale_worktrees: List[Tuple[str, datetime | None, str | None]] = []
    threshold = datetime.now() - timedelta(days=max_age_days)

    for worktree_dir in trees_root.iterdir():
        if not worktree_dir.is_dir():
            continue

        worktree_name = worktree_dir.name
        adw_id = extract_adw_id_from_worktree(worktree_name)

        if not adw_id:
            # Invalid worktree name format - treat as orphaned
            sys.stdout.write(f"Warning: Invalid worktree name format: {worktree_name} (orphaned)\n")
            stale_worktrees.append((worktree_name, None, None))
            continue

        # Check state file modification time
        state_file = agents_root() / adw_id / "adw_state.json"

        if not state_file.exists():
            # No state file - orphaned worktree
            stale_worktrees.append((worktree_name, None, adw_id))
            continue

        # Check if state file modification time exceeds threshold
        state_mtime = datetime.fromtimestamp(state_file.stat().st_mtime)
        if state_mtime < threshold:
            stale_worktrees.append((worktree_name, state_mtime, adw_id))

    return stale_worktrees


def cleanup_worktree_wrapper(
    worktree_name: str,
    last_modified: datetime | None,
    adw_id: str | None,
    delete_branch: bool,
    dry_run: bool,
    verbose: bool,
) -> bool:
    """Wrapper for cleanup_worktree with logging and dry-run support.

    Args:
        worktree_name: Worktree directory name
        last_modified: State file modification time (None if orphaned)
        adw_id: ADW identifier (None if invalid format)
        delete_branch: Whether to delete associated branch
        dry_run: Preview mode (no actual deletion)
        verbose: Enable detailed logging

    Returns:
        True if cleanup succeeded (or would succeed in dry-run), False otherwise
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Format last modified time
    if last_modified:
        modified_str = last_modified.strftime("%Y-%m-%d %H:%M:%S")
        age_days = (datetime.now() - last_modified).days
        age_str = f"{age_days} days ago"
    else:
        modified_str = "N/A (orphaned)"
        age_str = "unknown"

    # Log metadata
    sys.stdout.write(f"[{timestamp}] Worktree: {worktree_name}\n")
    sys.stdout.write(f"  ADW ID: {adw_id or 'N/A'}\n")
    sys.stdout.write(f"  Last Modified: {modified_str}\n")
    sys.stdout.write(f"  Age: {age_str}\n")
    sys.stdout.write(f"  Delete Branch: {delete_branch}\n")

    if dry_run:
        sys.stdout.write(f"  [DRY RUN] Would remove worktree: {worktree_name}\n")
        if verbose:
            sys.stdout.write(f"  [DRY RUN] Command: git worktree remove automation/trees/{worktree_name} --force\n")
            if delete_branch:
                sys.stdout.write(f"  [DRY RUN] Command: git branch -D {worktree_name}\n")
        return True

    # Execute cleanup
    try:
        success = cleanup_worktree(worktree_name, delete_branch=delete_branch)
        if success:
            sys.stdout.write(f"  [SUCCESS] Removed worktree: {worktree_name}\n")
        else:
            sys.stderr.write(f"  [ERROR] Failed to remove worktree: {worktree_name}\n")
        return success
    except Exception as exc:
        sys.stderr.write(f"  [ERROR] Exception during cleanup: {exc}\n")
        return False


def main() -> int:
    """Main entry point for cleanup script.

    Returns:
        Exit code: 0 if successful, 1 if errors occurred
    """
    parser = argparse.ArgumentParser(
        description="Cleanup stale ADW worktrees based on state file modification time",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--max-age-days",
        type=int,
        default=7,
        help="Maximum age in days before worktree is considered stale (default: 7)",
    )
    parser.add_argument(
        "--delete-branches",
        action="store_true",
        help="Delete associated git branches during cleanup (default: False)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        dest="dry_run",
        help="Preview stale worktrees without deletion (default: enabled)",
    )
    parser.add_argument(
        "--no-dry-run",
        action="store_false",
        dest="dry_run",
        help="Execute cleanup (disables dry-run mode)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable detailed logging output",
    )

    args = parser.parse_args()

    sys.stdout.write(f"=== ADW Stale Worktree Cleanup ===\n")
    sys.stdout.write(f"Max Age: {args.max_age_days} days\n")
    sys.stdout.write(f"Delete Branches: {args.delete_branches}\n")
    sys.stdout.write(f"Dry Run: {args.dry_run}\n")
    sys.stdout.write(f"Verbose: {args.verbose}\n")
    sys.stdout.write("\n")

    # Find stale worktrees
    stale_worktrees = find_stale_worktrees(max_age_days=args.max_age_days)

    if not stale_worktrees:
        sys.stdout.write("No stale worktrees found.\n")
        return 0

    sys.stdout.write(f"Found {len(stale_worktrees)} stale worktree(s):\n\n")

    # Process each stale worktree
    success_count = 0
    failure_count = 0

    for worktree_name, last_modified, adw_id in stale_worktrees:
        success = cleanup_worktree_wrapper(
            worktree_name=worktree_name,
            last_modified=last_modified,
            adw_id=adw_id,
            delete_branch=args.delete_branches,
            dry_run=args.dry_run,
            verbose=args.verbose,
        )
        if success:
            success_count += 1
        else:
            failure_count += 1
        sys.stdout.write("\n")

    # Summary
    sys.stdout.write("=== Cleanup Summary ===\n")
    sys.stdout.write(f"Total Stale: {len(stale_worktrees)}\n")
    if args.dry_run:
        sys.stdout.write(f"Would Remove: {success_count}\n")
    else:
        sys.stdout.write(f"Successfully Removed: {success_count}\n")
        sys.stdout.write(f"Failed: {failure_count}\n")

    # Exit with error code if any failures occurred (only in non-dry-run mode)
    if not args.dry_run and failure_count > 0:
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
