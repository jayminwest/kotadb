# /do Paradigm Implementation Spec

Technical specification for implementing root/branch/leaf agent hierarchy with forced delegation via tool restrictions.

## Architecture

```
.claude/
├── settings.json          # Tool restrictions (root/branch)
├── CLAUDE.md              # Root agent system prompt
├── commands/
│   └── do.md              # Entry point
├── agents/
│   ├── branch/
│   │   ├── plan.md        # Planning coordinator
│   │   ├── build.md       # Build coordinator
│   │   ├── review.md      # Review coordinator
│   │   └── meta.md        # Meta coordinator
│   └── leaf/
│       ├── retrieval.md   # Retrieval template
│       └── build.md       # Build template
└── servers/
    └── leaf-spawner/
        └── server.py      # MCP server (claude-agent-sdk wrapper)

.mcp.json                  # MCP server configuration
```

## The Bypass Mechanism

`settings.json` restrictions apply globally to all Claude Code CLI agents (main + Task subagents). Leaf agents spawned via MCP use `claude-agent-sdk` directly as external processes—they bypass CLI restrictions entirely.

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code CLI Process                                    │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Root Agent    │───▶│  Branch Agent   │                │
│  │  (Task tool)    │    │  (Task tool)    │                │
│  └─────────────────┘    └─────────────────┘                │
│           │                      │                          │
│           └──────────────────────┘                          │
│                      │                                      │
│         settings.json restrictions apply                    │
│         (no Write, Edit, Bash)                              │
└─────────────────────────────────────────────────────────────┘
                       │
                       │ MCP tool call
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  External Process (claude-agent-sdk)                        │
│  ┌─────────────────┐                                        │
│  │   Leaf Agent    │  ← Full tool access                    │
│  │  (Write, Edit,  │    (settings.json doesn't apply)       │
│  │   Bash, etc.)   │                                        │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## File 1: `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch",
      "mcp__leaf_spawner__spawn_leaf_agent",
      "mcp__leaf_spawner__get_agent_result",
      "mcp__leaf_spawner__list_agents"
    ],
    "deny": [
      "Write",
      "Edit",
      "Bash"
    ]
  }
}
```

---

## File 2: `.mcp.json`

```json
{
  "mcpServers": {
    "leaf_spawner": {
      "command": "uv",
      "args": [
        "run",
        "--with", "mcp",
        "--with", "claude-agent-sdk",
        "python",
        ".claude/servers/leaf-spawner/server.py"
      ],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
        "PROJECT_ROOT": "${PWD}"
      }
    }
  }
}
```

---

## File 3: `.claude/servers/leaf-spawner/server.py`

```python
#!/usr/bin/env python3
"""Leaf agent spawner - MCP server wrapping claude-agent-sdk."""
import asyncio
import json
import os
import uuid
from pathlib import Path
from mcp.server.fastmcp import FastMCP

AGENTS: dict[str, dict] = {}
mcp = FastMCP("leaf_spawner")


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
    try:
        from claude_agent_sdk import query, ClaudeAgentOptions

        opts = ClaudeAgentOptions(
            allowed_tools=AGENTS[agent_id]["tools"],
            cwd=os.environ.get("PROJECT_ROOT", "."),
            model=AGENTS[agent_id]["model"],
            system_prompt=template.get("system_prompt"),
            permission_mode="acceptEdits"
        )

        results = []
        async for msg in query(prompt=task, options=opts):
            if hasattr(msg, 'type') and msg.type == "result":
                if hasattr(msg, 'result'):
                    results.append(str(msg.result))

        AGENTS[agent_id]["status"] = "completed"
        AGENTS[agent_id]["result"] = "\n".join(results) or "Done"

    except Exception as e:
        AGENTS[agent_id]["status"] = "failed"
        AGENTS[agent_id]["result"] = f"Error: {e}"


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


if __name__ == "__main__":
    mcp.run(transport='stdio')
```

---

## File 4: `.claude/commands/do.md`

```markdown
# /do - Entry Point

Route to branch coordinators. Never implement directly.

## Rules
1. Cannot Write, Edit, Bash (denied in settings.json)
2. Classify requirement → spawn appropriate branch agent
3. Report result

## Routing

| Keywords | Branch |
|----------|--------|
| plan, research, find, investigate | branch_plan |
| implement, build, create, fix | branch_build |
| review, check, verify, test | branch_review |
| update prompts, improve agents | branch_meta |

## Execute

