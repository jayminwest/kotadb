#!/usr/bin/env -S uv run
"""GitHub helper operations for ADW orchestration."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Dict, List, Optional

from dotenv import load_dotenv

from data_types import GitHubIssue, GitHubIssueListItem

load_dotenv()


def get_github_env() -> Optional[dict[str, str]]:
    """Return a minimal environment for GitHub CLI commands if a PAT is set."""

    github_pat = os.getenv("GITHUB_PAT")
    if not github_pat:
        return None
    env = {
        "GH_TOKEN": github_pat,
        "PATH": os.environ.get("PATH", ""),
    }
    return env


def get_repo_url() -> str:
    """Return the remote origin URL for the current repository."""

    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"], capture_output=True, text=True, check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as exc:
        raise ValueError(
            "No git remote 'origin' found. Please ensure you're in a git repository with a remote."
        ) from exc
    except FileNotFoundError as exc:
        raise ValueError("git command not found. Please ensure git is installed.") from exc


def extract_repo_path(github_url: str) -> str:
    """Extract `<owner>/<repo>` from a GitHub remote URL."""

    return github_url.replace("https://github.com/", "").replace(".git", "")


def fetch_issue(issue_number: str, repo_path: str) -> GitHubIssue:
    """Fetch a GitHub issue using the GitHub CLI and return a typed model."""

    cmd = [
        "gh",
        "issue",
        "view",
        issue_number,
        "-R",
        repo_path,
        "--json",
        "number,title,body,state,author,assignees,labels,milestone,comments,createdAt,updatedAt,closedAt,url",
    ]

    env = get_github_env()

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    except FileNotFoundError as exc:
        raise RuntimeError(
            "GitHub CLI (gh) is not installed. Install it and run `gh auth login`."
        ) from exc

    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        raise RuntimeError(f"Failed to fetch issue {issue_number}")

    issue_data = json.loads(result.stdout)
    return GitHubIssue(**issue_data)


def make_issue_comment(issue_number: str, comment: str) -> None:
    """Post a comment on a GitHub issue via the GitHub CLI."""

    repo_url = get_repo_url()
    repo_path = extract_repo_path(repo_url)
    cmd = ["gh", "issue", "comment", issue_number, "-R", repo_path, "--body", comment]
    env = get_github_env()

    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        print(f"Error posting comment: {result.stderr}", file=sys.stderr)
        raise RuntimeError("Failed to post GitHub issue comment")


def mark_issue_in_progress(issue_number: str) -> None:
    """Optionally label and assign the issue to the current user."""

    repo_url = get_repo_url()
    repo_path = extract_repo_path(repo_url)
    env = get_github_env()

    label_cmd = [
        "gh",
        "issue",
        "edit",
        issue_number,
        "-R",
        repo_path,
        "--add-label",
        "in_progress",
    ]
    label_result = subprocess.run(label_cmd, capture_output=True, text=True, env=env)
    if label_result.returncode != 0:
        print(f"Note: Could not add 'in_progress' label: {label_result.stderr}")

    assign_cmd = [
        "gh",
        "issue",
        "edit",
        issue_number,
        "-R",
        repo_path,
        "--add-assignee",
        "@me",
    ]
    subprocess.run(assign_cmd, capture_output=True, text=True, env=env)


def fetch_open_issues(repo_path: str) -> List[GitHubIssueListItem]:
    """Return all open issues for the repository."""

    cmd = [
        "gh",
        "issue",
        "list",
        "--repo",
        repo_path,
        "--state",
        "open",
        "--json",
        "number,title,body,labels,createdAt,updatedAt",
        "--limit",
        "1000",
    ]

    env = get_github_env()

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, env=env)
    except subprocess.CalledProcessError as exc:  # pragma: no cover - upstream failure surface
        print(f"ERROR: Failed to fetch open issues: {exc.stderr}", file=sys.stderr)
        return []

    try:
        issues_data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:  # pragma: no cover - malformed CLI output
        print(f"ERROR: Unable to parse issue list JSON: {exc}", file=sys.stderr)
        return []

    return [GitHubIssueListItem(**issue) for issue in issues_data]


def fetch_issue_comments(repo_path: str, issue_number: int) -> List[Dict[str, object]]:
    """Return all comments for a GitHub issue sorted chronologically."""

    cmd = [
        "gh",
        "issue",
        "view",
        str(issue_number),
        "--repo",
        repo_path,
        "--json",
        "comments",
    ]

    env = get_github_env()

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, env=env)
    except subprocess.CalledProcessError as exc:  # pragma: no cover
        print(f"ERROR: Failed to fetch comments for issue #{issue_number}: {exc.stderr}", file=sys.stderr)
        return []

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:  # pragma: no cover
        print(f"ERROR: Unable to parse comments JSON for issue #{issue_number}: {exc}", file=sys.stderr)
        return []

    comments = payload.get("comments", [])
    comments.sort(key=lambda entry: entry.get("createdAt", ""))
    return comments
