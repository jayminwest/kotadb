# Claude Code Slash Commands Documentation

**Source:** https://code.claude.com/docs/en/slash-commands.md
**Scraped:** 2025-12-05

---

## Built-in Slash Commands

| Command | Purpose |
|---------|---------|
| `/add-dir` | Add additional working directories |
| `/agents` | Manage custom AI subagents for specialized tasks |
| `/bashes` | List and manage background tasks |
| `/bug` | Report bugs (sends conversation to Anthropic) |
| `/clear` | Clear conversation history |
| `/compact [instructions]` | Compact conversation with optional focus instructions |
| `/config` | Open the Settings interface (Config tab) |
| `/context` | Visualize current context usage as a colored grid |
| `/cost` | Show token usage statistics |
| `/doctor` | Checks the health of your Claude Code installation |
| `/exit` | Exit the REPL |
| `/export [filename]` | Export the current conversation to a file or clipboard |
| `/help` | Get usage help |
| `/hooks` | Manage hook configurations for tool events |
| `/ide` | Manage IDE integrations and show status |
| `/init` | Initialize project with CLAUDE.md guide |
| `/install-github-app` | Set up Claude GitHub Actions for a repository |
| `/login` | Switch Anthropic accounts |
| `/logout` | Sign out from your Anthropic account |
| `/mcp` | Manage MCP server connections and OAuth authentication |
| `/memory` | Edit CLAUDE.md memory files |
| `/model` | Select or change the AI model |
| `/output-style [style]` | Set the output style directly or from a selection menu |
| `/permissions` | View or update permissions |
| `/plugin` | Manage Claude Code plugins |
| `/pr-comments` | View pull request comments |
| `/privacy-settings` | View and update your privacy settings |
| `/release-notes` | View release notes |
| `/resume` | Resume a conversation |
| `/review` | Request code review |
| `/rewind` | Rewind the conversation and/or code |
| `/sandbox` | Enable sandboxed bash tool with filesystem and network isolation |
| `/security-review` | Complete a security review of pending changes on the current branch |
| `/status` | Open the Settings interface (Status tab) |
| `/statusline` | Set up Claude Code's status line UI |
| `/terminal-setup` | Install Shift+Enter key binding for newlines |
| `/todos` | List current todo items |
| `/usage` | Show plan usage limits and rate limit status |
| `/vim` | Enter vim mode for alternating insert and command modes |

## Custom Slash Commands

### Syntax
```
/<command-name> [arguments]
```

### Parameters
- `<command-name>`: Name derived from the Markdown filename (without `.md` extension)
- `[arguments]`: Optional arguments passed to the command

### Command Types

**Project commands** are stored in `.claude/commands/` and appear with "(project)" label.

**Personal commands** are stored in `~/.claude/commands/` and appear with "(user)" label.

### Features

#### Namespacing
Organize commands in subdirectories. File at `.claude/commands/frontend/component.md` creates `/component` showing "(project:frontend)".

#### Arguments

**All arguments with `$ARGUMENTS`**: Captures all arguments passed to the command.

**Individual arguments with `$1`, `$2`, etc.**: Access specific arguments using positional parameters.

#### Bash Command Execution
Execute bash commands before the slash command runs using the `!` prefix. You must include `allowed-tools` with the `Bash` tool.

Example:
```markdown
---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
description: Create a git commit
---

## Context

- Current git status: !`git status`
- Current git diff: !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Based on the above changes, create a single git commit.
```

#### File References
Include file contents using the `@` prefix to reference files.

#### Thinking Mode
Slash commands can trigger extended thinking by including extended thinking keywords.

### Frontmatter

| Frontmatter | Purpose | Default |
|-------------|---------|---------|
| `allowed-tools` | List of tools the command can use | Inherits from the conversation |
| `argument-hint` | The arguments expected for the slash command | None |
| `description` | Brief description of the command | Uses the first line from the prompt |
| `model` | Specific model string | Inherits from the conversation |
| `disable-model-invocation` | Whether to prevent SlashCommand tool from calling this command | false |

Example with frontmatter:
```markdown
---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
argument-hint: [message]
description: Create a git commit
model: claude-3-5-haiku-20241022
---

Create a git commit with message: $ARGUMENTS
```

Example using positional arguments:
```markdown
---
argument-hint: [pr-number] [priority] [assignee]
description: Review pull request
---

Review PR #$1 with priority $2 and assign to $3.
Focus on security, performance, and code style.
```

