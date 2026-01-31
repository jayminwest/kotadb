---
title: Create custom subagents
source: https://code.claude.com/docs/en/sub-agents
date: 2026-01-30
---

# Create Custom Subagents

Subagents are specialized Claude instances that can be spawned to handle specific tasks. They run with their own context, tools, and instructions, enabling parallel work and domain specialization.

## Overview

Subagents enable:
- Parallel task execution
- Specialized domain expertise
- Isolated contexts for focused work
- Reduced token usage through task delegation

## Built-in Subagents

Claude Code includes several built-in subagents:

### Explore Agent

The Explore agent is optimized for codebase exploration and understanding:

- **Purpose**: Navigate and understand code structure
- **Tools**: Read, Glob, Grep (read-only operations)
- **Use case**: Answering questions about code, finding implementations

```
Use the Task tool to explore how authentication is implemented in this codebase.
```

### Plan Agent

The Plan agent creates structured implementation plans:

- **Purpose**: Break down complex tasks into steps
- **Tools**: Read, Glob, Grep (read-only)
- **Use case**: Creating detailed plans before implementation

```
Use the Task tool to create a plan for adding user roles to the system.
```

### General-Purpose Agent

The default agent for implementation tasks:

- **Purpose**: Execute code changes and build features
- **Tools**: Full tool access (Read, Write, Edit, Bash, etc.)
- **Use case**: Implementing features, fixing bugs

## Creating Subagents

Custom subagents are defined as markdown files in `.claude/agents/`:

### Basic Structure

Create `.claude/agents/my-agent.md`:

```markdown
---
name: My Agent
description: Brief description of agent's purpose
tools:
  - Read
  - Write
  - Edit
  - Bash
---

# My Agent

You are a specialized agent for [specific purpose].

## Capabilities

- Capability 1
- Capability 2

## Guidelines

Follow these rules when executing tasks:

1. Rule 1
2. Rule 2

## Constraints

Do NOT:
- Constraint 1
- Constraint 2
```

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name for the agent |
| `description` | string | Brief description shown when selecting agents |
| `tools` | array | List of allowed tools |
| `model` | string | Override default model |
| `temperature` | number | Response randomness (0.0-1.0) |
| `max_tokens` | number | Maximum response length |

## Tools and Permissions

Control which tools a subagent can access:

### Read-Only Agent

```yaml
---
name: Analyzer
description: Analyzes code without modifications
tools:
  - Read
  - Glob
  - Grep
---
```

### Full Access Agent

```yaml
---
name: Builder
description: Implements features and fixes
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - NotebookEdit
---
```

### Limited Bash Agent

```yaml
---
name: Tester
description: Runs tests only
tools:
  - Read
  - Glob
  - Grep
  - Bash
allowed_commands:
  - "bun test"
  - "npm test"
  - "pytest"
---
```

## Invoking Subagents

### Via Task Tool

Use the Task tool to spawn a subagent:

```
Use the Task tool with the "analyzer" agent to review the authentication module.
```

### Automatic Selection

Claude Code may automatically select appropriate subagents based on task type.

### Explicit Selection

Specify the agent in your prompt:

```
Using the database-expert agent, create a migration for the users table.
```

## Agent Examples

### Code Reviewer Agent

```markdown
---
name: Code Reviewer
description: Reviews code for quality and best practices
tools:
  - Read
  - Glob
  - Grep
---

# Code Reviewer

You are a code review specialist. Analyze code for:

## Quality Checks

- Code clarity and readability
- Proper error handling
- Performance considerations
- Security vulnerabilities
- Test coverage

## Review Format

Provide feedback in this structure:

### Summary
Brief overview of findings

### Issues
- **Critical**: Must fix before merge
- **Major**: Should fix
- **Minor**: Nice to fix

### Suggestions
Improvements that could enhance the code

## Guidelines

- Be constructive, not critical
- Explain the "why" behind suggestions
- Provide code examples when helpful
```

### Database Expert Agent

```markdown
---
name: Database Expert
description: Handles database schema and query optimization
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Database Expert

You specialize in database operations:

## Capabilities

- Schema design and migrations
- Query optimization
- Index recommendations
- Data integrity constraints

## Conventions

- Use snake_case for table and column names
- Always include created_at and updated_at timestamps
- Define foreign key constraints explicitly
- Write reversible migrations

## Safety Rules

1. Never DROP tables without explicit confirmation
2. Always backup before destructive operations
3. Test migrations on sample data first
```

## Hooks

Subagents can define hooks for lifecycle events:

### Available Hooks

| Hook | Trigger |
|------|---------|
| `on_start` | When agent begins execution |
| `on_complete` | When agent finishes successfully |
| `on_error` | When agent encounters an error |
| `pre_tool` | Before each tool execution |
| `post_tool` | After each tool execution |

### Hook Configuration

```yaml
---
name: Cautious Builder
tools:
  - Read
  - Write
  - Edit
hooks:
  pre_tool:
    - command: echo "Executing: $TOOL_NAME"
  on_complete:
    - command: bun test
---
```

## Best Practices

### Single Responsibility

Each agent should have a clear, focused purpose:

```markdown
---
name: Test Writer
description: Creates unit tests only
---

You write unit tests. Do not modify production code.
```

### Clear Boundaries

Define what the agent should NOT do:

```markdown
## Constraints

- Do NOT modify files outside the `tests/` directory
- Do NOT delete existing tests
- Do NOT mock external services (use real implementations)
```

### Appropriate Tool Access

Grant only necessary permissions:

```yaml
# Good: Minimal required tools
tools:
  - Read
  - Glob

# Avoid: Excessive permissions for read-only task
tools:
  - Read
  - Write
  - Edit
  - Bash
```

### Documentation

Include usage examples in agent definitions:

```markdown
## Usage Examples

**Create component tests:**
```
Use the test-writer agent to create tests for src/components/Button.tsx
```

**Add integration tests:**
```
Use the test-writer agent to add integration tests for the auth flow
```
```
