"""Claude Code agent utilities for executing prompts programmatically."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .data_types import (
    AgentPromptRequest,
    AgentPromptResponse,
    AgentTemplateRequest,
    ClaudeCodeResultMessage,
)
from .utils import load_adw_env, project_root, run_logs_dir

# Load environment variables for local execution contexts.
load_adw_env()

# Resolve Claude CLI path (defaults to "claude").
CLAUDE_PATH = os.getenv("CLAUDE_CODE_PATH", "claude")
# Commands are at repository root, one level above automation directory
COMMANDS_ROOT = project_root().parent / ".claude" / "commands"


def check_claude_installed() -> Optional[str]:
    """Return an error message if the Claude Code CLI is not available."""

    try:
        result = subprocess.run([CLAUDE_PATH, "--version"], capture_output=True, text=True)
        if result.returncode != 0:
            return f"Error: Claude Code CLI is not installed. Expected at: {CLAUDE_PATH}"
    except FileNotFoundError:
        return f"Error: Claude Code CLI is not installed. Expected at: {CLAUDE_PATH}"
    return None


def parse_jsonl_output(output_file: str) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Parse a Claude JSONL output file and return all messages and the result message."""

    try:
        with open(output_file, "r", encoding="utf-8") as handle:
            messages = [json.loads(line) for line in handle if line.strip()]
    except Exception as exc:  # noqa: BLE001
        print(f"Error parsing JSONL file: {exc}", file=sys.stderr)
        return [], None

    result_message = next((msg for msg in reversed(messages) if msg.get("type") == "result"), None)
    return messages, result_message


def convert_jsonl_to_json(jsonl_file: str) -> str:
    """Convert JSONL file to newline-free JSON array for easier inspection."""

    json_file = jsonl_file.replace(".jsonl", ".json")
    messages, _ = parse_jsonl_output(jsonl_file)
    with open(json_file, "w", encoding="utf-8") as handle:
        json.dump(messages, handle, indent=2)
    print(f"Created JSON file: {json_file}")
    return json_file


def get_claude_env(cwd: Optional[str] = None) -> Dict[str, str]:
    """Return the environment variables required for Claude Code execution.

    Args:
        cwd: Optional working directory path. If provided and valid, enforces
             worktree git isolation by setting GIT_DIR and GIT_WORK_TREE.
    """

    env = {
        "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
        "CLAUDE_CODE_PATH": CLAUDE_PATH,
        "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR": os.getenv(
            "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR", "true"
        ),
        "E2B_API_KEY": os.getenv("E2B_API_KEY"),
        "HOME": os.getenv("HOME"),
        "USER": os.getenv("USER"),
        "PATH": os.getenv("PATH"),
        "SHELL": os.getenv("SHELL"),
        "TERM": os.getenv("TERM"),
    }

    github_pat = os.getenv("GITHUB_PAT")
    if github_pat:
        env["GITHUB_PAT"] = github_pat
        env["GH_TOKEN"] = github_pat

    # Note: Git worktrees have built-in isolation when using cwd parameter.
    # DO NOT set GIT_DIR/GIT_WORK_TREE for worktrees - in worktrees, .git is a
    # file (not a directory) that points to the actual git directory, so setting
    # GIT_DIR to .git breaks git operations.
    #
    # The cwd parameter passed to subprocess.run() is sufficient for worktree isolation.
    # Original issue #81 was caused by /generate_branch_name template running
    # git checkout commands, not by lack of environment variable isolation.

    return {key: value for key, value in env.items() if value is not None}


def save_prompt(
    prompt: str,
    adw_id: str,
    agent_name: str = "ops",
    slash_command: Optional[str] = None,
) -> None:
    """Persist the raw prompt for later auditing."""

    command_name = slash_command.lstrip("/") if slash_command else None

    if not command_name:
        match = re.search(r"/(\w+)", prompt)
        if not match:
            return
        command_name = match.group(1)
    prompt_dir = run_logs_dir(adw_id) / agent_name / "prompts"
    prompt_dir.mkdir(parents=True, exist_ok=True)
    prompt_file = prompt_dir / f"{command_name}.txt"
    with open(prompt_file, "w", encoding="utf-8") as handle:
        handle.write(prompt)
    print(f"Saved prompt to: {prompt_file}")


