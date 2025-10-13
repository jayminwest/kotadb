# Claude Code Slash Commands

This directory contains slash command templates for Claude Code integration. Commands are organized into logical subdirectories based on their functional domain.

## Directory Structure

The commands are organized into the following subdirectories:

- **workflows/** - SDLC phase commands (plan, build, test, review, document)
- **git/** - Version control operations (commit, branch management)
- **issues/** - GitHub issue template commands (chore, bug, feature)
- **homeserver/** - Trigger automation and webhook handlers
- **worktree/** - Git worktree management commands
- **automation/** - ADW workflow orchestration commands
- **app/** - Application layer commands (start server, database operations)
- **docs/** - Documentation helpers (anti-mock guidelines, conditional docs, prompt-code alignment)
- **ci/** - CI/CD workflow commands
- **tools/** - Utility commands (install, PR review)

## Command Discovery

Claude Code automatically discovers commands by reading `.md` files in this directory tree. Each file represents a command prompt that Claude Code can execute.

### Invocation Syntax

Commands are invoked using the pattern: `/subdirectory:filename`

For example:
- `/workflows:plan` → `.claude/commands/workflows/plan.md`
- `/issues:chore` → `.claude/commands/issues/chore.md`
- `/git:commit` → `.claude/commands/git/commit.md`

When a command is invoked, Claude Code expands the template content from the corresponding `.md` file and processes it as a prompt.

## Adding New Commands

When creating new slash commands, follow these guidelines:

1. **Choose the appropriate subdirectory** based on the command's domain:
   - SDLC workflow phases → `workflows/`
   - Git operations → `git/`
   - Issue templates → `issues/`
   - Automation triggers → `homeserver/` or `automation/`
   - Application operations → `app/`
   - Documentation tasks → `docs/`
   - CI/CD operations → `ci/`
   - General utilities → `tools/`

2. **Use descriptive filenames** that reflect the command's purpose (e.g., `plan.md`, `commit.md`, `install.md`)

3. **Follow existing command format**:
   - Start with a heading: `# /command-name`
   - Include input parameters if applicable
   - Provide clear instructions for Claude Code
   - Specify expected output format
   - Document use cases and notes

4. **Maintain prompt-code alignment**: When creating commands that interact with Python automation code, follow the guidelines in `.claude/commands/docs/prompt-code-alignment.md` to ensure templates produce parseable output.

## Documentation References

- **conditional_docs.md** - Guide for determining which documentation to read based on task scope
- **anti-mock.md** - Testing philosophy and guidelines for writing tests without mocks
- **prompt-code-alignment.md** - Guidelines for ensuring slash command templates align with parsing code
- **CLAUDE.md** (root) - Complete project architecture and development workflows
- **automation/adws/README.md** - ADW automation pipeline documentation

## Command Organization History

The subdirectory structure was established in issue #58 to improve command discoverability and maintainability. Prior to this reorganization, all commands were stored in a flat directory structure at `automation/.claude/commands/`. The current structure provides better separation of concerns and makes it easier for developers to locate and understand available commands.
