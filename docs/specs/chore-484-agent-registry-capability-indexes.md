# Chore Plan: Complete Agent Registry with Capability and Model Indexes

## Context
- Issue #484 requests completing the agent registry system started in #474
- Foundation exists: `.claude/agents/` directory with scout, build, and review agents
- Missing: `agent-template.md`, `orchestrator-agent.md`, `agent-registry.json` with indexes
- This enables the Task tool to invoke specialized agents with proper tool access boundaries
- Part of epic #481 (overhaul .claude/ directory)

## Relevant Files
- `.claude/agents/README.md` — existing agent documentation, needs registry reference added
- `.claude/agents/scout-agent.md` — existing agent, will be indexed in registry
- `.claude/agents/build-agent.md` — existing agent, will be indexed in registry
- `.claude/agents/review-agent.md` — existing agent, will be indexed in registry

### New Files
- `.claude/agents/agent-template.md` — reference template for creating new agents
- `.claude/agents/orchestrator-agent.md` — multi-agent coordination agent definition
- `.claude/agents/agent-registry.json` — machine-readable registry with capability and model indexes

## Work Items
### Preparation
- Verify on correct branch `chore/484-agent-registry-capability-indexes`
- Ensure clean working directory

### Execution
1. Create `agent-template.md` with YAML frontmatter format and documentation structure
2. Create `orchestrator-agent.md` with Task, SlashCommand, Read, Glob, Grep tools
3. Create `agent-registry.json` with schema, all agent definitions, and indexes
4. Update `README.md` to reference the registry and orchestrator agent

### Follow-up
- Run validation commands
- Verify JSON schema validates
- Push branch for review

## Step by Step Tasks

### 1. Create Agent Template
- Create `.claude/agents/agent-template.md` as reference for new agent creation
- Include YAML frontmatter with: name, description, tools, model, constraints
- Document required sections: Purpose, Approved Tools, Constraints, Use Cases, Output Expectations
- Include guidance comments explaining each field

### 2. Create Orchestrator Agent
- Create `.claude/agents/orchestrator-agent.md` for multi-agent coordination
- Tools: Task, SlashCommand, Read, Glob, Grep (read-only + delegation)
- Constraints: no direct file modifications, delegates to build-agent
- Document: coordination patterns, parallel agent spawning, state management

### 3. Create Agent Registry JSON
- Create `.claude/agents/agent-registry.json` with schema validation metadata
- Include all 4 agents (scout, build, review, orchestrator)
- Add `capabilityIndex` mapping capabilities to agent IDs:
  - explore, search, analyze → scout-agent
  - implement, modify, execute → build-agent
  - review, audit, quality → review-agent
  - orchestrate, coordinate, delegate → orchestrator-agent
- Add `modelIndex` mapping model tiers to agent IDs:
  - haiku → scout-agent, review-agent (fast, read-only)
  - sonnet → build-agent (default implementation)
  - opus → orchestrator-agent (complex coordination)
- Include toolMatrix showing tool access per agent

### 4. Update README
- Update `.claude/agents/README.md` to include orchestrator in table
- Add reference to `agent-registry.json` for programmatic access
- Document capability and model index usage patterns

### 5. Validate and Push
- Run validation commands to ensure no regressions
- Verify JSON parses correctly with `bunx json5`
- Push branch: `git push -u origin chore/484-agent-registry-capability-indexes`

## Risks
- **JSON schema validation**: Registry JSON must be valid → test with JSON parser before commit
- **Agent tool consistency**: Ensure registry tools match agent file tools → cross-reference during implementation
- **Frontmatter format**: Must match existing agent patterns → use scout-agent.md as reference

## Validation Commands
- `cd app && bun run lint`
- `cd app && bunx tsc --noEmit`
- `cd app && bun test`
- `bunx json5 .claude/agents/agent-registry.json` (verify JSON validity)

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- Use direct statements: `chore(agents): add agent registry with capability indexes`

## Deliverables
- `.claude/agents/agent-template.md` — reference template
- `.claude/agents/orchestrator-agent.md` — orchestrator agent definition
- `.claude/agents/agent-registry.json` — machine-readable registry with indexes
- `.claude/agents/README.md` — updated documentation