## Plugin Commands

Plugin commands are namespaced, automatically available once installed, and fully integrated with command features.

**Location**: `commands/` directory in plugin root

**File format**: Markdown files with frontmatter

**Basic command structure**:
```markdown
---
description: Brief description of what the command does
---

# Command Name

Detailed instructions for Claude on how to execute this command.
```

### Invocation Patterns
```
/command-name                    (direct command when no conflicts)
/plugin-name:command-name        (plugin-prefixed for disambiguation)
/command-name arg1 arg2          (with arguments)
```

## MCP Slash Commands

MCP servers expose prompts as slash commands that become available in Claude Code.

### Command Format
```
/mcp__<server-name>__<prompt-name> [arguments]
```

### Features

**Dynamic discovery**: MCP commands are automatically available when an MCP server is connected and exposes prompts.

**Arguments**: MCP prompts can accept server-defined arguments.

**Naming conventions**: Server and prompt names are normalized, with spaces and special characters becoming underscores in lowercase.

### Managing MCP Connections
Use the `/mcp` command to view all configured MCP servers, check connection status, authenticate with OAuth-enabled servers, clear authentication tokens, and view available tools and prompts.

### MCP Permissions and Wildcards
Wildcards are **not supported** in permission configurations.

- ✅ **Correct**: `mcp__github` (approves ALL tools from the github server)
- ✅ **Correct**: `mcp__github__get_issue` (approves specific tool)
- ❌ **Incorrect**: `mcp__github__*` (wildcards not supported)

## SlashCommand Tool

The SlashCommand tool allows Claude to execute custom slash commands programmatically during a conversation.

### Supported Commands
SlashCommand tool only supports custom slash commands that:
- Are user-defined (built-in commands like `/compact` are not supported)
- Have the `description` frontmatter field populated

### Disable SlashCommand Tool
To prevent Claude from executing any slash commands:
```bash
/permissions
# Add to deny rules: SlashCommand
```

### Disable Specific Commands Only
Add `disable-model-invocation: true` to the slash command's frontmatter.

### SlashCommand Permission Rules
The permission rules support:
- **Exact match**: `SlashCommand:/commit` (allows only `/commit` with no arguments)
- **Prefix match**: `SlashCommand:/review-pr:*` (allows `/review-pr` with any arguments)

### Character Budget Limit
- **Default limit**: 15,000 characters
- **Custom limit**: Set via `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable

## Skills vs Slash Commands

### Use Slash Commands For
- Quick, frequently-used prompts
- Simple prompt snippets used often
- Quick reminders or templates
- Frequently-used instructions fitting in one file

### Use Skills For
- Comprehensive capabilities with structure
- Complex workflows with multiple steps
- Capabilities requiring scripts or utilities
- Knowledge organized across multiple files
- Team workflows you want to standardize

### Key Differences

| Aspect | Slash Commands | Agent Skills |
|--------|----------------|--------------|
| **Complexity** | Simple prompts | Complex capabilities |
| **Structure** | Single .md file | Directory with SKILL.md + resources |
| **Discovery** | Explicit invocation (`/command`) | Automatic (based on context) |
| **Files** | One file only | Multiple files, scripts, templates |
| **Scope** | Project or personal | Project or personal |
| **Sharing** | Via git | Via git |

### Example Comparison

**As a slash command** (`.claude/commands/review.md`):
```markdown
Review this code for:
- Security vulnerabilities
- Performance issues
- Code style violations
```

Usage: `/review` (manual invocation)

**As a Skill** (`.claude/skills/code-review/`):
```
├── SKILL.md
├── SECURITY.md
├── PERFORMANCE.md
├── STYLE.md
└── scripts/
    └── run-linters.sh
```

Usage: "Can you review this code?" (automatic discovery)

### When to Use Each
- **Use slash commands**: You invoke the same prompt repeatedly, the prompt fits in a single file, you want explicit control over when it runs
- **Use Skills**: Claude should discover the capability automatically, multiple files or scripts are needed, complex workflows with validation steps, team needs standardized detailed guidance

## See Also
- Plugins - Extend Claude Code with custom commands through plugins
- Identity and Access Management - Complete guide to permissions, including MCP tool permissions
- Interactive mode - Shortcuts, input modes, and interactive features
- CLI reference - Command-line flags and options
- Settings - Configuration options
- Memory management - Managing Claude's memory across sessions
