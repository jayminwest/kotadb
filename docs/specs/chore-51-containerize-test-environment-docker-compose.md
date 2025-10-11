# Chore Plan: Containerize Test Environment with Docker Compose for Project Isolation

## Context

The current test infrastructure uses Supabase CLI's global state management (`supabase start`/`supabase stop`), which causes port conflicts and state collision when multiple KotaDB projects (or other Supabase projects) run on the same machine. This creates friction for developers working across multiple branches or projects simultaneously.

**Current Problems:**
- Global Supabase CLI state prevents simultaneous test runs across projects
- Port conflicts occur even with custom `config.toml` port settings
- Cleanup dependency: forgetting `supabase stop` breaks subsequent test runs
- State persistence between runs can cause test pollution
- Different setup flow between local development and CI (violates dev/CI parity)

**Why this matters now:**
- Developers working on multiple branches or projects experience port conflicts
- Test isolation is compromised by shared global state
- Forgotten cleanup steps break subsequent test runs (poor developer experience)
- Violates the antimocking philosophy goal of identical local/CI environments

**Constraints:**
- Must maintain test execution time under 2 minutes in CI
- Must preserve all 133 existing tests without modification
- Must maintain antimocking compliance (real services, zero mocks)
- Must keep existing Supabase CLI workflow available for manual development

## Relevant Files

### Modified Files
- `scripts/setup-test-db.sh` — Replace Supabase CLI calls with Docker Compose project isolation
- `scripts/reset-test-db.sh` — Update to work with Docker Compose containers
- `scripts/generate-env-test.sh` — Modify to extract credentials from Docker containers instead of Supabase CLI
- `.github/workflows/ci.yml` — Update to use Docker Compose instead of Supabase CLI
- `.github/scripts/setup-supabase-ci.sh` — Replace Supabase CLI logic with Docker Compose
- `docs/testing-setup.md` — Update with Docker Compose approach and troubleshooting
- `README.md` — Update test setup instructions
- `CLAUDE.md` — Update testing infrastructure notes
- `.claude/commands/conditional_docs.md` — Add condition for this spec document

### New Files
- `docker-compose.test.yml` — Isolated test stack definition (PostgreSQL + PostgREST + Kong + Auth)
- `scripts/cleanup-test-containers.sh` — Guaranteed cleanup script (trap-based)
- `scripts/generate-env-test-compose.sh` — Extract credentials from Docker Compose containers
- `docs/specs/chore-51-containerize-test-environment-docker-compose.md` — This plan document

## Work Items

### Preparation
1. Create `docker-compose.test.yml` with full Supabase stack definition
2. Verify Docker Compose dynamic port allocation behavior
3. Test unique project name generation strategy
4. Confirm Docker Compose works in GitHub Actions environment

### Execution
1. **Create Docker Compose Test Stack**
   - Define `docker-compose.test.yml` with PostgreSQL, PostgREST, Kong, Auth services
   - Pin service versions to match Supabase Local defaults
   - Configure for ephemeral usage (no persistent volumes)
   - Use environment variables for dynamic configuration

2. **Refactor Test Scripts**
   - Update `scripts/setup-test-db.sh` to use Docker Compose with unique project names
   - Create `scripts/generate-env-test-compose.sh` to inspect running containers
   - Create `scripts/cleanup-test-containers.sh` with trap handlers for guaranteed cleanup
   - Update `scripts/reset-test-db.sh` for container-based database reset
   - Add `scripts/run-migrations-compose.sh` to apply migrations directly to containerized Postgres

3. **Update CI Workflow**
   - Modify `.github/workflows/ci.yml` to use Docker Compose instead of Supabase CLI
   - Update `.github/scripts/setup-supabase-ci.sh` to use Docker Compose project isolation
   - Ensure cleanup runs even on test failure (always condition)
   - Verify CI execution time remains under 2 minutes

4. **Update Documentation**
   - Update `docs/testing-setup.md` with Docker Compose workflow
   - Add troubleshooting section for containerization issues
   - Document how to use Supabase CLI for manual dev (unchanged)
   - Update `README.md` with new test setup commands
   - Update `CLAUDE.md` with testing infrastructure notes
   - Add conditional documentation entry for this spec

