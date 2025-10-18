#!/usr/bin/env uv run
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "python-dotenv",
#     "pydantic",
#     "httpx",
# ]
# ///

"""Comprehensive health checks for the KotaDB ADW automation stack."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel

from adws.adw_modules.github import extract_repo_path, get_repo_url, make_issue_comment
from adws.adw_modules.utils import load_adw_env

load_adw_env()


class CheckResult(BaseModel):
    success: bool
    error: Optional[str] = None
    warning: Optional[str] = None
    details: Dict[str, Any] = {}


class HealthCheckResult(BaseModel):
    success: bool
    timestamp: str
    checks: Dict[str, CheckResult]
    warnings: List[str] = []
    errors: List[str] = []


def check_env_vars() -> CheckResult:
    required = {
        "ANTHROPIC_API_KEY": "Anthropic API key for Claude Code",
    }
    optional = {
        "CLAUDE_CODE_PATH": "Path to Claude Code CLI (defaults to 'claude')",
        "GITHUB_PAT": "GitHub personal access token (optional if `gh auth login` is configured)",
        "E2B_API_KEY": "Sandbox key for agent cloud execution",
    }

    missing_required = [f"{key} ({desc})" for key, desc in required.items() if not os.getenv(key)]
    missing_optional = [f"{key} ({desc})" for key, desc in optional.items() if not os.getenv(key)]

    return CheckResult(
        success=not missing_required,
        error="Missing required environment variables" if missing_required else None,
        details={
            "missing_required": missing_required,
            "missing_optional": missing_optional,
            "claude_code_path": os.getenv("CLAUDE_CODE_PATH", "claude"),
        },
    )


def run_command(cmd: List[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True)


def check_git_repo() -> CheckResult:
    try:
        repo_url = get_repo_url()
        repo_path = extract_repo_path(repo_url)
    except ValueError as exc:
        return CheckResult(success=False, error=str(exc))

    git_status = run_command(["git", "status", "--short"])
    if git_status.returncode != 0:
        return CheckResult(success=False, error=git_status.stderr.strip())

    dirty = bool(git_status.stdout.strip())
    return CheckResult(
        success=True,
        warning="Working tree has pending changes" if dirty else None,
        details={"repo_url": repo_url, "repo_path": repo_path, "dirty": dirty},
    )


def check_bun_toolchain() -> CheckResult:
    checks = {}
    for tool in ("bun", "tsc"):
        result = run_command([tool, "--version"])
        checks[tool] = result.stdout.strip() if result.returncode == 0 else result.stderr.strip()
        if result.returncode != 0:
            return CheckResult(success=False, error=f"{tool} unavailable", details=checks)
    return CheckResult(success=True, details=checks)


def check_github_cli() -> CheckResult:
    """Validate GitHub CLI installation and authentication."""

    try:
        version = run_command(["gh", "--version"])
    except FileNotFoundError:
        return CheckResult(
            success=False,
            error="GitHub CLI (gh) is not installed",
            details={"installed": False},
        )

    if version.returncode != 0:
        return CheckResult(
            success=False,
            error=version.stderr.strip() or "Unable to run 'gh --version'",
            details={"installed": False},
        )

    env = os.environ.copy()
    if os.getenv("GITHUB_PAT"):
        env["GH_TOKEN"] = os.getenv("GITHUB_PAT")

    status = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True, env=env)
    authenticated = status.returncode == 0

    return CheckResult(
        success=authenticated,
        error=None if authenticated else "GitHub CLI not authenticated",
        details={"installed": True, "authenticated": authenticated},
    )


def check_claude_code() -> CheckResult:
    claude_path = os.getenv("CLAUDE_CODE_PATH", "claude")
    try:
        version = run_command([claude_path, "--version"])
    except FileNotFoundError:
        return CheckResult(success=False, error=f"Claude CLI not found at '{claude_path}'")

    if version.returncode != 0:
        return CheckResult(success=False, error=version.stderr.strip())

    prompt = "Return only the string 4."
    env = os.environ.copy()
    if os.getenv("GITHUB_PAT"):
        env["GH_TOKEN"] = os.getenv("GITHUB_PAT")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as tmp:
        output_file = tmp.name

    cmd = [
        claude_path,
        "-p",
        prompt,
        "--model",
        "claude-3-5-haiku-20241022",
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
    ]

    with open(output_file, "w", encoding="utf-8") as writer:
        result = subprocess.run(cmd, stdout=writer, stderr=subprocess.PIPE, text=True, env=env, timeout=45)

    if result.returncode != 0:
        return CheckResult(success=False, error=f"Claude CLI invocation failed: {result.stderr.strip()}")

    try:
        with open(output_file, "r", encoding="utf-8") as handle:
            lines = [json.loads(line) for line in handle if line.strip()]
    except Exception as exc:  # noqa: BLE001
        return CheckResult(success=False, error=f"Unable to parse Claude output: {exc}")

    output = next((entry.get("result") for entry in lines if entry.get("type") == "result"), None)
    return CheckResult(success=output == "4", details={"response": output})


def check_mcp_server() -> CheckResult:
    """Validate MCP server connectivity and tool availability.

    Tests the KotaDB MCP server by making a JSON-RPC 2.0 tools/list request.
    Requires KOTA_MCP_API_KEY and MCP_SERVER_URL environment variables.

    Returns:
        CheckResult with success=True if server is reachable and tools are available
    """
    api_key = os.getenv("KOTA_MCP_API_KEY")
    if not api_key:
        return CheckResult(
            success=False,
            error="KOTA_MCP_API_KEY environment variable not set",
            details={"configured": False},
        )

    server_url = os.getenv("MCP_SERVER_URL", "http://localhost:3000/mcp")

    # JSON-RPC 2.0 request for tools/list
    jsonrpc_request = {"jsonrpc": "2.0", "method": "tools/list", "id": 1}

    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(
                server_url,
                json=jsonrpc_request,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            )

        if response.status_code == 401:
            return CheckResult(
                success=False,
                error="MCP server authentication failed (invalid API key)",
                details={"server_url": server_url, "status_code": 401},
            )

        if response.status_code != 200:
            return CheckResult(
                success=False,
                error=f"MCP server returned status {response.status_code}",
                details={"server_url": server_url, "status_code": response.status_code},
            )

        data = response.json()

        # Check for JSON-RPC error response
        if "error" in data:
            return CheckResult(
                success=False,
                error=f"MCP server error: {data['error'].get('message', 'Unknown error')}",
                details={"server_url": server_url, "error_code": data["error"].get("code")},
            )

        # Extract tools from result
        result = data.get("result", {})
        tools = result.get("tools", [])
        tool_names = [tool.get("name") for tool in tools if "name" in tool]

        return CheckResult(
            success=bool(tool_names),
            warning="No tools available from MCP server" if not tool_names else None,
            details={
                "server_url": server_url,
                "tool_count": len(tool_names),
                "tools": tool_names,
                "configured": True,
            },
        )

    except httpx.ConnectError:
        return CheckResult(
            success=False,
            error=f"Cannot connect to MCP server at {server_url}",
            details={"server_url": server_url, "error_type": "connection_refused"},
        )
    except httpx.TimeoutException:
        return CheckResult(
            success=False,
            error=f"MCP server request timed out ({server_url})",
            details={"server_url": server_url, "error_type": "timeout"},
        )
    except Exception as exc:  # noqa: BLE001
        return CheckResult(
            success=False,
            error=f"MCP server check failed: {exc}",
            details={"server_url": server_url, "error_type": type(exc).__name__},
        )


def run_checks(selected: List[str]) -> Dict[str, CheckResult]:
    registry = {
        "env": check_env_vars,
        "git": check_git_repo,
        "toolchain": check_bun_toolchain,
        "github": check_github_cli,
        "claude": check_claude_code,
        "mcp": check_mcp_server,
    }
    results: Dict[str, CheckResult] = {}
    for name in selected:
        checker = registry.get(name)
        if not checker:
            raise ValueError(f"Unknown check: {name}")
        results[name] = checker()
    return results


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run ADW health checks")
    parser.add_argument(
        "checks",
        nargs="*",
        choices=["env", "git", "toolchain", "github", "claude", "mcp", "all"],
        help="Checks to execute",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON output")
    parser.add_argument("--issue", help="Optional GitHub issue number for posting results")
    args = parser.parse_args(argv)

    default_checks = ["env", "git", "toolchain", "github", "claude", "mcp"]
    targets = default_checks if not args.checks or "all" in args.checks else args.checks
    results = run_checks(targets)

    errors = [name for name, result in results.items() if not result.success]
    warnings = [result.warning for result in results.values() if result.warning]

    payload = HealthCheckResult(
        success=not errors,
        timestamp=datetime.utcnow().isoformat(),
        checks=results,
        warnings=[w for w in warnings if w],
        errors=errors,
    )

    if args.json:
        sys.stdout.write(f"{payload.model_dump_json(indent=2, by_alias=True)}\n")
    else:
        overall = "OK" if payload.success else "FAIL"
        sys.stdout.write(f"Overall status: {overall} ({payload.timestamp})\n")
        for name in targets:
            result = results[name]
            status = "OK" if result.success else "FAIL"
            sys.stdout.write(f"[{status}] {name}\n")
            if result.error:
                sys.stdout.write(f"  - error: {result.error}\n")
            if result.warning:
                sys.stdout.write(f"  - warning: {result.warning}\n")
            for key, value in result.details.items():
                sys.stdout.write(f"  - {key}: {value}\n")

    if args.issue:
        summary_emoji = "✅" if payload.success else "❌"
        status_label = "HEALTHY" if payload.success else "UNHEALTHY"
        comment_lines = [f"{summary_emoji} Health check {payload.timestamp}: {status_label}"]
        if payload.errors:
            comment_lines.append("Errors: " + ", ".join(payload.errors))
        if payload.warnings:
            comment_lines.append("Warnings: " + ", ".join(payload.warnings))

        try:
            make_issue_comment(args.issue, "\n".join(comment_lines))
            sys.stdout.write(f"Posted health check summary to issue #{args.issue}\n")
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"Failed to post health check comment: {exc}\n")

    return 0 if payload.success else 1


if __name__ == "__main__":
    raise SystemExit(main())
