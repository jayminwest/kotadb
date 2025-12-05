# Test Environment Lifecycle Management

**Template Category**: Message-Only
**Prompt Level**: 1 (Static)

Standardized patterns for running tests in slash commands to ensure reliable Supabase Local stack integration.

## Overview

KotaDB follows an **antimocking philosophy** that requires all tests to run against a real Supabase Local stack (PostgreSQL + PostgREST + GoTrue + Kong). This ensures test environment parity with production and prevents fragile stub-based testing patterns.

**Critical requirement**: The Supabase Local stack must be running before executing any test command. Tests will fail with cryptic connection errors if containers are not available.

## Test Environment Architecture

The test environment uses Docker-managed Supabase services:
- **PostgreSQL** (port 5434): Database with migrations and seed data
- **PostgREST** (port 54322): REST API for database access
- **GoTrue** (port 54325): Authentication service
- **Kong Gateway** (port 54326): API gateway (used by Supabase JS client in tests)

See `docs/testing-setup.md` for detailed architecture and configuration.

## Standard Test Execution Pattern

All slash commands that run tests MUST follow this lifecycle:

```bash
# 1. Verify Docker is available
if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker not found. Install Docker Desktop: https://docs.docker.com/get-docker/"
  exit 1
fi

# 2. Setup test environment (idempotent - safe to run multiple times)
cd app && bun test:setup

# 3. Run tests
cd app && bun test

# 4. Cleanup test environment (optional during development)
cd app && bun test:teardown || true
```

**Key principles:**
- **Idempotency**: `bun test:setup` checks for existing containers and reuses them if healthy
- **Error handling**: Always check Docker availability before setup
- **Cleanup safety**: Use `|| true` on teardown to prevent blocking on cleanup errors
- **Working directory**: All commands assume `app/` as the working directory

## Available Test Scripts

From `app/package.json`:

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `bun test:setup` | Start Supabase Local stack | Before running any tests |
| `bun test` | Run full test suite with real Supabase | After setup completes |
| `bun test --filter integration` | Run integration tests only | For faster validation during development |
| `bun test:teardown` | Stop and remove all Supabase containers | After tests complete or when cleaning up |
| `bun test:reset` | Reset database to clean state | When test data becomes corrupted |

## Docker Prerequisite Checks

Before running `bun test:setup`, verify Docker is available:

```bash
# Check Docker installation
if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker not found"
  echo "Install Docker Desktop: https://docs.docker.com/get-docker/"
  exit 1
fi

# Check Docker daemon is running
if ! docker info &> /dev/null 2>&1; then
  echo "ERROR: Docker daemon not running"
  echo "Start Docker Desktop and try again"
  exit 1
fi
```

## Anti-Patterns to Avoid

### DO NOT Use Pipe Operators with Bun Test

**Problem**: Commands like `bun test | grep` hang indefinitely in Claude Code sessions due to Bun's multi-stream output behavior (stdout + stderr).

**Bad example:**
```bash
# This will hang indefinitely
bun test | grep "passing"
```

**Good example:**
```bash
# Use built-in filtering instead
bun test --filter integration
```

### DO NOT Run Tests Without Setup

**Problem**: Tests fail with cryptic connection errors when Supabase containers aren't running.

**Bad example:**
```bash
# Will fail if containers not running
cd app && bun test
```

**Good example:**
```bash
# Ensure containers are running first
cd app && bun test:setup
cd app && bun test
```

### DO NOT Skip Teardown in CI or Automated Workflows

**Problem**: Stale containers accumulate and cause port conflicts or resource exhaustion.

**Bad example:**
```bash
# Containers left running after CI job
cd app && bun test:setup
cd app && bun test
```

**Good example:**
```bash
# Always cleanup in CI/automated contexts
cd app && bun test:setup
cd app && bun test
cd app && bun test:teardown || true
```

**Exception**: During local development, you may skip teardown to speed up subsequent test runs (containers stay warm).

## Troubleshooting

### Connection Errors
**Symptom**: Tests fail with "ECONNREFUSED" or "Could not connect to Supabase"
**Solution**: Run `cd app && bun test:setup` to start containers

### Port Conflicts
**Symptom**: Setup fails with "port already in use"
**Solution**: Run `cd app && bun test:teardown` to clean up existing containers, then retry setup

### Stale Container State
**Symptom**: Tests fail unexpectedly after previously passing
**Solution**: Reset database with `cd app && bun test:reset` or full cleanup with `cd app && bun test:teardown && bun test:setup`

### Docker Not Available
**Symptom**: `docker: command not found`
**Solution**: Install Docker Desktop from https://docs.docker.com/get-docker/

### Docker Daemon Not Running
**Symptom**: Setup fails with "Cannot connect to Docker daemon"
**Solution**: Start Docker Desktop application and wait for it to become ready

### Slow Initial Setup
**Symptom**: First `bun test:setup` takes 60+ seconds
**Explanation**: Docker must pull Supabase images on first run. Subsequent runs reuse cached images and are much faster (5-10 seconds).

## Integration with Validation Levels

From `.claude/commands/workflows/validate-implementation.md`:

**Level 1** (Quick Gate): No test execution
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
```

**Level 2** (Integration Gate): Requires test environment
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test:setup
cd app && bun test --filter integration
cd app && bun test:teardown || true
```

**Level 3** (Release Gate): Full test suite
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test:setup
cd app && bun test --filter integration
cd app && bun test
cd app && bun test:teardown || true
```

## CI Environment Considerations

GitHub Actions workflows (`.github/workflows/app-ci.yml`) use a different setup pattern:
- Uses Docker Compose for isolated project names (prevents concurrent run conflicts)
- Auto-generates `app/.env.test` from dynamic container ports
- Applies migrations directly via `psql` (bypasses Supabase CLI)
- Always runs cleanup step (even on failure)

See `docs/testing-setup.md` "CI/CD Testing Infrastructure" section for CI-specific implementation.

## References

- **Antimocking Philosophy**: `.claude/commands/docs/anti-mock.md`
- **Testing Setup Guide**: `docs/testing-setup.md`
- **Package Scripts**: `app/package.json` (scripts section)
- **CI Workflow**: `.github/workflows/app-ci.yml`
- **Validation Levels**: `.claude/commands/workflows/validate-implementation.md`
