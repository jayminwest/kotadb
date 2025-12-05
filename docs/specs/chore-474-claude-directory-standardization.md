# Chore Plan: Standardize .claude/ Directory Structure

## Context
- The `.claude/` directory has 67 command files across 15 subdirectories that evolved organically
- Issue #474 requests alignment with template category patterns from the Agent Teaching Guide
- Key gaps: no explicit category declarations, no `.claude/agents/` directory, inconsistent output format sections
- Builds on existing compliant patterns in `commit.md`, `find_plan_file.md`, `audit.md`

## Relevant Files
- `.claude/commands/README.md` — Primary documentation; needs template category section
- `.claude/commands/git/commit.md` — Message-Only exemplar (already compliant)
- `.claude/commands/automation/find_plan_file.md` — Path Resolution exemplar (already compliant)
- `.claude/commands/automation/generate_branch_name.md` — Message-Only exemplar (already compliant)
- `.claude/commands/worktree/make_worktree_name.md` — Message-Only (needs category declaration)
- `.claude/commands/issues/audit.md` — Structured Data exemplar (already compliant)
- `.claude/commands/issues/prioritize.md` — Structured Data (already compliant)
- `.claude/commands/issues/classify_issue.md` — Message-Only (needs category declaration)
- `.claude/commands/workflows/review.md` — Structured Data (already compliant)
- `.claude/commands/issues/feature.md` — Action (has worktree handling, needs category declaration)
- `.claude/commands/issues/bug.md` — Action (has worktree handling, needs category declaration)
- `.claude/commands/issues/chore.md` — Action (has worktree handling, needs category declaration)
- `.claude/commands/workflows/implement.md` — Action (needs category declaration)
- `.claude/commands/workflows/plan.md` — Path Resolution (already has output requirements)
- `.claude/commands/workflows/build.md` — Action (needs category declaration)
- `.claude/commands/git/pull_request.md` — Path Resolution (returns PR URL)

### New Files
- `.claude/agents/README.md` — Agent directory documentation
- `.claude/agents/scout-agent.md` — Read-only codebase exploration agent
- `.claude/agents/build-agent.md` — File implementation specialist agent
- `.claude/agents/review-agent.md` — Code review specialist agent

## Work Items
### Preparation
- Create backup of current `.claude/commands/README.md`
- Document baseline state: `find .claude/commands -name "*.md" | wc -l`
- Create `.claude/agents/` directory structure

### Execution
- Phase 1: Create `.claude/agents/` directory with agent definitions
- Phase 2: Update `.claude/commands/README.md` with template categories
- Phase 3: Add explicit `**Template Category**:` declarations to all commands
- Phase 4: Standardize meta-commentary forbidden patterns sections

### Follow-up
- Run validation commands to ensure no syntax errors
- Verify command invocation still works after updates

## Step by Step Tasks

### Task Group 1: Create Agent Directory
- Create `.claude/agents/` directory
- Add `.claude/agents/README.md` documenting agent purpose and frontmatter format
- Add `.claude/agents/scout-agent.md` with read-only tool access (Glob, Grep, Read, MCP search)
- Add `.claude/agents/build-agent.md` with write tool access (Edit, Write, Bash)
- Add `.claude/agents/review-agent.md` with read-only + review-focused tools

### Task Group 2: Update README.md
- Add "## Template Categories" section with 4-category table
- Add `$ARGUMENTS` variable usage documentation
- Add validation levels reference matrix
- Add troubleshooting section for common issues
- Update command listing format to include category annotations

### Task Group 3: Classify Commands by Template Category
Based on analysis, classify all 67 commands:

**Message-Only (~8 commands):**
- `git/commit.md` — Returns single-line commit message
- `automation/generate_branch_name.md` — Returns single-line branch name
- `worktree/make_worktree_name.md` — Returns single-line worktree name
- `issues/classify_issue.md` — Returns `/feature`, `/bug`, `/chore`, or `0`
- `workflows/patch.md` — Returns patch instructions
- `tools/bun_install.md` — Returns installation status
- `tools/install.md` — Returns installation status
- `release/release.md` — Returns release status

**Path Resolution (~5 commands):**
- `automation/find_plan_file.md` — Returns file path or `0`
- `workflows/plan.md` — Returns `docs/specs/*.md` path
- `git/pull_request.md` — Returns PR URL

