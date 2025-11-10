# /refactor

Author a refactoring plan for the code improvement described in `$ARGUMENTS` (issue metadata JSON). The plan must guide the implementor through structural changes while preserving existing behavior.

**CRITICAL - Worktree Path Handling:**
- You are executing in an isolated git worktree directory
- Your CWD is the worktree root (e.g., `/project/trees/refactor-123-abc12345`)
- ALL file paths in Write, Edit, Read tools MUST be relative to CWD
- ✅ Correct: `docs/specs/refactor-123-plan.md`
- ❌ Wrong: `/project/trees/refactor-123-abc12345/docs/specs/refactor-123-plan.md`
- Using absolute paths will cause git staging failures and commit errors

## Instructions
- **Verify issue labels first**: Run `gh issue view <issue-number> --json labels` to ensure the issue has labels from all four categories (component, priority, effort, status). If labels are missing, apply them before proceeding.
- Create a new markdown plan under `docs/specs/` named `refactor-<issue-number>-<slug>.md` (e.g., `docs/specs/refactor-2350-extract-auth-logic.md`).
- Build `<slug>` from the issue title using 3–6 lowercase, hyphenated words (alphanumeric only).
- Follow the format exactly so orchestrators can parse sections reliably.
- Analyze existing code structure to understand current dependencies, interfaces, and behavior before proposing changes.
- Investigate impacted modules in `src/**`, `tests/**`, and any infrastructure that depends on the code being refactored.
- Capture all impacted files (and any new assets) in the dedicated section so implementors have clear scope boundaries.
- Reference the repo git flow: work from `refactor/<issue-number>-<slug>` off `develop`, with `develop` promoted to `main` on release.
- Integrate `/anti-mock` expectations: update test coverage to validate behavior preservation, use real Supabase connections, and document any temporary test skips.
- Ensure the plan's closing tasks rerun validation and push the branch so a PR can be raised (PR titles must end with the issue number, e.g. `refactor: extract auth logic (#210)`).
- Consult `.claude/commands/docs/conditional_docs/app.md` or `.claude/commands/docs/conditional_docs/automation.md` and read only the documentation whose conditions align with the refactoring scope.
- When the refactoring introduces new patterns or documentation, add or update the relevant conditional entry so future agents can discover it quickly.

## ADW Agent Integration
- If executing via ADW orchestration, query workflow state via MCP instead of searching:
  ```typescript
  const state = await mcp.call("adw_get_state", { adw_id: "<adw_id>" });
  const planFile = state.plan_file;  // e.g., "docs/specs/refactor-145-plan.md"
  const worktreePath = state.worktree_path;  // e.g., "trees/refactor-145-abc12345"
  ```

## Plan Format
```md
# Refactor Plan: <concise name>

## Refactoring Summary
- Current structure / pain points
- Desired structure / benefits
- Behavior preservation requirements

## Motivation
- Technical debt being addressed
- Developer experience improvements
- Performance or maintainability gains

## Current State Analysis
- Existing code organization
- Dependencies and coupling points
- Test coverage baseline

## Target Architecture
- New structure / patterns
- Dependency flow changes
- Interface contracts

## Relevant Files
- <path> — <why this file is touched>
### New Files
- <path> — <purpose>

## Task Breakdown
### Analysis
- Steps to understand current behavior
- Identify all dependencies and call sites
### Refactoring
- Ordered steps to transform the code
- Incremental changes to maintain working state
### Migration
- Update call sites and consumers
- Remove deprecated code paths
### Validation
- Tests to add/update (integration/e2e hitting Supabase per `/anti-mock`)
- Manual checks to run (verify behavior preservation)

## Step by Step Tasks
### <ordered task group>
- <actionable bullet in execution order>
- End with a task group that re-validates and pushes (`git push -u origin <branch>`).

## Behavior Preservation
- Critical functionality that must not change
- Test scenarios to validate equivalence
- Rollback plan if issues emerge

## Migration Strategy
- Breaking changes (if any)
- Deprecation timeline
- Communication plan for affected teams/services

## Validation Commands
- `bun run lint`
- `bun run typecheck`
- `bun test --filter integration`
- `bun test`
- `bun run build`
- <additional targeted checks aligned with `/validate-implementation` Level 2 or Level 3, depending on scope>

## Commit Message Validation
All commits for this refactoring will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `refactor: extract auth logic to middleware` not `Looking at the plan, this commit extracts auth logic`
```

## Report
Return ONLY the plan file path as plain text on a single line.

**CRITICAL - Output Format:**
- Return the relative path from the worktree root
- NO explanatory text, markdown formatting, or additional commentary
- NO code blocks, quotes, asterisks, or punctuation around the path
- Just the path itself

**Correct output:**
```
docs/specs/refactor-1450-extract-logic.md
```

**INCORRECT outputs (do NOT do this):**
```
Created refactor plan at docs/specs/refactor-1450-extract-logic.md
```
```
Plan file: docs/specs/refactor-1450-extract-logic.md
```
```
**docs/specs/refactor-1450-extract-logic.md**
```

