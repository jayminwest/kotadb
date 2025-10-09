# /chore

Produce a maintenance plan for the chore described in `$ARGUMENTS`. Focus on lean, auditable steps that unblock the requested upkeep.

## Instructions
- Create a markdown plan under `docs/specs/` named `chore-<issue-number>-<slug>.md` (e.g., `docs/specs/chore-1450-refresh-deps.md`).
- Build `<slug>` from the issue title using 3–6 lowercase, hyphenated words (alphanumeric only).
- Use the template exactly as written.
- Identify impacts across tooling, CI, documentation, and runtime configuration.
- Keep scope tight; defer unrelated improvements.
- Call out all affected files (and any new artefacts) in the plan to avoid churn during implementation.
- Reference the git flow: branch from `develop` using `chore/<issue-number>-<slug>`, merging back into `develop` before promotion to `main`.
- Consult `.claude/commands/conditional_docs.md` and pull in only the docs relevant to this maintenance scope.
- If the chore introduces new documentation artefacts, extend `.claude/commands/conditional_docs.md` with conditions that describe when to read them.

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
