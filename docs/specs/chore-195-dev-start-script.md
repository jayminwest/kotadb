# Chore Plan: Automate Development Environment Setup

## Context
The current development environment setup process requires manual execution of 5+ sequential steps, leading to common failure modes:
- Supabase container port conflicts from stale processes
- Misconfigured `.env` files with incorrect ports (54322 vs 54321)
- Missing CORS configuration blocking web app communication
- Inconsistent environment state across developers

This chore creates a unified `dev-start.sh` script to automate the entire development environment lifecycle, reducing setup time from 5-10 minutes of manual intervention to a single command.

**Timing**: Non-blocking maintenance work. No external deadline, but high developer QoL impact.

**Additional Requirements** (from command args):
- Add `--mcp-start` flag to start MCP server alongside API
- Add `--adws-mcp-start` flag to start ADW automation MCP server
- Both flags should integrate with existing health check and background process management

## Relevant Files
- `app/scripts/dev-start.sh` — New automation script (main deliverable)
- `app/.env.sample` — Template for environment variables (reference for parsing)
- `CLAUDE.md` — Project documentation (update development commands section)
- `.claude/commands/docs/conditional_docs.md` — Add condition for when to reference dev-start.sh

### New Files
- `app/scripts/dev-start.sh` — Development environment automation script with Supabase lifecycle, .env generation, dependency validation, API server startup, optional web app startup, and MCP server integration

## Work Items

### Preparation
- Verify Supabase CLI installation and Docker availability
- Review current `.env.sample` structure to determine required variables
- Test `supabase start` output format to validate parsing logic
- Check current CORS configuration in API server (app/src/api/routes.ts)
- Review existing scripts in `app/scripts/` for consistency patterns

### Execution
1. Create `app/scripts/dev-start.sh` with executable permissions (`chmod +x`)
2. Implement Supabase lifecycle management:
   - Stop existing containers (`supabase stop || true`)
   - Start fresh instance with output capture
   - Parse API URL, anon key, and service key from output
3. Implement `.env` file generation/update:
   - Extract current `.env` values (if exists) to preserve non-Supabase vars
   - Generate new `.env` with correct Supabase credentials
   - Set default `PORT=3000` and `KOTA_GIT_BASE_URL=https://github.com`
4. Add dependency validation (`bun install` if `node_modules/` missing)
5. Implement API server startup with background process management:
   - Start `bun run src/index.ts` in background
   - Capture PID for cleanup tracking
   - Add health check retry loop (10 attempts, 1s interval)
6. Add `--web` flag support for optional web app startup:
   - Start `npm run dev` in `../web` directory
   - Capture web app PID
7. Add `--mcp-start` flag support for MCP server startup:
   - Start MCP server process in background
   - Add MCP server health check
   - Integrate with cleanup tracking
8. Add `--adws-mcp-start` flag support for ADW automation MCP server:
   - Start ADW MCP server process in background
   - Add ADW MCP server health check
   - Integrate with cleanup tracking
9. Add error handling for common failure scenarios:
   - Docker not running
   - Supabase CLI not installed
   - Port conflicts (API, web app, MCP servers)
   - Bun not installed
10. Add cleanup trap for graceful shutdown on SIGINT/SIGTERM
11. Update `CLAUDE.md` development commands section with new script usage
12. Update `.claude/commands/docs/conditional_docs.md` to reference dev-start.sh when discussing development environment setup

### Follow-up
- Test script from clean state (no containers, no `.env`)
- Test script restart scenario (existing containers, existing `.env`)
- Verify `.env` contains correct Supabase URL and keys
- Verify API health check succeeds
- Verify `--web` flag starts web app correctly
- Verify `--mcp-start` flag starts MCP server correctly
- Verify `--adws-mcp-start` flag starts ADW MCP server correctly
- Test error messages for missing dependencies
- Confirm CORS configuration allows web app → API communication

## Step by Step Tasks

### Environment Analysis
- Read `app/.env.sample` to identify all required environment variables
- Test `supabase start` command locally to confirm output format
- Identify current CORS configuration in `app/src/api/routes.ts`

### Script Implementation
- Create `app/scripts/dev-start.sh` with proper shebang (`#!/bin/bash`)
- Add `set -e` for fail-fast behavior
- Implement Supabase stop/start lifecycle with output parsing
- Implement `.env` generation logic with variable preservation
- Add dependency check (`[ ! -d "node_modules" ] && bun install`)
- Implement API server background startup with PID tracking
- Add health check retry loop with timeout
- Implement `--web` flag with conditional web app startup
- Implement `--mcp-start` flag with MCP server startup and health check
- Implement `--adws-mcp-start` flag with ADW MCP server startup and health check
- Add cleanup trap: `trap "kill $API_PID $WEB_PID $MCP_PID $ADWS_MCP_PID 2>/dev/null" EXIT`
- Add user-friendly status messages and error handling

