# Bug Plan: Correct docker-compose.test.yml Path in Test Setup Scripts

## Bug Summary

**Observed behaviour:**
- `app/scripts/setup-test-db.sh` fails when executed from ADW worktrees with error: `open /path/to/worktree/app/docker-compose.test.yml: no such file or directory`
- `.github/scripts/setup-supabase-ci.sh` also references `docker-compose.test.yml` without explicit parent directory path
- Error occurs at line 46 of `setup-test-db.sh`: `docker compose -p "$PROJECT_NAME" -f docker-compose.test.yml up -d db`

**Expected behaviour:**
- Scripts should successfully locate and use `docker-compose.test.yml` from repository root
- Works consistently in main branch, worktrees, and CI environments

**Suspected scope:**
- All `docker compose` commands in `app/scripts/setup-test-db.sh` referencing `docker-compose.test.yml`
- All `docker compose` commands in `.github/scripts/setup-supabase-ci.sh` referencing `docker-compose.test.yml`
- Potentially affects other scripts using `docker compose` with relative paths

## Root Cause Hypothesis

**Leading theory:**
Docker Compose resolves relative file paths from the current working directory. When scripts run from `app/` directory (as documented in CLAUDE.md line 11), Docker attempts to find `docker-compose.test.yml` in `app/docker-compose.test.yml` instead of at repository root `../docker-compose.test.yml`.

**Supporting evidence:**
1. `docker-compose.test.yml` exists at repository root (verified with `ls -la docker-compose.test.yml`)
2. Scripts are executed from `app/` directory: `cd app && bun run test:setup`
3. Error message shows Docker looking in wrong location: `/path/to/worktree/app/docker-compose.test.yml`
4. Other scripts in `app/scripts/` correctly reference parent directory paths:
   - `run-migrations-compose.sh` line 31: `MIGRATION_DIR="app/supabase/migrations"` (when run from repo root)
   - However, `run-migrations-compose.sh` runs from repo root in CI (called as `app/scripts/run-migrations-compose.sh`)
5. Multiple references to `docker-compose.test.yml` without `../` prefix:
   - `app/scripts/setup-test-db.sh`: lines 46, 54, 62, 76, 94, 102, 135, 144, 156, 174
   - `app/scripts/run-migrations-compose.sh`: lines 18, 52
   - `app/scripts/generate-env-test-compose.sh`: lines 24, 25
   - `app/scripts/reset-test-db.sh`: lines 20, 33
   - `app/scripts/cleanup-test-containers.sh`: line 26
   - `.github/scripts/setup-supabase-ci.sh`: lines 38, 46, 54, 68, 90, 98, 123, 133, 147

## Fix Strategy

**Code changes:**
- Replace all occurrences of `-f docker-compose.test.yml` with `-f ../docker-compose.test.yml` in `app/scripts/setup-test-db.sh`
- Add `-f ../docker-compose.test.yml` to all `docker compose` commands in `app/scripts/run-migrations-compose.sh`
- Add `-f ../docker-compose.test.yml` to all `docker compose` commands in `app/scripts/generate-env-test-compose.sh`
- Add `-f ../docker-compose.test.yml` to all `docker compose` commands in `app/scripts/reset-test-db.sh`
- Update `docker compose down` command in `app/scripts/cleanup-test-containers.sh` to use `-f ../docker-compose.test.yml` for consistency
- Keep `.github/scripts/setup-supabase-ci.sh` unchanged (already correct - runs from repo root)

**Data/config updates:**
- No database schema changes required
- No environment variable changes required
- `docker-compose.test.yml` remains at repository root

**Guardrails:**
- All changes are local to bash scripts (no application code impact)
- Scripts will work across all execution contexts (main branch, worktrees, CI)
- No impact on running services or existing test data

## Relevant Files

- `app/scripts/setup-test-db.sh` — Primary test setup script executed from `app/` directory
- `app/scripts/run-migrations-compose.sh` — Migration script executed from `app/` directory
- `app/scripts/generate-env-test-compose.sh` — Environment generation script executed from `app/` directory
- `app/scripts/reset-test-db.sh` — Database reset utility script executed from `app/` directory
- `app/scripts/cleanup-test-containers.sh` — Teardown script for test containers executed from `app/` directory
- `.github/scripts/setup-supabase-ci.sh` — CI test setup script executed from repository root

### New Files
None (bug fix only modifies existing scripts)

## Task Breakdown

### Verification
**Steps to reproduce current failure:**
1. Create or use existing ADW worktree: `automation/trees/bug-98-*/`
2. Navigate to app directory: `cd app`
3. Run test setup: `bun run test:setup` or `./scripts/setup-test-db.sh`
4. Observe error: `open .../app/docker-compose.test.yml: no such file or directory`

**Logs/metrics to capture:**
- Error output from `docker compose` showing incorrect file path
- Verify current working directory at time of execution (`pwd`)
- Confirm `docker-compose.test.yml` location: `ls -la ../docker-compose.test.yml`

