# Chore Plan: Remove Beads Issue Tracking System

## Context
GitHub Issues already provides all necessary functionality for this project. The beads SQLite-based tracker and its ADW integration adds unnecessary complexity, maintenance burden, and redundant tooling that duplicates GitHub functionality. This removal simplifies the project and reduces cognitive load for contributors.

**Constraints:**
- Must preserve all existing GitHub issue data
- Must ensure CI pipeline continues to pass after removal
- Must verify no broken documentation links remain

## Relevant Files

### Database & Data
- `.beads/` — SQLite database and backup files for issue tracking
- `automation/adws/db_migrations/` — Contains beads-related schema migrations

### Automation Integration
- `automation/adws/adw_modules/beads_ops.py` — Core beads operations module
- `automation/adws/adw_modules/data_types.py` — Contains beads-related type definitions
- `automation/adws/adw_modules/state.py` — Beads state management logic
- `automation/adws/adw_modules/exit_codes.py` — Beads-specific exit codes
- `automation/adws/tests/test_beads_state_manager.py` — Beads state tests
- `automation/adws/tests/test_beads_database.py` — Beads database tests
- `automation/adws/adw_tests/test_beads_integration.py` — Beads integration tests
- `automation/adws/scripts/migrate_beads_schema.py` — Beads migration utility

### Scripts & CI
- `app/scripts/validate-beads-sync.sh` — Beads synchronization validator
- `app/package.json` — Contains `test:validate-beads` script
- `.github/workflows/app-ci.yml` — Contains beads validation step

### Documentation - Commands
- `.claude/commands/beads/` — Complete beads command directory (create, dep, ready, show, sync-github, update)
- `.claude/commands/docs/beads-adw-integration.md` — Beads workflow integration guide
- `.claude/commands/docs/conditional_docs/app.md` — Contains beads references
- `.claude/commands/docs/conditional_docs/automation.md` — Contains beads references
- `.claude/commands/docs/mcp-usage-guidance.md` — Contains beads examples
- `.claude/commands/workflows/adw-architecture.md` — Contains beads integration mentions
- `.claude/commands/workflows/orchestrator.md` — Contains beads workflow steps
- `.claude/commands/workflows/roadmap-update.md` — Contains beads references
- `.claude/commands/issues/prioritize.md` — Contains beads commands

### Documentation - Core & Specs
- `CLAUDE.md` — Project instructions with extensive beads references
- `automation/adws/README.md` — Automation documentation with beads integration
- `automation/adws/docs/exit-codes.md` — Beads error documentation
- `docs/specs/feature-301-beads-integration-phase-1.md` — Original beads spec
- `docs/specs/feature-303-beads-adw-workflow-integration.md` — Workflow integration spec
- `docs/specs/feature-304-beads-database-extension-adw-state.md` — Database extension spec

### New Files
- `docs/specs/chore-375-remove-beads-tracking.md` — This maintenance plan

## Work Items

### Preparation
- Verify current branch is `chore/375-remove-beads-tracking` from `develop`
- Backup `.beads/` directory contents for reference (if needed)
- Run initial validation suite to establish baseline

### Execution
1. **Remove database and data files**
   - Delete `.beads/` directory entirely
   - Delete beads-related migrations from `automation/adws/db_migrations/`

2. **Remove automation integration**
   - Delete `automation/adws/adw_modules/beads_ops.py`
   - Delete `automation/adws/tests/test_beads_state_manager.py`
   - Delete `automation/adws/tests/test_beads_database.py`
   - Delete `automation/adws/adw_tests/test_beads_integration.py`
   - Delete `automation/adws/scripts/migrate_beads_schema.py`
   - Remove beads imports and logic from `automation/adws/adw_modules/data_types.py`
   - Remove beads state management from `automation/adws/adw_modules/state.py`
   - Remove beads exit codes from `automation/adws/adw_modules/exit_codes.py`

3. **Update CI/CD configuration**
   - Remove `test:validate-beads` script from `app/package.json`
   - Remove beads validation step from `.github/workflows/app-ci.yml`
   - Delete `app/scripts/validate-beads-sync.sh`

4. **Clean up documentation**
   - Delete `.claude/commands/beads/` directory entirely
   - Delete `.claude/commands/docs/beads-adw-integration.md`
   - Remove beads references from `CLAUDE.md` (sections: Beads Workflow, Beads ADW Integration, GitHub-Beads Sync, MCP Server Availability, Related Resources)
   - Remove beads references from `.claude/commands/docs/conditional_docs/app.md`
   - Remove beads references from `.claude/commands/docs/conditional_docs/automation.md`
   - Remove beads examples from `.claude/commands/docs/mcp-usage-guidance.md`
   - Remove beads mentions from `.claude/commands/workflows/adw-architecture.md`
   - Remove beads workflow steps from `.claude/commands/workflows/orchestrator.md`
   - Remove beads references from `.claude/commands/workflows/roadmap-update.md`
   - Remove beads commands from `.claude/commands/issues/prioritize.md`
   - Remove beads documentation from `automation/adws/README.md`
   - Remove beads error docs from `automation/adws/docs/exit-codes.md`
   - Archive spec files: `docs/specs/feature-301-*.md`, `docs/specs/feature-303-*.md`, `docs/specs/feature-304-*.md`

