# Feature Plan: Provision Isolated Test Environments for ADW Validation Phase

## Overview

### Problem
ADW test phase (`automation/adws/adw_phases/adw_test.py`) fails immediately when running `bun test` because it lacks test infrastructure. Tests require a running Supabase stack (PostgreSQL + PostgREST + Kong + GoTrue) with generated `.env.test` credentials, but the ADW workflow executes validation commands directly in isolated worktrees without provisioning test environments.

**Current failure pattern:**
```
error: Missing Supabase credentials: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set
```

This blocks autonomous agents from detecting test failures before CI, forcing them to commit code that may break tests.

**Root cause:**
- ADW validation sequence: `lint` → `typecheck` → `test` → `build`
- `test` command fails due to missing database connection
- Worktrees don't inherit test infrastructure from main development environment
- Each worktree is isolated with its own filesystem context

### Desired Outcome
- `adw_test.py` provisions isolated test environment before running validation commands
- Test environment uses unique `PROJECT_NAME` derived from ADW ID (e.g., `kotadb-adw-{adw_id}`)
- Environment setup includes: Docker Compose start → migration execution → `.env.test` generation
- Validation commands run with provisioned test environment
- Test environment is torn down after validation completes (success or failure)
- `PROJECT_NAME` stored in ADW state for cleanup tracking
- Timeouts prevent hanging test environments from leaking resources
- Setup/teardown errors are logged and reported via GitHub issue comments
- Multiple concurrent ADW runs execute tests without port/database conflicts

### Non-Goals
- Modifying test suite structure or test files themselves
- Changing existing test infrastructure scripts (setup-test-db.sh, cleanup-test-containers.sh)
- Implementing test result caching or incremental testing
- Optimizing Docker image caching or startup performance
- Creating shared test environment pools (each ADW run gets dedicated environment)

## Issue Metadata
- **Issue Number**: #94
- **Title**: feat: provision isolated test environments for ADW validation phase
- **Labels**: `component:testing`, `component:ci-cd`, `priority:high`, `effort:medium`, `status:needs-investigation`
- **Related Issues**:
  - #79 (integrate automation tests into CI)
  - #83 (adw_sdlc validation - recently closed, demonstrates workflow fixing pattern)
  - #51 (containerize test environment with Docker Compose)
  - #62 (past ADW failure due to missing test environment)

## Technical Approach

### Architecture Notes
1. **Leverage Existing Infrastructure**: Reuse proven Docker Compose test stack from `app/scripts/setup-test-db.sh` and `app/scripts/cleanup-test-containers.sh`
2. **Per-Run Isolation**: Each ADW execution gets unique `PROJECT_NAME` (format: `kotadb-adw-{adw_id}`) to prevent conflicts
3. **State Tracking**: Store `test_project_name` in `agents/{adw_id}/adw_state.json` for lifecycle management
4. **Worktree Context**: Setup/teardown functions receive `worktree_path` to execute commands in correct working directory
5. **Graceful Cleanup**: Use try/finally blocks to ensure teardown runs even on validation failure
6. **Timeout Protection**: Add timeouts to Docker operations to prevent resource leaks

### Key Modules to Touch
- `automation/adws/adw_phases/adw_test.py` - Add test environment setup/teardown
- `automation/adws/adw_modules/state.py` - Add `test_project_name` field to ADW state schema
- `app/scripts/setup-test-db.sh` - Already supports `PROJECT_NAME` environment variable
- `app/scripts/cleanup-test-containers.sh` - Already supports `PROJECT_NAME` argument
- `automation/adws/README.md` - Document test environment provisioning in validation section

### Data/API Impacts
- **ADW State Extension**: Add `test_project_name` to state schema for tracking active test environments
- **Environment Variables**: Scripts already support `PROJECT_NAME` for isolation
- **Docker Resources**: Each ADW test run consumes ~300-500MB RAM, ~30-45 seconds startup time
- **Port Allocation**: Docker Compose handles dynamic port allocation automatically

## Relevant Files

### ADW Phase Scripts
- `automation/adws/adw_phases/adw_test.py` - Test phase orchestrator, needs environment provisioning
- `automation/adws/adw_modules/state.py` - State management, needs `test_project_name` field
- `automation/adws/adw_modules/workflow_ops.py` - Workflow utilities, may need test environment helpers

