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
import subprocess
import sys
from dataclasses import asdict
from pathlib import Path

# Add automation directory to Python path for local imports
automation_dir = Path(__file__).parent.parent.parent
if str(automation_dir) not in sys.path:
    sys.path.insert(0, str(automation_dir))

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
    run_validation_with_resolution,
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


def setup_test_environment(worktree_path: Path, adw_id: str, logger: logging.Logger, max_attempts: int = 3) -> str:
    """Provision isolated test environment with unique project name.

    Implements exponential backoff retry (3 attempts with 2s, 4s, 8s delays) to handle
    transient Docker/infrastructure failures gracefully.

    Args:
        worktree_path: Path to the git worktree
        adw_id: ADW execution ID for unique project naming
        logger: Logger instance for tracking retry attempts
        max_attempts: Maximum retry attempts (default: 3)

    Returns:
        Project name string if provisioning succeeds

    Raises:
        RuntimeError: If all retry attempts fail
    """
    import time

    project_name = f"kotadb-adw-{adw_id}"
    app_dir = worktree_path / "app"

    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        if attempt > 1:
            delay = 2 ** (attempt - 1)  # 2s, 4s, 8s
            logger.info(f"Retry attempt {attempt}/{max_attempts} after {delay}s delay")
            time.sleep(delay)
        else:
            logger.info(f"Provisioning test environment with PROJECT_NAME={project_name}")

        try:
            result = subprocess.run(
                ["bun", "run", "test:setup"],
                cwd=app_dir,
                env={**os.environ, "PROJECT_NAME": project_name},
                capture_output=True,
                text=True,
                timeout=180,
            )

            if result.returncode != 0:
                last_error = RuntimeError(
                    f"Test environment setup failed (exit {result.returncode}): {result.stderr}"
                )
                logger.warning(f"Attempt {attempt}/{max_attempts} failed: {last_error}")
                if attempt < max_attempts:
                    continue
                raise last_error

            logger.info(f"Test environment provisioned successfully on attempt {attempt}: {project_name}")
            return project_name

        except subprocess.TimeoutExpired as exc:
            last_error = RuntimeError(f"Test environment setup timed out after 180 seconds")
            logger.warning(f"Attempt {attempt}/{max_attempts} timed out")
            if attempt < max_attempts:
                continue
            raise last_error

    # Should never reach here, but provide fallback
    raise last_error if last_error else RuntimeError("Test environment setup failed after all attempts")


