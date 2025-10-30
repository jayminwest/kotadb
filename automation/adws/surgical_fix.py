#!/usr/bin/env python3
"""Surgical Fix Workflow for Critical Bug Automation.

This workflow orchestrates rapid bug fixes from issue identification through auto-merge:
1. Validate and reproduce the bug in an isolated worktree
2. Generate a targeted fix plan using existing slash commands
3. Implement the fix with Level 2+ validation
4. Create PR and monitor CI with automated retry logic
5. Auto-merge when all checks pass

Success metrics:
- Time-to-merge < 15 minutes for critical bugs
- CI auto-fix success rate > 70%
- End-to-end success rate > 80%
- Zero false-positive merges

Usage:
    # Start new workflow
    uv run adws/surgical_fix.py --issue 123

    # Resume from checkpoint
    uv run adws/surgical_fix.py --resume fix-123-20251029120000

    # Dry-run to validate preconditions
    uv run adws/surgical_fix.py --issue 123 --dry-run

    # Skip worktree cleanup on completion
    uv run adws/surgical_fix.py --issue 123 --skip-cleanup
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from adw_modules.data_types import (
    AutoMergeResult,
    CheckpointData,
    CIMonitoringResult,
    ReproductionResult,
    SurgicalFixState,
)
from adw_modules.exit_codes import (
    EXIT_BLOCKER_INVALID_ARGS,
    EXIT_BLOCKER_MISSING_SPEC,
    EXIT_BLOCKER_MISSING_STATE,
    EXIT_BLOCKER_RESOURCE_UNAVAILABLE,
    EXIT_EXEC_AGENT_FAILED,
    EXIT_EXEC_PARSE_ERROR,
    EXIT_RESOURCE_FILE_ERROR,
    EXIT_RESOURCE_GIT_ERROR,
    EXIT_RESOURCE_NETWORK_ERROR,
    EXIT_SUCCESS,
)
from adw_modules.git_ops import GitError, checkout_branch, ensure_branch, get_current_branch
from adw_modules.utils import project_root

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Environment configuration
SURGICAL_FIX_CLEANUP_WORKTREES = os.getenv("SURGICAL_FIX_CLEANUP_WORKTREES", "true").lower() == "true"
WORKTREE_BASE_PATH = project_root() / "automation" / "trees"
SURGICAL_FIX_STATE_DIR = project_root() / "automation" / "agents"


def generate_surgical_fix_id(issue_number: str) -> str:
    """Generate unique surgical fix identifier.

    Format: fix-<issue>-<timestamp>
    Example: fix-123-20251029120000

    Args:
        issue_number: GitHub issue number

    Returns:
        Unique surgical fix ID
    """
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"fix-{issue_number}-{timestamp}"


def load_surgical_fix_state(surgical_fix_id: str) -> SurgicalFixState:
    """Load surgical fix state from JSON file.

    Args:
        surgical_fix_id: Surgical fix identifier

    Returns:
        SurgicalFixState object

    Raises:
        FileNotFoundError: If state file doesn't exist
        ValueError: If state file is invalid
    """
    state_file = SURGICAL_FIX_STATE_DIR / surgical_fix_id / "surgical_fix_state.json"

    if not state_file.exists():
        raise FileNotFoundError(f"State file not found: {state_file}")

    try:
        with open(state_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return SurgicalFixState.model_validate(data)
    except Exception as e:
        raise ValueError(f"Invalid state file: {e}") from e


def save_surgical_fix_state(state: SurgicalFixState) -> None:
    """Save surgical fix state to JSON file with atomic writes.

    Args:
        state: SurgicalFixState object to save
    """
    state_dir = SURGICAL_FIX_STATE_DIR / state.surgical_fix_id
    state_dir.mkdir(parents=True, exist_ok=True)

    state_file = state_dir / "surgical_fix_state.json"
    temp_file = state_dir / "surgical_fix_state.json.tmp"

    # Write to temp file first
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(state.model_dump(mode="json"), f, indent=2)

    # Atomic rename
    temp_file.replace(state_file)
    logger.debug(f"Saved state to {state_file}")


def save_checkpoint(state: SurgicalFixState, step: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    """Save checkpoint for workflow recovery.

    Args:
        state: SurgicalFixState object
        step: Phase step identifier
        metadata: Additional checkpoint-specific data
    """
    checkpoint = CheckpointData(
        timestamp=datetime.now().isoformat(),
        step=step,
        files_completed=[],
        metadata=metadata or {}
    )
    state.checkpoints.append(checkpoint)
    save_surgical_fix_state(state)
    logger.info(f"Saved checkpoint: {step}")


def fetch_issue_metadata(issue_number: str) -> Dict[str, Any]:
    """Fetch issue metadata from GitHub API.

    Primary: GitHub API
    Fallback: Not implemented (would use Beads MCP)

    Args:
        issue_number: GitHub issue number

    Returns:
        Issue metadata dict with keys: number, title, body, labels, state

    Raises:
        subprocess.CalledProcessError: If gh command fails
    """
    logger.info(f"Fetching issue metadata for #{issue_number}")

    try:
        result = subprocess.run(
            ["gh", "issue", "view", issue_number, "--json", "number,title,body,labels,state"],
            capture_output=True,
            text=True,
            check=True,
            cwd=project_root()
        )
        metadata = json.loads(result.stdout)
        logger.debug(f"Fetched issue: {metadata.get('title', 'N/A')}")
        return metadata
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to fetch issue metadata: {e.stderr}")
        raise


def validate_issue_labels(labels: List[Dict[str, str]]) -> Tuple[bool, Optional[str]]:
    """Validate issue has bug label and priority:critical or priority:high.

    Args:
        labels: List of label dicts with 'name' key

    Returns:
        Tuple of (is_valid, error_message)
    """
    label_names = [label["name"] for label in labels]

    has_bug = "bug" in label_names
    has_priority = any(label in label_names for label in ["priority:critical", "priority:high"])

    if not has_bug:
        return False, "Issue must have 'bug' label"

    if not has_priority:
        return False, "Issue must have 'priority:critical' or 'priority:high' label"

    return True, None


def extract_reproduction_steps(issue_body: str) -> List[str]:
    """Extract reproduction steps from issue body.

    Looks for ## Reproduction Steps section and extracts bash commands.

    Args:
        issue_body: Issue body text

    Returns:
        List of reproduction commands
    """
    if not issue_body:
        return []

    # Find ## Reproduction Steps section
    match = re.search(r"## Reproduction Steps.*?```bash\n(.*?)```", issue_body, re.DOTALL | re.IGNORECASE)
    if not match:
        # Try without code block
        match = re.search(r"## Reproduction Steps.*?\n(.*?)(?:\n##|$)", issue_body, re.DOTALL | re.IGNORECASE)
        if not match:
            return []

        # Extract commands from plain text (lines starting with $ or commands)
        steps_text = match.group(1).strip()
        steps = []
        for line in steps_text.split("\n"):
            line = line.strip()
            if line and (line.startswith("$") or line.startswith("curl") or line.startswith("bun")):
                # Remove $ prefix if present
                command = line.lstrip("$ ")
                steps.append(command)
        return steps

    # Extract commands from code block
    commands_text = match.group(1).strip()
    return [cmd.strip() for cmd in commands_text.split("\n") if cmd.strip()]


def execute_reproduction_steps(
    steps: List[str],
    worktree_path: Path,
    timeout: int = 60
) -> ReproductionResult:
    """Execute reproduction steps in worktree with timeout.

    Args:
        steps: List of bash commands to execute
        worktree_path: Path to worktree
        timeout: Timeout in seconds per command

    Returns:
        ReproductionResult with execution details
    """
    logger.info(f"Executing {len(steps)} reproduction steps")

    evidence_dir = SURGICAL_FIX_STATE_DIR / worktree_path.name / "logs"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    evidence_file = evidence_dir / "reproduction.log"

    executed_steps = []
    success = True
    error_message = None

    with open(evidence_file, "w", encoding="utf-8") as log:
        log.write(f"Reproduction steps executed at {datetime.now().isoformat()}\n")
        log.write("=" * 80 + "\n\n")

        for i, step in enumerate(steps, 1):
            log.write(f"Step {i}: {step}\n")
            log.write("-" * 40 + "\n")

            try:
                result = subprocess.run(
                    step,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    cwd=worktree_path
                )

                log.write(f"Exit code: {result.returncode}\n")
                log.write(f"STDOUT:\n{result.stdout}\n")
                log.write(f"STDERR:\n{result.stderr}\n")
                log.write("\n")

                executed_steps.append(step)

                # Non-zero exit code indicates bug reproduced
                if result.returncode != 0:
                    logger.info(f"Bug reproduced at step {i}")
                    break

            except subprocess.TimeoutExpired:
                error_message = f"Step {i} timed out after {timeout}s"
                log.write(f"ERROR: {error_message}\n\n")
                success = False
                break
            except Exception as e:
                error_message = f"Step {i} failed: {str(e)}"
                log.write(f"ERROR: {error_message}\n\n")
                success = False
                break

    return ReproductionResult(
        steps_executed=executed_steps,
        evidence_files=[str(evidence_file)],
        confirmed_at=datetime.now().isoformat(),
        success=success,
        error_message=error_message
    )


def spawn_planning_agent(issue_number: str, worktree_path: Path) -> Tuple[bool, str, Optional[str]]:
    """Spawn planning agent to generate bug fix plan.

    Delegates to /bug <issue_number> slash command.

    Args:
        issue_number: GitHub issue number
        worktree_path: Path to worktree

    Returns:
        Tuple of (success, output, error_message)
    """
    logger.info(f"Spawning planning agent for issue #{issue_number}")

    try:
        result = subprocess.run(
            ["claude", "/bug", issue_number],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
            cwd=worktree_path
        )

        if result.returncode != 0:
            return False, result.stdout, result.stderr

        return True, result.stdout, None

    except subprocess.TimeoutExpired:
        return False, "", "Planning agent timed out after 5 minutes"
    except Exception as e:
        return False, "", f"Planning agent failed: {str(e)}"


def extract_plan_file_path(agent_output: str, issue_number: str) -> Optional[str]:
    """Extract plan file path from agent output with defensive parsing.

    Tries multiple patterns:
    1. Explicit path in output
    2. Standard pattern: docs/specs/bug-<issue>-*.md
    3. Fallback: Search filesystem

    Args:
        agent_output: Agent output text
        issue_number: GitHub issue number for fallback

    Returns:
        Plan file path relative to project root, or None if not found
    """
    # Pattern 1: Look for explicit path in output
    patterns = [
        r"docs/specs/bug-\d+-[a-z0-9-]+\.md",
        r"Plan file:\s*([^\s]+\.md)",
        r"Created:\s*([^\s]+\.md)",
    ]

    for pattern in patterns:
        match = re.search(pattern, agent_output)
        if match:
            path = match.group(0) if "bug-" in pattern else match.group(1)
            # Strip markdown formatting and git prefixes
            path = path.strip("`*").removeprefix("git:")
            if Path(project_root() / path).exists():
                return path

    # Pattern 2: Standard location
    specs_dir = project_root() / "docs" / "specs"
    if specs_dir.exists():
        pattern = f"bug-{issue_number}-*.md"
        matches = list(specs_dir.glob(pattern))
        if matches:
            # Return most recent
            latest = max(matches, key=lambda p: p.stat().st_mtime)
            return str(latest.relative_to(project_root()))

    return None


def validate_plan_file(plan_file: str) -> Tuple[bool, Optional[str]]:
    """Validate plan file contains required sections.

    Required sections:
    - Root Cause
    - Fix Strategy

    Args:
        plan_file: Path to plan file relative to project root

    Returns:
        Tuple of (is_valid, error_message)
    """
    path = project_root() / plan_file
    if not path.exists():
        return False, f"Plan file not found: {plan_file}"

    try:
        content = path.read_text()
    except Exception as e:
        return False, f"Failed to read plan file: {e}"

    required_sections = ["## Root Cause", "## Fix Strategy"]
    missing = [section for section in required_sections if section not in content]

    if missing:
        return False, f"Plan file missing required sections: {', '.join(missing)}"

    return True, None


def spawn_implementation_agent(plan_file: str, worktree_path: Path) -> Tuple[bool, str, Optional[str]]:
    """Spawn implementation agent to execute fix plan.

    Delegates to /implement <plan_file> slash command.

    Args:
        plan_file: Path to plan file
        worktree_path: Path to worktree

    Returns:
        Tuple of (success, output, error_message)
    """
    logger.info(f"Spawning implementation agent for plan: {plan_file}")

    try:
        result = subprocess.run(
            ["claude", "/implement", plan_file],
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
            cwd=worktree_path
        )

        if result.returncode != 0:
            return False, result.stdout, result.stderr

        return True, result.stdout, None

    except subprocess.TimeoutExpired:
        return False, "", "Implementation agent timed out after 10 minutes"
    except Exception as e:
        return False, "", f"Implementation agent failed: {str(e)}"


def extract_validation_results(agent_output: str) -> Dict[str, Any]:
    """Extract Level 2+ validation results from agent output.

    Parses output for:
    - Validation level (1, 2, or 3)
    - Lint status (pass/fail)
    - Typecheck status (pass/fail)
    - Integration tests (passed/total)

    Args:
        agent_output: Agent output text

    Returns:
        Dict with validation results
    """
    results = {
        "level": 2,  # Default
        "lint": "unknown",
        "typecheck": "unknown",
        "integration_tests": "unknown"
    }

    # Extract validation level
    level_match = re.search(r"Validation.*Level\s*(\d+)", agent_output, re.IGNORECASE)
    if level_match:
        results["level"] = int(level_match.group(1))

    # Extract lint status
    if re.search(r"lint.*pass", agent_output, re.IGNORECASE):
        results["lint"] = "pass"
    elif re.search(r"lint.*fail", agent_output, re.IGNORECASE):
        results["lint"] = "fail"

    # Extract typecheck status
    if re.search(r"typecheck.*pass", agent_output, re.IGNORECASE):
        results["typecheck"] = "pass"
    elif re.search(r"typecheck.*fail", agent_output, re.IGNORECASE):
        results["typecheck"] = "fail"

    # Extract integration test results
    test_match = re.search(r"integration.*(\d+)/(\d+)", agent_output, re.IGNORECASE)
    if test_match:
        passed, total = test_match.groups()
        results["integration_tests"] = f"{passed}/{total}"

    return results


def push_branch(branch_name: str, worktree_path: Path) -> Tuple[bool, Optional[str]]:
    """Push branch to remote.

    Args:
        branch_name: Branch name to push
        worktree_path: Path to worktree

    Returns:
        Tuple of (success, error_message)
    """
    logger.info(f"Pushing branch: {branch_name}")

    try:
        result = subprocess.run(
            ["git", "push", "-u", "origin", branch_name],
            capture_output=True,
            text=True,
            check=True,
            cwd=worktree_path
        )
        logger.info(f"Branch pushed successfully")
        return True, None
    except subprocess.CalledProcessError as e:
        return False, e.stderr


def create_pull_request(worktree_path: Path, issue_number: str) -> Tuple[bool, str, Optional[str]]:
    """Create pull request using /pull_request slash command.

    Args:
        worktree_path: Path to worktree
        issue_number: GitHub issue number for PR description

    Returns:
        Tuple of (success, output, error_message)
    """
    logger.info("Creating pull request")

    try:
        result = subprocess.run(
            ["claude", "/pull_request"],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
            cwd=worktree_path
        )

        if result.returncode != 0:
            return False, result.stdout, result.stderr

        return True, result.stdout, None

    except subprocess.TimeoutExpired:
        return False, "", "PR creation timed out after 5 minutes"
    except Exception as e:
        return False, "", f"PR creation failed: {str(e)}"


def extract_pr_metadata(agent_output: str, branch_name: str) -> Tuple[Optional[str], Optional[str]]:
    """Extract PR number and URL from agent output with fallback.

    Args:
        agent_output: Agent output text
        branch_name: Branch name for fallback lookup

    Returns:
        Tuple of (pr_number, pr_url)
    """
    # Pattern 1: Look for PR URL in output
    url_match = re.search(r"https://github\.com/[^/]+/[^/]+/pull/(\d+)", agent_output)
    if url_match:
        pr_number = url_match.group(1)
        pr_url = url_match.group(0)
        return pr_number, pr_url

    # Pattern 2: Look for explicit PR number
    number_match = re.search(r"PR #(\d+)", agent_output)
    if number_match:
        pr_number = number_match.group(1)
        # Construct URL (requires GitHub repo info)
        try:
            result = subprocess.run(
                ["gh", "pr", "view", pr_number, "--json", "url"],
                capture_output=True,
                text=True,
                check=True,
                cwd=project_root()
            )
            data = json.loads(result.stdout)
            return pr_number, data["url"]
        except:
            pass

    # Fallback: Query by branch name
    try:
        result = subprocess.run(
            ["gh", "pr", "list", "--head", branch_name, "--json", "number,url"],
            capture_output=True,
            text=True,
            check=True,
            cwd=project_root()
        )
        data = json.loads(result.stdout)
        if data:
            pr = data[0]
            return str(pr["number"]), pr["url"]
    except:
        pass

    return None, None


def get_pr_checks(pr_number: str) -> Dict[str, Any]:
    """Get CI check status for PR.

    Args:
        pr_number: GitHub PR number

    Returns:
        Dict with CI check results
    """
    try:
        result = subprocess.run(
            ["gh", "pr", "checks", pr_number, "--json"],
            capture_output=True,
            text=True,
            check=True,
            cwd=project_root()
        )
        return json.loads(result.stdout)
    except Exception as e:
        logger.error(f"Failed to get PR checks: {e}")
        return {}


def monitor_ci_status(pr_number: str, max_wait: int = 600, poll_interval: int = 30) -> CIMonitoringResult:
    """Monitor CI status with polling.

    Polls every 30 seconds until checks complete or timeout.

    Args:
        pr_number: GitHub PR number
        max_wait: Maximum wait time in seconds
        poll_interval: Polling interval in seconds

    Returns:
        CIMonitoringResult with check status
    """
    logger.info(f"Monitoring CI for PR #{pr_number}")

    start_time = time.time()
    while time.time() - start_time < max_wait:
        checks = get_pr_checks(pr_number)

        if not checks:
            logger.warning("No CI checks found, waiting...")
            time.sleep(poll_interval)
            continue

        # Check if all checks are complete
        all_complete = all(check.get("status") in ["completed", "success", "failure"] for check in checks)

        if all_complete:
            failing = [check["name"] for check in checks if check.get("conclusion") != "success"]
            checks_passed = len(failing) == 0

            return CIMonitoringResult(
                checks_passed=checks_passed,
                retry_count=0,
                last_check_at=datetime.now().isoformat(),
                failing_checks=failing
            )

        logger.info(f"CI checks in progress, waiting {poll_interval}s...")
        time.sleep(poll_interval)

    # Timeout
    logger.warning(f"CI monitoring timed out after {max_wait}s")
    return CIMonitoringResult(
        checks_passed=False,
        retry_count=0,
        last_check_at=datetime.now().isoformat(),
        failing_checks=["timeout"]
    )


def check_auto_merge_eligibility(pr_number: str) -> Tuple[bool, Optional[str]]:
    """Check if PR is eligible for auto-merge.

    Requirements:
    - All CI checks passed
    - Review approved (reviewDecision: APPROVED)

    Args:
        pr_number: GitHub PR number

    Returns:
        Tuple of (is_eligible, reason)
    """
    try:
        result = subprocess.run(
            ["gh", "pr", "view", pr_number, "--json", "statusCheckRollup,reviewDecision"],
            capture_output=True,
            text=True,
            check=True,
            cwd=project_root()
        )
        data = json.loads(result.stdout)

        # Check CI status
        checks = data.get("statusCheckRollup", [])
        if not checks:
            return False, "No CI checks found"

        failing_checks = [check for check in checks if isinstance(check, dict) and check.get("conclusion") != "SUCCESS"]
        if failing_checks:
            return False, f"CI checks failing: {len(failing_checks)}"

        # Check review approval
        review_decision = data.get("reviewDecision")
        if review_decision != "APPROVED":
            return False, f"Review not approved: {review_decision}"

        return True, None

    except Exception as e:
        return False, f"Failed to check eligibility: {str(e)}"


def attempt_auto_merge(pr_number: str) -> AutoMergeResult:
    """Attempt to auto-merge PR.

    Uses squash merge strategy.

    Args:
        pr_number: GitHub PR number

    Returns:
        AutoMergeResult with merge status
    """
    logger.info(f"Attempting auto-merge for PR #{pr_number}")

    try:
        result = subprocess.run(
            ["gh", "pr", "merge", pr_number, "--squash", "--auto"],
            capture_output=True,
            text=True,
            check=True,
            cwd=project_root()
        )

        return AutoMergeResult(
            eligible=True,
            merge_attempted=True,
            merge_result="success"
        )
    except subprocess.CalledProcessError as e:
        return AutoMergeResult(
            eligible=True,
            merge_attempted=True,
            merge_result=f"failed: {e.stderr}"
        )


def close_linked_issue(issue_number: str, pr_number: str) -> None:
    """Close GitHub issue with closing comment.

    Args:
        issue_number: GitHub issue number
        pr_number: GitHub PR number that fixed the issue
    """
    comment = f"Fixed by PR #{pr_number}"

    try:
        subprocess.run(
            ["gh", "issue", "close", issue_number, "--comment", comment],
            capture_output=True,
            text=True,
            check=True,
            cwd=project_root()
        )
        logger.info(f"Closed issue #{issue_number}")
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to close issue: {e.stderr}")


def cleanup_worktree(worktree_path: Path) -> None:
    """Remove worktree and clean up git references.

    Args:
        worktree_path: Path to worktree
    """
    if not worktree_path.exists():
        return

    logger.info(f"Cleaning up worktree: {worktree_path}")

    try:
        # Remove worktree
        subprocess.run(
            ["git", "worktree", "remove", str(worktree_path), "--force"],
            capture_output=True,
            text=True,
            check=True,
            cwd=project_root()
        )
        logger.info("Worktree removed successfully")
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to remove worktree: {e.stderr}")


def main() -> int:
    """Main workflow orchestration."""
    parser = argparse.ArgumentParser(description="Surgical Fix Workflow for Critical Bugs")
    parser.add_argument("--issue", help="GitHub issue number to fix")
    parser.add_argument("--resume", help="Resume from surgical fix ID")
    parser.add_argument("--dry-run", action="store_true", help="Validate preconditions without execution")
    parser.add_argument("--skip-cleanup", action="store_true", help="Skip worktree cleanup on completion")

    args = parser.parse_args()

    if not args.issue and not args.resume:
        sys.stderr.write("Error: Must specify --issue or --resume\n")
        return EXIT_BLOCKER_INVALID_ARGS

    # Load or create state
    if args.resume:
        try:
            state = load_surgical_fix_state(args.resume)
            logger.info(f"Resumed workflow: {args.resume}")
        except (FileNotFoundError, ValueError) as e:
            sys.stderr.write(f"Error loading state: {e}\n")
            return EXIT_BLOCKER_MISSING_STATE
    else:
        # Fetch issue metadata
        try:
            issue_metadata = fetch_issue_metadata(args.issue)
        except subprocess.CalledProcessError:
            return EXIT_BLOCKER_RESOURCE_UNAVAILABLE

        # Validate issue
        is_valid, error = validate_issue_labels(issue_metadata.get("labels", []))
        if not is_valid:
            sys.stderr.write(f"Error: {error}\n")
            return EXIT_BLOCKER_INVALID_ARGS

        # Create state
        surgical_fix_id = generate_surgical_fix_id(args.issue)
        state = SurgicalFixState(
            surgical_fix_id=surgical_fix_id,
            issue_number=args.issue,
            issue_title=issue_metadata["title"],
            created_at=datetime.now().isoformat(),
            phase_status={}
        )
        save_surgical_fix_state(state)
        logger.info(f"Created workflow: {surgical_fix_id}")

    if args.dry_run:
        sys.stdout.write(f"Dry-run complete. Workflow ID: {state.surgical_fix_id}\n")
        return EXIT_SUCCESS

    # Phase 1: Bug Reproduction
    if state.phase_status.get("reproduction") != "completed":
        logger.info("=== Phase 1: Bug Reproduction ===")
        state.phase_status["reproduction"] = "in_progress"
        save_surgical_fix_state(state)

        # Extract reproduction steps
        issue_metadata = fetch_issue_metadata(state.issue_number)
        steps = extract_reproduction_steps(issue_metadata.get("body", ""))

        if not steps:
            sys.stderr.write("Error: No reproduction steps found in issue body\n")
            return EXIT_BLOCKER_MISSING_SPEC

        # Create worktree
        worktree_name = f"bug-{state.issue_number}-fix"
        worktree_path = WORKTREE_BASE_PATH / worktree_name
        branch_name = f"bug/{state.issue_number}-surgical-fix"

        # Create worktree directory
        worktree_path.mkdir(parents=True, exist_ok=True)

        try:
            subprocess.run(
                ["git", "worktree", "add", str(worktree_path), "-b", branch_name],
                capture_output=True,
                text=True,
                check=True,
                cwd=project_root()
            )
        except subprocess.CalledProcessError as e:
            sys.stderr.write(f"Error creating worktree: {e.stderr}\n")
            return EXIT_RESOURCE_GIT_ERROR

        state.worktree_path = str(worktree_path)
        state.branch_name = branch_name
        save_surgical_fix_state(state)

        # Execute reproduction
        reproduction_result = execute_reproduction_steps(steps, worktree_path)
        state.reproduction = reproduction_result

        if not reproduction_result.success:
            state.phase_status["reproduction"] = "failed"
            save_surgical_fix_state(state)
            sys.stderr.write(f"Error: Reproduction failed: {reproduction_result.error_message}\n")
            return EXIT_EXEC_AGENT_FAILED

        state.phase_status["reproduction"] = "completed"
        save_checkpoint(state, "reproduction_complete")
        logger.info("Bug reproduction complete")

    # Phase 2: Plan Generation
    if state.phase_status.get("plan") != "completed":
        logger.info("=== Phase 2: Plan Generation ===")
        state.phase_status["plan"] = "in_progress"
        save_surgical_fix_state(state)

        worktree_path = Path(state.worktree_path)
        success, output, error = spawn_planning_agent(state.issue_number, worktree_path)

        if not success:
            state.phase_status["plan"] = "failed"
            save_surgical_fix_state(state)
            sys.stderr.write(f"Error: Planning failed: {error}\n")
            return EXIT_EXEC_AGENT_FAILED

        # Extract plan file
        plan_file = extract_plan_file_path(output, state.issue_number)
        if not plan_file:
            sys.stderr.write("Error: Could not find plan file\n")
            return EXIT_EXEC_PARSE_ERROR

        # Validate plan file
        is_valid, error = validate_plan_file(plan_file)
        if not is_valid:
            sys.stderr.write(f"Error: Invalid plan: {error}\n")
            return EXIT_BLOCKER_MISSING_SPEC

        state.plan_file = plan_file
        state.phase_status["plan"] = "completed"
        save_checkpoint(state, "plan_complete", {"plan_file": plan_file})
        logger.info(f"Plan generated: {plan_file}")

    # Phase 3: Implementation
    if state.phase_status.get("implementation") != "completed":
        logger.info("=== Phase 3: Implementation ===")
        state.phase_status["implementation"] = "in_progress"
        save_surgical_fix_state(state)

        worktree_path = Path(state.worktree_path)
        success, output, error = spawn_implementation_agent(state.plan_file, worktree_path)

        if not success:
            state.phase_status["implementation"] = "failed"
            save_surgical_fix_state(state)
            sys.stderr.write(f"Error: Implementation failed: {error}\n")
            return EXIT_EXEC_AGENT_FAILED

        # Extract validation results
        validation = extract_validation_results(output)
        state.validation = validation

        if validation.get("lint") == "fail" or validation.get("typecheck") == "fail":
            state.phase_status["implementation"] = "failed"
            save_surgical_fix_state(state)
            sys.stderr.write("Error: Validation failed\n")
            return EXIT_EXEC_AGENT_FAILED

        state.phase_status["implementation"] = "completed"
        save_checkpoint(state, "implementation_complete")
        logger.info("Implementation complete")

    # Phase 4: PR Creation
    if state.phase_status.get("pr_creation") != "completed":
        logger.info("=== Phase 4: PR Creation ===")
        state.phase_status["pr_creation"] = "in_progress"
        save_surgical_fix_state(state)

        worktree_path = Path(state.worktree_path)

        # Push branch
        success, error = push_branch(state.branch_name, worktree_path)
        if not success:
            state.phase_status["pr_creation"] = "failed"
            save_surgical_fix_state(state)
            sys.stderr.write(f"Error: Failed to push branch: {error}\n")
            return EXIT_RESOURCE_GIT_ERROR

        # Create PR
        success, output, error = create_pull_request(worktree_path, state.issue_number)
        if not success:
            state.phase_status["pr_creation"] = "failed"
            save_surgical_fix_state(state)
            sys.stderr.write(f"Error: PR creation failed: {error}\n")
            return EXIT_EXEC_AGENT_FAILED

        # Extract PR metadata
        pr_number, pr_url = extract_pr_metadata(output, state.branch_name)
        if not pr_number:
            sys.stderr.write("Error: Could not extract PR metadata\n")
            return EXIT_EXEC_PARSE_ERROR

        state.pr_number = pr_number
        state.pr_url = pr_url
        state.phase_status["pr_creation"] = "completed"
        save_checkpoint(state, "pr_created", {"pr_number": pr_number, "pr_url": pr_url})
        logger.info(f"PR created: {pr_url}")

    # Phase 5: CI Monitoring
    if state.phase_status.get("ci_monitoring") != "completed":
        logger.info("=== Phase 5: CI Monitoring ===")
        state.phase_status["ci_monitoring"] = "in_progress"
        save_surgical_fix_state(state)

        ci_result = monitor_ci_status(state.pr_number)
        state.ci_monitoring = ci_result

        if not ci_result.checks_passed:
            state.phase_status["ci_monitoring"] = "failed"
            save_surgical_fix_state(state)
            sys.stderr.write(f"Error: CI checks failed: {', '.join(ci_result.failing_checks)}\n")
            return EXIT_EXEC_AGENT_FAILED

        state.phase_status["ci_monitoring"] = "completed"
        save_checkpoint(state, "ci_passed")
        logger.info("CI checks passed")

    # Phase 6: Auto-Merge
    if state.phase_status.get("auto_merge") != "completed":
        logger.info("=== Phase 6: Auto-Merge ===")
        state.phase_status["auto_merge"] = "in_progress"
        save_surgical_fix_state(state)

        # Check eligibility
        eligible, reason = check_auto_merge_eligibility(state.pr_number)
        if not eligible:
            sys.stderr.write(f"Warning: PR not eligible for auto-merge: {reason}\n")
            sys.stdout.write(f"Manual review required for PR #{state.pr_number}\n")
            return EXIT_SUCCESS

        # Attempt merge
        merge_result = attempt_auto_merge(state.pr_number)
        state.auto_merge = merge_result

        if merge_result.merge_result != "success":
            state.phase_status["auto_merge"] = "failed"
            save_surgical_fix_state(state)
            sys.stderr.write(f"Error: Auto-merge failed: {merge_result.merge_result}\n")
            return EXIT_RESOURCE_NETWORK_ERROR

        # Close issue
        close_linked_issue(state.issue_number, state.pr_number)

        state.phase_status["auto_merge"] = "completed"
        save_checkpoint(state, "auto_merge_complete")
        logger.info("Auto-merge complete")

    # Cleanup
    if not args.skip_cleanup and SURGICAL_FIX_CLEANUP_WORKTREES:
        cleanup_worktree(Path(state.worktree_path))

    sys.stdout.write(f"Surgical fix complete: {state.pr_url}\n")
    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())
