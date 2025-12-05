---
# Agent Definition Template
# Copy this file and customize for new agents
# All fields are required unless marked optional

name: your-agent-name
# Unique identifier using kebab-case (e.g., scout-agent, build-agent)

description: Brief description of agent purpose
# One-line summary of what this agent does

tools:
  # List specific tool names the agent can use
  # Common read-only tools:
  - Glob
  - Grep
  - Read
  # Common write tools (use sparingly):
  # - Edit
  # - Write
  # - Bash
  # MCP tools:
  # - mcp__kotadb__search_code
  # - mcp__kotadb__search_dependencies
  # Delegation:
  # - Task

model: sonnet
# Optional: Preferred model tier
# - haiku: Fast, cost-effective for read-only tasks
# - sonnet: Default, balanced for most tasks
# - opus: Complex reasoning, orchestration

constraints:
  # Behavioral boundaries for the agent
  - Constraint description 1
  - Constraint description 2
---

# Agent Name

Brief introduction paragraph explaining the agent's role.

## Purpose

Describe the primary use cases for this agent:
- Use case 1
- Use case 2
- Use case 3

## Approved Tools

### Category 1 (e.g., File Discovery)
- **ToolName**: Brief description of how this agent uses the tool

### Category 2 (e.g., Analysis)
- **ToolName**: Brief description of how this agent uses the tool

## Constraints

1. **Constraint name**: Detailed explanation of the constraint
2. **Constraint name**: Detailed explanation of the constraint

## Use Cases

Example queries or tasks this agent handles well:
- "Example query 1"
- "Example query 2"
- "Example query 3"

## Output Expectations

Describe the expected output format and content:
- What information should be included
- How it should be structured
- Any specific formatting requirements

## Anti-Patterns

List things this agent should NOT do:
- Anti-pattern 1
- Anti-pattern 2
