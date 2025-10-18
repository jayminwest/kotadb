# /bug

Author a remediation plan for the bug described in `$ARGUMENTS` (issue metadata JSON). The plan must equip the implementor to fix the defect with minimal churn.

**CRITICAL - Worktree Path Handling:**
- You are executing in an isolated git worktree directory
- Your CWD is the worktree root (e.g., `/project/trees/bug-123-abc12345`)
- ALL file paths in Write, Edit, Read tools MUST be relative to CWD
- ✅ Correct: `docs/specs/bug-123-plan.md`
- ❌ Wrong: `/project/trees/bug-123-abc12345/docs/specs/bug-123-plan.md`
- Using absolute paths will cause git staging failures and commit errors

## Instructions
- **Verify issue labels first**: Run `gh issue view <issue-number> --json labels` to ensure the issue has labels from all four categories (component, priority, effort, status). If labels are missing, apply them before proceeding.
- Create a new markdown plan under `docs/specs/` named `bug-<issue-number>-<slug>.md` (e.g., `docs/specs/bug-2210-missing-search-results.md`).
- Build `<slug>` from the issue title using 3–6 lowercase, hyphenated words (alphanumeric only).
- Follow the format exactly so orchestrators can parse sections reliably.
- Reproduce the bug mentally using the provided context and outline how to confirm both failure and resolution.
- Investigate impacted modules in `src/**`, `tests/**`, and any infrastructure noted in the issue before proposing changes.
- Capture all impacted files (and any new assets) in the dedicated section so implementors have clear scope boundaries.
- Reference the repo git flow: work from `bug/<issue-number>-<slug>` off `develop`, with `develop` promoted to `main` on release.
- Integrate `/anti-mock` expectations: propose real Supabase test coverage, failure injection, and follow-ups for any temporary skips.
- Ensure the plan's closing tasks rerun validation and push the branch so a PR can be raised (PR titles must end with the issue number, e.g. `fix: correct row filters (#210)`).
- Consult `.claude/commands/docs/conditional_docs.md` and read only the documentation whose conditions align with the defect.
- When the remediation introduces new documentation, add or update the relevant conditional entry so future agents can discover it quickly.

## ADW Agent Integration
- If executing via ADW orchestration, query workflow state via MCP instead of searching:
  ```typescript
  const state = await mcp.call("adw_get_state", { adw_id: "<adw_id>" });
  const planFile = state.plan_file;  // e.g., "docs/specs/bug-145-plan.md"
  const worktreePath = state.worktree_path;  // e.g., "trees/bug-145-abc12345"
  ```

## Plan Format
```md
# Bug Plan: <concise name>

## Bug Summary
- Observed behaviour
- Expected behaviour
- Suspected scope

## Root Cause Hypothesis
- Leading theory
- Supporting evidence

## Fix Strategy
- Code changes
- Data/config updates
- Guardrails

## Relevant Files
- <path> — <why this file is touched>
### New Files
- <path> — <purpose>

## Task Breakdown
### Verification
- Steps to reproduce current failure
- Logs/metrics to capture
### Implementation
- Ordered steps to deliver the fix
### Validation
- Tests to add/update (integration/e2e hitting Supabase per `/anti-mock`)
- Manual checks to run (record data seeded + failure cases)

## Step by Step Tasks
### <ordered task group>
- <actionable bullet in execution order>
- End with a task group that re-validates and pushes (`git push -u origin <branch>`).

## Regression Risks
- Adjacent features to watch
- Follow-up work if risk materialises

## Validation Commands
- `bun run lint`
- `bun run typecheck`
- `bun test --filter integration`
- `bun test`
- `bun run build`
- <additional targeted checks aligned with `/validate-implementation` Level 2 or Level 3, depending on impact>

## Commit Message Validation
All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix: resolve search filter bug` not `Looking at the changes, this commit fixes the search filter bug`
```

## Report
Provide a 2-3 bullet summary of the fix strategy and risks.

**Important Notes:**
- The plan file path will be automatically detected by `/find_plan_file` agent
- Focus output on summarizing the fix approach, not the file location
- Do NOT format output with markdown (no **bold**, no ` ``` blocks`, no # headers)

**Correct output:**
```
- Created bug fix plan for missing search results issue
- Root cause: RLS policy incorrectly filtering user-scoped queries
- Fix strategy: update policy predicate, add regression tests
- Risk: policy change affects all search endpoints, requires careful validation
```

**INCORRECT output (do NOT do this):**
```
# Bug Fix Plan

**Summary:** I've created a comprehensive bug fix plan!

The plan file is located at: **docs/specs/bug-2210-missing-search-results.md**

This plan addresses...
```