def teardown_test_environment(worktree_path: Path, project_name: str, logger: logging.Logger) -> None:
    """Tear down test environment (best-effort cleanup)."""
    app_dir = worktree_path / "app"

    logger.info(f"Tearing down test environment: {project_name}")

    try:
        result = subprocess.run(
            ["bun", "run", "test:teardown"],
            cwd=app_dir,
            env={**os.environ, "PROJECT_NAME": project_name},
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode != 0:
            logger.warning(f"Test environment teardown had errors: {result.stderr}")
        else:
            logger.info(f"Test environment cleaned up successfully: {project_name}")

    except subprocess.TimeoutExpired:
        logger.warning("Test environment teardown timed out after 60 seconds")
    except Exception as exc:
        logger.warning(f"Test environment teardown failed: {exc}")


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
        sys.stderr.write("adw_id is required for test phase (use value from planning stage)." + "\n")
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

    # Provision isolated test environment
    try:
        project_name = setup_test_environment(worktree_path, adw_id, logger)
        state.update(test_project_name=project_name)
        state.save()
    except Exception as exc:
        logger.error(f"Test environment provisioning failed: {exc}")
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"❌ Test environment setup failed: {exc}"),
        )
        sys.exit(1)

    issue = fetch_issue(issue_number, repo_path)
    persist_issue_snapshot(state, issue)
    state.save()

    if not state.issue_class:
        issue_command, error = classify_issue(issue, adw_id, logger)
        if issue_command:
            state.update(issue_class=issue_command)
            state.save()

    try:
        # Pre-validation health checks (non-blocking)
        app_package_json = worktree_path / "app" / "package.json"
        app_env_test = worktree_path / "app" / ".env.test"

        if not app_package_json.exists():
            logger.warning(f"Worktree structure check: app/package.json not found at {app_package_json}")
        if not app_env_test.exists():
            logger.warning(f"Test environment check: app/.env.test not found at {app_env_test}")

        lockfile_dirty = lockfile_changed(cwd=worktree_path)
        commands = validation_commands(lockfile_dirty and not args.skip_install)
        serialized_commands = serialize_validation(commands)

        make_issue_comment(
            issue_number,
            f"{format_issue_message(adw_id, 'ops', '✅ Starting validation run')}\n"
            f"Commands:\n" + "\n".join(f"- `{entry['cmd']}`" for entry in serialized_commands),
        )

        # Check if agent resolution is enabled (default: true)
        enable_resolution = os.getenv("ADW_ENABLE_RESOLUTION", "true").lower() == "true"

        if enable_resolution:
            results, success = run_validation_with_resolution(
                commands=commands,
                worktree_path=worktree_path,
                adw_id=adw_id,
                issue_number=issue_number,
                logger=logger,
                max_attempts=3,
            )
        else:
            from adws.adw_modules.workflow_ops import run_validation_commands
            results = run_validation_commands(commands, cwd=worktree_path, logger=logger)
            success = all(r.ok for r in results)

        _, summary = summarize_validation_results(results)

        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_TESTER, summary),
        )

        # Always persist validation results for post-mortem analysis, regardless of outcome
        state.update(
            last_validation=json.dumps([asdict(result) for result in results], indent=2),
            last_validation_success=success,
        )
        state.save()

        if not success:
            # Extract first failed result for detailed error reporting
            failed_result = next((r for r in results if not r.ok), None)
            if failed_result:
                # Truncate outputs to 2000 chars with ellipsis
                def truncate(text: str, limit: int = 2000) -> str:
                    return text[:limit] + "..." if len(text) > limit else text

                error_details = [
                    f"**Command**: `{' '.join(failed_result.command)}`",
                    f"**Label**: {failed_result.label}",
                    f"**Exit code**: {failed_result.returncode}",
                    "",
                ]

                # Add resolution attempt details if enabled
                if enable_resolution:
                    retry_count = state.get("validation_retry_count", 0)
                    error_details.extend([
                        f"**Resolution attempts**: {retry_count}",
                        "",
                    ])

                    # Include last resolution attempts (truncated to 500 chars)
                    last_attempts = state.get("last_resolution_attempts", "")
                    if last_attempts:
                        truncated_attempts = truncate(last_attempts, limit=500)
                        error_details.extend([
                            "**Resolution history**:",
                            "```",
                            truncated_attempts,
                            "```",
                            "",
                        ])

                error_details.extend([
                    "**Stderr**:",
                    "```",
                    truncate(failed_result.stderr) if failed_result.stderr else "(empty)",
                    "```",
                    "",
                    "**Stdout**:",
                    "```",
                    truncate(failed_result.stdout) if failed_result.stdout else "(empty)",
                    "```",
                ])
                error_message = "\n".join(error_details)

                make_issue_comment(
                    issue_number,
                    f"{format_issue_message(adw_id, 'ops', '❌ Validation command failed')}\n\n{error_message}",
                )

            logger.error("Validation run failed")
            sys.exit(1)

        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", "✅ Validation phase completed"),
        )
        make_issue_comment(
            issue_number,
            f"{format_issue_message(adw_id, 'ops', '📋 Test phase state')}\n```json\n{json.dumps(state.data, indent=2)}\n```",
        )
        logger.info("Validation completed successfully")

    finally:
        # Always tear down test environment, even on failure
        if state.get("test_project_name"):
            teardown_test_environment(
                worktree_path,
                state.get("test_project_name"),
                logger
            )


if __name__ == "__main__":
    main()
