# Settings Configuration Guide

**Template Category**: Message-Only
**Prompt Level**: 1 (Static)

This document explains Claude Code settings configuration for KotaDB development, including permission patterns, status line setup, and local override best practices.

## File Structure

```
.claude/
├── settings.json              # Shared project settings (committed)
├── settings.local.json        # Personal settings (gitignored)
├── settings.local.json.template  # Template for local settings
└── statusline.py              # Status line script
```

## settings.json (Shared)

The shared settings file contains project-wide configuration that all developers use:

```json
{
  "statusLine": {
    "type": "command",
    "command": "python3 $CLAUDE_PROJECT_DIR/.claude/statusline.py"
  },
  "hooks": {
    "PostToolUse": [...],
    "UserPromptSubmit": [...]
  }
}
```

### Status Line

The status line displays project context in Claude Code:
- Project name (KotaDB)
- Current git branch
- Environment indicator for main/develop branches

### Hooks

See `.claude/hooks/README.md` for hook documentation:
- **PostToolUse**: Auto-linting after Write/Edit operations
- **UserPromptSubmit**: Context building for each prompt

## settings.local.json (Personal)

Personal settings file for individual developer preferences. This file is gitignored and should be created from the template.

### Setup

```bash
cp .claude/settings.local.json.template .claude/settings.local.json
# Edit to customize your preferences
```

### Permission Patterns

The permissions system controls which operations Claude Code can perform without prompting.

#### Permission Syntax

```
Tool(pattern)
```

Where:
- `Tool` is the tool name (e.g., `Bash`, `Read`, `Write`)
- `pattern` is a glob pattern matching the tool's arguments

#### Bash Permissions

```json
{
  "permissions": {
    "allow": [
      "Bash(bun *)",        // All bun commands
      "Bash(bunx *)",       // Bun execute
      "Bash(git *)",        // All git commands
      "Bash(gh *)",         // GitHub CLI
      "Bash(docker *)",     // Docker commands
      "Bash(supabase *)",   // Supabase CLI
      "Bash(python3 *)",    // Python scripts
      "Bash(pytest *)"      // Python tests
    ]
  }
}
```

#### MCP Tool Permissions

```json
{
  "permissions": {
    "allow": [
      "mcp__kotadb__*",              // All kotadb tools
      "mcp__kotadb-staging__*",      // Staging instance
      "mcp__kotadb-production__*",   // Production instance
      "mcp__playwright__*",          // Browser automation
      "mcp__supabase__*",            // Supabase management
      "mcp__sequential-thinking__*"  // Reasoning tools
    ]
  }
}
```

#### File System Permissions

```json
{
  "permissions": {
    "allow": [
      "Bash(ls *)",
      "Bash(cd *)",
      "Bash(pwd)",
      "Bash(mkdir *)",
      "Bash(rm *)",
      "Bash(cp *)",
      "Bash(mv *)"
    ]
  }
}
```

### MCP Server Enablement

```json
{
  "enableAllProjectMcpServers": true
}
```

This enables all MCP servers configured in the project's `.mcp.json` file.

## Permission Best Practices

### Minimal Permissions (Recommended for Review)

When reviewing unfamiliar code or PRs:

```json
{
  "permissions": {
    "allow": [
      "Bash(bun run lint)",
      "Bash(bunx tsc --noEmit)",
      "Bash(git status)",
      "Bash(git diff *)",
      "mcp__kotadb__search_code"
    ]
  }
}
```

### Development Permissions

For active development work:

```json
{
  "permissions": {
    "allow": [
      "Bash(bun *)",
      "Bash(git *)",
      "Bash(docker *)",
      "Bash(supabase *)",
      "mcp__kotadb__*",
      "mcp__playwright__*"
    ]
  }
}
```

### Full Automation Permissions

For trusted automation workflows (use with caution):

```json
{
  "permissions": {
    "allow": [
      "Bash(*)",
      "mcp__*"
    ]
  },
  "enableAllProjectMcpServers": true
}
```

## Security Considerations

1. **Avoid wildcard Bash permissions** in shared settings
2. **Review MCP permissions** before enabling production tools
3. **Use template as starting point**, customize based on needs
4. **settings.local.json is gitignored** to prevent credential exposure
5. **Audit permissions periodically** as project needs evolve

## Troubleshooting

### Status Line Not Showing

1. Verify statusline.py exists and is executable
2. Check script output: `python3 .claude/statusline.py`
3. Verify settings.json has valid JSON syntax

### Permissions Not Working

1. Check settings.local.json JSON syntax
2. Verify permission pattern matches tool usage
3. Check MCP server is enabled in `.mcp.json`

### Hook Failures

See `.claude/hooks/README.md` for hook troubleshooting.

## Related Documentation

- `.claude/hooks/README.md` - Hook implementation details
- `.claude/commands/docs/mcp-usage-guidance.md` - MCP tool decision matrix
- `.claude/commands/docs/kotadb-agent-usage.md` - MCP tools in agent contexts
