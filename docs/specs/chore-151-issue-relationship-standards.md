# Chore Plan: Establish Issue Relationship Documentation Standards

## Issue Relationships

- **Related To**: #148 (hybrid ADW resilience) - Enables better context discovery for ADW planning phase
- **Related To**: #110 (kota-tasks MCP) - Relationship metadata helps AI agents identify prerequisites
- **Related To**: #105 (log analysis) - Improves observability of ADW success patterns via dependency tracking

## Context
As KotaDB grows in complexity, tracking issue dependencies and relationships has become critical for both human developers and AI agents. Currently, spec files lack explicit relationship metadata, making it difficult to:
- Understand prerequisite work before starting implementation
- Identify related issues that share technical concerns
- Enable AI agents to discover context automatically
- Trace feature evolution across multiple issues/PRs

This chore establishes comprehensive relationship documentation standards across spec files, GitHub templates, and slash commands to improve long-term development culture and automation capabilities.

**Constraints:**
- Must maintain backward compatibility with existing spec files
- Machine-readable format for AI agent parsing
- No disruption to current development workflows

## Relevant Files
- `.claude/commands/docs/conditional_docs.md` — conditional documentation routing (requires update)
- `.github/ISSUE_TEMPLATE/*.yml` — GitHub issue templates (require relationship fields)
- `.github/pull_request_template.md` — PR template (requires relationship section)
- `.claude/commands/issues/issue.md` — issue creation command (requires relationship prompts)
- `.claude/commands/plan.md` — plan command (should reference relationship docs)
- `.claude/commands/review.md` — review command (should validate relationships)
- `docs/specs/*.md` — all existing spec files (batch update needed)

### New Files
- `.claude/commands/docs/issue-relationships.md` — comprehensive relationship documentation standards
- `docs/specs/_template-with-relationships.md` — spec file template with relationship section
- `docs/specs/chore-151-relationship-migration.md` — batch update tracking document

## Work Items

### Preparation
- Verify current spec file structure across all existing files
- Audit GitHub issue/PR templates for current relationship documentation
- Review slash commands for relationship handling
- Create backup branch of all documentation before modifications

### Execution
1. Create relationship documentation standards document (`.claude/commands/docs/issue-relationships.md`)
2. Create enhanced spec file template with relationship section
3. Update GitHub issue templates to include relationship fields
4. Update GitHub PR template to include relationship references
5. Update `.claude/commands/issues/issue.md` to prompt for relationships
6. Update `.claude/commands/plan.md` to reference relationship documentation
7. Update `.claude/commands/review.md` to validate relationship metadata
8. Update `.claude/commands/docs/conditional_docs.md` with new standard
9. Batch update existing spec files with relationship sections (prioritize recent/active)
10. Document batch update progress in tracking file

### Follow-up
- Monitor adoption in next 5 PRs
- Validate AI agents correctly parse relationship metadata
- Create follow-up issue for automated relationship validation in CI

## Step by Step Tasks

### Documentation Standards Creation
- Create `.claude/commands/docs/issue-relationships.md` with relationship type definitions (Depends On, Related To, Blocks, Supersedes, Child Of, Follow-Up)
- Document when to use each relationship type with examples
- Include benefits section for AI agents, contributors, and project managers
- Add machine-readable formatting guidelines for consistent parsing

### Template Updates
- Create `docs/specs/_template-with-relationships.md` with full relationship section
- Update `.github/ISSUE_TEMPLATE/feature_request.yml` to include relationship fields
- Update `.github/ISSUE_TEMPLATE/bug_report.yml` to include relationship fields
- Update `.github/ISSUE_TEMPLATE/chore.yml` to include relationship fields (if exists)
- Update `.github/pull_request_template.md` with relationship references section
- Add relationship field descriptions with examples in templates

### Slash Command Integration
- Update `.claude/commands/issues/issue.md` to prompt for issue relationships during creation
- Update `.claude/commands/plan.md` to include relationship discovery in planning instructions
- Update `.claude/commands/review.md` to validate relationship documentation completeness
- Update `.claude/commands/docs/conditional_docs.md` to reference issue-relationships.md when working with spec files or GitHub issues

### Spec File Migration
- Create `docs/specs/chore-151-relationship-migration.md` to track batch update progress
- Identify 10 most recent/active spec files for manual relationship annotation
- Extract relationship data from git history, issue comments, and PR descriptions
- Update selected spec files with relationship metadata
- Document migration methodology for future bulk updates
- Mark remaining spec files for gradual migration during normal development

### Validation and Finalization
- Run `bun run lint` to check markdown formatting
- Run `bun run typecheck` to ensure no TypeScript errors
- Verify all new documentation files render correctly on GitHub
- Test issue creation workflow with updated templates
- Test PR creation workflow with updated template
- Validate conditional docs routing includes new standards
- Commit all changes with conventional commit message
- Push branch to remote with `git push -u origin chore/151-issue-relationship-standards`

## Risks

**Risk:** Batch updating all spec files could introduce inconsistencies or errors
→ **Mitigation:** Prioritize recent/active files for manual review, defer historical files to gradual migration

**Risk:** New relationship fields might be ignored by developers
→ **Mitigation:** Update slash commands to prompt for relationships, include examples in templates

**Risk:** Over-documentation of trivial relationships clutters spec files
→ **Mitigation:** Documentation standards emphasize meaningful connections only, provide clear guidelines

**Risk:** Relationship metadata becomes stale as issues evolve
→ **Mitigation:** Update review command to validate relationship accuracy during PR review

**Risk:** Machine parsing breaks if formatting is inconsistent
→ **Mitigation:** Enforce strict formatting in documentation standards, provide clear examples

## Validation Commands

- `bun run lint` — validate markdown formatting
- `bun run typecheck` — ensure no TypeScript errors
- `bun test` — run full test suite (documentation changes should not break tests)
- Manual verification of GitHub template rendering
- Manual verification of slash command prompts
- Manual verification of conditional docs routing

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `docs: add issue relationship standards` not `Based on the plan, the commit should add relationship standards`

## Deliverables

**Code changes:**
- None (documentation-only chore)

**Config updates:**
- `.github/ISSUE_TEMPLATE/*.yml` — relationship fields added
- `.github/pull_request_template.md` — relationship section added

**Documentation updates:**
- `.claude/commands/docs/issue-relationships.md` — new relationship standards document
- `.claude/commands/docs/conditional_docs.md` — updated with new standard routing
- `.claude/commands/issues/issue.md` — relationship prompts added
- `.claude/commands/plan.md` — relationship discovery instructions added
- `.claude/commands/review.md` — relationship validation instructions added
- `docs/specs/_template-with-relationships.md` — new spec template
- `docs/specs/chore-151-relationship-migration.md` — migration tracking document
- `docs/specs/*.md` — 10+ spec files updated with relationship metadata