**Action (~45 commands):**
- `issues/feature.md` — Creates plan file, returns path
- `issues/bug.md` — Creates plan file, returns path
- `issues/chore.md` — Creates plan file, returns path
- `issues/refactor.md` — Creates plan file, returns path
- `workflows/implement.md` — Modifies files, returns report
- `workflows/build.md` — Modifies files, returns summary
- `workflows/document.md` — Creates/updates docs
- `workflows/orchestrator.md` — Coordinates workflow
- `workflows/prime.md` — Primes environment
- `workflows/dogfood-prime.md` — Primes dev environment
- `workflows/validate-implementation.md` — Runs validation
- `workflows/roadmap-update.md` — Updates roadmap
- `worktree/init_worktree.md` — Initializes worktree
- `worktree/spawn_interactive.md` — Spawns interactive session
- `ci/ci-audit.md` — Audits CI configuration
- `ci/ci-update.md` — Updates CI workflows
- `ci/ci-investigate.md` — Investigates CI failures
- `app/start.md` — Starts application
- `app/schema_plan.md` — Plans schema changes
- `docs/docs-update.md` — Updates documentation
- `validation/resolve_failed_validation.md` — Resolves validation issues
- `tools/pr-review.md` — Reviews PRs
- `homeserver/update_homeserver_task.md` — Updates task status
- `tasks/create.md` — Creates phase task
- `tasks/update_status.md` — Updates task status
- `tasks/query_phase.md` — Queries phase status
- `issues/issue.md` — Creates/updates issue

**Structured Data (~9 commands):**
- `issues/audit.md` — Returns JSON audit report
- `issues/prioritize.md` — Returns JSON prioritization
- `workflows/review.md` — Returns JSON review result
- `homeserver/get_homeserver_tasks.md` — Returns JSON task array

**Documentation (~15 commands - no output requirements, reference only):**
- `docs/architecture.md`
- `docs/database.md`
- `docs/workflow.md`
- `docs/mcp-integration.md`
- `docs/mcp-usage-guidance.md`
- `docs/kotadb-agent-usage.md`
- `docs/anti-mock.md`
- `docs/test-lifecycle.md`
- `docs/issue-relationships.md`
- `docs/prompt-code-alignment.md`
- `docs/automated-deployments.md`
- `docs/conditional_docs.md`
- `docs/conditional_docs/app.md`
- `docs/conditional_docs/automation.md`
- `docs/conditional_docs/web.md`
- `testing/logging-standards.md`
- `testing/testing-guide.md`
- `app/environment.md`
- `app/dev-commands.md`
- `app/pre-commit-hooks.md`
- `ci/ci-configuration.md`
- `workflows/adw-architecture.md`
- `workflows/adw-observability.md`
- `tools/tools.md`

### Task Group 4: Add Template Category Declarations
- Add `**Template Category**: Message-Only` after title for Message-Only commands
- Add `**Template Category**: Path Resolution` after title for Path Resolution commands
- Add `**Template Category**: Action` after title for Action commands
- Add `**Template Category**: Structured Data` after title for Structured Data commands
- Skip documentation-only files (no category needed)

### Task Group 5: Standardize Output Format Sections
- Ensure Message-Only commands have "Meta-Commentary Patterns (FORBIDDEN)" section
- Ensure Path Resolution commands document `0` sentinel value
- Ensure Action commands include worktree path handling guidance
- Ensure Structured Data commands include JSON schema

### Task Group 6: Validation and Push
- Run `cd app && bun run lint` (if applicable to md files)
- Verify no broken markdown syntax
- Stage all changes: `git add .claude/`
- Commit with message: `chore: 474 - standardize claude directory structure`
- Push branch: `git push -u origin chore/474-claude-directory-standardization`

## Risks
- **Breaking existing workflows** → Mitigation: Only add metadata, do not change functional behavior
- **Large diff size may obscure issues** → Mitigation: Split into logical commits per phase
- **Agents not recognizing new format** → Mitigation: Test command invocation after changes

## Validation Commands
- `cd app && bun run lint`
- `cd app && bunx tsc --noEmit`
- `find .claude/commands -name "*.md" -exec grep -l "Template Category" {} \; | wc -l` (verify declarations added)
- `ls -la .claude/agents/` (verify agent directory created)

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: standardize command template categories` not `Based on the plan, the commit should standardize categories`

## Deliverables
- `.claude/agents/` directory with 3 agent definitions + README
- Updated `.claude/commands/README.md` with template categories documentation
- Template category declarations added to ~40 command files
- Standardized output format sections across all commands
- Meta-commentary forbidden patterns documented consistently
