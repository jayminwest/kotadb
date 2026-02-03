# /feature

**Template Category**: Action

Draft a KotaDB feature implementation plan using the issue context passed in `$ARGUMENTS` (provide JSON with issue number, title, summary, and constraints).

**CRITICAL - Worktree Path Handling:**
- You are executing in an isolated git worktree directory
- Your CWD is the worktree root (e.g., `/project/trees/feat-123-abc12345`)
- ALL file paths in Write, Edit, Read tools MUST be relative to CWD
- ✅ Correct: `.claude/.cache/specs/feature-123-plan.md`
- ❌ Wrong: `/project/trees/feat-123-abc12345/.claude/.cache/specs/feature-123-plan.md`
- Using absolute paths will cause git staging failures and commit errors

## Instructions
- **Verify issue labels first**: Run `gh issue view <issue-number> --json labels` to ensure the issue has labels from all four categories (component, priority, effort, status). If labels are missing, apply them before proceeding.
- Create a new markdown plan under `.claude/.cache/specs/` named `feature-<issue-number>-<slug>.md` (e.g., `.claude/.cache/specs/feature-1024-event-streaming.md`).
- Build `<slug>` from the issue title using 3–6 lowercase, hyphenated words (alphanumeric only).
- Reference issue metadata from `$ARGUMENTS` at the top of the plan for traceability.
- Review `.claude/commands/docs/conditional_docs/app.md` or `.claude/commands/docs/conditional_docs/automation.md` and read any documentation whose conditions match the feature scope.
- **Use KotaDB MCP tools for context gathering**: Use `mcp__kotadb-staging__search_code` to find similar implementations, `mcp__kotadb-staging__analyze_change_impact` for large features (see `.claude/commands/docs/kotadb-agent-usage.md` for patterns)
- Follow the repo git flow: work from `feat/<issue-number>-<slug>` branching off `develop`, with releases promoted from `develop` to `main`.
- Populate the exact format below so automation can reference each section without guesswork.
- Research existing patterns in `src/**`, `tests/**`, and platform docs before proposing changes.
- Highlight any data contracts, API surfaces, or tooling updates that the feature requires.
- Think critically about risk, rollout, and validation; do not leave placeholders empty.
- Enumerate relevant code paths and new assets in their dedicated sections.
- Incorporate `/anti-mock` guidance: plan for real database coverage, failure injection, and follow-up for any unavoidable skips.
- Ensure the plan's final tasks rerun validation and push the branch so a PR can be created (PR titles must end with the issue number, e.g. `feat: add search filters (#210)`).
- If the plan introduces new documentation areas, append or update the relevant entry in `.claude/commands/docs/conditional_docs/app.md` or `.claude/commands/docs/conditional_docs/automation.md`.

## ADW Agent Integration
- If executing via ADW orchestration, query workflow state via MCP instead of searching:
  ```typescript
  const state = await mcp.call("adw_get_state", { adw_id: "<adw_id>" });
  const planFile = state.plan_file;  // e.g., ".claude/.cache/specs/feature-145-plan.md"
  const worktreePath = state.worktree_path;  // e.g., "trees/feat-145-abc12345"
  ```

## Plan Format
```md
# Feature Plan: <concise name>

## Overview
- Problem
- Desired outcome
- Non-goals

## Technical Approach
- Architecture notes
- Key modules to touch
- Data/API impacts

## Relevant Files
- <path> — <why this file matters>
### New Files
- <path> — <purpose>

## Task Breakdown
### Phase 1
- <foundational tasks>
### Phase 2
- <implementation tasks>
### Phase 3
- <integration & cleanup>

## Step by Step Tasks
### <ordered task group>
- <actionable bullet in execution order>
- Conclude with a task group that re-validates and pushes (`git push -u origin <branch>`).

## Risks & Mitigations
- <risk> → <mitigation>

## Validation Strategy
- Automated tests (integration/e2e using SQLite per `/anti-mock`)
- Manual checks (document data seeded and failure scenarios exercised)
- Release guardrails (monitoring, alerting, rollback) with real-service evidence

## Validation Commands
- bun run lint
- bun run typecheck
- bun test --filter integration
- bun test
- bun run build
- <domain-specific checks>
```

## Validation Commands
Plan for validation using the levels defined in `/validate-implementation`. Features must run **Level 2** at minimum:
- `bun run lint`
- `bun run typecheck`
- `bun test --filter integration`
- `bun test`
- `bun run build`
Document any domain-specific scripts (seed data, preview builds) required for full coverage.

## Commit Message Validation
All commits for this feature will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `feat: add event streaming API` not `Based on the plan, this commit adds event streaming`

## Report
Return ONLY the plan file path as plain text on a single line.

**CRITICAL - Output Format:**
- Return the relative path from the worktree root
- NO explanatory text, markdown formatting, or additional commentary
- NO code blocks, quotes, asterisks, or punctuation around the path
- Just the path itself

**Correct output:**
```
.claude/.cache/specs/chore-1450-refresh-deps.md
```

**INCORRECT outputs (do NOT do this):**
```
Created chore plan at .claude/.cache/specs/chore-1450-refresh-deps.md
```
```
Plan file: .claude/.cache/specs/chore-1450-refresh-deps.md
```
```
**.claude/.cache/specs/chore-1450-refresh-deps.md**
```

## Feature Plan Summary

I've created a comprehensive plan for the event streaming feature!

**Plan Location:** .claude/.cache/specs/feature-1024-event-streaming.md

The plan includes three major phases...
```
