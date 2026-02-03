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
model: haiku|sonnet|opus
constraints:
  - Constraint description
---
```

## Available Agents

### Core Agents

| Agent | Purpose | Tool Access | Model |
|-------|---------|-------------|-------|
| scout-agent | Read-only codebase exploration | Glob, Grep, Read, MCP search | haiku |
| build-agent | File implementation and modification | Edit, Write, Bash, full toolset | sonnet |
| review-agent | Code review and analysis | Read-only + review-focused tools | haiku |
| docs-scraper | Documentation scraping and saving | WebFetch, Firecrawl, Write | sonnet |

### Expert Domains (4-Agent Pattern)

Expert domains provide structured expertise with a consistent 4-agent workflow: **plan** -> **build** -> **improve** -> **question**.

| Domain | Purpose | Location |
|--------|---------|----------|
| claude-config | .claude/ configuration management (commands, hooks, settings) | `experts/claude-config/` |
| agent-authoring | Agent creation and modification (frontmatter, tools, registry) | `experts/agent-authoring/` |

Each domain includes:
- **plan-agent**: Creates implementation specs and plans
- **build-agent**: Implements changes based on specs
- **improve-agent**: Evolves expertise and refines implementations
- **question-agent**: Answers questions (read-only, no approval needed)

## Agent Registry

For programmatic access to agent definitions, use `agent-registry.json`:

```json
{
  "agents": { ... },          // Agent definitions with tools and capabilities
  "capabilityIndex": { ... }, // Map capabilities to agent IDs
  "modelIndex": { ... },      // Map model tiers to agent IDs
  "toolMatrix": { ... }       // Map tools to agents that use them
}
```

### Capability Index
Find agents by what they can do:
- `explore`, `search`, `analyze` -> scout-agent
- `implement`, `modify`, `execute` -> build-agent
- `review`, `audit`, `quality` -> review-agent
- `scrape`, `fetch`, `document` -> docs-scraper

### Model Index
Select agents by model tier:
- `haiku` -> scout-agent, review-agent, question-agents (fast, read-only tasks)
- `sonnet` -> build-agent, docs-scraper, plan/build/improve-agents (balanced implementation)

## Tool Access Categories

### Read-Only Tools
- `Glob` - File pattern matching
- `Grep` - Content search
- `Read` - File reading
- `mcp__kotadb-bunx__search_code` - Code search via MCP
- `mcp__kotadb-bunx__search_dependencies` - Dependency analysis via MCP

### Write Tools
- `Edit` - File modification
- `Write` - File creation
- `Bash` - Shell command execution
- `NotebookEdit` - Jupyter notebook modification

### Analysis Tools
- `WebFetch` - URL content fetching
- `mcp__kotadb-bunx__analyze_change_impact` - Change impact analysis
- `mcp__firecrawl-mcp__firecrawl_scrape` - Web scraping

## Agent Selection Guidelines

1. **Exploration tasks** (understanding code, finding patterns) -> `scout-agent`
2. **Implementation tasks** (writing code, modifying files) -> `build-agent`
3. **Review tasks** (code review, quality checks) -> `review-agent`
4. **Documentation tasks** (scraping external docs) -> `docs-scraper`
5. **Configuration questions** -> `claude-config-question-agent`
6. **Agent authoring questions** -> `agent-authoring-question-agent`

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

## Adding New Expert Domains

To create a new expert domain:

1. Create directory: `experts/<domain-name>/`
2. Add 4 agent files following the pattern:
   - `<domain>-plan-agent.md`
   - `<domain>-build-agent.md`
   - `<domain>-improve-agent.md`
   - `<domain>-question-agent.md`
3. Create `expertise.yaml` with domain knowledge
4. Register all agents in `agent-registry.json`
5. Update CLAUDE.md Expert Domains section
