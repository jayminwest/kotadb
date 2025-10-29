# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KotaDB is a lightweight HTTP API service for indexing and searching code repositories. Built with Bun + TypeScript and Supabase (PostgreSQL) for multi-tenant data isolation via RLS. Designed to power AI developer workflows through automated code intelligence.

## Quick Reference

```bash
# Start development environment
cd app && ./scripts/dev-start.sh

# Run tests
cd app && bun test

# Type-check
cd app && bunx tsc --noEmit

# Validate migration sync
cd app && bun run test:validate-migrations
```

## Critical Conventions

### Path Aliases

Always use TypeScript path aliases (defined in `app/tsconfig.json`):
- `@api/*`, `@auth/*`, `@db/*`, `@indexer/*`, `@mcp/*`, `@validation/*`, `@queue/*`
- `@shared/*` → `../shared/*` (shared types for monorepo)

### Migration Sync Requirement

Database migrations exist in **two locations** and must stay synchronized:
1. `app/src/db/migrations/` (source)
2. `app/supabase/migrations/` (copy for Supabase CLI)

Run `cd app && bun run test:validate-migrations` to check for drift.

Migration naming: `YYYYMMDDHHMMSS_description.sql` (generate: `date -u +%Y%m%d%H%M%S`)

### Logging Standards

- **TypeScript**: Use `process.stdout.write()` / `process.stderr.write()` (NEVER `console.*`)
- **Python**: Use `sys.stdout.write()` / `sys.stderr.write()` (NEVER `print()`)

Enforced by pre-commit hooks and CI validation.

### Testing Philosophy

**Antimocking**: All tests use real Supabase Local database connections for production parity.

See `.claude/commands/docs/anti-mock.md` for complete guidelines.

## Documentation Directory

### Development
- [Development Commands](./.claude/commands/app/dev-commands.md) - Quick start, server startup, testing
- [Environment Variables](./.claude/commands/app/environment.md) - Supabase config, ports, auto-generated files
- [Pre-commit Hooks](./.claude/commands/app/pre-commit-hooks.md) - Installation, troubleshooting, bypass

### Architecture
- [Architecture Overview](./.claude/commands/docs/architecture.md) - Path aliases, shared types, core components
- [Database Schema](./.claude/commands/docs/database.md) - Tables, RLS policies, migrations, Supabase Local
- [API Workflow](./.claude/commands/docs/workflow.md) - Auth flow, rate limiting, indexing, search, validation

### MCP Integration
- [MCP Integration](./.claude/commands/docs/mcp-integration.md) - Server architecture, tools, SDK behavior
- [MCP Usage Guidance](./.claude/commands/docs/mcp-usage-guidance.md) - When to use MCP vs direct operations

### Testing
- [Testing Guide](./.claude/commands/testing/testing-guide.md) - Antimocking philosophy, migration sync, commands
- [Logging Standards](./.claude/commands/testing/logging-standards.md) - TypeScript/Python logging rules

### AI Developer Workflows (ADW)
- [ADW Architecture](./.claude/commands/workflows/adw-architecture.md) - 3-phase system, atomic agents, resilience
- [ADW Observability](./.claude/commands/workflows/adw-observability.md) - Metrics analysis, CI integration

### CI/CD
- [CI Configuration](./.claude/commands/ci/ci-configuration.md) - GitHub Actions, parallelization, caching

### Issue Management
- [Issue Relationships](./.claude/commands/docs/issue-relationships.md) - Dependency types, prioritization
- [Beads Workflow](./.claude/commands/beads/) - SQLite-based issue tracker with git sync

## MCP Server Availability

KotaDB provides MCP servers for programmatic operations:
- **kotadb**: Code search, indexing, dependency analysis
- **beads**: Issue tracking, dependency management
- **playwright**: Browser automation (available via MCP)
- **sequential-thinking**: Complex reasoning tasks

See [MCP Usage Guidance](./.claude/commands/docs/mcp-usage-guidance.md) for decision matrix on when to use MCP tools vs direct file operations.

## Related Resources

- Complete automation architecture: `automation/adws/README.md`
- Testing setup details: `docs/testing-setup.md`
- MCP Claude Code integration: `docs/guides/mcp-claude-code-integration.md`
- Beads integration roadmap: Issue #300 (epic)
