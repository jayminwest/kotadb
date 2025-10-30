# /chore

Produce a maintenance plan for the chore described in `$ARGUMENTS`. Focus on lean, auditable steps that unblock the requested upkeep.

**CRITICAL - Worktree Path Handling:**
- You are executing in an isolated git worktree directory
- Your CWD is the worktree root (e.g., `/project/trees/chore-123-abc12345`)
- ALL file paths in Write, Edit, Read tools MUST be relative to CWD
- ✅ Correct: `docs/specs/chore-123-plan.md`
- ❌ Wrong: `/project/trees/chore-123-abc12345/docs/specs/chore-123-plan.md`
- Using absolute paths will cause git staging failures and commit errors

## Instructions
- **Verify issue labels first**: Run `gh issue view <issue-number> --json labels` to ensure the issue has labels from all four categories (component, priority, effort, status). If labels are missing, apply them before proceeding.
- Create a markdown plan under `docs/specs/` named `chore-<issue-number>-<slug>.md` (e.g., `docs/specs/chore-1450-refresh-deps.md`).
- Build `<slug>` from the issue title using 3–6 lowercase, hyphenated words (alphanumeric only).
- Use the template exactly as written.
- Identify impacts across tooling, CI, documentation, and runtime configuration.
- Keep scope tight; defer unrelated improvements.
- Call out all affected files (and any new artefacts) in the plan to avoid churn during implementation.
- Reference the git flow: branch from `develop` using `chore/<issue-number>-<slug>`, merging back into `develop` before promotion to `main`.
- Ensure the plan's final tasks rerun validation and push the branch so reviewers can create a PR (PR titles must end with the issue number, e.g. `chore: refresh deps (#210)`).
<<<<<<< HEAD
- Consult `.claude/commands/docs/conditional_docs/app.md` or `.claude/commands/docs/conditional_docs/automation.md` and pull in only the docs relevant to this maintenance scope.
- If the chore introduces new documentation artefacts, extend `.claude/commands/docs/conditional_docs/app.md` or `.claude/commands/docs/conditional_docs/automation.md` with conditions that describe when to read them.
=======
- Consult `.claude/commands/docs/conditional_docs.md` and pull in only the docs relevant to this maintenance scope.
- If the chore introduces new documentation artefacts, extend `.claude/commands/docs/conditional_docs.md` with conditions that describe when to read them.
>>>>>>> origin/main

## ADW Agent Integration
- If executing via ADW orchestration, query workflow state via MCP instead of searching:
  ```typescript
  const state = await mcp.call("adw_get_state", { adw_id: "<adw_id>" });
  const planFile = state.plan_file;  // e.g., "docs/specs/chore-145-plan.md"
  const worktreePath = state.worktree_path;  // e.g., "trees/chore-145-abc12345"
  ```

## Plan Format
```md
# Chore Plan: <concise name>

## Context
- Why this chore matters now
- Constraints / deadlines

## Relevant Files
- <path> — <reason this file is involved>
### New Files
- <path> — <purpose>

## Work Items
### Preparation
- <git, environment, backups>
### Execution
- <ordered maintenance tasks>
### Follow-up
- <monitoring, docs, verification>

## Step by Step Tasks
### <ordered task group>
- <actionable bullet in execution order>
- Close with a task group that re-validates and pushes (`git push -u origin <branch>`).

## Risks
- <risk> → <mitigation>

## Validation Commands
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run build`
- <supplemental checks chosen from `/validate-implementation` based on impact level>

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: refresh dependencies` not `Based on the plan, the commit should refresh dependencies`

## Deliverables
- Code changes
- Config updates
- Documentation updates
```

## Report
<<<<<<< HEAD
Return ONLY the plan file path as plain text on a single line.

**CRITICAL - Output Format:**
- Return the relative path from the worktree root
- NO explanatory text, markdown formatting, or additional commentary
- NO code blocks, quotes, asterisks, or punctuation around the path
- Just the path itself

**Correct output:**
```
docs/specs/chore-1450-refresh-deps.md
```

**INCORRECT outputs (do NOT do this):**
```
Created chore plan at docs/specs/chore-1450-refresh-deps.md
```
```
Plan file: docs/specs/chore-1450-refresh-deps.md
```
```
**docs/specs/chore-1450-refresh-deps.md**
```

=======
Summarise the plan in 2-3 bullets highlighting key changes and risks.

**Important Notes:**
- The plan file path will be automatically detected by `/find_plan_file` agent
- Focus output on summarizing what was planned, not the file location
- Do NOT format output with markdown (no **bold**, no ` ``` blocks`, no # headers)

**Correct output:**
```
- Created chore plan for dependency refresh (bun 1.1.x upgrade)
- Plan covers lockfile updates, test validation, and CI verification
- Low risk: no breaking changes expected, validation confirms compatibility
```

**INCORRECT output (do NOT do this):**
```
# Chore Plan Created

I have successfully created a maintenance plan!

**Plan location:** docs/specs/chore-1450-refresh-deps.md

The plan includes...
```
>>>>>>> origin/main
