#!/usr/bin/env python3
"""Leaf agent spawner - MCP server wrapping claude-agent-sdk."""
import asyncio
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from mcp.server.fastmcp import FastMCP

AGENTS: dict[str, dict] = {}
mcp = FastMCP("leaf_spawner")

# Auto-detect claude CLI path at startup for portability
CLAUDE_CLI_PATH: str | None = None


def _find_claude_cli() -> str | None:
    """Find the claude CLI binary, checking PATH and common locations."""
    # First, check PATH
    cli_path = shutil.which("claude")
    if cli_path:
        return cli_path

    # Check common installation locations (homebrew, npm global, local)
    common_paths = [
        "/opt/homebrew/bin/claude",  # macOS Homebrew ARM
        "/usr/local/bin/claude",     # macOS Homebrew Intel / Linux
        Path.home() / ".npm-global" / "bin" / "claude",
        Path.home() / ".local" / "bin" / "claude",
        Path.home() / "node_modules" / ".bin" / "claude",
        Path.home() / ".yarn" / "bin" / "claude",
    ]

    for path in common_paths:
        path = Path(path)
        if path.exists() and path.is_file():
            return str(path)

    return None


# Detect CLI path at module load time
CLAUDE_CLI_PATH = _find_claude_cli()


def load_template(name: str) -> dict:
    """Load from .claude/agents/leaf/{name}.md or use defaults."""
    project_root = Path(os.environ.get("PROJECT_ROOT", "."))
    path = project_root / ".claude" / "agents" / "leaf" / f"{name}.md"

    if path.exists():
        content = path.read_text()
        if content.startswith("---"):
            import yaml
            parts = content.split("---", 2)
            if len(parts) >= 3:
                fm = yaml.safe_load(parts[1])
                return {
                    "tools": fm.get("tools", ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]),
                    "model": fm.get("model", "sonnet"),
                    "system_prompt": parts[2].strip()
                }

    # Defaults
    defaults = {
        "retrieval": {"tools": ["Read", "Glob", "Grep", "WebFetch"], "model": "haiku"},
        "build": {"tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"], "model": "sonnet"},
        "review": {"tools": ["Read", "Glob", "Grep"], "model": "sonnet"}
    }
    return defaults.get(name, defaults["build"])


@mcp.tool()
async def spawn_leaf_agent(
    agent_type: str,
    task: str,
    tools: list[str] | None = None,
    model: str | None = None
) -> str:
    """Spawn a leaf agent.

    Args:
        agent_type: retrieval, build, review, or custom template name
        task: Task prompt
        tools: Override tools (optional)
        model: Override model - haiku, sonnet, opus (optional)
    """
    agent_id = str(uuid.uuid4())[:8]
    template = load_template(agent_type)

    AGENTS[agent_id] = {
        "id": agent_id,
        "type": agent_type,
        "task": task,
        "tools": tools or template.get("tools"),
        "model": model or template.get("model"),
        "status": "running",
        "result": None
    }

    asyncio.create_task(_run(agent_id, task, template))

    return json.dumps({"agent_id": agent_id, "status": "spawned"})


