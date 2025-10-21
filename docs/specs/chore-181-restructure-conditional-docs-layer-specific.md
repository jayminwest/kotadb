# Chore Plan: Restructure conditional_docs.md into Layer-Specific Directory

## Context
The `.claude/commands/docs/conditional_docs.md` file has grown to 272 lines (~16KB) containing documentation references for three distinct project layers: application (app/), automation (automation/adws/), and web frontend (if applicable). This single monolithic file is loaded into agent context windows for all slash commands, causing unnecessary token consumption when agents only need documentation relevant to their specific layer.

**Why this matters now:**
- Agents working on backend tasks load automation-specific docs unnecessarily
- Agents working on automation load backend-specific docs unnecessarily
- Large context window footprint reduces available space for actual code and implementation details
- The file will continue to grow as documentation expands, making this problem worse over time
- 13 slash command templates reference this file, making updates now cost-effective before more commands are added

**Constraints:**
- Must maintain backward compatibility during migration (all commands must continue to work)
- No changes to automation layer Python code required (confirmed: no references to conditional_docs.md path in automation/)
- Must preserve all existing conditional documentation entries (no information loss)
- CI must pass for both app-ci.yml and automation-ci.yml after migration

## Relevant Files
- `.claude/commands/docs/conditional_docs.md` — Current monolithic file (272 lines, 60+ entries)
- `.claude/commands/workflows/document.md` — References conditional_docs.md (2 occurrences)
- `.claude/commands/workflows/implement.md` — References conditional_docs.md (1 occurrence)
- `.claude/commands/workflows/prime.md` — References conditional_docs.md (1 occurrence)
- `.claude/commands/docs/docs-update.md` — References conditional_docs.md (2 occurrences)
- `.claude/commands/README.md` — Documents conditional_docs.md purpose (1 occurrence)
- `.claude/commands/issues/issue.md` — References conditional_docs.md (1 occurrence)
- `.claude/commands/issues/bug.md` — References conditional_docs.md (1 occurrence)
- `.claude/commands/issues/chore.md` — References conditional_docs.md (2 occurrences)
- `.claude/commands/issues/feature.md` — References conditional_docs.md (2 occurrences)

### New Files
- `.claude/commands/docs/conditional_docs/app.md` — Backend/API-specific documentation references (app/, testing, CI, database)
- `.claude/commands/docs/conditional_docs/automation.md` — Automation-specific documentation references (automation/adws/, ADW workflows)
- `.claude/commands/docs/conditional_docs/web.md` — Frontend-specific documentation references (placeholder for future web/ directory)

## Work Items
### Preparation
- Review conditional_docs.md structure and categorize entries by layer
- Audit all 13 references to conditional_docs.md in `.claude/commands/**/*.md`
- Identify any shared entries that belong in multiple layers (e.g., CLAUDE.md has both app and issue management content)

### Execution
- Create `.claude/commands/docs/conditional_docs/` directory
- Create `app.md` with backend-specific entries (CLAUDE.md app sections, schema.md, testing-setup.md, CI workflows, backend specs)
- Create `automation.md` with automation-specific entries (automation/adws/README.md, ADW specs, workflow isolation, log analysis)
- Create `web.md` as placeholder for future frontend documentation
- Update all 13 slash command templates to reference layer-specific files based on command purpose:
  - Workflow commands (document.md, implement.md, prime.md): reference app.md or automation.md based on context
  - Issue commands (issue.md, bug.md, chore.md, feature.md): reference app.md (most issues are app-layer)
  - Docs commands (docs-update.md): reference all layers or provide guidance on choosing layer
- Update `.claude/commands/README.md` to document new directory structure

### Follow-up
- Test sample commands from each category to ensure docs load correctly
- Run CI workflows to verify no broken references
- Remove original `conditional_docs.md` after validating migration
- Update `CLAUDE.md` if the chore introduces new documentation patterns worth documenting

## Step by Step Tasks
### Analysis & Categorization
- Read conditional_docs.md and categorize all 60+ entries into app/automation/web layers
- Identify shared entries that should appear in multiple layer files (e.g., CLAUDE.md, README.md)
- Document entry categorization logic for future maintainers

### Directory Creation
- Create `.claude/commands/docs/conditional_docs/` directory
- Create `app.md` with appropriate header explaining layer scope
- Create `automation.md` with appropriate header explaining layer scope
- Create `web.md` as minimal placeholder for future use

