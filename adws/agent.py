"""Claude Code agent utilities for executing prompts programmatically."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

if __package__ is None or __package__ == "":
    import sys
    from pathlib import Path

    sys.path.append(str(Path(__file__).resolve().parent.parent))

from adws.data_types import (
    AgentPromptRequest,
    AgentPromptResponse,
    AgentTemplateRequest,
    ClaudeCodeResultMessage,
)
from adws.utils import load_adw_env, project_root, run_logs_dir

# Load environment variables for local execution contexts.
load_adw_env()

# Resolve Claude CLI path (defaults to "claude").
CLAUDE_PATH = os.getenv("CLAUDE_CODE_PATH", "claude")
COMMANDS_ROOT = project_root() / ".claude" / "commands"


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


def get_claude_env() -> Dict[str, str]:
    """Return the environment variables required for Claude Code execution."""

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
    """Return the on-disk path for a slash command template."""

    if not slash_command.startswith("/"):
        raise ValueError(f"Invalid slash command: {slash_command}")

    command_name = slash_command[1:]
    path = COMMANDS_ROOT / f"{command_name}.md"
    if not path.exists():
        raise FileNotFoundError(f"Prompt template not found for {slash_command} at {path}")
    return path


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

    env = get_claude_env() or None

    try:
        with open(output_path, "w", encoding="utf-8") as handle:
            result = subprocess.run(
                cmd,
                stdout=handle,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
                cwd=project_root(),
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
    )
    return prompt_claude_code(prompt_request)
