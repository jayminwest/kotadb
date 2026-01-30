# Claude Code Slash Commands

This directory contains slash command templates for Claude Code integration. Commands are organized into logical subdirectories based on their functional domain.

## Template Categories

All slash commands are classified into one of four template categories based on their output requirements:

| Category | Description | Output Format | Sentinel Value |
|----------|-------------|---------------|----------------|
| **Message-Only** | Returns a single piece of text | Single line or short paragraph | `0` for failure |
| **Path Resolution** | Returns a file path or URL | Absolute path or URL string | `0` for not found |
| **Action** | Performs operations, returns summary | Structured report or status | Exit code |
| **Structured Data** | Returns machine-parseable data | JSON object/array | Empty object/array |

### Category Guidelines

**Message-Only** commands:
- Output must be a direct answer with no preamble
- No markdown formatting unless explicitly required
- Use `0` to indicate failure or no result

**Path Resolution** commands:
- Output must be a valid filesystem path or URL
- Use `0` when path/URL cannot be determined
- No explanatory text around the path

**Action** commands:
- Perform side effects (file modification, git operations, etc.)
- Return structured status report
- Include validation results when applicable

**Structured Data** commands:
- Output must be valid JSON
- Follow documented schema
- Return empty array `[]` or object `{}` for no results

### Meta-Commentary Patterns (FORBIDDEN)

These patterns are forbidden in command output across all categories:

- "Based on the changes..."
- "The commit should..."
- "Here is the..."
- "This commit..."
- "I can see that..."
- "Looking at..."
- "The changes..."
- "Let me..."