### Test Infrastructure (app/)
- `app/scripts/setup-test-db.sh` - Docker Compose stack startup, migration, seeding
- `app/scripts/cleanup-test-containers.sh` - Docker Compose teardown, volume removal
- `app/scripts/generate-env-test-compose.sh` - Extract credentials from Docker containers
- `app/scripts/run-migrations-compose.sh` - Apply migrations to test database
- `app/docker-compose.test.yml` - Docker Compose configuration for test stack
- `app/package.json` - Contains `test:setup` and `test:teardown` scripts

### Documentation
- `automation/adws/README.md` - ADW workflow documentation, needs test environment section
- `docs/testing-setup.md` - Test infrastructure guide, provides context
- `CLAUDE.md` - Project instructions, documents testing infrastructure

### New Files
None required - all functionality implemented via existing scripts and state tracking

## Task Breakdown

### Phase 1: State Schema Extension
1. Read `automation/adws/adw_modules/state.py` to understand current schema
2. Add `test_project_name: Optional[str] = None` field to `ADWState` dataclass
3. Update `to_dict()` method to include `test_project_name` in serialization
4. Update `load()` method to deserialize `test_project_name` field
5. Update `extra` field filtering to exclude `test_project_name` from extras

### Phase 2: Test Environment Management Functions
1. Read `automation/adws/adw_phases/adw_test.py` to understand current structure
2. Add `setup_test_environment(worktree_path: Path, adw_id: str, logger: logging.Logger) -> str` function
   - Generate `PROJECT_NAME` as `kotadb-adw-{adw_id}`
   - Set `app_dir = worktree_path / "app"`
   - Run `bun run test:setup` in `app_dir` with `PROJECT_NAME` environment variable
   - Add 180-second timeout for full stack startup
   - Return `PROJECT_NAME` on success
   - Raise `RuntimeError` on failure with stderr details
3. Add `teardown_test_environment(worktree_path: Path, project_name: str, logger: logging.Logger)` function
   - Set `app_dir = worktree_path / "app"`
   - Run `bun run test:teardown` in `app_dir` with `PROJECT_NAME` environment variable
   - Add 60-second timeout for cleanup
   - Log errors but don't raise (cleanup is best-effort)

### Phase 3: Integrate Setup/Teardown into Validation Flow
1. Modify `main()` function in `adw_test.py` to provision test environment before validation
2. Add setup step after worktree verification:
   ```python
   try:
       project_name = setup_test_environment(worktree_path, adw_id, logger)
       state.update(test_project_name=project_name)
       state.save()
   except Exception as exc:
       logger.error(f"Test environment provisioning failed: {exc}")
       make_issue_comment(
           issue_number,
           format_issue_message(adw_id, "ops", f"❌ Test environment setup failed: {exc}"),
       )
       sys.exit(1)
   ```
3. Wrap validation execution in try/finally block
4. Add teardown in finally block:
   ```python
   finally:
       if state.get("test_project_name"):
           teardown_test_environment(
               worktree_path,
               state.get("test_project_name"),
               logger
           )
   ```
5. Ensure teardown runs even on validation failure or early exit

### Phase 4: Documentation Updates
1. Read `automation/adws/README.md` validation section (lines 142-153)
2. Add new subsection: "### Test Environment Provisioning"
3. Document test environment lifecycle:
   - Automatic provisioning per ADW run
   - Unique PROJECT_NAME prevents conflicts
   - Automatic teardown after validation
   - Resource usage (~300-500MB RAM, ~30-45s startup)
4. Add troubleshooting entry for test environment issues:
   - How to check for orphaned containers
   - Manual cleanup commands
   - How to debug setup failures
5. Update validation flow description to mention test environment provisioning