### Documentation Updates
- Update `CLAUDE.md` "Development Commands" section with `./scripts/dev-start.sh [--web] [--mcp-start] [--adws-mcp-start]`
- Add usage examples for different startup scenarios
- Document flags: `--web` (start web app), `--mcp-start` (start MCP server), `--adws-mcp-start` (start ADW MCP server)
- Update `.claude/commands/docs/conditional_docs.md` with new condition:
  ```
  - **Development Environment Setup**: `docs/specs/chore-195-dev-start-script.md`
    - When: User mentions "dev environment", "local setup", "starting development", or asks about Supabase configuration
  ```

### Validation
- Run `chmod +x app/scripts/dev-start.sh` to make script executable
- Test clean start: `cd app && ./scripts/dev-start.sh`
- Test restart: run script twice in succession
- Test web flag: `cd app && ./scripts/dev-start.sh --web`
- Test MCP flag: `cd app && ./scripts/dev-start.sh --mcp-start`
- Test ADW MCP flag: `cd app && ./scripts/dev-start.sh --adws-mcp-start`
- Test combined flags: `cd app && ./scripts/dev-start.sh --web --mcp-start --adws-mcp-start`
- Verify `.env` correctness (compare `SUPABASE_URL` with `supabase status` output)
- Verify API health: `curl http://localhost:3000/health`
- Verify error handling: test with Docker stopped, Bun uninstalled (in isolated environment)
- Run standard validation suite: `cd app && bun run lint && bunx tsc --noEmit && bun test`
- Stage all changes: `git add app/scripts/dev-start.sh CLAUDE.md .claude/commands/docs/conditional_docs.md docs/specs/chore-195-dev-start-script.md`
- Commit with validated message format (avoid meta-commentary)
- Push branch to origin: `git push -u origin chore/195-dev-start-script`

## Risks

**Risk**: Supabase output format changes break parsing logic
**Mitigation**: Add fallback to manual prompt if parsing fails; document expected output format in comments

**Risk**: Port conflicts from non-Supabase processes (e.g., other PostgreSQL instances on 5432)
**Mitigation**: Check port availability before starting; provide clear error message with conflict resolution steps

**Risk**: Script fails mid-execution leaving environment in inconsistent state
**Mitigation**: Use `set -e` for fail-fast; add cleanup trap to kill background processes on error

**Risk**: `.env` file corruption if script interrupted during write
**Mitigation**: Write to `.env.tmp` first, then `mv` atomically; preserve backup as `.env.backup`

**Risk**: Health check timeout if API server slow to start (cold start with migrations)
**Mitigation**: Increase retry attempts from 10 to 30 (30s total timeout); add verbose logging for diagnosis

**Risk**: MCP server or ADW MCP server startup conflicts or missing dependencies
**Mitigation**: Add prerequisite checks for MCP server dependencies; document required setup in error messages

## Validation Commands

**Standard suite:**
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test
```

**Script-specific validation:**
```bash
# Test clean start
cd app && ./scripts/dev-start.sh

# Test restart (should handle existing containers/processes)
cd app && ./scripts/dev-start.sh

# Test web app integration
cd app && ./scripts/dev-start.sh --web

# Test MCP server integration
cd app && ./scripts/dev-start.sh --mcp-start

# Test ADW MCP server integration
cd app && ./scripts/dev-start.sh --adws-mcp-start

# Test combined flags
cd app && ./scripts/dev-start.sh --web --mcp-start --adws-mcp-start

# Verify .env correctness
cat app/.env | grep SUPABASE_URL
supabase status | grep "API URL"

# Verify API health
curl http://localhost:3000/health

# Verify graceful shutdown (Ctrl+C should kill all background processes)
cd app && ./scripts/dev-start.sh --web --mcp-start --adws-mcp-start
# Press Ctrl+C
ps aux | grep -E "(bun|supabase)" # Should show no orphaned processes
```

**Error scenario testing** (in isolated VM or container):
```bash
# Docker not running
systemctl stop docker && ./scripts/dev-start.sh

# Supabase CLI missing
mv $(which supabase) /tmp && ./scripts/dev-start.sh

# Bun not installed
docker run --rm -it ubuntu:22.04 /bin/bash
# ... copy script and test
```

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `chore(scripts): <subject>`
- Valid scope: `scripts` for shell script changes, `docs` for documentation updates
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(scripts): automate dev environment setup` not `Based on the plan, this commit should automate development environment setup`

**Example valid commits:**
```
chore(scripts): automate dev environment setup with dev-start.sh
docs: update CLAUDE.md with dev-start.sh usage
chore(scripts): add --web flag for optional web app startup
chore(scripts): add --mcp-start and --adws-mcp-start flags for MCP server integration
```

## Deliverables
- **Code changes**: `app/scripts/dev-start.sh` executable script with Supabase lifecycle, .env generation, health checks, and MCP integration
- **Config updates**: None (script generates `.env` dynamically from Supabase output)
- **Documentation updates**:
  - `CLAUDE.md`: Add `./scripts/dev-start.sh [--web] [--mcp-start] [--adws-mcp-start]` to development commands
  - `.claude/commands/docs/conditional_docs.md`: Add condition for development environment setup context
  - `docs/specs/chore-195-dev-start-script.md`: This maintenance plan
