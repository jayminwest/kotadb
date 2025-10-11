#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic"]
# ///

"""Documentation phase for the AI Developer Workflow."""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
from typing import Optional

from adws.adw_modules import git_ops
from adws.adw_modules.git_ops import GitError
from adws.adw_modules.github import extract_repo_path, fetch_issue, get_repo_url, make_issue_comment
from adws.adw_modules.state import ADWState, StateNotFoundError
from adws.adw_modules.utils import load_adw_env
from adws.adw_modules.workflow_ops import (
    AGENT_DOCUMENTOR,
    classify_issue,
    create_commit_message,
    create_pull_request,
    document_changes,
    format_issue_message,
    start_logger,
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


def parse_args(argv: list[str]) -> tuple[str, Optional[str]]:
    if len(argv) < 2:
        print("Usage: uv run adws/adw_document.py <issue-number> [adw-id]", file=sys.stderr)
        sys.exit(1)
    issue_number = argv[1]
    adw_id = argv[2] if len(argv) > 2 else None
    return issue_number, adw_id


def load_state(adw_id: str) -> ADWState:
    try:
        return ADWState.load(adw_id)
    except StateNotFoundError:
        raise SystemExit(
            f"No workflow state found for ADW ID '{adw_id}'. Run plan/build phases before documentation."
        )


def main() -> None:
    load_adw_env()
    issue_number, provided_adw_id = parse_args(sys.argv)

    if not provided_adw_id:
        raise SystemExit("adw_id is required for documentation phase. Re-run plan/build to obtain it.")

    state = load_state(provided_adw_id)
    issue_number = state.issue_number or issue_number
    state.update(issue_number=issue_number)

    logger = start_logger(state.adw_id, "adw_document")
    logger.info(f"Documentation phase start | issue #{issue_number} | adw_id={state.adw_id}")

    check_env(logger)

    try:
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
    except ValueError as exc:
        logger.error(f"Unable to resolve repository: {exc}")
        sys.exit(1)

    if not state.branch_name:
        logger.error("No branch name stored in state. Run build phase before documentation.")
        make_issue_comment(
            issue_number,
            format_issue_message(state.adw_id, "ops", "❌ Documentation blocked: missing branch information."),
        )
        sys.exit(1)

    try:
        git_ops.checkout_branch(state.branch_name)
    except GitError as exc:
        logger.error(f"Failed to checkout branch {state.branch_name}: {exc}")
        make_issue_comment(
            issue_number,
            format_issue_message(
                state.adw_id,
                "ops",
                f"❌ Documentation blocked: unable to checkout branch {state.branch_name}: {exc}",
            ),
        )
        sys.exit(1)

    issue = fetch_issue(str(issue_number), repo_path)
    issue_payload = issue.model_dump(mode="json") if hasattr(issue, "model_dump") else issue.dict()
    state.update(issue=issue_payload)
    state.save()

    make_issue_comment(
        issue_number,
        format_issue_message(state.adw_id, "ops", "✅ Starting documentation phase"),
    )

    doc_result, error = document_changes(issue, state.adw_id, logger)
    if error or not doc_result:
        logger.error(f"Documentation generation failed: {error}")
        make_issue_comment(
            issue_number,
            format_issue_message(state.adw_id, AGENT_DOCUMENTOR, f"❌ Documentation failed: {error}"),
        )
        sys.exit(1)

    if not doc_result.success:
        logger.error("Documentation agent reported failure")
        make_issue_comment(
            issue_number,
            format_issue_message(
                state.adw_id,
                AGENT_DOCUMENTOR,
                doc_result.error_message or "❌ Documentation agent reported failure.",
            ),
        )
        sys.exit(1)

    summary_lines = ["✅ Documentation updated" if doc_result.documentation_created else "ℹ️ No documentation changes were necessary"]
    if doc_result.summary:
        summary_lines.append(doc_result.summary)
    if doc_result.documentation_path:
        summary_lines.append(f"Generated file: `{doc_result.documentation_path}`")
    make_issue_comment(
        issue_number,
        format_issue_message(state.adw_id, AGENT_DOCUMENTOR, "\n".join(summary_lines)),
    )

    if doc_result.documentation_created and not git_ops.ensure_clean_worktree():
        if not state.issue_class:
            issue_command, classify_error = classify_issue(issue, state.adw_id, logger)
            if issue_command:
                state.update(issue_class=issue_command)
                state.save()
            else:
                classify_error = classify_error or "classifier returned no command"
                logger.warning(f"Issue classification unavailable: {classify_error}")
        commit_message, commit_error = create_commit_message(
            AGENT_DOCUMENTOR,
            issue,
            state.issue_class or "/feature",  # type: ignore[arg-type]
            state.adw_id,
            logger,
        )
        if commit_error or not commit_message:
            logger.error(f"Failed to draft documentation commit message: {commit_error}")
            make_issue_comment(
                issue_number,
                format_issue_message(state.adw_id, AGENT_DOCUMENTOR, f"❌ Error drafting documentation commit: {commit_error}"),
            )
            sys.exit(1)
        committed, git_error = git_ops.commit_all(commit_message)
        if not committed:
            logger.error(f"Documentation commit failed: {git_error}")
            make_issue_comment(
                issue_number,
                format_issue_message(state.adw_id, AGENT_DOCUMENTOR, f"❌ Error committing documentation: {git_error}"),
            )
            sys.exit(1)

        pushed, push_error = git_ops.push_branch(state.branch_name)
        if not pushed:
            logger.error(f"Failed to push documentation branch: {push_error}")
            make_issue_comment(
                issue_number,
                format_issue_message(state.adw_id, "ops", f"❌ Error pushing branch: {push_error}"),
            )
        else:
            make_issue_comment(
                issue_number,
                format_issue_message(state.adw_id, "ops", f"✅ Branch pushed: {state.branch_name}"),
            )
            if state.plan_file:
                pr_url, pr_error = create_pull_request(state.branch_name, issue, state.plan_file, state.adw_id, logger)
                if pr_error:
                    make_issue_comment(
                        issue_number,
                        format_issue_message(state.adw_id, "ops", f"❌ Error creating pull request: {pr_error}"),
                    )
                elif pr_url:
                    make_issue_comment(
                        issue_number,
                        format_issue_message(state.adw_id, "ops", f"✅ Pull request updated: {pr_url}"),
                    )

    state.update(
        last_documentation=json.dumps(doc_result.model_dump() if hasattr(doc_result, "model_dump") else doc_result.dict())
    )
    state.save()

    make_issue_comment(
        issue_number,
        format_issue_message(state.adw_id, "ops", "✅ Documentation phase completed"),
    )
    make_issue_comment(
        issue_number,
        f"{format_issue_message(state.adw_id, "ops", "📋 Documentation state snapshot")}\n```json\n{json.dumps(state.data, indent=2)}\n```",
    )
    logger.info("Documentation phase completed successfully")


if __name__ == "__main__":
    main()
