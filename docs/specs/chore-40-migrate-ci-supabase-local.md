# Chore Plan: Migrate CI to Supabase Local for Test Environment Parity

## Context

CI tests are failing with **401 Unauthorized** errors despite tests passing locally in ~13.5 seconds. The root cause is an environment mismatch:

- **Local testing**: Uses Supabase Local (full stack: PostgreSQL + PostgREST + Kong + Auth) via `bun run test:setup`
- **CI testing**: Uses plain PostgreSQL service without PostgREST or Supabase stack

This violates KotaDB's **anti-mock philosophy** by creating testing drift between local and CI environments. Authentication tests fail because API key validation requires PostgREST RPC endpoints that don't exist in GitHub Actions' plain PostgreSQL service.

**Why this matters now:**
- PRs appear green locally but fail in CI (false confidence)
- Developers only discover issues after pushing (slow feedback loop)
- Inconsistent validation environments produce different results
- Violates antimocking principles established in issue #31

**Constraints:**
- Must maintain test execution time under 2 minutes in CI
- Zero mocks/stubs allowed as workarounds
- Must achieve exact parity with local testing environment

## Relevant Files

### Modified Files
- `.github/workflows/ci.yml` — Replace PostgreSQL service with Supabase CLI setup
- `docs/testing-setup.md` — Update CI integration section to reflect Supabase Local usage
- `README.md` — Update CI badge and test documentation references
- `CLAUDE.md` — Update CI/CD workflow notes

### New Files
- `.github/scripts/setup-supabase-ci.sh` — CI-specific script to start Supabase Local and generate credentials
- `docs/specs/chore-40-migrate-ci-supabase-local.md` — This plan document

## Work Items

### Preparation
1. Verify Supabase CLI GitHub Action availability (`supabase/setup-cli@v1`)
2. Confirm Docker-in-Docker support in GitHub Actions runners (already available)
3. Review local test setup scripts to replicate flow in CI
4. Backup current CI configuration for rollback capability

### Execution
1. Create CI-specific Supabase setup script (`.github/scripts/setup-supabase-ci.sh`)
2. Update `.github/workflows/ci.yml` to use Supabase CLI action
3. Replace PostgreSQL service configuration with Supabase Local startup
4. Configure auto-generation of `.env.test` from `supabase status` in CI
5. Remove manual migration running (Supabase handles this automatically)
6. Update test step to use generated credentials

### Follow-up
1. Monitor CI execution time across multiple PRs (target: <2 minutes)
2. Update documentation to explain CI test infrastructure
3. Verify all 133 tests pass consistently in CI
4. Add CI setup validation to health check script if needed

## Step by Step Tasks

### 1. Create CI Setup Script
- Create `.github/scripts/setup-supabase-ci.sh` with executable permissions
- Script must: initialize Supabase config, start services, wait for readiness, generate `.env.test`
- Reuse logic from `scripts/generate-env-test.sh` for credential extraction
- Add error handling and status checks for CI context

### 2. Update CI Workflow Configuration
- Replace `services.postgres` block with Supabase CLI setup steps
- Add `supabase/setup-cli@v1` action before Bun installation
- Configure Supabase Local to use consistent ports (match local: 54321 API, 54322 PostgREST, 5434 DB)
- Run `.github/scripts/setup-supabase-ci.sh` to start services and generate credentials

### 3. Update Test Execution Step
- Remove manual PostgreSQL setup and migration running
- Source `.env.test` for test credentials (auto-generated from `supabase status`)
- Execute `bun test` with Supabase Local backing services
- Add Supabase teardown step (`supabase stop`) in workflow cleanup

### 4. Update Documentation
- Modify `docs/testing-setup.md` CI/CD Integration section to describe Supabase Local usage
- Update `README.md` to note CI uses Supabase Local (matching local dev)
- Add note in `CLAUDE.md` about CI/CD test environment architecture

### 5. Validation and Cleanup
- Run `bunx tsc --noEmit` to verify type checking
- Run `bun run lint` to verify linting passes
- Test CI workflow on branch with trivial change
- Verify all 133 tests pass in CI with no 401 errors
- Check CI execution time remains under 2 minutes
- Push branch to trigger actual CI validation
- Run `/pull_request chore/40-migrate-ci-supabase-local <issue_json> docs/specs/chore-40-migrate-ci-supabase-local.md <adw_id>` to create PR

## Risks

| Risk | Mitigation |
|------|------------|
| **Supabase Local startup adds significant time (~30-60s)** | Accept trade-off for testing parity; monitor actual duration and optimize if >2min total |
| **Docker-in-Docker resource limits in GitHub Actions** | GitHub Actions provides generous limits; Supabase Local tested to work in similar CI environments |
| **Migration sync issues between `src/db/migrations/` and `supabase/migrations/`** | Already have `bun run test:validate-migrations` to catch drift; add to CI validation steps |
| **Intermittent Supabase service startup failures** | Add retry logic and health checks in setup script; fail fast with clear error messages |
| **Credentials exposure in CI logs** | Setup script uses secure variable handling; no credentials printed to stdout |

## Validation Commands

**Local validation before pushing:**
```bash
bun run typecheck          # Type-check passes
bun run lint              # Linting passes
bun test                  # All 133 tests pass (local Supabase)
bun run test:validate-migrations  # Migration sync verified
```

**CI-specific validation (from `/validate-implementation`):**
- All GitHub Actions CI jobs pass (133/133 tests)
- No authentication-related 401 failures in CI logs
- Test execution time under 2 minutes total
- Supabase services start successfully without errors
- `.env.test` auto-generation works in CI environment

**Post-deployment validation:**
- Create test PR with trivial change
- Verify CI passes with full test suite
- Check PR merge workflow functions end-to-end
- Monitor CI stability over next 5-10 PRs

## Deliverables

**Code changes:**
- `.github/scripts/setup-supabase-ci.sh` — CI-specific Supabase Local setup script
- `.github/workflows/ci.yml` — Updated to use Supabase CLI and Local services

**Config updates:**
- Removed PostgreSQL service configuration from CI workflow
- Added Supabase CLI action setup
- Configured auto-generation of `.env.test` in CI

**Documentation updates:**
- `docs/testing-setup.md` — CI/CD Integration section updated for Supabase Local
- `README.md` — CI testing notes updated to reflect Supabase usage
- `CLAUDE.md` — CI/CD workflow architecture notes updated
- `docs/specs/chore-40-migrate-ci-supabase-local.md` — This plan document
