# CLAUDE.md

## BLUF

KotaDB is a local-only code intelligence API (Bun + TypeScript + SQLite). Use `/do` for everything.

## Quick Start

**Primary Entry Point:**
```
/do <request>
```

The `/do` command routes your request to the appropriate workflow:
- GitHub issues: `#123`, URLs, or SDLC keywords
- Expert domains: Claude config and agent authoring tasks
- Questions: "How do I..." style queries

**Examples:**
```
/do #123                              # Work on GitHub issue
/do "Create a slash command for X"   # Claude config task
/do "What tools should an agent have?" # Question
```

## Preserved Commands

For specific operations, these commands remain available:

| Category | Commands |
|----------|----------|
| **Git** | `/git:commit`, `/git:pull_request` |
| **Issues** | `/issues:feature`, `/issues:bug`, `/issues:chore`, `/issues:refactor`, `/issues:classify_issue`, `/issues:audit`, `/issues:prioritize` |
| **Tools** | `/tools:install`, `/tools:bun_install`, `/tools:pr-review`, `/tools:question`, `/tools:tools` |
| **Docs** | `/docs:load-ai-docs`, `/docs:mcp-integration`, `/docs:mcp-usage-guidance`, `/docs:kotadb-agent-usage` |
| **Release** | `/release:release` |
| **Validation** | `/validation:resolve_failed_validation` |

## Expert Domains

Two expert domains provide specialized knowledge with plan, build, improve, and question agents:

| Domain | Purpose | Location |
|--------|---------|----------|
| `claude-config` | .claude/ configuration (commands, hooks, settings) | `.claude/agents/experts/claude-config/` |
| `agent-authoring` | Agent creation (frontmatter, tools, registry) | `.claude/agents/experts/agent-authoring/` |

**Usage via /do:**
- Implementation: `/do "Add new hook for X"` (plan -> approval -> build -> improve)
- Questions: `/do "How do I create a slash command?"` (direct answer)

## Critical Conventions

**Path Aliases**: Use `@api/*`, `@db/*`, `@indexer/*`, `@mcp/*`, `@validation/*`, `@shared/*`

**Logging**: Use `process.stdout.write()` / `process.stderr.write()` (never `console.*`)

**Branching**: `feat/*`, `bug/*`, `chore/*` -> `develop` -> `main`

**Storage**: SQLite only (local mode)

## Quick Reference

```bash
# Start development
cd app && bun run src/index.ts

# Run tests
cd app && bun test

# Type-check
cd app && bunx tsc --noEmit

# Lint
cd app && bun run lint
```

## MCP Server

KotaDB provides MCP tools for code search, indexing, and dependency analysis. See `/docs:mcp-usage-guidance` for the decision matrix on when to use MCP vs direct operations.
