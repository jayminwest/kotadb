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

from utils import make_adw_id, run_logs_dir

load_dotenv()

PORT = int(os.getenv("PORT", "8001"))

app = FastAPI(title="KotaDB ADW Webhook", description="GitHub issue/comment trigger for automation")


@app.post("/gh-webhook")
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
        script_path = Path(__file__).resolve().parent / "adw_plan_build.py"
        project_root = script_path.parent
        cmd = ["uv", "run", str(script_path), str(issue_number), adw_id]

        log_dir = run_logs_dir(adw_id)
        relative_log_dir = log_dir.relative_to(project_root) if log_dir.is_relative_to(project_root) else log_dir

        print(f"Launching background workflow for issue #{issue_number} ({trigger_reason}) → {' '.join(cmd)}")

        subprocess.Popen(  # noqa: S603 - intentional background execution
            cmd,
            cwd=project_root,
            env=os.environ.copy(),
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


@app.get("/health")
async def health() -> dict[str, object]:
    """Run the ADW health check script and report status."""

    script_path = Path(__file__).resolve().parent / "health_check.py"

    try:
        result = subprocess.run(
            ["uv", "run", str(script_path)],
            capture_output=True,
            text=True,
            timeout=45,
            cwd=script_path.parent,
            env=os.environ.copy(),
        )
    except subprocess.TimeoutExpired:
        return {"status": "unhealthy", "reason": "health check timeout"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "unhealthy", "reason": f"health check error: {exc}"}

    status = "healthy" if result.returncode == 0 else "unhealthy"
    return {
        "status": status,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


if __name__ == "__main__":
    print(f"Starting webhook server on http://0.0.0.0:{PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
