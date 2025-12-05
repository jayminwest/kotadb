# Development Commands

**Template Category**: Message-Only
**Prompt Level**: 1 (Static)

Quick reference for common development commands. All commands should be run from the `app/` directory.

## Quick Start (Recommended)

```bash
cd app && ./scripts/dev-start.sh            # Start Supabase + API server
cd app && ./scripts/dev-start.sh --web      # Start Supabase + API + web app
cd app && ./scripts/dev-start.sh --mcp-start --adws-mcp-start  # Include MCP servers
```

The `dev-start.sh` script automates:
- Supabase container lifecycle (stop existing, start fresh)
- `.env` file generation with correct Supabase credentials
- Dependency installation (if `node_modules/` missing)
- API server startup with health check validation
- Optional web app startup (`--web` flag)
- Optional MCP server startup (`--mcp-start` flag)
- Optional ADW MCP server startup (`--adws-mcp-start` flag)
- Graceful cleanup on Ctrl+C (kills all background processes)

Press Ctrl+C to stop all services.

## Manual Server Startup

```bash
cd app && bun run src/index.ts              # Start server (default port 3000)
cd app && PORT=4000 bun run src/index.ts    # Start with custom port
cd app && bun --watch src/index.ts          # Watch mode for development
```

## Testing Commands

```bash
cd app && bun test                          # Run test suite
DEBUG=1 cd app && bun test                  # Verbose test output (auth logs, setup details)
cd app && bunx tsc --noEmit                # Type-check without emitting files
cd app && bun run test:validate-migrations # Validate migration sync
cd app && bun run test:validate-env        # Detect hardcoded environment URLs in tests
```

## Test Database Management

```bash
./scripts/setup-test-db.sh       # Start Supabase Local test database
./scripts/reset-test-db.sh       # Reset test database to clean state
```

## Docker

```bash
docker compose up dev   # Run in development container (builds from app/ directory)
```

Note: The Docker build context for application services (`dev`, `home`) is set to the `app/` directory.

## Related Documentation

- [Environment Variables](./.claude/commands/app/environment.md)
- [Pre-commit Hooks](./.claude/commands/app/pre-commit-hooks.md)
- [Testing Guide](./.claude/commands/testing/testing-guide.md)
