# /chore

Produce a maintenance plan for the chore described in `$ARGUMENTS`. Focus on lean, auditable steps that unblock the requested upkeep.

## Instructions
- **Verify issue labels first**: Run `gh issue view <issue-number> --json labels` to ensure the issue has labels from all four categories (component, priority, effort, status). If labels are missing, apply them before proceeding.
- Create a markdown plan under `docs/specs/` named `chore-<issue-number>-<slug>.md` (e.g., `docs/specs/chore-1450-refresh-deps.md`).
- Build `<slug>` from the issue title using 3–6 lowercase, hyphenated words (alphanumeric only).
- Use the template exactly as written.
- Identify impacts across tooling, CI, documentation, and runtime configuration.
- Keep scope tight; defer unrelated improvements.
- Call out all affected files (and any new artefacts) in the plan to avoid churn during implementation.
- Reference the git flow: branch from `develop` using `chore/<issue-number>-<slug>`, merging back into `develop` before promotion to `main`.
- Ensure the plan’s final tasks rerun validation, push the branch, and invoke `/pull_request <branch> <issue_json> <plan_path> <adw_id>` so reviewers get a PR immediately (PR titles must end with the issue number, e.g. `chore: refresh deps (#210)`).
- Consult `.claude/commands/docs/conditional_docs.md` and pull in only the docs relevant to this maintenance scope.
- If the chore introduces new documentation artefacts, extend `.claude/commands/docs/conditional_docs.md` with conditions that describe when to read them.

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
- Close with a task group that re-validates, pushes (`git push -u origin <branch>`), and runs `/pull_request <branch> <issue_json> <plan_path> <adw_id>`.

## Risks
- <risk> → <mitigation>

## Validation Commands
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run build`
- <supplemental checks chosen from `/validate-implementation` based on impact level>

## Deliverables
- Code changes
- Config updates
- Documentation updates
```

## Report
- Summarise key actions in bullets.
- Output the relative path to the new `docs/specs/` plan.