### Phase 5: Testing and Validation
1. Test manual execution with existing worktree (if available from issue #62 failure)
2. Test concurrent ADW runs to verify isolation
3. Test failure scenarios (setup failure, validation failure, early exit)
4. Verify cleanup removes containers and volumes
5. Verify no orphaned resources after multiple runs
6. Test with fresh worktree from new issue

## Step by Step Tasks

### 1. Extend ADW State Schema
- Read `automation/adws/adw_modules/state.py` to understand structure
- Add `test_project_name: Optional[str] = None` field to `ADWState` dataclass after `worktree_created_at`
- Update `to_dict()` method to include `test_project_name` in payload dictionary
- Update `load()` classmethod to extract `test_project_name` from loaded data
- Update `extra` field filtering in `load()` to exclude `test_project_name`
- Verify field is included in `__init__` signature for dataclass

### 2. Implement Test Environment Setup Function
- Read `automation/adws/adw_phases/adw_test.py` to understand imports and structure
- Import `subprocess` module for command execution
- Add `setup_test_environment()` function after `parse_args()` function
- Generate unique project name: `project_name = f"kotadb-adw-{adw_id}"`
- Resolve app directory: `app_dir = worktree_path / "app"`
- Log provisioning start with project name
- Execute `bun run test:setup` with subprocess.run():
  - Set `cwd=app_dir`
  - Set `env={**os.environ, "PROJECT_NAME": project_name}`
  - Set `timeout=180` (3 minutes for full stack)
  - Set `capture_output=True, text=True`
- Check return code, raise RuntimeError on failure with stderr
- Log success and return project name

### 3. Implement Test Environment Teardown Function
- Add `teardown_test_environment()` function after setup function
- Resolve app directory: `app_dir = worktree_path / "app"`
- Log teardown start with project name
- Execute `bun run test:teardown` with subprocess.run():
  - Set `cwd=app_dir`
  - Set `env={**os.environ, "PROJECT_NAME": project_name}`
  - Set `timeout=60` (1 minute for cleanup)
  - Set `capture_output=True, text=True`
- Log errors but don't raise (teardown is best-effort)
- Log completion

### 4. Integrate Setup into main() Function
- Locate worktree verification section in `main()` (after line 119)
- Add try-except block for test environment setup
- Call `setup_test_environment(worktree_path, adw_id, logger)`
- Store returned project_name in state: `state.update(test_project_name=project_name)`
- Save state: `state.save()`
- On exception, log error, post GitHub comment, and exit with code 1

### 5. Wrap Validation in try/finally
- Locate validation execution section (after line 136)
- Add try block before "lockfile_dirty = lockfile_changed()" line
- Move all validation logic into try block (through line 169)
- Add finally block after validation logic
- In finally block, check if `state.get("test_project_name")` exists
- If exists, call `teardown_test_environment(worktree_path, state.get("test_project_name"), logger)`

### 6. Update ADW Documentation
- Read `automation/adws/README.md` lines 142-153 (validation section)
- Add new subsection after line 153: "### Test Environment Provisioning"
- Document automatic test environment lifecycle
- Document resource requirements (RAM, startup time)
- Document PROJECT_NAME isolation mechanism
- Add subsection under "## Troubleshooting" for test environment issues
- Document orphaned container detection: `docker ps -a | grep kotadb-adw`
- Document manual cleanup: `docker compose -p kotadb-adw-{id} down -v`
- Document setup failure debugging steps

### 7. Validation and Testing
- Create test plan covering:
  - Manual execution with fresh worktree
  - Concurrent ADW runs (2+ simultaneous)
  - Setup failure scenario (Docker not running)
  - Validation failure scenario (broken tests)
  - Cleanup verification (no orphaned containers)
- Execute test plan and document results
- Verify PROJECT_NAME appears in Docker container names
- Verify unique ports allocated per ADW run
- Run `docker ps -a | grep kotadb-adw` after tests to check cleanup
- Run `docker volume ls | grep kotadb-adw` to check volume cleanup

### 8. Final Validation and PR Creation
- Run validation commands from worktree `app/` directory:
  - `cd app && bun run lint`
  - `cd app && bun run typecheck`
  - `cd app && bun test` (against provisioned test environment)
  - `cd app && bun run build`
- Verify all validation passes
- Stage all changes: `git add automation/adws/adw_phases/adw_test.py automation/adws/adw_modules/state.py automation/adws/README.md`
- Commit changes with issue reference
- Push branch to remote: `git push -u origin feature-94-{adw_id_short}`
- Create pull request via slash command with issue JSON and plan path

## Risks & Mitigations

### Risk: Docker not available in ADW execution environment
**Mitigation**:
- Test environment setup includes Docker prerequisite checks
- Existing `setup-test-db.sh` script validates Docker availability
- Early failure with clear error message guides user to install Docker
- Document Docker requirement in ADW setup documentation

### Risk: Test environment setup times out during stack startup
**Mitigation**:
- Set generous 180-second timeout (3 minutes) for full stack startup
- Existing scripts include health checks with retry loops
- Log detailed startup progress for debugging
- Document expected startup time in README (~30-45 seconds normally)

### Risk: Cleanup fails, leaving orphaned containers accumulating
**Mitigation**:
- Teardown runs in finally block, guaranteed even on validation failure
- Use best-effort cleanup (log errors, don't raise)
- Document manual cleanup commands for emergency situations
- Store PROJECT_NAME in state before setup for tracking
- Add troubleshooting section with orphan detection commands

### Risk: Concurrent ADW runs conflict on ports or database resources
**Mitigation**:
- Each ADW run uses unique PROJECT_NAME (kotadb-adw-{adw_id})
- Docker Compose handles dynamic port allocation automatically
- Each project gets isolated PostgreSQL database
- No shared state between concurrent test environments
- Test concurrent execution explicitly during validation

### Risk: Worktree lacks bun binary or node_modules
**Mitigation**:
- Worktrees share git repository but have independent filesystems
- `setup-test-db.sh` script includes bun prerequisite check
- Package.json and bun.lock exist in worktree (tracked by git)
- Validation phase already handles `bun install` if lockfile dirty
- Early failure with clear error message if bun not available

### Risk: Test environment consumes excessive resources on CI runners
**Mitigation**:
- Document resource requirements upfront (~300-500MB RAM per environment)
- Teardown runs after validation completes, not kept running
- Each environment isolated, not shared across runs
- CI runners typically have 7GB+ RAM, sufficient for test environments
- Consider adding environment variable to skip test provisioning if needed

## Validation Strategy

### Automated Tests
1. **Unit Tests**: No new unit tests required (integration-level feature)
2. **Integration Tests**: Validation happens via end-to-end ADW execution
3. **Existing Test Suite**: Leverage existing 133 tests in `app/tests/`

### Manual Validation
1. **Fresh Worktree Test**:
   - Create new issue with `component:testing` label
   - Run `uv run automation/adws/adw_phases/adw_plan.py {issue_number}`
   - Verify worktree created successfully
   - Run `uv run automation/adws/adw_phases/adw_test.py {issue_number} {adw_id}`
   - Verify Docker Compose stack starts with unique project name
   - Verify `.env.test` generated in worktree `app/` directory
   - Verify all validation commands execute (lint, typecheck, test, build)
   - Verify teardown removes containers: `docker ps -a | grep kotadb-adw-{adw_id}`
   - Verify teardown removes volumes: `docker volume ls | grep kotadb-adw-{adw_id}`

2. **Concurrent Execution Test**:
   - Create two test issues
   - Run plan phase for both: `uv run automation/adws/adw_phases/adw_plan.py {issue1} &` and `uv run automation/adws/adw_phases/adw_plan.py {issue2} &`
   - Get ADW IDs from state files
   - Run test phase for both: `uv run automation/adws/adw_phases/adw_test.py {issue1} {adw_id1} &` and `uv run automation/adws/adw_phases/adw_test.py {issue2} {adw_id2} &`
   - Verify both complete without port conflicts
   - Verify unique PROJECT_NAME for each: `docker ps | grep kotadb-adw`
   - Verify both environments cleaned up after completion

3. **Failure Handling Test**:
   - Run test phase with Docker not running
   - Verify setup fails with clear error message
   - Verify GitHub comment posted with error details
   - Verify no orphaned containers left behind
   - Start Docker and re-run
   - Introduce breaking change in test code
   - Run test phase and verify validation fails
   - Verify teardown still executes despite validation failure
   - Verify containers cleaned up: `docker ps -a | grep kotadb-adw`

4. **Resource Cleanup Test**:
   - Run 3+ test phases sequentially
   - After each completion, verify cleanup: `docker ps -a | grep kotadb-adw`
   - Verify no accumulation of containers or volumes
   - Check disk usage in `/var/lib/docker/volumes/`
   - Verify PROJECT_NAME stored in state before setup for each run

### Release Guardrails
1. **Monitoring**:
   - Log test environment provisioning events in `logs/kota-db-ts/{env}/{adw_id}/adw_test/execution.log`
   - Track setup/teardown success rates via log analysis
   - Monitor Docker container count for leaks: `docker ps -a | grep kotadb-adw | wc -l`
   - Monitor Docker volume usage: `docker volume ls | grep kotadb-adw | wc -l`

2. **Alerting**:
   - Alert on repeated test environment setup failures
   - Alert on orphaned container accumulation (threshold: >5 containers)
   - Alert on disk space issues in Docker volume directory
   - Alert on Docker daemon crashes during ADW execution

3. **Rollback Plan**:
   - Feature is additive, no breaking changes to existing workflows
   - Rollback: Remove setup/teardown calls, revert state schema change
   - Document rollback procedure for emergency situations
   - Provide manual test environment setup commands as fallback

## Validation Commands

### Level 2 Validation (Minimum Required)
```bash
# Run from worktree app/ directory
cd app

# Lint
bun run lint

# Type-check
bun run typecheck

# Integration tests (requires provisioned test environment)
# This will be tested by adw_test.py itself

# Full test suite
bun test

# Build
bun run build
```

### Domain-Specific Validation
```bash
# Test environment provisioning (manual)
cd automation
uv run adws/adw_phases/adw_plan.py 94  # Create worktree
ADW_ID=$(cat agents/*/adw_state.json | jq -r '.adw_id' | head -1)
uv run adws/adw_phases/adw_test.py 94 $ADW_ID  # Should provision and run tests

# Verify test environment running
docker ps | grep kotadb-adw-$ADW_ID

# Verify cleanup after completion
docker ps -a | grep kotadb-adw-$ADW_ID  # Should be empty

# Test concurrent execution
uv run adws/adw_phases/adw_plan.py 95 &
PID1=$!
uv run adws/adw_phases/adw_plan.py 96 &
PID2=$!
wait $PID1 $PID2

ADW_ID1=$(cat agents/*/adw_state.json | jq -r 'select(.issue_number=="95") | .adw_id')
ADW_ID2=$(cat agents/*/adw_state.json | jq -r 'select(.issue_number=="96") | .adw_id')

uv run adws/adw_phases/adw_test.py 95 $ADW_ID1 &
uv run adws/adw_phases/adw_test.py 96 $ADW_ID2 &
wait

# Verify both cleaned up
docker ps -a | grep kotadb-adw  # Should be empty

# Check for orphaned resources
docker volume ls | grep kotadb-adw  # Should be empty
```

### Automation Layer Validation
```bash
# Run from automation directory
cd automation

# Lint Python (if applicable)
# uv run ruff check adws/

# Type-check Python (if applicable)
# uv run mypy adws/ --ignore-missing-imports

# Run automation test suite (if exists)
# uv run pytest adws/adw_tests/ -v
```

## References
- **Issue**: #94 - feat: provision isolated test environments for ADW validation phase
- **Related Issues**:
  - #79 - integrate automation tests into CI
  - #83 - adw_sdlc validation (demonstrates workflow fixing pattern)
  - #51 - containerize test environment with Docker Compose
  - #62 - past ADW failure due to missing test environment
- **Investigation Log**: `automation/logs/kota-db-ts/local/7170397a/adw_test/execution.log`
- **Test Infrastructure Scripts**:
  - `app/scripts/setup-test-db.sh` - Docker Compose stack startup
  - `app/scripts/cleanup-test-containers.sh` - Stack teardown
  - `app/scripts/generate-env-test-compose.sh` - Credential extraction
  - `app/scripts/run-migrations-compose.sh` - Migration application
- **Docker Configuration**: `app/docker-compose.test.yml`
- **CI Integration**: `.github/workflows/app-ci.yml`, `.github/scripts/setup-supabase-ci.sh`
- **Documentation**:
  - `docs/testing-setup.md` - Test infrastructure guide
  - `automation/adws/README.md` - ADW workflow documentation
  - `CLAUDE.md` - Project instructions and testing infrastructure overview
