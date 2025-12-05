# Chore Plan: Refactor CLAUDE.md as Navigation Gateway

## Context
- CLAUDE.md currently at 138 lines, already under 250 line target
- Current structure mixes reference documentation with navigation links
- Issue #482 is part of epic #481 (overhaul .claude/ directory)
- Builds on #474 (foundation) and supersedes #311 (earlier refactor effort)
- Existing detailed docs are already delegated to `.claude/commands/docs/`
- Missing: BLUF section, command navigation, common workflows, diagnostic mappings

## Relevant Files
- `CLAUDE.md` — primary target for restructuring
- `.claude/commands/README.md` — documents command structure and categories
- `.claude/commands/workflows/prime.md` — quick-start onboarding reference
- `.claude/commands/docs/conditional_docs/app.md` — layer-specific doc routing
- `.claude/commands/docs/conditional_docs/automation.md` — automation layer docs

### New Files
- None — all changes are to existing `CLAUDE.md`

## Work Items
### Preparation
- Create branch `chore/482-claude-md-navigation-gateway` from `develop`
- Review existing command inventory across all subdirectories
- Identify commands to include in navigation index

### Execution
1. Restructure CLAUDE.md with new sections:
   - BLUF with `/workflows:prime` pointer
   - Quick Start (4-step onboarding)
   - Core Principles (principle → command mapping)
   - Command Navigation (category-based index)
   - Common Workflows (complete sequences)
   - When Things Go Wrong (diagnostic mappings)
2. Remove detailed inline documentation (already delegated)
3. Keep critical conventions section (concise)
4. Maintain MCP server overview (concise)

### Follow-up
- Verify all referenced commands exist
- Test workflow sequences documented
- Update conditional_docs/app.md if CLAUDE.md conditions change

## Step by Step Tasks

### 1. Git Setup
- `git checkout develop && git pull --rebase`
- `git checkout -b chore/482-claude-md-navigation-gateway`

### 2. Audit Current Commands
- Review all 60+ commands in `.claude/commands/` subdirectories
- Group by category: workflows, issues, git, testing, architecture, docs, tools, ci, automation, release, worktree, app, homeserver, validation, tasks

### 3. Restructure CLAUDE.md
- Add BLUF section at top with `/workflows:prime` pointer
- Add Quick Start section (4 steps)
- Add Core Principles section (5-7 principles mapped to commands)
- Replace Documentation Directory with Command Navigation (category-based)
- Add Common Workflows section with 3-5 complete sequences
- Add When Things Go Wrong section with diagnostic mappings
- Keep Project Overview (condensed)
- Keep Critical Conventions (essential only)
- Keep MCP Server Availability (condensed)

### 4. Command Navigation Categories
Organize commands into these categories:
- **Workflows**: plan, build, review, implement, document, validate-implementation, patch, orchestrator, prime, dogfood-prime, roadmap-update
- **Issues**: feature, bug, chore, refactor, issue, classify_issue, audit, prioritize
- **Git**: commit, pull_request
- **Testing**: testing-guide, anti-mock, test-lifecycle, logging-standards
- **Architecture**: architecture, database, workflow, mcp-integration, mcp-usage-guidance
- **Documentation**: docs-update, conditional_docs, issue-relationships, prompt-code-alignment, kotadb-agent-usage
- **CI/CD**: ci-configuration, ci-investigate, ci-update, ci-audit, automated-deployments
- **Tools**: tools, pr-review, install, bun_install
- **Automation**: adw-architecture, adw-observability, generate_branch_name, find_plan_file
- **Release**: release
- **Worktree**: init_worktree, make_worktree_name, spawn_interactive
- **App**: start, dev-commands, environment, pre-commit-hooks, schema_plan
- **Homeserver**: get_homeserver_tasks, update_homeserver_task
- **Validation**: resolve_failed_validation
- **Tasks**: create, query_phase, update_status

### 5. Document Common Workflows
- **Starting a New Feature**: issue → classify → plan → implement → validate → commit → pull_request
- **Bug Fix**: bug → plan → implement → validate → commit → pull_request
- **Code Review**: pr-review → validate-implementation → review
- **Environment Setup**: prime → dogfood-prime → start
- **CI Troubleshooting**: ci-investigate → ci-audit → ci-update

### 6. Create Diagnostic Mappings
- **Tests failing**: testing-guide, test-lifecycle, anti-mock
- **Build failing**: dev-commands, environment, pre-commit-hooks
- **CI failing**: ci-investigate, ci-configuration
- **Migration errors**: database, architecture
- **Type errors**: architecture (path aliases)
- **Lint failures**: logging-standards, pre-commit-hooks

### 7. Validation
- `wc -l CLAUDE.md` — verify < 250 lines
- Manually verify all command paths exist
- Run quick validation: `cd app && bunx tsc --noEmit`

### 8. Commit and Push
- Stage changes: `git add CLAUDE.md`
- Commit with conventional format
- Push: `git push -u origin chore/482-claude-md-navigation-gateway`

## Risks
- **Command paths change**: Mitigation — use relative paths, verify existence
- **Too concise loses context**: Mitigation — ensure each command has one-line description
- **Workflow sequences become outdated**: Mitigation — reference existing command docs

## Validation Commands
- `wc -l CLAUDE.md` — line count < 250
- `cd app && bunx tsc --noEmit` — type-check passes
- `cd app && bun run lint` — lint passes
- Verify all referenced .md files exist via `ls` or glob

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: refactor CLAUDE.md as navigation gateway` not `Based on the plan, the commit should refactor CLAUDE.md`

## Deliverables
- Refactored `CLAUDE.md` under 250 lines
- BLUF section with quick-start pointer
- Command Navigation with category-based index (60+ commands)
- Common Workflows section (5 workflows)
- When Things Go Wrong diagnostic section
- All existing functionality preserved via links to detailed docs