### Follow-up
1. Monitor CI execution time across multiple PRs (target: <2 minutes)
2. Test simultaneous test runs for 2+ KotaDB projects locally
3. Verify cleanup guarantees with ctrl-c and deliberate test failures
4. Validate all 133 tests pass consistently in both local and CI environments

## Step by Step Tasks

### 1. Create Docker Compose Test Stack
- Create `docker-compose.test.yml` with services: db, rest, auth, kong
- Pin versions: `supabase/postgres:15.1.0.147`, `postgrest/postgrest:v12.0.1`, `supabase/gotrue:v2.99.0`, `kong:2.8.1`
- Configure db service with test credentials (postgres/postgres)
- Configure PostgREST to connect to db and expose schemas (public, auth)
- Configure Auth (gotrue) with JWT secret and db connection
- Configure Kong with declarative config (reuse `supabase/kong.yml`)
- Use dynamic port allocation (no hardcoded ports)
- Add health checks for reliable startup detection

### 2. Create Migration Runner Script
- Create `scripts/run-migrations-compose.sh` to apply migrations from `src/db/migrations/*.sql`
- Use `psql` to connect to containerized Postgres (bypass Supabase CLI)
- Accept project name as parameter to target correct container
- Run migrations in order (sorted by filename)
- Verify each migration succeeds before continuing

### 3. Create Container Credential Extraction Script
- Create `scripts/generate-env-test-compose.sh` with project name parameter
- Use `docker compose -p <project> port <service> <internal_port>` to get dynamic ports
- Extract DB credentials from container environment variables
- Generate `.env.test` with proper format (SUPABASE_URL, SUPABASE_SERVICE_KEY, etc.)
- Handle missing containers gracefully with error messages

### 4. Create Cleanup Script with Trap Handlers
- Create `scripts/cleanup-test-containers.sh` with project name parameter
- Use `docker compose -p <project> down -v` to destroy containers and volumes
- Add trap handlers for SIGINT, SIGTERM, EXIT
- Ensure cleanup runs even on script failure

### 5. Refactor Setup Script
- Update `scripts/setup-test-db.sh` to generate unique project name (`kotadb-test-$(date +%s)-$$`)
- Replace `supabase start` with `docker compose -p $PROJECT_NAME -f docker-compose.test.yml up -d`
- Wait for services to be healthy (poll health checks)
- Call `scripts/generate-env-test-compose.sh $PROJECT_NAME` to create `.env.test`
- Call `scripts/run-migrations-compose.sh $PROJECT_NAME` to apply migrations
- Seed test data using `psql` (same as before)
- Add trap handler to call cleanup script on exit
- Store project name in `.test-project-name` file for other scripts

### 6. Update Reset Script
- Update `scripts/reset-test-db.sh` to read project name from `.test-project-name`
- Use `docker compose -p $PROJECT_NAME exec db psql ...` to truncate tables
- Re-seed test data after truncation
- Fall back to error message if no project name found

### 7. Update CI Setup Script
- Update `.github/scripts/setup-supabase-ci.sh` to use Docker Compose approach
- Remove Supabase CLI installation dependency (use Docker Compose directly)
- Generate unique project name for CI run
- Follow same flow as local setup script
- Ensure cleanup happens in workflow's always-run teardown step

### 8. Update CI Workflow
- Modify `.github/workflows/ci.yml` to remove `supabase/setup-cli@v1` action
- Update setup step to run refactored `.github/scripts/setup-supabase-ci.sh`
- Update teardown step to use cleanup script instead of `supabase stop`
- Read project name from `.test-project-name` for teardown

### 9. Update Documentation
- Update `docs/testing-setup.md` Architecture section with Docker Compose details
- Add "Project Isolation" section explaining unique project names
- Update troubleshooting section with Docker Compose-specific issues
- Add note about Supabase CLI still available for manual development
- Update `README.md` test setup section to reference Docker Compose approach
- Update `CLAUDE.md` testing infrastructure notes
- Add entry to `.claude/commands/conditional_docs.md` for this spec

