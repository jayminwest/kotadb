# Chore Plan: Fix CI workflows after repository restructure

## Context
After PR #54 restructured the repository to separate application (`app/`) and agentic (`automation/`) layers, both CI workflows are failing:

1. **Application CI (app-ci.yml)**: Fails at migration step because script paths are incorrect after restructure
   - Error: `.github/scripts/setup-supabase-ci.sh: line 119: ./scripts/run-migrations-compose.sh: No such file or directory`
   - Root cause: Script runs from repo root but calls `./scripts/` (should be `app/scripts/`)

2. **Automation CI (automation-ci.yml)**: Fails because `automation/` lacks Python project structure
   - Error: `error: Failed to spawn: pytest` (Permission denied, os error 13)
   - Root cause: No `pyproject.toml` in `automation/` directory, so `uv run` can't find the project context

The restructure created clean separation but broke CI script path assumptions. This must be fixed immediately to unblock development on the `chore/54-separate-agentic-application-layers` branch.

**Constraints / deadlines**: High priority - CI must pass before PR #54 can be merged.

## Relevant Files
- `.github/scripts/setup-supabase-ci.sh` — CI setup script with hardcoded path to migrations script (line 119)
- `.github/workflows/app-ci.yml` — Application CI workflow that calls setup script
- `.github/workflows/automation-ci.yml` — Automation CI workflow trying to run pytest via uv
- `app/scripts/run-migrations-compose.sh` — Migration script called from wrong directory
- `app/scripts/cleanup-test-containers.sh` — Cleanup script with working directory assumption
- `app/scripts/generate-env-test-compose.sh` — Env generation script with working directory assumption

### New Files
- `automation/pyproject.toml` — Python project metadata for uv to discover the project
- `automation/adws/pyproject.toml` — (Alternative location if tests should run from adws/ subdirectory)

## Work Items

### Preparation
- Review current CI failure logs to confirm all path-related issues
- Verify all script dependencies and working directory assumptions
- Check if automation tests are actually implemented (may need to skip for now)

### Execution
1. Fix Application CI script paths
   - Update `.github/scripts/setup-supabase-ci.sh` to use `app/scripts/` prefix for all script calls
   - Ensure `.test-project-name` file location is consistent with cleanup script expectations
   - Test that migration script can find database via Docker Compose project name

2. Fix Automation CI Python project structure
   - Determine correct location for `pyproject.toml` (automation/ root vs automation/adws/)
   - Create minimal `pyproject.toml` with pytest dependency if tests exist
   - Verify if ADW tests actually exist in `automation/adws/adw_tests/` (may be empty)
   - Update workflow to gracefully handle case where tests aren't implemented yet

3. Validate working directory assumptions
   - Review all scripts in `app/scripts/` for hardcoded paths
   - Ensure scripts work when called from `.github/scripts/`
   - Check that Docker Compose project isolation still functions correctly

### Follow-up
- Monitor next CI run to confirm both workflows pass
- Document script path conventions in CLAUDE.md if needed
- Consider adding path validation checks to scripts to fail fast with clear errors

## Step by Step Tasks

### Fix Application CI
1. Read `.github/scripts/setup-supabase-ci.sh` and identify all script path references
2. Update line 119: change `./scripts/run-migrations-compose.sh` to `app/scripts/run-migrations-compose.sh`
3. Update line 160: change `./scripts/generate-env-test-compose.sh` to `app/scripts/generate-env-test-compose.sh`
4. Verify `.test-project-name` is created in repo root (line 34) and accessed correctly by cleanup
5. Check if any other scripts have path assumptions that broke after restructure

### Fix Automation CI
6. Investigate `automation/adws/adw_tests/` directory structure to see if tests exist
7. Determine if tests are implemented or if this is placeholder infrastructure
8. If tests exist: create `automation/pyproject.toml` with pytest and required dependencies
9. If tests don't exist: update workflow to skip test step gracefully with clear messaging
10. Consider creating `automation/adws/__init__.py` if missing for proper Python package structure

### Validation
11. Commit changes to the current branch (`chore/54-separate-agentic-application-layers`)
12. Push changes: `git push -u origin chore/54-separate-agentic-application-layers`
13. Wait for CI to run and verify both workflows pass
14. Run local validation: `cd app && bun run test:validate-migrations`
15. Run local type check: `cd app && bunx tsc --noEmit`
16. Verify Docker Compose test stack works locally: `.github/scripts/setup-supabase-ci.sh`

### Finalize
17. Confirm all CI checks are green on GitHub
18. Update CLAUDE.md if needed to document script path conventions post-restructure
19. Mark this chore as complete

## Risks

| Risk | Mitigation |
|------|-----------|
| Migration script fails with Docker Compose project name | Verify `$PROJECT_NAME` is exported and available to child scripts called from setup-supabase-ci.sh |
| `.test-project-name` file written to wrong location | Ensure setup script runs from repo root, cleanup script knows to look there |
| Automation tests actually need complex dependencies | Start with minimal pyproject.toml, add dependencies incrementally if tests fail |
| Scripts have additional hardcoded path assumptions | Add defensive path checks at start of each script |
| CI working directory conflicts with script expectations | Use absolute paths or explicit `cd` commands in CI workflow steps |

## Validation Commands

Application layer:
```bash
cd app && bun run test:validate-migrations
cd app && bunx tsc --noEmit
cd app && bun run lint
cd app && bun test
```

Automation layer (if tests implemented):
```bash
cd automation && uv run pytest adws/adw_tests -v
```

Full CI simulation:
```bash
.github/scripts/setup-supabase-ci.sh  # Should complete without path errors
```

Docker cleanup:
```bash
app/scripts/cleanup-test-containers.sh $(cat .test-project-name)
```

## Deliverables

- Updated `.github/scripts/setup-supabase-ci.sh` with correct path prefixes
- Either:
  - `automation/pyproject.toml` with pytest configuration (if tests exist), OR
  - Updated `.github/workflows/automation-ci.yml` to gracefully skip unimplemented tests
- Passing Application CI workflow (type check, lint, tests)
- Passing Automation CI workflow (or graceful skip message)
- Verified Docker Compose project isolation still works correctly
- Clean CI runs on `chore/54-separate-agentic-application-layers` branch