### Implementation
1. **Update `app/scripts/setup-test-db.sh`:**
   - Replace `-f docker-compose.test.yml` with `-f ../docker-compose.test.yml` on lines 46, 54, 62, 76, 94, 102, 135, 144, 156, 174
   - Verify all `docker compose` commands use consistent path reference

2. **Update `app/scripts/run-migrations-compose.sh`:**
   - Add `-f ../docker-compose.test.yml` to `docker compose port` command on line 18
   - Add `-f ../docker-compose.test.yml` to `docker compose exec` command on line 52
   - Ensures migration script can locate compose file for port lookup and psql execution

3. **Update `app/scripts/generate-env-test-compose.sh`:**
   - Add `-f ../docker-compose.test.yml` to `docker compose port kong` command on line 24
   - Add `-f ../docker-compose.test.yml` to `docker compose port db` command on line 25
   - Ensures environment generation script can extract container ports

4. **Update `app/scripts/reset-test-db.sh`:**
   - Add `-f ../docker-compose.test.yml` to `docker compose ps` command on line 20
   - Add `-f ../docker-compose.test.yml` to `docker compose exec` command on line 33
   - Ensures reset script can check container status and execute SQL commands

5. **Update `app/scripts/cleanup-test-containers.sh`:**
   - Add `-f ../docker-compose.test.yml` to `docker compose down` command on line 26
   - Ensures cleanup script can locate compose file for proper teardown

6. **Verify `.github/scripts/setup-supabase-ci.sh`:**
   - Confirm script runs from repository root (not from `app/`)
   - Keep existing `-f docker-compose.test.yml` references unchanged

### Validation
**Tests to add/update:**
- No new test files required (validates via existing test suite)
- Run full test suite to ensure Docker Compose stack starts correctly: `cd app && bun test`
- Test in ADW worktree context to verify fix works in isolated environments

**Manual checks to run:**
1. **Local test from main branch:**
   ```bash
   cd app
   bun run test:setup
   # Verify: Stack starts without errors
   docker compose -p $(cat .test-project-name) ps
   # Verify: All services healthy (db, auth, rest, kong)
   bun run test:teardown
   ```

2. **Local test from worktree:**
   ```bash
   cd automation/trees/bug-98-b9e5db8f/app
   bun run test:setup
   # Verify: Stack starts without errors
   docker compose -p $(cat .test-project-name) ps
   # Verify: All services healthy
   bun run test:teardown
   ```

3. **Path verification:**
   ```bash
   cd app
   ls -la ../docker-compose.test.yml  # Confirm file exists
   docker compose -f ../docker-compose.test.yml config  # Validate compose file syntax
   ```

4. **CI verification:**
   - Push branch and trigger GitHub Actions workflow
   - Verify `.github/scripts/setup-supabase-ci.sh` completes successfully
   - Verify all 133 tests pass in CI environment

## Step by Step Tasks

### Preparation
- Verify current working directory expectations for all affected scripts
- Confirm `docker-compose.test.yml` location at repository root

### Fix Implementation
- Update `app/scripts/setup-test-db.sh` to use `../docker-compose.test.yml` for all docker compose commands
- Update `app/scripts/cleanup-test-containers.sh` to use `../docker-compose.test.yml` in teardown command
- Verify `.github/scripts/setup-supabase-ci.sh` uses correct path (already correct - no changes needed)

### Local Validation
- Test setup script from `app/` directory in main branch
- Test setup script from `app/` directory in worktree
- Run full test suite to ensure no regressions: `cd app && bun test`

### CI Validation
- Push branch to trigger GitHub Actions
- Verify CI test setup completes successfully
- Verify all 133 tests pass in CI environment

### Finalization
- Re-run validation commands to confirm fix
- Push branch with `git push -u origin bug/98-docker-compose-path`
- Run `/pull_request bug/98-docker-compose-path <issue_json> docs/specs/bug-98-docker-compose-path.md <adw_id>` to create PR

## Regression Risks

**Adjacent features to watch:**
- Other test scripts that use Docker Compose (all use `docker compose -p "$PROJECT_NAME"` without `-f` flag)
- CI workflows that depend on test infrastructure setup
- Local development workflows that rely on test database setup
- ADW automation that provisions test environments in worktrees

**Follow-up work if risk materialises:**
- If other scripts fail to locate compose file, audit all `docker compose` commands in repository
- If CI fails after changes, verify script execution context (working directory)
- If cleanup fails, ensure teardown script can locate compose file for proper resource cleanup

## Validation Commands

```bash
# Type checking and linting
cd app && bunx tsc --noEmit

# Full test suite (requires Docker)
cd app && bun run test:setup
cd app && bun test
cd app && bun run test:teardown

# Validate migration sync
cd app && bun run test:validate-migrations

# Validate no hardcoded environment URLs
cd app && bun run test:validate-env

# Path verification
cd app && ls -la ../docker-compose.test.yml
cd app && docker compose -f ../docker-compose.test.yml config
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix: correct docker-compose.test.yml path in test scripts` not `Looking at the changes, this commit fixes the docker-compose path issue`