Use direct statements instead of meta-commentary.

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
- **experts/** - Domain expert system (architecture, testing, security, integration)

## Command Discovery

Claude Code automatically discovers commands by reading `.md` files in this directory tree. Each file represents a command prompt that Claude Code can execute.

### Invocation Syntax

Commands are invoked using the pattern: `/subdirectory:filename`

For example:
- `/workflows:plan` → `.claude/commands/workflows/plan.md`
- `/issues:chore` → `.claude/commands/issues/chore.md`
- `/git:commit` → `.claude/commands/git/commit.md`

When a command is invoked, Claude Code expands the template content from the corresponding `.md` file and processes it as a prompt.

### Using $ARGUMENTS

Commands can accept arguments passed after the command name. These are available via the `$ARGUMENTS` variable:

```
/workflows:implement .claude/.cache/specs/feature-123.md
```

In the template, reference arguments with `$ARGUMENTS`:
```markdown
Follow the provided plan file (path passed via `$ARGUMENTS`) and implement each step.
```

Guidelines for `$ARGUMENTS`:
- Always document expected argument format in the command template
- Validate arguments exist before using them
- Provide clear error messages for missing/invalid arguments
- Use descriptive placeholders: `$ARGUMENTS` not `$1` or `$args`

### Validation Levels

Commands that modify code should specify their validation level:

| Level | Name | Scope | Commands |
|-------|------|-------|----------|
| 1 | Quick | Docs-only, config | `lint`, `typecheck` |
| 2 | Integration | Features, bugs, endpoints | Level 1 + `test --filter integration` |
| 3 | Release | Schema, auth, migrations | Level 2 + `test` (all) + `build` |

Reference: `/workflows:validate-implementation` for detailed validation procedures.

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
   - Domain expertise → `experts/`

2. **Use descriptive filenames** that reflect the command's purpose (e.g., `plan.md`, `commit.md`, `install.md`)

3. **Follow existing command format**:
   - Start with a heading: `# /command-name`
   - Include input parameters if applicable
   - Provide clear instructions for Claude Code
   - Specify expected output format
   - Document use cases and notes

4. **Maintain prompt-code alignment**: When creating commands that interact with Python automation code, follow the guidelines in `.claude/commands/docs/prompt-code-alignment.md` to ensure templates produce parseable output.

## Documentation References

- **`.claude/docs/prompt-levels.md`** - 7-level prompt maturity model documentation
- **conditional_docs/** - Layer-specific documentation guides (see "Conditional Documentation Structure" below)
- **anti-mock.md** - Testing philosophy and guidelines for writing tests without mocks
- **prompt-code-alignment.md** - Guidelines for ensuring slash command templates align with parsing code
- **CLAUDE.md** (root) - Complete project architecture and development workflows
- **automation/adws/README.md** - ADW automation pipeline documentation

## Conditional Documentation Structure

The `conditional_docs/` directory contains layer-specific documentation guides that help agents determine which KotaDB documentation to consult based on their task scope. This structure minimizes context window usage by loading only relevant documentation for each layer.

### Layer-Specific Files

- **app.md** - Application layer documentation (backend/API, database, testing, CI/CD)
  - Use when working on: `app/src/**`, database schema, Supabase integration, test infrastructure, GitHub Actions workflows
  - Coverage: API routes, authentication, rate limiting, indexer, MCP server, validation, queue system, migrations, antimocking philosophy, CI/CD setup

- **automation.md** - Automation layer documentation (ADW workflows, agent orchestration, worktree isolation)
  - Use when working on: `automation/adws/**`, ADW phase scripts, workflow triggers, log analysis, orchestrator
  - Coverage: ADW modules, phase architecture, worktree management, state persistence, Claude Code integration, resilience patterns, observability

- **web.md** - Web layer documentation (frontend/UI, client-side logic)
  - Use when working on: Web application features, UI components, client-side interactions
  - Coverage: Placeholder for future frontend documentation (no entries yet)

### When to Use Layer-Specific Docs

- **Backend/API development**: Read `conditional_docs/app.md` before starting work
- **Automation/ADW development**: Read `conditional_docs/automation.md` before starting work
- **Cross-layer changes**: Read relevant sections from multiple layer files as needed
- **New documentation**: Add entries to appropriate layer file(s) based on documentation scope

### Benefits

- **Reduced context window usage**: Agents load only relevant documentation for their layer
- **Improved maintainability**: Easier to navigate and update layer-specific documentation
- **Better separation of concerns**: Clear boundaries between application, automation, and web layers
- **Scalable pattern**: Easy to add new layers (CLI tools, SDKs, etc.) in future

## Troubleshooting

### Command Not Found
- Verify file exists: `ls .claude/commands/<subdirectory>/<command>.md`
- Check spelling and case sensitivity
- Ensure file has `.md` extension

### Arguments Not Passed
- Arguments must follow the command: `/command:name arg1 arg2`
- Multi-word arguments should be quoted if needed
- Check template uses `$ARGUMENTS` (not `$1` or `$args`)

### Output Format Issues
- Review template category requirements above
- Ensure forbidden meta-commentary patterns are not used
- Validate JSON output with `jq` for Structured Data commands

### Validation Failures
- Run validation commands manually to see detailed errors
- Check lint output: `cd app && bun run lint`
- Check typecheck output: `cd app && bunx tsc --noEmit`
- Ensure all dependencies installed: `cd app && bun install`

### Template Not Expanding
- Verify Claude Code has access to `.claude/` directory
- Check for syntax errors in markdown
- Ensure frontmatter (if present) is valid YAML

## Expert System

The `experts/` directory contains domain specialists that provide multi-perspective analysis for planning and code review. Each expert follows a three-command pattern:

### Expert Types

| Expert | Domain | Commands |
|--------|--------|----------|
| Architecture | Path aliases, component boundaries, data flow | `architecture_expert_plan`, `architecture_expert_review`, `architecture_expert_improve` |
| Testing | Antimocking, test patterns, coverage | `testing_expert_plan`, `testing_expert_review`, `testing_expert_improve` |
| Security | RLS, authentication, input validation | `security_expert_plan`, `security_expert_review`, `security_expert_improve` |
| Integration | MCP, Supabase, external APIs | `integration_expert_plan`, `integration_expert_review`, `integration_expert_improve` |

### Command Pattern

Each expert has three commands at different prompt maturity levels:

- **`_plan` (Level 5)**: Analyze requirements from domain perspective
  - Invocation: `/experts:architecture-expert:architecture_expert_plan <context>`
  - Output: Analysis, recommendations, risks

- **`_review` (Level 5)**: Review code changes from domain perspective
  - Invocation: `/experts:testing-expert:testing_expert_review <pr-context>`
  - Output: APPROVE/CHANGES_REQUESTED/COMMENT with findings

- **`_improve` (Level 6-7)**: Self-improve by analyzing git history
  - Invocation: `/experts:security-expert:security_expert_improve`
  - Effect: Updates Expertise sections in `_plan` and `_review` commands

### Orchestrators

Multi-expert coordination for comprehensive analysis:

- **Planning Council** (`/experts:orchestrators:planning_council <context>`)
  - Invokes all 4 experts in parallel
  - Synthesizes findings into single unified plan contribution
  - Identifies cross-cutting concerns and priority recommendations

- **Review Panel** (`/experts:orchestrators:review_panel <pr-context>`)
  - Invokes all 4 experts in parallel
  - Aggregates review status (CHANGES_REQUESTED if any expert flags it)
  - Produces single consolidated review decision

### Invocation Examples

```bash
# Single expert planning
/experts:architecture-expert:architecture_expert_plan "Add rate limiting to /search endpoint"

# Single expert review
/experts:testing-expert:testing_expert_review "#123"

# Multi-expert planning
/experts:orchestrators:planning_council "Implement user authentication flow"

# Multi-expert review
/experts:orchestrators:review_panel "PR #456"

# Self-improvement (run periodically)
/experts:architecture-expert:architecture_expert_improve
```

### Prompt Maturity Levels

The expert system uses the 7-level prompt maturity model. For complete documentation, see `.claude/docs/prompt-levels.md`.

| Level | Name | Characteristics |
|-------|------|-----------------|
| 1 | Static | Hardcoded instructions, no variables |
| 2 | Parameterized | Uses `$ARGUMENTS` for input |
| 3 | Conditional | Branches based on input or state |
| 4 | Contextual | References external files or context |
| 5 | Higher Order | Invokes other commands, accepts complex context |
| 6 | Self-Modifying | Updates own content based on execution |
| 7 | Meta-Cognitive | Reflects on and improves other commands |

Experts are Level 5-7, with `_improve` commands enabling knowledge accumulation.

## Command Organization History

The subdirectory structure was established in issue #58 to improve command discoverability and maintainability. Prior to this reorganization, all commands were stored in a flat directory structure at `automation/.claude/commands/`. The current structure provides better separation of concerns and makes it easier for developers to locate and understand available commands.
