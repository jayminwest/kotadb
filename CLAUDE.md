# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KotaDB is a lightweight HTTP API service for indexing and searching code repositories. Built with Bun + TypeScript and Supabase (PostgreSQL) for multi-tenant data isolation via RLS. Designed to power AI developer workflows through automated code intelligence.

## Branching Strategy

**Default Branch**: `develop` (all PRs merge here for continuous integration)

**Git Flow**:
- Feature branches (`feat/*`, `bug/*`, `chore/*`) merge into `develop`
- `develop` accumulates tested changes and merges into `main` for production releases
- Direct commits to `develop` or `main` are discouraged; use feature branches + PRs
- GitHub auto-close for issues works when PRs merge into `develop` (the default branch)

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

# Configure indexer batch size (optional - defaults to 50)
# Set INDEXER_BATCH_SIZE=<value> in app/.env to tune for repository size
# Larger batches = fewer database calls, smaller batches = better progress tracking
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

### Dev-Mode Session Endpoint

For **testing and development only**: `/auth/dev-session` generates authenticated Supabase sessions for Playwright agents that cannot complete GitHub OAuth headlessly.

- **Security**: Strict production guard (requires both `NODE_ENV !== 'production'` AND `VERCEL_ENV !== 'production'`)
- **Location**: `web/app/auth/dev-session/route.ts`
- **Helper Utilities**: `web/lib/playwright-helpers.ts` (cookie injection, session management)
- **Requirements**: `SUPABASE_SERVICE_ROLE_KEY` env var (admin API access)
- **Middleware**: Exempted from auth checks via middleware matcher
- **Spec**: `docs/specs/feature-317-dev-session-endpoint.md`

```bash
# Create test session
curl -X POST http://localhost:3001/auth/dev-session \
  -H "Content-Type: application/json" \
  -d '{"email":"test@local.dev","tier":"free"}'
```

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
- [ADW Exit Codes](./automation/adws/docs/exit-codes.md) - Standardized exit codes for debugging (blockers, validation, execution, resources)

### CI/CD
- [CI Configuration](./.claude/commands/ci/ci-configuration.md) - GitHub Actions, parallelization, caching, path filtering

### Deployment
- [Staging Environments](./docs/deployment/staging-environments.md) - Vercel preview deployments, backend configuration, environment variables

### Issue Management
- [Issue Relationships](./.claude/commands/docs/issue-relationships.md) - Dependency types, prioritization
- [Beads Workflow](./.claude/commands/beads/) - SQLite-based issue tracker with git sync
- [Beads ADW Integration](./.claude/commands/docs/beads-adw-integration.md) - Workflow integration, atomic operations
- [GitHub-Beads Sync](./.claude/commands/beads/sync-github.md) - Maintain GitHub and Beads alignment

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
