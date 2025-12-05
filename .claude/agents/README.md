# Claude Code Agents

This directory contains agent definitions for Claude Code. Agents are specialized configurations that define tool access, capabilities, and behavioral constraints for specific use cases.

## Agent Structure

Each agent definition follows a standard frontmatter format:

```yaml
---
name: agent-name
description: Brief description of agent purpose
tools:
  - Tool1
  - Tool2
constraints:
  - Constraint description
---
```

## Available Agents

| Agent | Purpose | Tool Access | Model |
|-------|---------|-------------|-------|
| scout-agent | Read-only codebase exploration | Glob, Grep, Read, MCP search | haiku |
| build-agent | File implementation and modification | Edit, Write, Bash, full toolset | sonnet |
| review-agent | Code review and analysis | Read-only + review-focused tools | haiku |
| orchestrator-agent | Multi-agent coordination | Task, SlashCommand, delegation | opus |

## Agent Registry

For programmatic access to agent definitions, use `agent-registry.json`:

```json
{
  "agents": { ... },        // Agent definitions with tools and capabilities
  "capabilityIndex": { ... }, // Map capabilities to agent IDs
  "modelIndex": { ... },      // Map model tiers to agent IDs
  "toolMatrix": { ... }       // Map tools to agents that use them
}
```

### Capability Index
Find agents by what they can do:
- `explore`, `search`, `analyze` → scout-agent
- `implement`, `modify`, `execute` → build-agent
- `review`, `audit`, `quality` → review-agent
- `orchestrate`, `coordinate`, `delegate` → orchestrator-agent

### Model Index
Select agents by model tier:
- `haiku` → scout-agent, review-agent (fast, read-only tasks)
- `sonnet` → build-agent (balanced implementation)
- `opus` → orchestrator-agent (complex coordination)

## Tool Access Categories

### Read-Only Tools
- `Glob` - File pattern matching
- `Grep` - Content search
- `Read` - File reading
- `mcp__kotadb__search_code` - Code search via MCP
- `mcp__kotadb__search_dependencies` - Dependency analysis via MCP

### Write Tools
- `Edit` - File modification
- `Write` - File creation
- `Bash` - Shell command execution
- `NotebookEdit` - Jupyter notebook modification

### Analysis Tools
- `WebFetch` - URL content fetching
- `WebSearch` - Web search
- `mcp__kotadb__analyze_change_impact` - Change impact analysis

## Agent Selection Guidelines

1. **Exploration tasks** (understanding code, finding patterns) → `scout-agent`
2. **Implementation tasks** (writing code, modifying files) → `build-agent`
3. **Review tasks** (code review, quality checks) → `review-agent`

## Integration with Commands

Slash commands can specify preferred agents using frontmatter:

```yaml
---
preferred_agent: scout-agent
---
```

This signals to orchestration systems which agent profile best suits the command's requirements.

## Adding New Agents

When creating new agent definitions:

1. Copy `agent-template.md` as your starting point
2. Use the frontmatter format with `name`, `description`, `tools`, `model`, and `constraints`
3. List specific tool names (not patterns)
4. Document constraints clearly
5. Add entry to the Available Agents table above
6. Add entry to `agent-registry.json` with capabilities and tools
7. Update capability and model indexes in the registry
8. Consider whether existing agents could be extended instead