```
Task tool:
  subagent_type: "branch_plan" (or build/review/meta)
  prompt: "REQUIREMENT: {requirement}\n\nExecute workflow."
```
```

---

## File 5: `.claude/agents/branch/plan.md`

```markdown
---
name: branch_plan_coordinator
description: Planning via retrieval agents
tools: Read, Glob, Grep, WebFetch
---

# Plan Coordinator

Spawn retrieval agents to gather information, synthesize into plan.

## Workflow
1. Identify information needs
2. Spawn retrieval agents (parallel):
   ```
   mcp__leaf_spawner__spawn_leaf_agent(agent_type="retrieval", task="Find X")
   ```
3. Collect results: `mcp__leaf_spawner__get_agent_result(agent_id="...")`
4. Synthesize plan
5. Return to root

## Output
```
## Plan: {Summary}

### Findings
- Finding 1
- Finding 2

### Steps
1. Step 1
2. Step 2

### Files
- path/to/file.py
```
```

---

## File 6: `.claude/agents/branch/build.md`

```markdown
---
name: branch_build_coordinator
description: Implementation via build agents
tools: Read, Glob, Grep
---

# Build Coordinator

Spawn build agents to implement changes.

## Workflow
1. Receive plan/requirement
2. Decompose into file changes
3. Spawn build agents:
   ```
   mcp__leaf_spawner__spawn_leaf_agent(agent_type="build", task="Implement X in file.py")
   ```
4. Collect results
5. Report completion

## Parallelization
- Independent files → parallel spawn
- Dependent files → sequential

## Output
```
## Build Complete

### Modified
- file1.py: {change}
- file2.py: {change}

### Agents
- abc123: completed
- def456: completed
```
```

---

## File 7: `.claude/agents/branch/review.md`

```markdown
---
name: branch_review_coordinator
description: Validation via review agents
tools: Read, Glob, Grep
---

# Review Coordinator

Validate implementation against requirements.

## Workflow
1. Spawn retrieval agents to read requirements + implementation
2. Compare alignment
3. Report status

## Output
```
## Review

### Alignment
- [x] Requirement 1: OK
- [ ] Requirement 2: Missing X

### Quality
- Patterns: OK
- Tests: Missing

### Action
- Fix X before merge
```
```

---

## File 8: `.claude/agents/branch/meta.md`

```markdown
---
name: branch_meta_coordinator
description: System updates
tools: Read, Glob, Grep
---

# Meta Coordinator

Update .claude/ configuration via build agents.

## Scope
- Agent prompts
- Commands
- Settings (with caution)

## Safety
- Never modify permissions without explicit request
- Document all changes
```

---

## Leaf Templates

### `.claude/agents/leaf/retrieval.md`

```markdown
---
name: leaf_retrieval
tools: [Read, Glob, Grep, WebFetch, WebSearch]
model: haiku
---

Search and read files. Report findings with file paths and line numbers. Be concise.
```

### `.claude/agents/leaf/build.md`

```markdown
---
name: leaf_build
tools: [Read, Write, Edit, Bash, Glob, Grep]
model: sonnet
---

Implement code changes. Follow existing patterns. Minimal changes only.
```

---

## Model Selection

| Layer | Model | Rationale |
|-------|-------|-----------|
| Root | opus | High-stakes routing |
| Branch | sonnet | Coordination |
| Leaf (retrieval) | haiku | Simple search |
| Leaf (build) | sonnet | Code quality |

---

## Critical Implementation Details

### Single-Message Parallelism

Multiple MCP calls in ONE message = parallel execution:
```
# PARALLEL (single message with multiple tool calls)
spawn_leaf_agent(agent_type="retrieval", task="Find auth code")
spawn_leaf_agent(agent_type="retrieval", task="Find API routes")
spawn_leaf_agent(agent_type="retrieval", task="Check docs")

# SEQUENTIAL (separate messages)
Message 1: spawn_leaf_agent(...)
Message 2: spawn_leaf_agent(...)  # Waits for 1 to complete
```

### Context Isolation

Each leaf agent gets fresh context. They see only their task prompt—not root/branch conversation. This keeps coordinator context clean for orchestration logic.

### Permission Mode

Leaf agents use `permission_mode="acceptEdits"` to auto-approve file modifications. They're trusted workers executing delegated tasks.

---

## Production Additions

1. **Persistence**: Write `AGENTS` dict to `.claude/data/agents.json`
2. **Cost tracking**: Extract `msg.total_cost_usd` from ResultMessage
3. **Timeouts**: Configurable per agent type
4. **Hooks**: PreToolUse logging for observability
5. **Error types**: Granular error categorization
