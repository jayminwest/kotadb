# Chore Plan: Restructure conditional_docs.md into Layer-Specific Directory

## Context

The `.claude/commands/docs/conditional_docs.md` file has grown to 272 lines (~16KB) and contains documentation references for three distinct project layers: application (app/), automation (automation/adws/), and web frontend. This single file is loaded into agent context windows for all slash commands, causing unnecessary token consumption when agents only need documentation relevant to their specific layer.

**Why this chore matters now:**
- Large context window footprint reduces available space for actual code and implementation details
- Agents working on backend tasks load automation-specific docs unnecessarily and vice versa
- Harder to maintain and navigate as documentation references continue to grow
- Blocking improved context efficiency for agent-based workflows

**Constraints / deadlines:**
- None specified, but this unblocks better context management for all slash commands
- Should be completed before additional conditional docs are added to prevent further bloat

## Relevant Files

### Existing Files to Modify
- `.claude/commands/docs/conditional_docs.md` — Current monolithic file (to be removed after migration)
- `.claude/commands/**/*.md` — 13+ slash command templates that reference conditional_docs.md
- `automation/adws/adw_modules/agent.py` — May contain path references to conditional_docs.md
- `.claude/commands/README.md` — Documentation explaining command structure (needs update)

### New Files
- `.claude/commands/docs/conditional_docs/app.md` — Backend/API-specific docs (app/src/, testing, CI, database)
- `.claude/commands/docs/conditional_docs/automation.md` — Automation-specific docs (automation/adws/, ADW workflows)
- `.claude/commands/docs/conditional_docs/web.md` — Frontend-specific docs placeholder

## Work Items

### Preparation
1. Audit all references to `conditional_docs.md` in `.claude/commands/` directory
2. Categorize each conditional doc entry by layer (app vs automation vs web)
3. Identify any shared entries that belong in multiple layers
4. Create backup of original `conditional_docs.md` for validation

### Execution
1. Create `.claude/commands/docs/conditional_docs/` directory
2. Create three layer-specific files: `app.md`, `automation.md`, `web.md`
3. Migrate conditional doc entries from monolithic file to appropriate layer files
4. Update all slash command templates to reference layer-specific files
5. Update automation layer path references in `adw_modules/agent.py` if needed
6. Update `.claude/commands/README.md` with new structure documentation
7. Remove original `conditional_docs.md` after confirming all references migrated

### Follow-up
1. Manually test sample commands from each layer (e.g., `/implement`, `/adw:plan`)
2. Verify CI passes for both app-ci.yml and automation-ci.yml workflows
3. Monitor agent context window usage in production workflows
4. Document pattern in CLAUDE.md for future layer additions

## Step by Step Tasks

### Task Group 1: Analysis and Directory Setup
- Run `grep -r "conditional_docs.md" .claude/commands/` to find all references
- Review `.claude/commands/docs/conditional_docs.md` and categorize entries by layer
- Create directory: `mkdir -p .claude/commands/docs/conditional_docs`
- Create empty layer files: `touch .claude/commands/docs/conditional_docs/{app,automation,web}.md`

### Task Group 2: Content Migration
- Extract app-layer entries (CLAUDE.md, schema.md, testing-setup.md, CI workflows, backend specs) into `app.md`
- Extract automation-layer entries (automation/adws/README.md, ADW specs, workflow isolation, log analysis) into `automation.md`
- Create placeholder content in `web.md` for future frontend documentation
- Verify all 60+ conditional doc entries have been migrated (no orphaned entries)

### Task Group 3: Reference Updates
- Update slash command templates in `.claude/commands/workflows/` to reference layer-specific files
- Update slash command templates in `.claude/commands/issues/` to reference layer-specific files
- Update slash command templates in `.claude/commands/docs/` to reference layer-specific files
- Update slash command templates in `.claude/commands/worktree/` if they reference conditional_docs
- Search and update any automation layer references: `grep -r "conditional_docs.md" automation/adws/`

### Task Group 4: Documentation Updates
- Update `.claude/commands/README.md` with explanation of new `conditional_docs/` directory structure
- Add section explaining when to use which layer-specific file
- Document pattern for adding new layers in future (CLI tools, SDKs, etc.)

### Task Group 5: Cleanup and Validation
- Remove original `.claude/commands/docs/conditional_docs.md` after confirming migration complete
- Run `cd app && bunx tsc --noEmit` to verify no TypeScript errors
- Run `cd app && bun run lint` to verify ESLint passes
- Run `cd app && bun test` to verify test suite passes
- Manually test sample commands: `/implement` (app layer), `/adw:plan` (automation layer)
- Stage all changes: `git add .claude/commands/docs/conditional_docs/ .claude/commands/**/*.md automation/adws/`
- Commit changes: `git commit -m "chore: restructure conditional_docs.md into layer-specific directory (#181)"`
- Push branch: `git push -u origin chore/181-restructure-conditional-docs`

## Risks

**Risk:** Missed references to conditional_docs.md cause broken documentation loading
- **Mitigation:** Use comprehensive grep search for all references before removal; manual testing of sample commands from each layer

**Risk:** Shared documentation entries duplicated across multiple layer files
- **Mitigation:** Identify shared entries during categorization phase and duplicate only where necessary; document pattern in README.md

**Risk:** Automation scripts break due to hardcoded path references
- **Mitigation:** Search automation/adws/ directory for path references and update accordingly; verify automation-ci.yml passes

**Risk:** CI workflows fail due to template syntax errors after updates
- **Mitigation:** Validate all updated command templates locally before pushing; ensure app-ci.yml and automation-ci.yml both pass

## Validation Commands

- `cd app && bun run lint` - Verify ESLint passes
- `cd app && bunx tsc --noEmit` - Verify TypeScript type-checking passes
- `cd app && bun test` - Verify test suite passes (133 tests)
- `grep -r "conditional_docs.md" .claude/commands/` - Verify no remaining references to old file
- `grep -r "conditional_docs.md" automation/adws/` - Verify automation layer updated if needed
- Manual validation: Test `/implement` command (app layer docs)
- Manual validation: Test `/adw:plan` command (automation layer docs)
- `gh workflow run app-ci.yml` - Verify app CI passes (if applicable)
- `gh workflow run automation-ci.yml` - Verify automation CI passes (if applicable)

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: restructure conditional_docs.md into layer-specific directory (#181)`

Example valid commit:
```
chore(docs): restructure conditional_docs.md into layer-specific directory (#181)
```

## Deliverables

**Code changes:**
- None (documentation-only chore)

**Config updates:**
- None (documentation-only chore)

**Documentation updates:**
- New directory structure: `.claude/commands/docs/conditional_docs/` with `app.md`, `automation.md`, `web.md`
- Updated slash command templates (13+ files) to reference layer-specific files
- Updated `.claude/commands/README.md` with new structure documentation
- Removed original `.claude/commands/docs/conditional_docs.md`
- Updated automation layer path references if applicable

## Issue Relationships

**Related To:**
- #58: Organize .claude/commands into subdirectories (established pattern for command organization)
- #146: Overhaul slash command templates to embrace MCP tooling (may affect how docs are loaded)
