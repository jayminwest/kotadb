#!/usr/bin/env -S uv run
# /// script
# dependencies = ["fastapi", "uvicorn", "python-dotenv"]
# ///

"""FastAPI webhook trigger for the KotaDB ADW workflow."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request

if __package__ is None or __package__ == "":
    import sys
    from pathlib import Path

    sys.path.append(str(Path(__file__).resolve().parent.parent))

from adws.utils import make_adw_id, project_root, run_logs_dir

load_dotenv(project_root() / ".env")

PORT = int(os.getenv("PORT", "8001"))
RUNNER_IMAGE = os.getenv("ADW_RUNNER_IMAGE", "kotadb-adw-runner:latest")
DOCKER_BIN = os.getenv("ADW_DOCKER_BIN", "docker")
ADW_GIT_REF = os.getenv("ADW_GIT_REF", os.getenv("ADW_GIT_BRANCH", "main"))
ADW_REPO_URL = os.getenv("ADW_REPO_URL")
LOG_ROOT = Path(
    os.getenv("ADW_CONTAINER_LOG_PATH", os.getenv("ADW_LOG_ROOT", project_root() / ".adw_logs"))
).resolve()
LOG_VOLUME = os.getenv("ADW_LOG_VOLUME")
HOST_LOG_PATH = os.path.expanduser(os.getenv("ADW_HOST_LOG_PATH", "")).strip()

FORWARD_ENV = (
    "ANTHROPIC_API_KEY",
    "GITHUB_PAT",
    "CLAUDE_CODE_PATH",
    "E2B_API_KEY",
    "GH_TOKEN",
    "GIT_AUTHOR_NAME",
    "GIT_AUTHOR_EMAIL",
)


def ensure_runner_image() -> None:
    """Ensure the configured runner image is present locally, pulling if needed."""

    if os.getenv("ADW_RUNNER_AUTO_PULL", "true").lower() not in {"1", "true", "yes", "on"}:
        return

    try:
        inspect = subprocess.run(
            [DOCKER_BIN, "image", "inspect", RUNNER_IMAGE],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:  # pragma: no cover - env misconfiguration
        raise RuntimeError("Docker binary not found. Set ADW_DOCKER_BIN or install Docker.") from exc

    if inspect.returncode == 0:
        return

    pull = subprocess.run([DOCKER_BIN, "pull", RUNNER_IMAGE], text=True)
    if pull.returncode != 0:
        raise RuntimeError(f"Failed to pull runner image {RUNNER_IMAGE}")

app = FastAPI(title="KotaDB ADW Webhook", description="GitHub issue/comment trigger for automation")


@app.post("/gh-webhook")
@app.post("/github/issues")
async def github_webhook(request: Request) -> dict[str, object]:
    """Handle GitHub issue and comment events."""

    try:
        event_type = request.headers.get("X-GitHub-Event", "")
        payload = await request.json()
        action = payload.get("action", "")
        issue = payload.get("issue", {})
        issue_number = issue.get("number")

        print(f"Received webhook event={event_type} action={action} issue={issue_number}")

        trigger_reason = None
        if event_type == "issues" and action == "opened" and issue_number:
            trigger_reason = "New issue opened"
        elif event_type == "issue_comment" and action == "created" and issue_number:
            comment = payload.get("comment", {})
            comment_body = (comment.get("body") or "").strip().lower()
            if comment_body == "adw":
                trigger_reason = "Comment command 'adw'"

        if not trigger_reason:
            return {"status": "ignored", "reason": f"No trigger rule matched ({event_type}/{action})"}

        adw_id = make_adw_id()
        ensure_runner_image()

        LOG_ROOT.mkdir(parents=True, exist_ok=True)
        log_dir = run_logs_dir(adw_id)
        log_dir.mkdir(parents=True, exist_ok=True)

        env_args: list[str] = []
        for key in FORWARD_ENV:
            value = os.getenv(key)
            if value is not None and value != "":
                env_args.extend(["-e", f"{key}={value}"])

        env_args.extend(
            [
                "-e",
                f"ISSUE_NUMBER={issue_number}",
                "-e",
                f"ADW_ID={adw_id}",
                "-e",
                f"ADW_GIT_REF={ADW_GIT_REF}",
            ]
        )
        if ADW_REPO_URL:
            env_args.extend(["-e", f"ADW_REPO_URL={ADW_REPO_URL}"])

        if LOG_VOLUME:
            log_mount_args = ["-v", f"{LOG_VOLUME}:/workspace/.adw_logs"]
        else:
            if not HOST_LOG_PATH:
                raise RuntimeError(
                    "ADW_HOST_LOG_PATH must be set to an absolute host path when ADW_LOG_VOLUME is not provided"
                )
            if not os.path.isabs(HOST_LOG_PATH):
                raise RuntimeError("ADW_HOST_LOG_PATH must be an absolute host path")
            log_mount_args = ["-v", f"{HOST_LOG_PATH}:/workspace/.adw_logs"]

        docker_cmd = [
            DOCKER_BIN,
            "run",
            "--rm",
            "--name",
            f"adw-run-{adw_id}",
            *log_mount_args,
            *env_args,
            RUNNER_IMAGE,
            str(issue_number),
            adw_id,
        ]

        print(
            "Launching background workflow for issue #{issue_number} "
            f"({trigger_reason}) → {' '.join(docker_cmd)}"
        )

        subprocess.Popen(  # noqa: S603 - intentional background execution
            docker_cmd,
            env=os.environ.copy(),
        )

        relative_log_dir = (
            log_dir.relative_to(project_root())
            if log_dir.is_relative_to(project_root())
            else log_dir
        )

        return {
            "status": "accepted",
            "issue": issue_number,
            "adw_id": adw_id,
            "reason": trigger_reason,
            "logs": str(relative_log_dir),
        }
    except Exception as exc:  # noqa: BLE001 - ensure webhook ack
        print(f"Error handling webhook: {exc}")
        return {"status": "error", "message": "Internal webhook error"}


def docker_available() -> tuple[bool, str | None]:
    """Return whether the Docker daemon is reachable from the webhook container."""

    try:
        result = subprocess.run(
            [DOCKER_BIN, "info"],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except FileNotFoundError:
        return False, "docker binary not found"
    except subprocess.TimeoutExpired:
        return False, "docker info timed out"

    if result.returncode != 0:
        return False, result.stderr.strip() or result.stdout.strip()
    return True, None


@app.get("/health")
async def health() -> dict[str, object]:
    """Report webhook readiness and Docker connectivity."""

    ok, reason = docker_available()
    status = "healthy" if ok else "unhealthy"
    response: dict[str, object] = {"status": status}
    if reason:
        response["reason"] = reason
    return response


if __name__ == "__main__":
    print(f"Starting webhook server on http://0.0.0.0:{PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