### Content Migration
- Copy app-specific entries to `app.md`:
  - CLAUDE.md (app/src/** architecture, path aliases, validation commands)
  - README.md (Bun API service, environment variables, docker commands)
  - docs/schema.md (database schema, migrations, RLS policies)
  - docs/supabase-setup.md (Supabase integration)
  - docs/testing-setup.md (test environment setup)
  - docs/migration-sqlite-to-supabase.md (database migration)
  - .claude/commands/docs/anti-mock.md (testing philosophy)
  - .claude/commands/docs/test-lifecycle.md (test execution)
  - All specs under feature-* or chore-* related to app layer (API, indexer, database, auth, validation, MCP)
  - CI workflow references (.github/workflows/automation-ci.yml if app-related)
- Copy automation-specific entries to `automation.md`:
  - automation/adws/README.md (ADW architecture, workflows, state management)
  - docs/adws/validation.md (ADW validation rules)
  - .claude/commands/docs/prompt-code-alignment.md (template design for ADW)
  - All specs related to ADW workflows (feature-105, feature-163, feature-187, chore-81, feature-65, chore-update-automation-commands-path)
  - .github/workflows/automation-ci.yml (automation CI infrastructure)
- Copy shared/cross-cutting entries to both `app.md` and `automation.md`:
  - CLAUDE.md (issue relationship standards section)
  - .claude/commands/README.md (command organization)
  - .claude/commands/docs/issue-relationships.md (relationship metadata)
  - .claude/commands/issues/*.md references (issue management workflows)
  - .claude/commands/worktree/spawn_interactive.md (interactive worktree development)
  - docs/vision/*.md (strategic planning)
  - .claude/commands/workflows/orchestrator.md (workflow automation)

### Template Updates
- Update `.claude/commands/workflows/document.md` to reference layer-specific files
- Update `.claude/commands/workflows/implement.md` to reference layer-specific files
- Update `.claude/commands/workflows/prime.md` to reference layer-specific files
- Update `.claude/commands/docs/docs-update.md` to reference layer-specific files
- Update `.claude/commands/README.md` to document new structure
- Update `.claude/commands/issues/issue.md` to reference layer-specific files
- Update `.claude/commands/issues/bug.md` to reference layer-specific files
- Update `.claude/commands/issues/chore.md` to reference layer-specific files
- Update `.claude/commands/issues/feature.md` to reference layer-specific files

### Validation
- Run `bun run lint` to check for any syntax issues in updated markdown files
- Run `bun run typecheck` to ensure no TypeScript references are broken
- Test `/implement` command with sample app task to verify app.md loads correctly
- Test `/orchestrator` or ADW-related command to verify automation.md loads correctly
- Test `/bug` command to verify layer selection logic works
- Verify CI passes: check GitHub Actions status or run locally if possible

### Cleanup & Documentation
- Remove original `.claude/commands/docs/conditional_docs.md` after successful validation
- Update `.claude/commands/docs/conditional_docs.md` reference in this spec to point to new directory
- Add migration note to `.claude/commands/README.md` explaining the restructure

### Final Push
- Stage all changes: `git add .claude/commands/docs/conditional_docs/ .claude/commands/**/*.md docs/specs/chore-181-*.md`
- Commit with message: `chore: restructure conditional_docs.md into layer-specific directory`
- Push branch: `git push -u origin chore/181-restructure-conditional-docs-layer-specific`

## Risks
- **Risk:** Agents may reference old path `.claude/commands/docs/conditional_docs.md` in cached prompts
  - **Mitigation:** Keep original file temporarily with deprecation notice, remove only after validation period
- **Risk:** Some commands may need both app and automation docs (e.g., orchestrator)
  - **Mitigation:** Allow commands to reference multiple layer files, or create shared entries in both files
- **Risk:** Entry categorization may be subjective (unclear if entry belongs to app vs automation)
  - **Mitigation:** Use decision criteria: if conditions mention `app/src/**`, it's app; if conditions mention `automation/adws/**`, it's automation; if both, duplicate entry
- **Risk:** Breaking changes to command templates may cause ADW workflow failures
  - **Mitigation:** Test with sample commands before committing, run CI to verify no regressions
- **Risk:** Documentation for web layer may be premature (no web/ directory yet)
  - **Mitigation:** Create minimal placeholder file with note that it's for future use

## Validation Commands
- `bun run lint` — Check markdown syntax and formatting
- `bun run typecheck` — Ensure no TypeScript references are broken
- `bun test` — Run test suite to verify no unexpected side effects
- Manual command testing:
  - Test `/implement` with app-layer task to verify app.md loads
  - Test ADW command to verify automation.md loads
  - Test `/bug` to verify layer selection logic
- CI verification:
  - Check `.github/workflows/app-ci.yml` passes
  - Check `.github/workflows/automation-ci.yml` passes
  - Review CI logs for any warnings about missing documentation references

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: restructure conditional_docs into layer-specific directory` not `Based on the plan, the commit should restructure conditional_docs`

## Deliverables
- Three new layer-specific documentation files: `app.md`, `automation.md`, `web.md`
- Updated 13 slash command templates with layer-specific references
- Updated `.claude/commands/README.md` documenting new structure
- Removed original `conditional_docs.md` after validation
- CI passing for both app-ci.yml and automation-ci.yml workflows
- All 60+ conditional documentation entries preserved and migrated
