# Feature Plan: Beads Integration Phase 1 - Core Infrastructure and Slash Commands

## Overview

### Problem
KotaDB currently uses GitHub Issues for work tracking, which lacks explicit dependency management and programmatic work prioritization capabilities. ADW workflows must parse spec files to discover blockers, make multiple GitHub API calls for issue queries, and have no atomic "claim work" operation for concurrent execution. This creates coordination overhead, latency, and potential race conditions in AI-supervised workflows.

### Desired Outcome
Establish foundational Beads integration infrastructure to enable dependency-aware issue tracking with git-synchronized state. Developers can create issues with explicit relationships (`blocks`, `related`, `parent-child`, `discovered-from`) via slash commands and query ready-to-work tasks without parsing spec files. This phase focuses on initialization, manual workflow testing, and documentation to prepare for ADW automation in Phase 2.

### Non-Goals
- **ADW orchestrator integration**: Deferred to Phase 2 (issue #TBD-2)
- **GitHub bidirectional sync**: Deferred to Phase 4 (not MVP)
- **Database extension for ADW state**: Deferred to Phase 3
- **Migration of existing GitHub issues**: Start fresh with selective migration only
- **CI enforcement of JSONL freshness**: Basic syntax check only in Phase 1

## Technical Approach

### Architecture Notes
Beads provides a lightweight SQLite-based issue tracker with MCP server integration. The KotaDB plugin (`plugin:beads:beads`) exposes 14 MCP tools for CRUD operations, dependency management, and work selection queries. The database lives in `.beads/kota-db-ts.db` (gitignored) with auto-exported `.beads/issues.jsonl` (version controlled) for team synchronization.

**Key architectural decisions**:
1. **Shared database model**: All worktrees share project root `.beads/` database (SQLite locking prevents conflicts)
2. **Issue ID prefix**: `kota-` for consistency with repository naming
3. **JSONL-first git workflow**: Auto-export on write (5s debounce), auto-import on pull if JSONL newer
4. **Slash command interface**: Manual testing via Claude Code before ADW integration
5. **MCP workspace context**: All slash commands call `set_context` with project root before operations

### Key Modules to Touch
- **`.claude/commands/beads/`**: Create 5 new slash command templates for manual workflow testing
- **`CLAUDE.md`**: Add "Beads Workflow" section with conventions, discovery paths, git workflow
- **`app/scripts/validate-beads-sync.sh`**: CI validation script for JSONL syntax checking
- **`.github/workflows/app-ci.yml`**: Add beads JSONL validation to setup job
- **`app/package.json`**: Add `test:validate-beads` script for local validation
- **`.gitignore`**: Add `.beads/*.db` entry to exclude SQLite binary
- **`.claude/commands/docs/conditional_docs/app.md`**: Add beads workflow documentation reference

### Data/API Impacts
**No backend API changes**: Beads operates entirely via MCP tools (client-side integration). No KotaDB API endpoints, database schema, or authentication changes required.

**MCP tool contract**:
- All beads tools require `workspace_root` parameter (handled by `set_context` call)
- Tools return JSON results for programmatic consumption
- Error handling via MCP error codes (e.g., missing context, invalid issue ID)

## Relevant Files

### Initialization & Configuration
- `.beads/` - Created by `bd init`, contains database and JSONL export
- `.gitignore` - Add `.beads/*.db` entry for SQLite binary exclusion
- `CLAUDE.md` - Document beads workflow conventions and discovery paths

### Slash Commands (New Files)
- `.claude/commands/beads/ready.md` - Query ready-to-work tasks with filters
- `.claude/commands/beads/create.md` - Create issues with dependencies
- `.claude/commands/beads/show.md` - Show issue details with dependency tree
- `.claude/commands/beads/update.md` - Update issue status/priority/assignee
- `.claude/commands/beads/dep.md` - Add dependency relationships between issues

### CI/CD Infrastructure
- `app/scripts/validate-beads-sync.sh` - Validates JSONL syntax and existence
- `.github/workflows/app-ci.yml` - Add validation step to setup job
- `app/package.json` - Add `test:validate-beads` script

### Documentation
- `.claude/commands/docs/conditional_docs/app.md` - Add beads workflow reference entry

### New Files
- `docs/specs/feature-301-beads-integration-phase-1.md` - This plan file
- `.claude/commands/beads/ready.md` - Show ready-to-work tasks
- `.claude/commands/beads/create.md` - Create issues with dependencies
- `.claude/commands/beads/show.md` - Show issue details with dependency tree
- `.claude/commands/beads/update.md` - Update issue status/priority/assignee
- `.claude/commands/beads/dep.md` - Add dependency relationships
- `app/scripts/validate-beads-sync.sh` - CI validation script for JSONL syntax

## Task Breakdown

### Phase 1: Beads Initialization
- Initialize beads database with `kota-` prefix in project root
- Verify `.beads/` directory structure created correctly
- Add `.beads/*.db` to `.gitignore` for SQLite binary exclusion
- Commit `.beads/issues.jsonl` and `.beads/config.json` to git
- Test database discovery via `mcp__plugin_beads_beads__where_am_i`
- Document discovery paths and configuration in CLAUDE.md

### Phase 2: Slash Command Creation
- Create `/beads:ready` command for querying ready-to-work tasks
  - Call `set_context` with project root before `ready` tool
  - Format results as markdown table (ID, title, priority, labels)
  - Link to spec files if they exist (`docs/specs/{type}-{number}-*.md`)
  - Recommend next issue based on priority + effort
- Create `/beads:create` command for creating issues with dependencies
  - Prompt for title, type, priority, description, dependencies
  - Validate parameters before MCP tool call
  - Return created issue ID and summary
- Create `/beads:show` command for showing issue details
  - Display metadata (title, status, priority, assignee)
  - Show dependency tree (dependents, dependencies)
  - Link to GitHub issue if external reference exists
- Create `/beads:update` command for updating issue fields
  - Prompt for issue ID and fields to update
  - Validate status/priority values
  - Confirm update success
- Create `/beads:dep` command for adding dependencies
  - Prompt for source issue, target issue, relationship type
  - Validate relationship type (blocks, related, parent-child, discovered-from)
  - Confirm relationship creation
- Follow prompt-code alignment guidelines (output format, error handling)

### Phase 3: Documentation & Integration
- Update `CLAUDE.md` with "Beads Workflow" section
  - Database discovery paths (project root → ancestors → `~/.beads/default.db`)
  - Issue ID prefix conventions (`kota-1`, `kota-2`, etc.)
  - Dependency relationship types and usage guidelines
  - Git workflow for JSONL sync (commit frequency, merge conflict resolution)
  - Migration path from GitHub Issues (selective vs full)
  - When to use beads vs GitHub Issues (internal vs external collaboration)
- Add beads workflow reference to `.claude/commands/docs/conditional_docs/app.md`
- Create examples for common beads operations in documentation
- Create CI validation script `app/scripts/validate-beads-sync.sh`
  - Check `.beads/issues.jsonl` syntax (valid JSONL format via `jq`)
  - Exit with error if validation fails
  - Skip validation if `.beads/` directory doesn't exist
- Add `test:validate-beads` script to `app/package.json`
- Update `.github/workflows/app-ci.yml` to run validation in setup job
- Add path filter to only run validation if `.beads/` directory exists

## Step by Step Tasks

### Beads Initialization Tasks
1. Run `bd init --prefix kota` in project root directory
2. Verify `.beads/kota-db-ts.db` created and functional
3. Verify `.beads/issues.jsonl` and `.beads/config.json` created
4. Test empty database query with `bd list` (should return empty result)
5. Add `.beads/*.db` entry to `.gitignore` (exclude SQLite binary)
6. Commit `.beads/issues.jsonl` and `.beads/config.json` to git
7. Test MCP tool `mcp__plugin_beads_beads__where_am_i` for database discovery

### Slash Command Creation Tasks
8. Create `.claude/commands/beads/` directory for command organization
9. Create `/beads:ready` command file with MCP tool integration
   - Include `set_context` call with project root
   - Call `mcp__plugin_beads_beads__ready` with optional filters
   - Format results as markdown table with links to spec files
   - Add recommendation logic based on priority + effort labels
10. Create `/beads:create` command file with parameter prompting
    - Prompt for title, type (bug/feature/task/epic/chore), priority (0-2)
    - Prompt for optional description, dependencies (comma-separated IDs)
    - Call `mcp__plugin_beads_beads__create` with validated parameters
    - Return created issue ID and summary
11. Create `/beads:show` command file for issue details
    - Accept issue ID as argument
    - Call `mcp__plugin_beads_beads__show` with issue ID
    - Display metadata (title, status, priority, assignee, dates)
    - Show dependency tree (dependents, dependencies with relationship types)
    - Link to GitHub issue if external_ref field exists
12. Create `/beads:update` command file for field updates
    - Prompt for issue ID and fields to update (status, priority, assignee, description)
    - Validate status values (open, in_progress, blocked, closed)
    - Validate priority values (0-2)
    - Call `mcp__plugin_beads_beads__update` with parameters
    - Confirm update success
13. Create `/beads:dep` command file for dependency relationships
    - Prompt for source issue ID, target issue ID, relationship type
    - Validate relationship type (blocks, related, parent-child, discovered-from)
    - Call `mcp__plugin_beads_beads__dep` with parameters
    - Confirm relationship creation
14. Test all 5 slash commands manually with sample issues
15. Verify error handling for invalid parameters (missing IDs, invalid statuses)

### Documentation Tasks
16. Add "Beads Workflow" section to `CLAUDE.md` with subsections:
    - "Database Discovery" (explain `.beads/` search path)
    - "Issue ID Conventions" (explain `kota-` prefix and numbering)
    - "Dependency Relationship Types" (define blocks, related, parent-child, discovered-from)
    - "Git Workflow for JSONL Sync" (explain auto-export, commit strategy, merge conflicts)
    - "Migration from GitHub Issues" (explain selective migration approach)
    - "When to Use Beads vs GitHub Issues" (internal dependency tracking vs external collaboration)
17. Add beads workflow documentation reference to `.claude/commands/docs/conditional_docs/app.md`
18. Include examples of common beads operations (create issue, add dependency, query ready tasks)

### CI Validation Tasks
19. Create `app/scripts/validate-beads-sync.sh` script with validation logic:
    - Check if `.beads/` directory exists (skip if not)
    - Validate `.beads/issues.jsonl` syntax using `jq -e .`
    - Exit with error code if validation fails
    - Print success message if validation passes
20. Make validation script executable (`chmod +x`)
21. Add `"test:validate-beads": "bash scripts/validate-beads-sync.sh"` to `app/package.json`
22. Update `.github/workflows/app-ci.yml` setup job:
    - Add validation step after migration sync validation
    - Run `cd app && bun run test:validate-beads`
    - Add path filter to skip if `.beads/` doesn't exist
23. Test CI validation locally with `cd app && bun run test:validate-beads`

### Manual Testing Tasks
24. Create 3 test issues via `/beads:create` (feature, bug, chore)
25. Add dependency relationship via `/beads:dep` (issue 1 blocks issue 2)
26. Query ready tasks via `/beads:ready` (expect only issue 1)
27. Update issue 1 status to completed via `/beads:update`
28. Re-query ready tasks via `/beads:ready` (expect issue 2 now ready)
29. Test `/beads:show` for dependency tree visualization
30. Verify JSONL export created and valid JSON format (`cat .beads/issues.jsonl | jq .`)
31. Commit JSONL changes, push to remote, test teammate sync workflow

### Final Validation and Push Tasks
32. Re-run all 5 slash commands to verify functionality
33. Run `bun run lint` in app directory
34. Run `bun run typecheck` (shared types and app)
35. Run `cd app && bun run test:validate-beads` for JSONL validation
36. Verify `.beads/issues.jsonl` committed to git (`git status`)
37. Run `git diff --stat` to review all changes
38. Push branch to remote: `git push -u origin feat/301-beads-integration-phase-1`

## Risks & Mitigations

### Risk 1: Team Adoption Overhead
**Impact**: Developers unfamiliar with beads may resist migration from GitHub Issues
**Mitigation**:
- Start with slash commands (no CLI knowledge required)
- Create visual comparison guide showing beads benefits (dependency graphs, instant work selection)
- Phase 1 is opt-in for manual testing only (no forced migration)
- Document common workflows with examples in CLAUDE.md

### Risk 2: Beads Database Merge Conflicts
**Impact**: Concurrent work across branches may create JSONL merge conflicts
**Mitigation**:
- Beads JSONL format is line-based (one issue per line, merge-friendly)
- Worst case: `bd import issues.jsonl` re-imports from git after manual conflict resolution
- Document merge conflict resolution workflow in CLAUDE.md
- ADW worktree isolation prevents conflicts during agent execution

### Risk 3: CI Validation False Positives
**Impact**: CI may fail on valid JSONL due to strict validation checks
**Mitigation**:
- Phase 1 CI validation only checks syntax (no timestamp or staleness checks)
- Skip validation if `.beads/` directory doesn't exist (no false failures on fresh clones)
- Phase 2 can add stricter validation after adoption feedback

### Risk 4: MCP Tool Parameter Confusion
**Impact**: Slash commands call MCP tools with incorrect workspace_root or parameter types
**Mitigation**:
- All slash commands call `set_context` with project root before operations
- Include parameter validation in command templates (type guards, range checks)
- Test error handling for missing context and invalid parameters
- Document MCP tool contracts in slash command templates

### Risk 5: JSONL Export Lag
**Impact**: Developers commit code changes before beads auto-exports to JSONL (stale state)
**Mitigation**:
- Beads auto-exports with 5s debounce (fast enough for normal workflows)
- CI validation checks JSONL syntax but not freshness in Phase 1
- Document recommended workflow: create/update issues, wait 5s, then commit
- Phase 2 can add pre-commit hook to validate JSONL freshness

## Validation Strategy

### Automated Tests
**No automated tests required for Phase 1**: Slash commands are templates (not executable code), and beads MCP server is tested upstream. CI validation covers JSONL syntax checking only.

**Future test candidates** (Phase 2):
- Integration tests for slash command output format (validate markdown table structure)
- Unit tests for beads database operations (create, update, delete, dependency relationships)
- Concurrency tests for multiple agents creating issues simultaneously

### Manual Checks
Document all manual validation steps in task breakdown (items 24-31):
1. **Create issues**: Verify 3 test issues created successfully with correct metadata
2. **Add dependencies**: Verify dependency relationships stored correctly (blocks, related, parent-child)
3. **Query ready tasks**: Verify only unblocked issues returned by `/beads:ready`
4. **Update status**: Verify issue status changes trigger dependency resolution (blocked → ready)
5. **Show dependency tree**: Verify `/beads:show` displays complete dependency graph
6. **JSONL export**: Verify `.beads/issues.jsonl` auto-exports with valid JSON format
7. **Git sync**: Verify teammate can pull JSONL and auto-import to local database
8. **Error handling**: Verify slash commands handle invalid parameters gracefully (missing IDs, invalid statuses)
9. **Database discovery**: Verify `where_am_i` tool returns correct database path
10. **Spec file linking**: Verify `/beads:ready` links to existing spec files when available

### Release Guardrails
**Phase 1 is development-only**: No production deployment or user-facing changes. Beads integration is internal developer tooling for ADW workflow preparation.

**Monitoring** (Phase 2):
- Track beads adoption rate (issues created via slash commands vs GitHub)
- Monitor JSONL merge conflicts during code review
- Measure work selection latency (beads vs GitHub API baseline)

**Alerting** (Phase 2):
- Alert if beads database becomes corrupted (validation fails)
- Alert if JSONL exports stop auto-generating (5s debounce broken)
- Alert if CI validation fails repeatedly (indicates systemic issue)

**Rollback** (Phase 2):
- Delete `.beads/` directory to revert to GitHub-only workflow
- ADW workflows fall back to GitHub API queries if beads unavailable
- No data loss risk (JSONL committed to git)

## Validation Commands

### Level 2: Integration Validation (Minimum for this feature)
```bash
# Type checking
cd app && bun run typecheck

# Linting
cd app && bun run lint

# Beads JSONL validation
cd app && bun run test:validate-beads

# Manual slash command testing (no automated tests)
# - Run /beads:create to create 3 test issues
# - Run /beads:dep to add dependency relationships
# - Run /beads:ready to query unblocked tasks
# - Run /beads:update to change issue status
# - Run /beads:show to view dependency tree
# - Verify JSONL export with: cat .beads/issues.jsonl | jq .
```

**No build or unit tests required**: This feature adds configuration files, slash command templates, and documentation only. No application code changes.

### Domain-Specific Validation
```bash
# Validate beads database initialization
bd list  # Should return empty result on fresh init
bd where-am-i  # Should return project root database path

# Validate JSONL format
cat .beads/issues.jsonl | jq empty  # Should exit with 0 if valid JSON

# Validate git tracking
git status .beads/  # Should show issues.jsonl and config.json as tracked

# Validate gitignore
git check-ignore .beads/*.db  # Should match .beads/*.db pattern
```

## Commit Message Validation
All commits for this feature will follow Conventional Commits format and avoid meta-commentary patterns:

**Valid examples**:
- `feat(beads): initialize beads database with kota prefix`
- `feat(beads): add slash commands for manual workflow testing`
- `docs(beads): add workflow conventions to CLAUDE.md`
- `chore(ci): add beads JSONL validation to app-ci workflow`

**Invalid examples** (meta-commentary):
- `Based on the plan, this commit adds beads initialization`
- `The commit should initialize beads with kota prefix`
- `I can see the changes initialize the database`
- `Looking at the diff, let me add beads commands`

**Commit scope**: Use `beads` scope for all beads-related changes. Use `ci` scope for workflow changes.

## Issue Relationships

- **Child Of**: #300 (epic: integrate beads dependency-aware issue tracker)
- **Blocks**: Phase 2 (#TBD, ADW Integration) - Must complete initialization before ADW workflows can use beads
- **Related To**: #297 (ADW workflow orchestration tools for MCP) - Beads provides work selection backend
- **Related To**: #151 (GitHub issue relationship standards) - Beads makes relationships programmatic
- **Related To**: #187 (/orchestrator slash command) - Beads enables smarter work prioritization

## References

- **Beads MCP Server**: `plugin:beads:beads` (available MCP tools)
- **Beads Quickstart**: `beads://quickstart` MCP resource
- **Issue Relationship Standards**: `.claude/commands/docs/issue-relationships.md`
- **Prompt-Code Alignment**: `.claude/commands/docs/prompt-code-alignment.md`
- **Slash Command README**: `.claude/commands/README.md`
- **Beads Open Source**: https://github.com/steveyegge/beads
- **Epic Issue #300**: GitHub issue with complete Phase 1-4 roadmap