async def _run(agent_id: str, task: str, template: dict):
    """Execute via claude-agent-sdk."""
    import subprocess
    import sys

    # Build the SDK invocation as a subprocess to isolate from MCP event loop
    project_root = os.environ.get("PROJECT_ROOT", os.getcwd())
    tools_json = json.dumps(AGENTS[agent_id]["tools"])
    model = AGENTS[agent_id]["model"]
    system_prompt = template.get("system_prompt", "")

    # Use the auto-detected CLI path if available
    cli_path_arg = f"cli_path={repr(CLAUDE_CLI_PATH)}," if CLAUDE_CLI_PATH else ""

    script = f'''
import anyio
import json
from claude_agent_sdk import query, ClaudeAgentOptions

async def run():
    opts = ClaudeAgentOptions(
        {cli_path_arg}
        allowed_tools={tools_json},
        cwd={repr(project_root)},
        model={repr(model)},
        system_prompt={repr(system_prompt)} if {repr(system_prompt)} else None,
        permission_mode="acceptEdits"
    )

    results = []
    async for msg in query(prompt={repr(task)}, options=opts):
        msg_type = type(msg).__name__
        if msg_type == "ResultMessage":
            if hasattr(msg, 'result') and msg.result:
                results.append(str(msg.result))
        elif msg_type == "AssistantMessage" and hasattr(msg, 'content'):
            for block in msg.content:
                if type(block).__name__ == "TextBlock" and hasattr(block, 'text'):
                    results.append(block.text)

    print(json.dumps({{"status": "completed", "result": "\\n".join(results) if results else "Done"}}))

anyio.run(run)
'''

    try:
        # Ensure PATH includes common locations for claude CLI
        env = {**os.environ, "PROJECT_ROOT": project_root}
        current_path = env.get("PATH", "")
        homebrew_paths = "/opt/homebrew/bin:/usr/local/bin"
        if homebrew_paths not in current_path:
            env["PATH"] = f"{homebrew_paths}:{current_path}"

        result = subprocess.run(
            ["uv", "run", "--with", "claude-agent-sdk", "--with", "anyio", "python3", "-c", script],
            capture_output=True,
            text=True,
            timeout=120,
            env=env,
            cwd=project_root
        )

        if result.returncode == 0:
            try:
                output = json.loads(result.stdout.strip().split("\n")[-1])
                AGENTS[agent_id]["status"] = output.get("status", "completed")
                AGENTS[agent_id]["result"] = output.get("result", "Done")
            except json.JSONDecodeError:
                AGENTS[agent_id]["status"] = "completed"
                AGENTS[agent_id]["result"] = result.stdout.strip() or "Done"
        else:
            AGENTS[agent_id]["status"] = "failed"
            AGENTS[agent_id]["result"] = f"Error (exit {result.returncode}): {result.stderr or result.stdout}"
    except subprocess.TimeoutExpired:
        AGENTS[agent_id]["status"] = "failed"
        AGENTS[agent_id]["result"] = "Error: Agent execution timed out after 120 seconds"
    except Exception as e:
        import traceback
        AGENTS[agent_id]["status"] = "failed"
        AGENTS[agent_id]["result"] = f"Error: {e}\n{traceback.format_exc()}"


