# Chore Plan: Final Documentation and Validation of .claude/ Overhaul

## Context
- The .claude/ directory overhaul (Epic #481) has completed phases 2-6, but requires holistic validation
- The 7-level prompt maturity model is referenced in commands/README.md but not formally documented
- 54 of 84 command files lack explicit Template Category declarations
- `.claude/docs/` directory does not exist yet; needs to be created for prompt-levels.md
- agent-registry.json validates as proper JSON with capability and model indexes

## Relevant Files
- `.claude/commands/README.md` — Command taxonomy and template categories (already comprehensive)
- `.claude/agents/agent-registry.json` — Machine-readable agent registry (valid JSON)
- `.claude/agents/README.md` — Agent documentation and usage guidance
- `CLAUDE.md` — Project navigation gateway (references commands accurately)
- `.claude/settings.json` — Shared project settings with hooks
- `.claude/hooks/` — Automation hooks (auto_linter.py, context_builder.py)

### New Files
- `.claude/docs/prompt-levels.md` — 7-level prompt maturity model documentation

## Work Items

### Preparation
- Verify current branch is correct for chore work
- Review existing template category annotations in commands

### Execution
- Create `.claude/docs/` directory structure
- Create `.claude/docs/prompt-levels.md` with 7-level model documentation
- Audit commands without Template Category declarations
- Update commands/README.md with complete prompt level annotations
- Validate agent-registry.json schema consistency
- Test representative commands from each template category
- Verify CLAUDE.md command references are accurate

### Follow-up
- Run full validation suite
- Document any discovered issues for future work

## Step by Step Tasks

### 1. Create Prompt Levels Documentation
- Create `.claude/docs/` directory
- Create `.claude/docs/prompt-levels.md` documenting all 7 levels with examples
- Include required sections per level
- Reference KotaDB commands at each level

### 2. Commands Audit and Updates
- Identify all 54 commands lacking Template Category declarations
- Prioritize core workflow commands for annotation updates
- Add Template Category to commands/README.md command tables
- Add Prompt Level annotations where applicable

### 3. Validation Suite
- Validate all command files parse without errors (markdown structure)
- Validate agent-registry.json against schema patterns
- Test key commands: `/workflows:plan`, `/git:commit`, `/issues:chore`, `/docs:architecture`
- Verify agent invocations in registry have correct tool access

### 4. Cross-Cutting Concerns
- Verify CLAUDE.md references accurate command paths
- Verify workflow sequences documented in CLAUDE.md are complete
- Verify hooks configuration applies correctly (check settings.json)
- Confirm no blocking issues from hooks during normal operations

### 5. Documentation Polish
- Update any stale references to old directory structure
- Ensure conditional_docs files reference new prompt-levels.md
- Add prompt-levels.md condition to app.md conditional docs

### 6. Final Validation and Push
- Run lint: `cd app && bun run lint`
- Run typecheck: `cd app && bunx tsc --noEmit`
- Commit changes with conventional commit format
- Push branch: `git push -u origin chore/487-final-docs-validation`

## Risks
- Commands without Template Category may require individual assessment → Batch update with reasonable defaults based on command purpose
- Some commands may have evolved since README last updated → Cross-reference command files during validation
- Hook configurations may interfere with validation → Test in isolated context if needed

## Validation Commands
- `bun run lint` (from app/)
- `bunx tsc --noEmit` (from app/)
- `jq empty .claude/agents/agent-registry.json` (JSON validation)
- Manual test of key slash commands from each category

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- Use direct statements: `chore(docs): add 7-level prompt maturity model documentation`

## Deliverables
- `.claude/docs/prompt-levels.md` — Complete 7-level prompt maturity model documentation
- Updated `.claude/commands/README.md` — Complete taxonomy with prompt level annotations
- Validation report confirming all components work together
- Updated `.claude/commands/docs/conditional_docs/app.md` — Reference to prompt-levels.md
