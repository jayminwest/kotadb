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

**CLAUDE.md Structure (Navigation Gateway Pattern):**
- BLUF section: Quick-start commands and essential context (max 10 lines for scannability)
- Quick Start: Numbered 4-step workflow (prime, plan, implement, validate)
- Core Principles: Table mapping principles to commands and descriptions
- Command Navigation: Organized by category with 60+ commands in tables (workflows, issues, git, testing, docs, ci, tools, app, automation, worktree, release, validation)
- Common Workflows: End-to-end command sequences for typical tasks (5 main sequences)
- When Things Go Wrong: Diagnostic mappings from problems to commands
- Quick Reference: Shell commands for common operations
- Critical Conventions: Path aliases, migration sync, logging, testing, branching
- MCP Servers: Available MCP integrations
- Layer-Specific Documentation: Links to conditional docs (Added after #491)

**settings.json Configuration (Added after #491):**
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
            "timeout": 45000
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
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/context_builder.py",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```
- statusLine: Custom status line script (python3)
- hooks: PostToolUse and UserPromptSubmit automation with matchers and timeouts
- Hook scripts use shared utilities (hook_helpers.py) for JSON I/O and file detection
- Hooks include PreToolUse for tool blocking enforcement (Added after #214)

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

**Slash Command Organization (Added after #491):**
- Directory structure: `.claude/commands/<category>/<command>.md`
- Frontmatter required: `description`, `argument-hint` (if takes arguments)
- New fields (added #474): `Template Category`, `Prompt Level` (1-7)
- Naming convention: lowercase with underscores or hyphens
- Nested commands: `<category>:<subcategory>:<command>`
- Template Categories: Message-Only, Path Resolution, Action, Structured Data
- Prompt Levels: 1 (static reference) to 7 (self-modifying with reasoning)

**Expert Triad Pattern (Added after #490):**
- Three-command expert structure: `*_plan.md`, `*_review.md`, `*_improve.md`
- Each expert covers a SDLC phase: planning, review, and self-improvement
- Template Category for plan/review: Structured Data (Level 5 Higher Order)
- Template Category for improve: Action (Level 6 Self-Modifying)
- Improve command uses git log analysis to extract patterns and update expertise
- Experts: architecture, security, testing, integration, ux, cc_hook, claude-config

**Cascading Bulk Update Pattern (Added after #490):**
- Tier 1: `/tools:all-proj-bulk-update [docs]` - Master orchestrator
- Tier 2: Per-directory orchestrators spawned in parallel (agents, commands, hooks, docs)
- Tier 3: Specific subdirectory workers for detailed updates
- Used for synchronized updates across .claude directory structure

**Multi-Phase Orchestrator Pattern (Added after #490):**
- Generic orchestrator: `/experts:orchestrators:orchestrator <task> [phases=scout,plan,build]`
- Phase definitions: scout (exploration), plan (multi-expert analysis), build (implementation), review, validate
- Scout phase: Haiku model for read-only codebase exploration
- Plan phase: Sonnet model with multi-expert coordination, creates `docs/specs/` files
- Build phase: Parallel or sequential implementation based on file dependencies
- Review phase: Multi-expert code review, creates `docs/reviews/` files
- Validate phase: Test and quality gate execution
- Supports custom phase selection via `phases` parameter

**Layer-Specific Documentation Routing (Added after #491):**
- Backend/API patterns in `.claude/commands/docs/conditional_docs/app.md`
- Automation/ADW patterns in `.claude/commands/docs/conditional_docs/automation.md`
- Web/Frontend patterns in `.claude/commands/docs/conditional_docs/web.md`
- CLAUDE.md references `Layer-Specific Documentation` section
- Enables conditional guidance based on codebase layer

**settings.json Hook Configuration Pattern (Updated after #508):**
- Hook structure: PostToolUse, UserPromptSubmit, and PreToolUse with matcher patterns
- Matcher types: tool names (Write|Edit), empty string for all prompts, regex patterns
- Timeout values: milliseconds (45000 for PostToolUse, 10000 for UserPromptSubmit, 30000 for PreToolUse)
- Hook commands use environment variable: `$CLAUDE_PROJECT_DIR` for path resolution
- Multiple hooks per hook type with sequential execution
- PostToolUse: Triggered after Write/Edit operations for linting
- UserPromptSubmit: Triggered before processing user input for context building
- PreToolUse: Triggered before tool execution for tool blocking and enforcement (Added after #214)

**Hook Hook Nested Structure (Added after #214):**
- Hook configuration uses nested "hooks" array for multiple hook scripts
- Matcher field determines which tools/prompts trigger the hooks
- Each hook in the array gets matcher-level timeout
- Order matters: hooks execute sequentially

**Agent Registry Pattern (Added after #214):**
- JSON schema with capability and model indexes
- Agent definitions include name, description, file path, model, capabilities, tools
- Capability index maps capabilities to available agents
- Model index maps models (haiku, sonnet, opus) to agents
- Tool matrix maps tools to agents that can use them
- readOnly field indicates if agent can modify files
- Coordinator agents use leaf_spawner tools for delegation

**Agent Coordinator Pattern (Added after #214):**
- Branch coordinator agents (plan, build, review, meta) use leaf_spawner tools
- Leaf spawner tool for spawning agents: `mcp__leaf_spawner__spawn_leaf_agent`
- Agent types supported: retrieval, build, review, custom template names
- Timeout specification: up to 600000ms (10 minutes)
- Coordinator agents spawn leaf agents in parallel or sequence based on dependencies

**Universal Entry Point Pattern (Added after #214):**
- `/do` command for end-to-end issue resolution
- Auto-discover ADW state by issue number
- Support multiple input formats: issue number, GitHub URL, free-form text
- Autonomous workflow: scout → plan → build → review → validate
- Auto-fix loops for validation failures
- No user checkpoints, commit on success

**Orchestrator Context Detection Hook (Added after #214):**
- UserPromptSubmit hook: `orchestrator_context.py` detects orchestrator commands
- Patterns: `/do`, `/workflows/orchestrator`, `/experts/orchestrators/`, command-orchestrator
- Persists context to state file: `.claude/data/orchestrator_context.json`
- Sets environment variable: `CLAUDE_ORCHESTRATOR_CONTEXT`
- Enables downstream enforcement (PreToolUse guard hook)

**Orchestrator Guard Hook Pattern (Added after #214):**
- PreToolUse hook: `orchestrator_guard.py` enforces orchestrator pattern
- Blocks file modification tools (Write, Edit, MultiEdit, NotebookEdit) in orchestrator context
- Allows specific tools: Read, Grep, Glob, Bash, Task, SlashCommand, etc.
- Reads context from state file for cross-process enforcement
- Provides helpful error message directing to Task delegation

**Anti-Patterns Discovered:**
- CLAUDE.md with outdated command references (discovered #491)
- settings.json with invalid JSON syntax or commented-out code (discovered #486)
- Missing MCP server configurations for required tools
- Duplicate command definitions across directories
- Overly long CLAUDE.md sections exceeding 50 lines without subsections (discovered #482)
- Command descriptions that don't match actual behavior
- Commands missing Template Category or Prompt Level annotations (fixed #487)
- Hardcoded paths in CLAUDE.md instead of command references (discovered #482)
- Orchestrator prompts with inconsistent phase definitions (discovered #490)
- Multi-tier update strategies without clear responsibility boundaries (addressed #491)
- Hook timeout values as raw seconds instead of milliseconds (discovered #508)
- Hook matcher patterns without pipe operator for multiple tool names (discovered #508)
- Hook configuration without nested "hooks" array structure (discovered #214)
- Agent registry missing capability or model indexes (discovered #214)
- ADW commands not supporting issue auto-discovery (discovered #214)
- Missing orchestrator context detection and guard hooks (discovered #214)

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
2. **Identify Scope**: Determine affected config areas (CLAUDE.md, settings, commands, hooks, agents)
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