def command_template_path(slash_command: str) -> Path:
    """Return the on-disk path for a slash command template.

    Searches for the command file in COMMANDS_ROOT and its subdirectories.
    For example, /chore resolves to .claude/commands/issues/chore.md.
    """

    if not slash_command.startswith("/"):
        raise ValueError(f"Invalid slash command: {slash_command}")

    command_name = slash_command[1:]

    # First, try direct path (for backward compatibility if any commands remain at root)
    direct_path = COMMANDS_ROOT / f"{command_name}.md"
    if direct_path.exists():
        return direct_path

    # Search in subdirectories
    for subdir in COMMANDS_ROOT.iterdir():
        if not subdir.is_dir():
            continue
        candidate = subdir / f"{command_name}.md"
        if candidate.exists():
            return candidate

    raise FileNotFoundError(f"Prompt template not found for {slash_command} in {COMMANDS_ROOT} or its subdirectories")


def render_slash_command_prompt(slash_command: str, args: Sequence[str]) -> str:
    """Load a slash command template and substitute positional arguments."""

    template_path = command_template_path(slash_command)
    content = template_path.read_text(encoding="utf-8")

    for index, value in enumerate(args, start=1):
        content = content.replace(f"${index}", value)

    if "$ARGUMENTS" in content:
        joined_arguments = "\n\n".join(arg for arg in args if arg)
        content = content.replace("$ARGUMENTS", joined_arguments)

    return content


def prompt_claude_code(request: AgentPromptRequest) -> AgentPromptResponse:
    """Execute Claude Code with the configured prompt."""

    error_msg = check_claude_installed()
    if error_msg:
        return AgentPromptResponse(output=error_msg, success=False, session_id=None)

    save_prompt(request.prompt, request.adw_id, request.agent_name, request.slash_command)

    output_path = Path(request.output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [CLAUDE_PATH, "-p", request.prompt, "--model", request.model, "--output-format", "stream-json", "--verbose"]
    if request.dangerously_skip_permissions:
        cmd.append("--dangerously-skip-permissions")

    env = get_claude_env(cwd=request.cwd) or None

    try:
        with open(output_path, "w", encoding="utf-8") as handle:
            result = subprocess.run(
                cmd,
                stdout=handle,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
                cwd=request.cwd or project_root(),
            )
    except subprocess.TimeoutExpired:
        error = "Error: Claude Code command timed out"
        print(error, file=sys.stderr)
        return AgentPromptResponse(output=error, success=False, session_id=None)
    except Exception as exc:  # noqa: BLE001
        error = f"Error executing Claude Code: {exc}"
        print(error, file=sys.stderr)
        return AgentPromptResponse(output=error, success=False, session_id=None)

    if result.returncode != 0:
        error = f"Claude Code error: {result.stderr}"
        print(error, file=sys.stderr)
        return AgentPromptResponse(output=error, success=False, session_id=None)

    print(f"Output saved to: {output_path}")
    messages, result_message = parse_jsonl_output(str(output_path))
    convert_jsonl_to_json(str(output_path))

    if result_message:
        message = ClaudeCodeResultMessage(**result_message)
        return AgentPromptResponse(output=message.result, success=not message.is_error, session_id=message.session_id)

    raw_output = "".join(json.dumps(entry) + "\n" for entry in messages)
    return AgentPromptResponse(output=raw_output, success=True, session_id=None)


def execute_template(request: AgentTemplateRequest) -> AgentPromptResponse:
    """Execute a Claude Code template, writing output beneath the run log directory."""

    run_dir = run_logs_dir(request.adw_id) / request.agent_name
    run_dir.mkdir(parents=True, exist_ok=True)
    output_file = run_dir / "raw_output.jsonl"

    try:
        prompt = render_slash_command_prompt(request.slash_command, request.args)
    except FileNotFoundError as exc:
        return AgentPromptResponse(output=str(exc), success=False, session_id=None)

    prompt_request = AgentPromptRequest(
        prompt=prompt,
        adw_id=request.adw_id,
        agent_name=request.agent_name,
        model=request.model,
        dangerously_skip_permissions=True,
        output_file=str(output_file),
        slash_command=request.slash_command,
        cwd=request.cwd,
    )
    return prompt_claude_code(prompt_request)


__all__ = [
    "CLAUDE_PATH",
    "COMMANDS_ROOT",
    "AgentPromptRequest",
    "AgentPromptResponse",
    "AgentTemplateRequest",
    "ClaudeCodeResultMessage",
    "check_claude_installed",
    "command_template_path",
    "convert_jsonl_to_json",
    "execute_template",
    "get_claude_env",
    "parse_jsonl_output",
    "prompt_claude_code",
    "render_slash_command_prompt",
    "save_prompt",
]
