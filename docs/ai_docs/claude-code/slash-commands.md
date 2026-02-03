---
title: Extend Claude with Skills (Slash Commands)
source: https://code.claude.com/docs/en/skills
date: 2026-01-30
---

# Extend Claude with Skills (Slash Commands)

Skills (also known as slash commands) are reusable prompts that extend Claude Code's capabilities. They allow you to create custom workflows, automate repetitive tasks, and share standardized approaches across your team.

## Overview

Skills are markdown files that contain instructions for Claude. When invoked with a slash command, Claude receives the skill's content as context and follows its instructions.

## Creating Skills

Skills are markdown files stored in specific locations. The filename (without extension) becomes the command name.

### Basic Skill Structure

Create a file at `.claude/commands/my-skill.md`:

```markdown
---
description: Brief description shown in command list
---

# My Skill

Instructions for Claude to follow when this skill is invoked.

You can include:
- Step-by-step instructions
- Code examples
- Constraints and guidelines
```

## SKILL.md Format

Skills use markdown with optional YAML frontmatter for configuration.

### Frontmatter Fields

```yaml
---
description: Short description for help text
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
model: claude-sonnet-4-5-20250514
temperature: 0.7
---
```

| Field | Description |
|-------|-------------|
| `description` | Brief description shown when listing commands |
| `allowed-tools` | Restrict which tools the skill can use |
| `model` | Override the default model for this skill |
| `temperature` | Adjust response randomness (0.0-1.0) |

### Markdown Body

The body contains instructions for Claude:

```markdown
---
description: Generate unit tests for a file
---

# Generate Tests

When the user provides a file path, generate comprehensive unit tests following these guidelines:

1. Use the project's existing test framework
2. Cover edge cases and error conditions
3. Follow the AAA pattern (Arrange, Act, Assert)
4. Mock external dependencies appropriately

## Output Format

Create the test file in the same directory with `.test.ts` extension.
```

## Where Skills Live

Skills can be stored at multiple levels:

### Project Skills

Located in `.claude/commands/` within your project:

```
.claude/
  commands/
    review.md         -> /project:review
    test.md           -> /project:test
    deploy/
      staging.md      -> /project:deploy:staging
      production.md   -> /project:deploy:production
```

### User Skills

Located in `~/.claude/commands/` for personal skills available across all projects:

```
~/.claude/
  commands/
    format.md         -> /user:format
    snippet.md        -> /user:snippet
```

### Nested Skills

Organize skills in directories for namespacing:

```
.claude/
  commands/
    git/
      commit.md       -> /project:git:commit
      pr.md           -> /project:git:pr
    db/
      migrate.md      -> /project:db:migrate
      seed.md         -> /project:db:seed
```

## Argument Handling

Skills can accept arguments from the user.

### Positional Arguments

Arguments after the command are available as `$ARGUMENTS`:

```markdown
---
description: Search codebase for a pattern
---

Search the codebase for: $ARGUMENTS

Use Grep to find all occurrences and summarize the results.
```

Usage: `/project:search authentication logic`

### Structured Arguments

For complex inputs, use placeholders:

```markdown
---
description: Create a new component
---

Create a new React component with:
- Name: $ARGUMENTS
- Follow the project's component patterns
- Include TypeScript types
- Add basic unit tests
```

### File Context

Reference the current file or selection:

```markdown
---
description: Explain the current code
---

Explain the following code in detail:

$SELECTION

If no selection, explain the entire file: $FILE
```

## Running Skills in Subagents

Skills can spawn subagents for complex workflows:

### Delegating Work

```markdown
---
description: Review and improve code quality
allowed-tools: [Read, Task]
---

# Code Quality Review

1. First, use the Task tool to analyze the codebase structure
2. Identify areas needing improvement
3. Use Task tool to implement fixes in parallel
4. Summarize all changes made
```

### Chaining Skills

Skills can invoke other skills:

```markdown
---
description: Full release workflow
---

Execute the following workflow:

1. Run /project:test to ensure tests pass
2. Run /project:lint to check code quality
3. Run /project:build to create production build
4. Run /project:deploy:staging for staging deployment
```

## Best Practices

### Keep Skills Focused

Each skill should do one thing well:

```markdown
---
description: Format code according to project standards
---

Format the provided code using the project's Prettier configuration.
Do not modify logic, only formatting.
```

### Provide Clear Instructions

Be explicit about expectations:

```markdown
---
description: Create database migration
---

# Create Migration

Generate a database migration with:

1. **Naming**: Use timestamp prefix (YYYYMMDDHHMMSS_description.sql)
2. **Location**: Place in `migrations/` directory
3. **Content**: Include both UP and DOWN migrations
4. **Safety**: Ensure migrations are reversible

Do NOT:
- Drop columns without confirmation
- Modify production-critical tables without warning
```

### Document Edge Cases

```markdown
---
description: Refactor function for readability
---

# Refactor Guidelines

Improve code readability while:
- Preserving all existing functionality
- Maintaining backward compatibility
- Keeping the same public API

If the refactoring would change behavior, stop and explain the implications before proceeding.
```

## Listing Available Commands

View all available skills:

```bash
claude /help
```

Or within a session, type `/` to see command suggestions.
