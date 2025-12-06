---
description: Provide Claude configuration analysis for planning
argument-hint: <issue-context>
---

# Claude Config Expert - Plan

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

USER_PROMPT: $ARGUMENTS

## Expertise

### Claude Configuration Knowledge Areas

**CLAUDE.md Structure:**
- BLUF section: Quick-start commands and essential context
- Quick Start: Numbered workflow steps (prime, plan, implement, validate)
- Core Principles: Table of key conventions with command references
- Command Navigation: Organized tables by category (workflows, issues, git, testing, docs, ci, tools, app, automation, worktree, release, validation)
- Common Workflows: End-to-end command sequences for typical tasks
- Quick Reference: Shell commands for common operations
- Critical Conventions: Path aliases, migration sync, logging, testing, branching
- MCP Servers: Available MCP integrations
- Layer-Specific Documentation: Links to conditional docs

**settings.json Configuration:**
```json
{
  "statusLine": {
    "type": "command",
    "command": "python .claude/scripts/statusline.py"
  },
  "hooks": {
    "PostToolUse": [...],
    "UserPromptSubmit": [...]
  }
}
```

**settings.local.json Pattern:**
- Gitignored file for personal settings
- Template provided: `.claude/settings.local.json.template`
- Overrides shared settings without affecting team
- Used for: model preferences, personal shortcuts, experimental features

**MCP Server Configuration:**
- Server definitions in project settings
- Tool permissions: allow/deny patterns
- Connection parameters: stdio vs. HTTP transport
- Environment variable passthrough

**Slash Command Organization:**
- Directory structure: `.claude/commands/<category>/<command>.md`
- Frontmatter required: `description`, optional `argument-hint`
- Naming convention: lowercase with underscores or hyphens
- Nested commands: `<category>:<subcategory>:<command>`

**Anti-Patterns Discovered:**
- CLAUDE.md with outdated command references
- settings.json with invalid JSON syntax
- Missing MCP server configurations for required tools
- Duplicate command definitions across directories
- Overly long CLAUDE.md sections that reduce scannability
- Command descriptions that don't match actual behavior

### Command Registration Patterns

**Template Categories:**
- Message-Only (Level 1): Static reference content
- Structured Data (Level 5): Domain analysis with workflow
- Action (Level 6-7): Self-modifying or meta-cognitive

**Required Frontmatter:**
```yaml
---
description: Brief one-line description
argument-hint: <optional-argument-hint>
---
```

**Command Discovery:**
- Claude Code scans `.claude/commands/` recursively
- Each `.md` file becomes a slash command
- Path determines command name: `commands/a/b.md` → `/a:b`

## Workflow

1. **Parse Context**: Extract configuration-relevant requirements from USER_PROMPT
2. **Identify Scope**: Determine affected config areas (CLAUDE.md, settings, commands)
3. **Check Consistency**: Verify changes align with existing patterns
4. **Assess Documentation**: Evaluate documentation update needs
5. **Pattern Match**: Compare against known patterns in Expertise
6. **Risk Assessment**: Identify configuration-related risks

## Report Format

### Claude Config Perspective

**Configuration Scope:**
- [List configuration areas affected by this change]

**Documentation Impact:**
- [CLAUDE.md, conditional docs, or command docs affected]

**Recommendations:**
1. [Prioritized configuration recommendation with rationale]

**Risks:**
- [Configuration risk with severity: HIGH/MEDIUM/LOW]

**Pattern Compliance:**
- [Assessment of alignment with established configuration patterns]