### 10. Validation and Cleanup
- Run `bunx tsc --noEmit` to verify type checking
- Run `bun run lint` to verify linting passes
- Run `bun run test:validate-migrations` to check migration sync
- Test containerized setup locally: `bun run test:setup && bun test`
- Test simultaneous test runs (open 2+ terminal windows, run `bun test` in each)
- Verify cleanup works with ctrl-c during test run
- Verify cleanup works when tests fail deliberately
- Push branch and verify CI passes with new approach
- Verify CI execution time remains under 2 minutes
- Create git branch: `git checkout -b chore/51-containerize-test-environment-docker-compose`
- Stage all changes: `git add -A`
- Commit changes with descriptive message
- Push branch: `git push -u origin chore/51-containerize-test-environment-docker-compose`
- Run `/pull_request chore/51-containerize-test-environment-docker-compose <issue_json> docs/specs/chore-51-containerize-test-environment-docker-compose.md <adw_id>` to create PR

## Risks

| Risk | Mitigation |
|------|------------|
| **Docker Compose adds startup overhead** | Accept trade-off for true isolation; monitor actual duration and optimize if >2min total |
| **Dynamic port allocation may fail** | Docker Compose handles this reliably; add fallback error messages if port detection fails |
| **Migrations may fail without Supabase CLI** | Create dedicated migration runner script using `psql`; test thoroughly before rollout |
| **Cleanup may fail leaving orphaned containers** | Use trap handlers and `always` condition in CI; test cleanup under various failure scenarios |
| **CI may have Docker resource limits** | GitHub Actions provides generous limits; Docker Compose is lighter than Supabase CLI's full stack |
| **Existing tests may break with new infrastructure** | All tests use real services (antimocking compliant); no mocks to break; run full suite before merging |
| **Developers may forget cleanup command** | Trap handlers auto-cleanup on script exit; document cleanup in README and error messages |

## Validation Commands

**Pre-implementation validation:**
```bash
# Verify Docker Compose can start Supabase stack
docker compose -f docker-compose.test.yml up -d

# Verify dynamic port allocation
docker compose ps

# Verify health checks
docker compose ps | grep healthy

# Verify cleanup
docker compose down -v
```

**Local validation before pushing:**
```bash
bun run typecheck          # Type-check passes
bun run lint               # Linting passes
bun run test:validate-migrations  # Migration sync verified
bun run test:setup         # Containerized setup works
bun test                   # All 133 tests pass

# Test simultaneous runs (open 2 terminals)
# Terminal 1:
cd /Users/jayminwest/Projects/kota-db-ts
bun run test:setup && bun test

# Terminal 2:
cd /Users/jayminwest/Projects/kota-db-ts-branch2
bun run test:setup && bun test
# Should run without port conflicts

# Test cleanup guarantees
bun run test:setup
# Press ctrl-c during tests
docker ps | grep kotadb-test  # Should show no containers
```

**CI-specific validation:**
- All GitHub Actions CI jobs pass (133/133 tests)
- No port conflict errors in CI logs
- Test execution time under 2 minutes total
- Containers cleaned up successfully (check "Teardown" step)
- `.env.test` auto-generation works in CI environment

**Post-deployment validation:**
- Create test PR with trivial change
- Verify CI passes with full test suite
- Monitor CI stability over next 5-10 PRs
- Verify developers can run tests for multiple projects simultaneously

## Deliverables

**Code changes:**
- `docker-compose.test.yml` — Full Supabase stack for isolated testing
- `scripts/setup-test-db.sh` — Refactored to use Docker Compose with project isolation
- `scripts/reset-test-db.sh` — Updated for Docker Compose containers
- `scripts/generate-env-test-compose.sh` — Extract credentials from Docker containers
- `scripts/run-migrations-compose.sh` — Apply migrations directly to containerized Postgres
- `scripts/cleanup-test-containers.sh` — Guaranteed cleanup with trap handlers
- `.github/scripts/setup-supabase-ci.sh` — Updated to use Docker Compose
- `.github/workflows/ci.yml` — Remove Supabase CLI dependency, use Docker Compose

**Config updates:**
- `.test-project-name` — Ephemeral file storing current test project name (gitignored)
- `.env.test` — Updated generation logic for Docker Compose (already gitignored)

**Documentation updates:**
- `docs/testing-setup.md` — Docker Compose workflow, project isolation, troubleshooting
- `README.md` — Updated test setup instructions
- `CLAUDE.md` — Testing infrastructure architecture notes
- `.claude/commands/conditional_docs.md` — Add condition for this spec
- `docs/specs/chore-51-containerize-test-environment-docker-compose.md` — This plan document