@mcp.tool()
async def spawn_parallel_agents(
    agents_config: list[dict],
    timeout: int = 120
) -> str:
    """Spawn multiple leaf agents in parallel.

    Args:
        agents_config: List of agent configurations, each containing:
            - agent_type: str (retrieval, build, review, or custom template)
            - task: str (task prompt)
            - tools: list[str] | None (optional tool override)
            - model: str | None (optional model override)
        timeout: Per-agent timeout in seconds (default: 120)

    Returns:
        JSON with aggregated results from all agents
    """
    # Validation
    if not isinstance(agents_config, list):
        return json.dumps({
            "status": "failed",
            "error": "agents_config must be a list"
        })

    if len(agents_config) == 0:
        return json.dumps({
            "status": "failed",
            "error": "agents_config cannot be empty"
        })

    if len(agents_config) > 20:
        return json.dumps({
            "status": "failed",
            "error": f"Maximum 20 agents allowed, got {len(agents_config)}"
        })

    # Validate each agent config
    for i, config in enumerate(agents_config):
        if not isinstance(config, dict):
            return json.dumps({
                "status": "failed",
                "error": f"Agent config at index {i} must be a dict"
            })
        if "agent_type" not in config:
            return json.dumps({
                "status": "failed",
                "error": f"Agent config at index {i} missing required field 'agent_type'"
            })
        if "task" not in config:
            return json.dumps({
                "status": "failed",
                "error": f"Agent config at index {i} missing required field 'task'"
            })

    start_time = time.time()
    agent_ids = []

    # Spawn all agents
    for config in agents_config:
        agent_id = str(uuid.uuid4())[:8]
        agent_type = config["agent_type"]
        task = config["task"]
        tools = config.get("tools")
        model = config.get("model")

        template = load_template(agent_type)

        AGENTS[agent_id] = {
            "id": agent_id,
            "type": agent_type,
            "task": task,
            "tools": tools or template.get("tools"),
            "model": model or template.get("model"),
            "status": "running",
            "result": None
        }

        agent_ids.append(agent_id)
        asyncio.create_task(_run(agent_id, task, template))

    # Wait for all agents to complete with timeout
    async def wait_for_agent(agent_id: str, timeout: int) -> dict:
        """Wait for a specific agent with individual timing."""
        agent_start = time.time()
        elapsed = 0

        while elapsed < timeout:
            agent = AGENTS.get(agent_id)
            if not agent:
                return {
                    "agent_id": agent_id,
                    "agent_type": "unknown",
                    "status": "failed",
                    "result": None,
                    "error": "Agent not found",
                    "duration_seconds": elapsed
                }

            if agent["status"] != "running":
                agent_duration = time.time() - agent_start
                return {
                    "agent_id": agent_id,
                    "agent_type": agent["type"],
                    "status": agent["status"],
                    "result": agent["result"] if agent["status"] == "completed" else None,
                    "error": agent["result"] if agent["status"] == "failed" else None,
                    "duration_seconds": round(agent_duration, 2)
                }

            await asyncio.sleep(0.5)
            elapsed = time.time() - agent_start

        # Timeout reached
        agent = AGENTS.get(agent_id, {})
        return {
            "agent_id": agent_id,
            "agent_type": agent.get("type", "unknown"),
            "status": "timeout",
            "result": None,
            "error": f"Agent timed out after {timeout} seconds",
            "duration_seconds": timeout
        }

    # Gather all results (asyncio.gather doesn't fail if individual tasks timeout)
    agent_results = await asyncio.gather(
        *[wait_for_agent(agent_id, timeout) for agent_id in agent_ids],
        return_exceptions=False
    )

    # Calculate summary
    total_duration = time.time() - start_time
    completed_count = sum(1 for r in agent_results if r["status"] == "completed")
    failed_count = sum(1 for r in agent_results if r["status"] == "failed")
    timeout_count = sum(1 for r in agent_results if r["status"] == "timeout")

    # Determine overall status
    if completed_count == len(agent_results):
        overall_status = "completed"
    elif completed_count > 0:
        overall_status = "partial"
    else:
        overall_status = "failed"

    return json.dumps({
        "status": overall_status,
        "agents": agent_results,
        "summary": {
            "total": len(agent_results),
            "completed": completed_count,
            "failed": failed_count,
            "timeout": timeout_count,
            "total_duration_seconds": round(total_duration, 2)
        }
    }, indent=2)


@mcp.tool()
async def get_agent_result(agent_id: str, wait: bool = True, timeout: int = 120) -> str:
    """Get agent result.

    Args:
        agent_id: Agent ID from spawn_leaf_agent
        wait: Wait for completion
        timeout: Max wait seconds
    """
    if agent_id not in AGENTS:
        return json.dumps({"error": "Agent not found"})

    if wait and AGENTS[agent_id]["status"] == "running":
        for _ in range(timeout):
            if AGENTS[agent_id]["status"] != "running":
                break
            await asyncio.sleep(1)

    return json.dumps(AGENTS[agent_id])


@mcp.tool()
async def list_agents() -> str:
    """List all agents."""
    return json.dumps([
        {"id": a["id"], "type": a["type"], "status": a["status"]}
        for a in AGENTS.values()
    ])


@mcp.tool()
async def get_diagnostics() -> str:
    """Get diagnostic info about the leaf spawner configuration."""
    return json.dumps({
        "claude_cli_path": CLAUDE_CLI_PATH,
        "project_root": os.environ.get("PROJECT_ROOT", "not set"),
        "path_env": os.environ.get("PATH", "not set")[:500],  # Truncate for readability
        "anthropic_api_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "agents_count": len(AGENTS)
    })


if __name__ == "__main__":
    mcp.run(transport='stdio')