### Follow-up
- Run comprehensive grep search for remaining "beads" references
- Verify CI pipeline passes completely
- Check for broken documentation links
- Review diff to ensure no unintended deletions

## Step by Step Tasks

### Phase 1: Remove Core Files
1. Delete `.beads/` directory
2. Delete `automation/adws/adw_modules/beads_ops.py`
3. Delete all beads test files (3 files in automation/adws/tests/ and adw_tests/)
4. Delete `automation/adws/scripts/migrate_beads_schema.py`
5. Delete beads-related migrations from `automation/adws/db_migrations/`

### Phase 2: Update Automation Modules
6. Edit `automation/adws/adw_modules/data_types.py` to remove beads-related types
7. Edit `automation/adws/adw_modules/state.py` to remove beads state management
8. Edit `automation/adws/adw_modules/exit_codes.py` to remove beads exit codes

### Phase 3: Update CI/CD
9. Edit `app/package.json` to remove `test:validate-beads` script
10. Edit `.github/workflows/app-ci.yml` to remove beads validation step
11. Delete `app/scripts/validate-beads-sync.sh`

### Phase 4: Clean Documentation - Commands
12. Delete `.claude/commands/beads/` directory
13. Delete `.claude/commands/docs/beads-adw-integration.md`
14. Edit `.claude/commands/docs/conditional_docs/app.md` to remove beads references
15. Edit `.claude/commands/docs/conditional_docs/automation.md` to remove beads references
16. Edit `.claude/commands/docs/mcp-usage-guidance.md` to remove beads examples
17. Edit `.claude/commands/workflows/adw-architecture.md` to remove beads mentions
18. Edit `.claude/commands/workflows/orchestrator.md` to remove beads workflow steps
19. Edit `.claude/commands/workflows/roadmap-update.md` to remove beads references
20. Edit `.claude/commands/issues/prioritize.md` to remove beads commands

### Phase 5: Clean Documentation - Core
21. Edit `CLAUDE.md` to remove all beads sections and references
22. Edit `automation/adws/README.md` to remove beads documentation
23. Edit `automation/adws/docs/exit-codes.md` to remove beads error docs
24. Archive `docs/specs/feature-301-beads-integration-phase-1.md`
25. Archive `docs/specs/feature-303-beads-adw-workflow-integration.md`
26. Archive `docs/specs/feature-304-beads-database-extension-adw-state.md`

### Phase 6: Verification
27. Run `grep -ri "beads" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.beads` to find remaining references
28. Address any remaining references found in step 27
29. Run `cd app && bun run lint`
30. Run `cd app && bunx tsc --noEmit`
31. Run `cd app && bun test`
32. Verify `.github/workflows/app-ci.yml` has no beads references
33. Verify `app/package.json` has no beads scripts
34. Check documentation for broken internal links

### Phase 7: Finalize
35. Stage all changes: `git add -A`
36. Commit with proper message (see Commit Message Validation below)
37. Push branch: `git push -u origin chore/375-remove-beads-tracking`

## Risks

**Risk**: Breaking automation modules that import beads functionality
- **Mitigation**: Carefully review all imports in `automation/adws/adw_modules/` and update accordingly; run Python tests

**Risk**: Leaving orphaned references that cause runtime errors
- **Mitigation**: Use comprehensive grep search; run full test suite; verify CI passes

**Risk**: Breaking documentation links
- **Mitigation**: Manual review of cross-references; test documentation navigation paths

**Risk**: Removing files still needed by active workflows
- **Mitigation**: Review ADW orchestration code to ensure no hard dependencies on beads modules

## Validation Commands

```bash
# App validation
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test

# Automation validation (if Python tests exist)
cd automation && python -m pytest

# Verify no beads references remain (excluding git history)
grep -ri "beads" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.beads --exclude-dir=dist --exclude-dir=build | wc -l
# Should return 0 or only match this plan file and archived specs

# Verify package.json cleanup
cat app/package.json | grep beads
# Should return nothing

# Verify CI workflow cleanup
cat .github/workflows/app-ci.yml | grep beads
# Should return nothing
```

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: remove beads issue tracking system` not `Based on the plan, the commit should remove beads`

**Example commit message:**
```
chore(automation): remove beads issue tracking system

Remove beads SQLite-based tracker and ADW integration.
GitHub Issues provides all necessary functionality.

- Delete .beads/ directory and related migrations
- Remove beads_ops.py and integration tests
- Clean up CI/CD beads validation steps
- Update documentation to remove beads references
```

## Deliverables

- **Code changes**: Deletion of beads modules, tests, and scripts
- **Config updates**: package.json scripts, CI workflow steps removed
- **Documentation updates**: CLAUDE.md, command docs, specs archived, all beads references removed
- **Validation**: Clean grep results, passing CI, no broken links
