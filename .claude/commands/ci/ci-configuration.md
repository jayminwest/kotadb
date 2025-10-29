# CI Configuration

GitHub Actions workflows, parallelization, caching strategy, and push trigger patterns for KotaDB.

## GitHub Actions Workflows

### Application CI (`.github/workflows/app-ci.yml`)

Tests the TypeScript/Bun application layer.

#### Workflow Structure

Parallelized for ~15s runtime improvement:

- **`setup` job**: Installs dependencies, validates migration sync, caches node_modules
- **`typecheck` job**: Runs type-checking for shared types and application (depends on setup)
- **`lint` job**: Runs ESLint validation (depends on setup)
- **`test` job**: Runs full test suite (depends on typecheck and lint)

#### Caching Strategy

Uses `actions/cache@v4` with `bun-${{ hashFiles('app/bun.lockb') }}` key for node_modules reuse across parallel jobs.

#### Test Environment

- Uses Docker Compose with isolated project names
- Runs `.github/scripts/setup-supabase-ci.sh` to start containerized Supabase stack
- Auto-generates `app/.env.test` from Docker Compose container ports for dynamic credentials
- Executes full test suite (133 tests) against real Supabase stack (PostgreSQL + PostgREST + Kong + Auth)
- Ensures **exact parity** between local and CI testing environments (antimocking compliance)
- **Project isolation**: Unique project names prevent port conflicts across concurrent CI runs

#### Migration Application

Migrations applied directly to containerized Postgres via `psql` (bypasses Supabase CLI).

#### Teardown

Cleanup via `app/scripts/cleanup-test-containers.sh` in cleanup step (always runs).

#### Parallel Execution

Typecheck and lint jobs run concurrently after setup completes, reducing total workflow runtime.

### Automation CI (`.github/workflows/automation-ci.yml`)

Tests the Python automation layer.

- Runs pytest suite (63 tests) for ADW workflow validation
- Python syntax check on all modules (`adws/adw_modules/*.py`, `adws/adw_phases/*.py`)
- Uses `uv` package manager with dependency caching for fast builds
- Configures git identity for worktree isolation tests
- Path filtering: only runs on changes to `automation/**`
- Validates automation infrastructure without external service dependencies
- **Target runtime**: < 2 minutes for full test suite execution

## Push Trigger Strategy for Feature Branches

All CI workflows trigger on both `push` and `pull_request` events to ensure validation regardless of PR creation timing.

This prevents PRs from merging without CI validation when commits are pushed before PR creation (common in worktree workflows).

## Supported Branch Patterns

Issue #193:

- `main` - Production branch
- `develop` - Development integration branch
- `feat/**` - Feature branches
- `bug/**` - Bug fix branches
- `chore/**` - Chore branches
- `fix/**` - Alternative fix branch naming
- `refactor/**` - Refactoring branches
- `interactive-*` - Interactive worktree branches (created via `/spawn_interactive`)

## Trigger Behavior

- Push to any supported branch triggers CI workflows (filtered by path)
- Pull requests trigger CI workflows for code review validation
- Fork PRs rely on `pull_request` trigger (push triggers may be restricted by GitHub security)
- Path filters limit CI runs to relevant component changes

## Monitoring

- Track GitHub Actions minutes consumption via Settings → Billing
- Alert if consumption increases >10% from baseline
- Path filters mitigate unnecessary CI runs

## Test Environment Variable Loading Strategy

### Problem

CI uses dynamic Docker Compose ports, but tests were hardcoding `localhost:54322`.

### Solution

Tests automatically load `.env.test` via preload script before running.

### Implementation

- `app/tests/setup.ts`: Preload script that parses `.env.test` and loads into `process.env`
- `app/package.json`: Test script uses `bun test --preload ./tests/setup.ts`
- `app/tests/helpers/db.ts`: Reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `process.env` with fallback to defaults
- All test files removed hardcoded env var assignments (lines like `process.env.SUPABASE_URL = "http://localhost:54322"`)
- CI workflow: Preload script automatically loads `app/.env.test` (no manual export needed)
- Local development: Preload script loads `.env.test` automatically, falls back to standard ports if file missing

### Validation

Run `cd app && bun run test:validate-env` to detect hardcoded environment variable assignments in tests.

### Result

Tests automatically respect dynamic ports from `app/.env.test` in both CI and local development.

## Related Documentation

- [Testing Guide](./.claude/commands/testing/testing-guide.md)
- [Database Schema](./.claude/commands/docs/database.md)
- [Environment Variables](./.claude/commands/app/environment.md)
- [ADW Observability](./.claude/commands/workflows/adw-observability.md)
