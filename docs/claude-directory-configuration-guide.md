# Comprehensive Guide to Claude Code `.claude/` Directory Configuration

**For Maximum Agentic Accuracy and Leverage**

---

> **The prompt is THE fundamental unit of engineering.**
>
> Invest in your prompts for the trifecta to achieve asymmetric engineering in the age of agents.
>
> **Guiding Philosophy: One agent, one purpose, one prompt**

---

## Table of Contents

1. [Introduction](#introduction)
2. [The Virtuous Feedback Cycle](#the-virtuous-feedback-cycle)
3. [Agentic Prompt Engineering](#agentic-prompt-engineering)
4. [Directory Structure Overview](#directory-structure-overview)
5. [CLAUDE.md - The Gateway Document](#claudemd---the-gateway-document)
6. [Slash Commands](#slash-commands)
7. [Agents (Sub-agents)](#agents-sub-agents)
8. [Expert System Architecture](#expert-system-architecture)
9. [Hooks and Automation](#hooks-and-automation)
10. [Settings and Configuration](#settings-and-configuration)
11. [System Prompts vs User Prompts](#system-prompts-vs-user-prompts)
12. [Best Practices](#best-practices)
13. [Common Pitfalls](#common-pitfalls)
14. [Quick Start Template](#quick-start-template)
15. [Documentation Scraping Pattern](#documentation-scraping-pattern)

---

## Introduction

The `.claude/` directory is the configuration center for Claude Code, enabling sophisticated multi-agent workflows, slash commands, automation hooks, and expert systems. When properly configured, it creates a "Pit of Success" architecture where writing correct, high-quality code becomes easier than writing incorrect code.

This guide teaches you how to configure the `.claude/` directory for maximum agentic accuracy and leverage, based on production patterns from enterprise-scale monorepos.

### Who This Guide Is For

- **Advanced users** seeking expert-level configuration patterns
- **Any project type** - patterns are language/framework agnostic
- **Full ecosystem coverage** - from basic commands to self-improving expert systems

---

## The Virtuous Feedback Cycle

The foundational philosophy behind effective `.claude/` configuration:

```
Consistent Code Patterns → Better Context for AI Agents → Higher Quality Agent Output → Reinforces Patterns
```

**Why this matters:**
1. **Consistent patterns** reduce cognitive load for AI agents parsing your codebase
2. **Better context** enables agents to understand intent and constraints
3. **Higher quality output** means fewer iterations and corrections
4. **Reinforced patterns** create compounding improvements over time

Every configuration decision should ask: "Does this make patterns more consistent and discoverable?"

---

## Agentic Prompt Engineering

Understanding the hierarchy of prompt sophistication is essential for building effective `.claude/` configurations.

### The 7 Levels of Agentic Prompt Formats

Each level builds upon the previous, adding capabilities and complexity:

#### Level 1: High Level Prompt

> Reusable, ad-hoc, static prompt.

**Purpose**: Reference documentation and simple guidance.

**Required Sections**:
- `# Title`
- High Level Prompt content (required)
- `## Purpose`

**Example Use Cases**:
- Architecture principles
- Code standards
- Quick references

---

#### Level 2: Workflow Prompt

> Sequential workflow prompt with input, work, and output.

**Purpose**: Execute a defined sequence of steps.

**Required Sections**:
- `Metadata` (frontmatter)
- `## Workflow` (required)
- `## Instructions` (secondary)
- `## Variables` (secondary)
- `## Report` (secondary)
- `## Relevant Files`
- `## Codebase Structure`
- ...plus all Level 1 sections

**Example Use Cases**:
- Build processes
- Priming environments
- Quick planning tasks

---

#### Level 3: Control Flow Prompt

> A prompt that runs conditions and/or loops in the workflow.

**Purpose**: Handle branching logic, conditionals, and iteration.

**Adds**:
- Conditional decision trees
- If/else logic in Instructions
- Environment detection
- Fallback patterns
- Loop constructs

**Example Use Cases**:
- Environment-aware builds
- Conditional image generation
- Iterative refinement tasks

---

#### Level 4: Delegate Prompt

> A prompt that delegates work to other agents (primary or sub-agents).

**Purpose**: Orchestrate multiple agents for complex tasks.

**Adds**:
- `## Variables` with agent configuration (model, count, tools)
- Task tool invocations
- Parallel agent spawning
- Result aggregation

**Example Use Cases**:
- Parallel sub-agent execution
- Documentation loading across sources
- Background task management

---

#### Level 5: Higher Order Prompt

> Accept another reusable prompt (file) as input. Provides consistent structure so the lower level prompt can be changed.

**Purpose**: Create composable, swappable prompt components.

**Adds**:
- `## Variables` with prompt file variable (required)
- File path resolution
- Context injection from external prompts

**Example Use Cases**:
- Build commands that accept spec files
- Context bundle loaders
- Template-driven workflows

---

#### Level 6: Template Metaprompt

> A prompt used to create a new prompt in a specific dynamic format.

**Purpose**: Generate new prompts programmatically.

**Adds**:
- `## Template` (required)
- Dynamic prompt generation
- Format validation

**Example Use Cases**:
- Workflow template generators
- Framework-specific plan generators
- Prompt factories

---

#### Level 7: Self-Improving Prompt

> A prompt that is updated by itself or another prompt/agent with new information.

**Purpose**: Accumulate knowledge over time.

**Adds**:
- `## Expertise` (required)
- Self-update mechanisms
- Knowledge persistence across sessions

**Key Insight**: The Expertise section can be self-improving, but works best when a separate `_improve` prompt is dedicated to updating the expertise.

**Example Use Cases**:
- Domain expert commands
- Pattern libraries that evolve with the codebase
- Learning systems

---

### Agentic Prompt Sections Reference

An ordered list of common and rare sections you can use to build prompts:

| Section | Purpose |
|---------|---------|
| `Metadata` | YAML frontmatter with `allowed-tools`, `description`, `argument-hint`, `model` |
| `# Title` | Main heading - clear, action-oriented name |
| `## Purpose` | High-level description of what the prompt accomplishes |
| `## Variables` | Dynamic (`$1`, `$2`, `$ARGUMENTS`) and static variable definitions |
| `## Instructions` | Specific guidelines, rules, and constraints |
| `## Relevant Files` | Files or patterns the prompt needs to access |
| `## Codebase Structure` | Expected directory layout and organization |
| `## Workflow` | Core execution steps as numbered list |
| `## Expertise` | Accumulated knowledge that evolves over time (Level 7) |
| `## Template` | Reusable patterns or boilerplate structures (Level 6) |
| `## Examples` | Concrete usage scenarios with expected outcomes |
| `## Report` | How results should be presented after execution |

#### Section Details

**Metadata**
```yaml
---
description: Brief command description
argument-hint: <required-input>
allowed-tools: Read, Write, Bash
model: sonnet
---
```

**Variables**
```markdown
## Variables

USER_PROMPT: $ARGUMENTS
CONFIG_PATH: ./config.json
MAX_RETRIES: 3
```
Reference throughout the prompt using `{{variable_name}}` syntax.

**Workflow**
```markdown
## Workflow

1. **Gather Context**
   - Read configuration file
   - Identify target files

2. **Execute Task**
   - Process each file
   - Handle errors gracefully

3. **Report Results**
   - Summarize changes
   - List any issues
```

**Expertise**
```markdown
## Expertise

### Domain Knowledge

**Discovered Patterns:**
- Pattern A: [Description with code example]
- Pattern B: [Description with code example]

**Anti-Patterns to Avoid:**
- [What not to do and why]

**Best Practices:**
- [Accumulated wisdom from codebase analysis]
```

---

## Directory Structure Overview

```
.claude/
├── agents/                     # Sub-agent definitions
│   ├── agent-registry.json     # Machine-readable agent index
│   ├── agent-template.md       # Template for new agents
│   ├── scout-agent.md          # Read-only exploration
│   ├── build-agent.md          # Implementation specialist
│   ├── planning-council.md     # Multi-expert planning
│   ├── review-panel.md         # Multi-expert review
│   └── ...                     # Additional specialized agents
│
├── commands/                   # Slash commands (60+ files)
│   ├── README.md               # Command taxonomy and standards
│   ├── workflows/              # SDLC phases (plan, implement, validate)
│   ├── issues/                 # GitHub issue management
│   ├── git/                    # Version control operations
│   ├── testing/                # Test utilities
│   ├── architecture/           # Design patterns and principles
│   ├── docs/                   # Documentation helpers
│   ├── experts/                # Domain expert commands
│   │   ├── orchestrators/      # Multi-agent coordination
│   │   ├── architecture-expert/
│   │   ├── testing-expert/
│   │   ├── security-expert/
│   │   └── ...
│   └── ...                     # Additional categories
│
├── hooks/                      # Python automation hooks
│   ├── auto_linter.py          # Post-write linting
│   ├── context_bundle_builder.py
│   └── utils/                  # Shared utilities
│
├── docs/                       # Internal documentation
│   └── prompt-levels.md        # 7-level maturity model
│
├── settings.json               # Global configuration
└── settings.local.json         # Local overrides (gitignored)
```

---

## CLAUDE.md - The Gateway Document

The root `CLAUDE.md` file serves as the primary entry point for Claude Code. It should be **concise** (under 250 lines) and act as a **navigation layer**, not a comprehensive reference.

### Required Sections

```markdown
# CLAUDE.md

**BLUF**: [One-line project summary and quick-start pointer]

## Quick Start

New to this project? Start here:
1. **Setup Environment**: `/tools:prime`
2. **Explore Commands**: `/tools:tools`
3. **Read Core Principles**: [Link to relevant sections]
4. **Start Development**: `/issues:prioritize`

## Core Principles

- **[Principle Name]**: [1-2 sentence description]
  - See: `/category:command`
[Repeat for each core principle]

## Command Navigation

### [Category Name]
- `/subdirectory:command` - One-line description
[Organize into 10-15 logical categories]

## Common Workflows

### [Workflow Name] (e.g., "Starting a New Feature")
```bash
/command1          # Comment explaining step
/command2          # Comment explaining step
```
[Include 3-5 common workflows]

## When Things Go Wrong

### [Failure Category]
- **[Symptom]**: `/diagnostic:command`
[Map common failures to diagnostic commands]
```

### Design Principles for CLAUDE.md

1. **Gateway, not encyclopedia** - Keep it navigational
2. **One principle → One command** - Every principle maps to exactly one slash command
3. **Progressive disclosure** - Summary here, details in commands
4. **Workflow-first** - Show complete sequences, not isolated commands
5. **Failure recovery** - Document how to diagnose problems

---

## Slash Commands

Slash commands are markdown files in `.claude/commands/` that define reusable workflows, reference documentation, and expert analyses.

### File Structure

Every command file has this anatomy:

```markdown
---
description: Brief, action-oriented description (machine-parseable)
argument-hint: [optional] Format hint for arguments
---

# Command Title

[Optional context paragraph]

## Instructions

[Sequential or conditional steps]

## CRITICAL: Output Format Requirements

**Template Category**: [Message-Only | Path Resolution | Action | Structured Data]

[Output contract specification]

**Correct output:**
```
[Example of expected output]
```

**INCORRECT output (do NOT do this):**
```
[Counter-example showing what to avoid]
```

## Arguments

$ARGUMENTS (required/optional: description)
```

### The 4 Template Categories

Every command must declare its template category for predictable output:

#### 1. Message-Only Templates
- **Purpose**: Return a single plain-text value
- **Output**: No markdown, no formatting, no preambles
- **Use cases**: Branch names, commit messages, file paths

```markdown
## CRITICAL: Output Format Requirements

**Template Category**: Message-Only

Return ONLY the commit message as plain text.

**DO NOT include:**
- Markdown formatting (bold, headers, code blocks)
- Explanatory preambles ("Here is the commit message...")
- Meta-commentary ("Based on the changes...")

**Correct output:**
```
feat(api): add rate limiting middleware

Implements token bucket algorithm with Redis backend.
```

**INCORRECT output:**
```
Based on the changes, here is the commit message:

feat(api): add rate limiting middleware
```
```

#### 2. Path Resolution Templates
- **Purpose**: Return file paths or sentinel values
- **Output**: Relative path or `0` (not found)
- **Use cases**: Finding plan files, locating configs

```markdown
## CRITICAL: Output Format Requirements

**Template Category**: Path Resolution

Return ONLY the relative file path, or `0` if not found.

**DO NOT include:**
- Absolute paths
- Git status prefixes (`?? `, `M `)
- Markdown formatting

**Correct output:**
```
docs/specs/feature-123-auth.md
```
```

#### 3. Action Templates
- **Purpose**: Perform operations and summarize results
- **Output**: Bullet-point summary of actions taken
- **Use cases**: Implementations, validations, git operations

```markdown
## CRITICAL: Output Format Requirements

**Template Category**: Action

Perform operations and return concise bullet summary.

**DO NOT include:**
- Markdown headers (no # headers)
- Verbose explanations
- Meta-commentary

**Correct output:**
```
- Modified src/auth.ts: added validation (45 lines)
- Created tests/auth.test.ts: 12 integration tests
- Validation: Level 2 (feature change)
- git status: 2 files changed, +156/-12
```
```

#### 4. Structured Data Templates
- **Purpose**: Return machine-readable data
- **Output**: Valid JSON matching schema
- **Use cases**: Audit reports, configuration exports

```markdown
## CRITICAL: Output Format Requirements

**Template Category**: Structured Data

Return ONLY valid JSON matching the schema below.

**Schema:**
```json
{
  "status": "string",
  "files": ["string"],
  "issues": [{"severity": "string", "message": "string"}]
}
```
```

### The 7-Level Prompt Maturity Model

Commands operate at different sophistication levels:

| Level | Name | Characteristics | Example |
|-------|------|-----------------|---------|
| 1 | Reference | Static documentation | `/architecture:patterns` |
| 2 | Workflow | Sequential steps | `/git:commit` |
| 3 | Control Flow | Conditionals, loops | `/issues:audit` |
| 4 | Delegate | Spawns sub-agents | `/experts:orchestrator` |
| 5 | Higher Order | Accepts context from files | `/experts:*:*_plan` |
| 6 | Template Meta | Generates new prompts | `/experts:*:*_improve` |
| 7 | Self-Improving | Updates own expertise | Domain experts |

**Start simple** - Most projects only need Levels 1-3. Add higher levels as complexity warrants.

### Forbidden Meta-Commentary Patterns

For Message-Only and Action templates, explicitly forbid reasoning leakage:

```markdown
## Meta-Commentary Patterns (FORBIDDEN)

When generating output, NEVER include:
- "based on" - e.g., "Based on the changes..."
- "here is" - e.g., "Here is the result..."
- "i can see" - e.g., "I can see that..."
- "looking at" - e.g., "Looking at the code..."
- "let me" - e.g., "Let me create..."
- "the [noun] is" - e.g., "The branch name is..."
- "after analyzing" - e.g., "After analyzing..."
```

### Organizing Commands

Group commands into semantic categories (3-7 commands per category):

```
commands/
├── workflows/        # SDLC phases
├── issues/           # Issue management
├── git/              # Version control
├── testing/          # Test utilities
├── architecture/     # Design patterns
├── docs/             # Documentation
├── tools/            # Development environment
└── experts/          # Domain expertise
```

---

## Agents (Sub-agents)

Agents are stateless, specialized AI workers invoked via the Task tool. They enable parallel execution and capability isolation.

### Agent File Structure

```markdown
---
name: scout-agent
description: Use proactively for read-only codebase exploration. Specialist for finding files, understanding patterns, and mapping dependencies.
tools: Read, Glob, Grep
model: sonnet
color: green
---

# Scout Agent

You are a Scout Agent specializing in read-only codebase exploration.

## Purpose

Explore codebases to find files, understand patterns, map dependencies, and provide context before planning or implementation.

## Constraints

- **NEVER** use Write, Edit, or Bash tools
- **NEVER** make changes to any files
- Focus on gathering information and reporting findings

## Output Format

Return a structured exploration report with:
- Exploration Summary (1-2 paragraphs)
- Relevant Files (table with path, purpose, relevance)
- Existing Patterns (documented patterns found)
- Dependencies (internal and external)
- Recommendations (actionable insights)
```

### YAML Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Kebab-case identifier (used in `subagent_type`) |
| `description` | Yes | Action-oriented text guiding when to use |
| `tools` | Yes | Comma-separated tool list |
| `model` | No | `haiku`, `sonnet`, or `opus` (default: sonnet) |
| `color` | No | Visual indicator in UI |

### Model Selection Strategy

| Model | Cost | Speed | Use For |
|-------|------|-------|---------|
| haiku | Low | Fast | Read-only exploration, simple delegation |
| sonnet | Medium | Medium | Most specialized work, implementation, review |
| opus | High | Slow | Complex orchestration, agent generation |

### Tool Capabilities

**Read-Only Agents:**
```yaml
tools: Read, Glob, Grep
```

**Implementation Agents:**
```yaml
tools: Write, Read, Edit, Grep, Glob, Bash, TodoWrite
```

**Orchestration Agents:**
```yaml
tools: Task, SlashCommand, Read, Glob, Grep, Write
```

**Browser Automation:**
```yaml
tools: mcp__playwright__browser_navigate, mcp__playwright__browser_click, ...
```

### Agent Registry

Maintain a machine-readable registry for agent discovery:

```json
{
  "$schema": "...",
  "version": "1.0.0",
  "lastUpdated": "2025-01-15",
  "agents": [
    {
      "id": "scout-agent",
      "name": "Scout Agent",
      "file": ".claude/agents/scout-agent.md",
      "description": "Read-only codebase exploration",
      "model": "sonnet",
      "capabilities": ["explore", "search", "analyze"],
      "tools": ["Read", "Glob", "Grep"],
      "inputType": "prompt",
      "outputType": "report",
      "useCases": [
        "Finding files by pattern",
        "Understanding code structure",
        "Mapping dependencies"
      ]
    }
  ],
  "capabilityIndex": {
    "explore": ["scout-agent"],
    "implement": ["build-agent"]
  },
  "modelIndex": {
    "haiku": [],
    "sonnet": ["scout-agent", "build-agent"],
    "opus": ["meta-agent"]
  }
}
```

### Invoking Agents

Agents are invoked via the Task tool:

```json
{
  "subagent_type": "scout-agent",
  "prompt": "Explore the authentication system and identify all entry points",
  "model": "haiku"
}
```

**Parallel invocation** - Send multiple Task calls in a single message:

```json
// Message with multiple Task tool calls
[
  { "subagent_type": "scout-agent", "prompt": "Explore auth..." },
  { "subagent_type": "scout-agent", "prompt": "Explore payments..." }
]
```

---

## Expert System Architecture

For complex projects, implement a multi-expert system with domain specialists and orchestrators.

### Domain Expert Pattern

Each domain expertise area follows a three-command structure:

```
experts/
└── architecture-expert/
    ├── architecture_expert_plan.md    # Analysis for planning
    ├── architecture_expert_review.md  # Code review analysis
    └── architecture_expert_improve.md # Self-improvement
```

#### _plan Commands (Level 5)

Analyze requirements from a domain perspective:

```markdown
---
description: Provide architecture analysis for planning
argument-hint: <issue-context>
---

# Architecture Expert - Plan

## Variables

USER_PROMPT: $ARGUMENTS

## Expertise

### Architectural Knowledge Areas

**System Design:**
- Component decomposition and boundaries
- Data flow and state management
- API design and contracts

**Patterns This Codebase Uses:**
- [Document actual patterns from your codebase]
- [Include code examples]

## Workflow

1. Understand the requirement context
2. Analyze architectural implications
3. Identify relevant patterns
4. Formulate recommendations

## Report Format

```markdown
### Architecture Perspective

**Analysis:**
- [Key findings]

**Recommendations:**
1. [Prioritized recommendations]

**Risks:**
- [Risk assessment]
```
```

#### _review Commands (Level 5)

Review code changes from domain perspective:

```markdown
---
description: Review code changes from architecture perspective
argument-hint: <pr-number-or-diff-context>
---

# Architecture Expert - Review

## Variables

REVIEW_CONTEXT: $ARGUMENTS

## Expertise

### Review Focus Areas

**Critical Issues to Flag:**
- Circular dependencies introduced
- Breaking API contract changes
- Missing error handling at boundaries

**Important Concerns:**
- Inconsistent patterns across modules
- Unnecessary coupling
- Missing abstractions

## Output

```markdown
### Architecture Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Critical Issues:**
- [List]

**Suggestions:**
- [List]
```
```

#### _improve Commands (Level 6-7)

Self-improvement through codebase analysis:

```markdown
---
description: Review changes and update expert knowledge
---

# Architecture Expert - Improve

## Workflow

1. **Analyze Recent Changes**
   ```bash
   git log --oneline -30 --all -- "src/**"
   ```

2. **Extract Learnings**
   - Identify successful patterns
   - Note decisions that worked
   - Document problems encountered

3. **Update Expertise**
   - Edit architecture_expert_plan.md Expertise section
   - Add new patterns discovered
   - Remove outdated patterns

4. **Document Anti-Patterns**
   - Record patterns that caused issues
   - Note why they failed
   - Document better alternatives
```

### Orchestrator Pattern

Orchestrators coordinate multiple experts for complex tasks:

#### Planning Council

Spawns 5 domain experts in parallel:

```markdown
---
description: Coordinate multiple experts for comprehensive planning
---

# Planning Council

## Domain Experts

1. Architecture Expert
2. Testing Expert
3. Security Expert
4. Integration Expert
5. UX Expert

## Workflow

### 1. Invoke Experts in Parallel

Use SlashCommand tool (ALL 5 in single message):
```
/experts:architecture-expert:architecture_expert_plan {context}
/experts:testing-expert:testing_expert_plan {context}
/experts:security-expert:security_expert_plan {context}
/experts:integration-expert:integration_expert_plan {context}
/experts:ux-expert:ux_expert_plan {context}
```

### 2. Synthesize Findings

Combine expert outputs into unified analysis:
- Identify cross-cutting concerns
- Consolidate risk assessments
- Create prioritized recommendations

### 3. Output Single Spec File

**CRITICAL**: Output is for INCLUSION in single file, NOT separate files per expert.
```

#### Multi-Phase Orchestrator

Coordinates complete development workflows:

```
User Input
    ↓
[Phase 1: Scout] → scout-agent (exploration)
    ↓
[Phase 2: Plan] → planning-council (expert analysis)
    ↓ Creates: docs/specs/<name>.md
[Phase 3: Build] → build-agent (implementation)
    ↓
[Phase 4: Review] → review-panel (expert review)
    ↓ Creates: docs/reviews/<name>-review.md
[Phase 5: Validate] → validation commands
```

---

## Hooks and Automation

Hooks execute shell commands in response to Claude Code events.

### Hook Types

| Event | When It Fires |
|-------|---------------|
| `PostToolUse` | After specific tools complete |
| `UserPromptSubmit` | After user submits a prompt |
| `PreToolUse` | Before a tool executes |

### Configuration in settings.json

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/auto_linter.py",
            "timeout": 45
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/context_builder.py"
          }
        ]
      }
    ]
  }
}
```

### Example Hook: Auto-Linter

```python
#!/usr/bin/env python3
"""Post-write hook that runs linting on modified files."""

import sys
import json
import subprocess
from pathlib import Path

def main():
    # Read hook input from stdin
    hook_input = json.loads(sys.stdin.read())

    file_path = hook_input.get("tool_input", {}).get("file_path", "")

    if not file_path.endswith((".ts", ".tsx", ".js", ".jsx")):
        return output_result("skip", "Not a JS/TS file")

    # Run linter
    result = subprocess.run(
        ["pnpm", "eslint", "--fix", file_path],
        capture_output=True,
        text=True,
        timeout=30
    )

    if result.returncode == 0:
        return output_result("continue", "Linting passed")
    else:
        return output_result("continue", f"Lint issues: {result.stderr}")

def output_result(decision, message):
    """Output hook result as JSON."""
    print(json.dumps({
        "decision": decision,
        "additionalContext": message
    }))

if __name__ == "__main__":
    main()
```

### Hook Best Practices

1. **Non-blocking**: Always exit 0 and return `"decision": "continue"`
2. **Timeouts**: Set reasonable timeouts (30-60 seconds)
3. **Feedback via additionalContext**: Return useful messages without blocking
4. **Idempotent**: Hooks may run multiple times for same operation

---

## Settings and Configuration

### settings.json (Committed)

Global configuration for the project:

```json
{
  "statusLine": {
    "type": "command",
    "command": "python3 $CLAUDE_PROJECT_DIR/.claude/statusline.py"
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/auto_linter.py",
            "timeout": 45
          }
        ]
      }
    ]
  }
}
```

### settings.local.json (Gitignored)

Local overrides for permissions and MCP servers:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm install:*)",
      "Bash(pnpm dev:*)",
      "Bash(pnpm test:*)",
      "Bash(pnpm lint:*)",
      "Bash(pnpm build:*)",
      "mcp__playwright__browser_navigate",
      "mcp__playwright__browser_click"
    ]
  },
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["playwright"]
}
```

### Permission Patterns

Use glob patterns for flexible permissions:

```json
{
  "allow": [
    "Bash(pnpm *:*)",      // All pnpm scripts
    "Bash(git *:*)",       // All git commands
    "Bash(rm -rf node_modules)", // Specific command
    "mcp__playwright__*"   // All playwright tools
  ]
}
```

---

## System Prompts vs User Prompts

> The most important difference is **scope and persistence**.
>
> System prompts set the rules for all conversations.
> User prompts ask for specific tasks.

### System Prompts

System prompts tell the AI who it is and how to behave in every conversation. They're like the AI's personality and rule book combined.

**What they do:**
- Set the AI's role ("You are a helpful coding assistant")
- Define what the AI can and can't do
- Establish the tone and style for all responses
- Create rules that apply to every single interaction

**How to write them:**
- Be very clear - you can't fix confusion later
- Think about edge cases - what could go wrong?
- Test thoroughly - mistakes affect everything
- Keep them focused - too many rules create conflicts
- Use simple, exact language

**Example:**
```
You are a Python tutor. Always explain code step by step.
Never write code longer than 10 lines without explaining it.
If a user asks about other languages, politely redirect to Python.
```

### User Prompts

User prompts ask the AI to do specific tasks. They work within the rules set by the system prompt.

**What they do:**
- Request specific actions or information
- Provide context for the current task
- Give examples of what you want
- Can be refined based on responses

**How to write them:**
- Be clear about what you want right now
- Include relevant details and context
- Show examples if helpful
- You can ask follow-up questions to improve results

**Example:**
```
Write a function that reverses a string. Use a for loop and explain each line.
```

### Key Differences

| System Prompt                     | User Prompt                    |
| --------------------------------- | ------------------------------ |
| Sets rules for ALL conversations  | Asks for ONE specific thing    |
| Can't be changed mid-conversation | Can be refined with follow-ups |
| Needs to handle many scenarios    | Focuses on current task only   |
| Mistakes affect everything        | Mistakes affect one response   |
| Written once, used many times     | Written fresh each time        |

### Why This Matters

A bad system prompt is like bad instructions for a whole job - everything goes wrong. A bad user prompt is like unclear directions for one task - you can just ask again better.

System prompts need more testing because they affect everything. User prompts can be fixed on the fly. That's why engineers spend more time perfecting system prompts - they're the foundation everything else builds on.

### Which Sections Work Best for System Prompts

Not all prompt sections make sense for system prompts. Here's what to use and what to skip:

**Essential Sections:**

**Purpose** - Define the AI's core identity and role
```
You are a senior Python developer who writes secure, well-tested code.
You are a patient tutor who breaks down complex topics into simple steps.
```

**Instructions** - Set the behavioral rules that apply to every interaction
- How to use tools ("Always read files before editing them")
- Safety boundaries ("Never delete files without explicit confirmation")
- Output preferences ("Keep responses concise and actionable")
- Error handling ("If unclear, ask for clarification rather than guess")

**Examples** - Show expected behavior patterns (not task examples)
- How to format responses
- How to handle ambiguous requests
- What good vs bad output looks like

**Sections to Avoid in System Prompts:**

- **Variables** - System prompts don't take input parameters. They're static rules.
- **Workflow** - Usually too specific. System prompts set general behavior, not step-by-step tasks.
- **Report/Expertise/Templates** - Too task-specific for system prompts.
- **Metadata/Relevant Files/Codebase Structure** - These are for specific prompt files, not system-wide behavior.

### Common System Prompt Patterns

**Tool Usage Instructions:**
```
When working with files:
1. Always use Read before Edit
2. Create parent directories before writing files
3. Never use shell commands for file operations - use the provided tools
```

**Behavioral Boundaries:**
```
If asked to do something harmful or unethical, politely decline and explain why.
Never execute commands that could damage the system.
Always confirm before making destructive changes.
```

**Output Formatting:**
```
Structure responses as:
- Brief summary of what you'll do
- Execute the task
- Confirm completion with specific details
Keep explanations under 3 sentences unless asked for more detail.
```

**The Key Insight:** System prompts should focus on WHO the AI is and HOW it should behave across all situations. Skip anything task-specific - that belongs in user prompts.

---

## Best Practices

### 1. Start Simple, Add Complexity As Needed

```
Week 1: CLAUDE.md + basic commands (Level 1-2)
Week 2: Add workflow commands (Level 2-3)
Week 3: Add automation hooks
Month 2: Consider expert system (Level 4-7)
```

### 2. Output Format Discipline

Every command must specify:
- Template category
- Expected output format
- Correct example
- Incorrect example
- Forbidden patterns

### 3. Principle of Least Privilege for Agents

```yaml
# Scout: Read-only
tools: Read, Glob, Grep

# Builder: Write-capable
tools: Write, Read, Edit, Bash, TodoWrite

# Never: Everything
tools: ALL  # Don't do this
```

### 4. Document Patterns From Your Codebase

In expert Expertise sections, document **actual patterns** from your codebase:

```markdown
## Expertise

### Patterns This Codebase Uses

**Error Handling Pattern:**
```typescript
// From src/lib/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
  }
}
```

**Usage:**
- All API routes wrap handlers in `withErrorHandling()`
- Validation errors use `ValidationError` subclass
```

### 5. Use Variable Injection Consistently

```markdown
## Variables

USER_PROMPT: $ARGUMENTS      # For task context
PATH_TO_SPEC: $ARGUMENTS     # For file paths
ISSUE_NUMBER: $ARGUMENTS     # For issue references
```

### 6. Maintain Registry Files

Keep machine-readable indexes updated:
- `agents/agent-registry.json`
- `commands/README.md` (command taxonomy)

### 7. Version Your Configuration

Track `.claude/` in version control (except `settings.local.json`):

```gitignore
# .gitignore
.claude/settings.local.json
.claude/**/__pycache__/
```

---

## Common Pitfalls

### 1. Over-Documentation

**Problem**: Extensive CLAUDE.md that agents ignore.

**Fix**: Keep CLAUDE.md under 250 lines. Delegate to commands.

### 2. Missing Output Format Requirements

**Problem**: Command output is unpredictable, breaks consumers.

**Fix**: Add "CRITICAL: Output Format Requirements" to every command.

### 3. Meta-Commentary Leakage

**Problem**: Output includes reasoning ("Based on the changes, here is...").

**Fix**: Explicitly document forbidden patterns.

### 4. Absolute Paths in Worktrees

**Problem**: Git staging fails when using absolute paths.

**Fix**: Always use relative paths. Add worktree guidance to Action templates.

### 5. Undocumented Dependencies

**Problem**: Commands depend on others without documenting prerequisites.

**Fix**: Document required prior steps. Show complete workflow sequences.

### 6. Agent Tool Bloat

**Problem**: Agents have access to unnecessary tools.

**Fix**: Apply principle of least privilege. Read-only agents should not have Write.

### 7. Expertise Section Destruction

**Problem**: `_improve` commands replace instead of merge expertise.

**Fix**: Explicitly instruct to preserve existing expertise and append learnings.

### 8. Single Expert, Multiple Files

**Problem**: Planning Council creates separate files per expert.

**Fix**: Enforce single output file constraint. Experts output sections, not files.

---

## Quick Start Template

Copy this structure to start your `.claude/` configuration:

```
.claude/
├── settings.json
├── commands/
│   ├── README.md
│   ├── workflows/
│   │   └── validate.md
│   ├── git/
│   │   ├── commit.md
│   │   └── branch.md
│   └── tools/
│       └── prime.md
└── agents/
    ├── agent-registry.json
    └── scout-agent.md
```

### Minimal settings.json

```json
{
  "statusLine": {
    "type": "string",
    "value": "Project: {project_name}"
  }
}
```

### Minimal CLAUDE.md

```markdown
# CLAUDE.md

**BLUF**: [Project description]. Use `/tools:prime` to get started.

## Quick Start

1. **Setup**: `/tools:prime`
2. **Validate**: `/workflows:validate`
3. **Commit**: `/git:commit`

## Core Principles

- **[Principle 1]**: [Description]
- **[Principle 2]**: [Description]

## Commands

- `/tools:prime` - Initialize development environment
- `/workflows:validate` - Run validation checks
- `/git:commit` - Generate conventional commit
- `/git:branch` - Create new branch
```

### Minimal Command (Level 2)

```markdown
---
description: Run validation checks
---

# Validate

## Instructions

1. Run linting: `pnpm lint`
2. Run type checking: `pnpm check-types`
3. Run tests: `pnpm test`

## CRITICAL: Output Format Requirements

**Template Category**: Action

Return bullet summary of validation results.

**Correct output:**
```
- Lint: passed (0 errors)
- Types: passed
- Tests: 42 passed, 0 failed
```

**INCORRECT output:**
```
Let me run the validation checks for you...

Running lint... Done!
```
```

---

## Documentation Scraping Pattern

A powerful pattern for keeping external documentation available offline for agent context.

### The docs-scraper Agent

A specialized agent that fetches web documentation and saves it as properly formatted markdown:

```yaml
---
name: docs-scraper
description: Documentation scraping specialist. Use proactively to fetch and save documentation from URLs as properly formatted markdown files.
tools: mcp__firecrawl-mcp__firecrawl_scrape, WebFetch, Write, Edit
model: sonnet
---
```

**Input formats:**
- URL only: `https://docs.example.com/api` (auto-generates filename)
- URL with path: `https://docs.example.com/api -> category/api-reference.md`

**Workflow:**
1. Parse input for URL and optional target path
2. Fetch content using Firecrawl MCP (falls back to WebFetch)
3. Clean and reformat as proper markdown
4. Save to `docs/ai_docs/<output-path>`
5. Report success/failure with file path

### The load-ai-docs Command (Level 4 Delegate)

A Level 4 delegate prompt that orchestrates multiple docs-scraper agents in parallel:

```markdown
---
description: Load documentation from websites into local markdown files
argument-hint: [category] (claude-code|anthropic|uv|zod|supabase|stripe|openai|google|nextjs|all)
---
```

**Categories and URLs are mapped in tables:**

```markdown
### Claude Code
| URL | Output Path |
|-----|-------------|
| https://code.claude.com/docs/en/hooks.md | claude-code/hooks.md |
| https://code.claude.com/docs/en/mcp.md | claude-code/mcp.md |
| https://code.claude.com/docs/en/sub-agents.md | claude-code/sub-agents.md |
```

**Workflow:**
1. Parse category from `$ARGUMENTS` (default: `all`)
2. Filter URLs by category from mapping tables
3. Check freshness - skip files created within 24 hours
4. Spawn `docs-scraper` agents **in parallel** for each URL
5. Aggregate results and report summary

**Usage:**
```bash
/docs:load-ai-docs              # Load all documentation
/docs:load-ai-docs claude-code  # Load only Claude Code docs
/docs:load-ai-docs stripe       # Load only Stripe docs
```

**Output structure:**
```
docs/ai_docs/
├── claude-code/
│   ├── hooks.md
│   ├── mcp.md
│   └── sub-agents.md
├── database/supabase/
│   ├── auth.md
│   └── database.md
├── payments/stripe/
│   ├── webhooks.md
│   └── checkout.md
└── frameworks/nextjs/
    └── app-router.md
```

### Why This Pattern Matters

1. **Offline context** - Agents can read local docs without web fetches
2. **Freshness control** - 24-hour cache prevents redundant scraping
3. **Parallel execution** - Multiple docs fetched simultaneously
4. **Organized storage** - Categorical directory structure
5. **Reusable agent** - docs-scraper can be invoked directly for ad-hoc URLs

This is a textbook example of the **Level 4 Delegate Pattern**: a command that orchestrates specialized agents for parallel work, then aggregates results.

---

## Conclusion

Effective `.claude/` configuration is an investment that compounds over time. Start with the basics:

1. **CLAUDE.md** as navigation gateway
2. **Commands** with strict output contracts
3. **Agents** with limited, appropriate tools

Add complexity only when needed:

4. **Hooks** for automation
5. **Expert system** for domain specialization
6. **Self-improvement** for knowledge accumulation

The goal is always the **Virtuous Feedback Cycle**: consistent patterns that improve agent accuracy, creating higher quality output that reinforces those patterns.

---

*This guide is based on production patterns from enterprise monorepos. Adapt patterns to your project's specific needs while maintaining the core principles of consistency, discoverability, and progressive complexity.*
