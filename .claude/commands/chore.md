# /chore

Produce a maintenance plan for the chore described in `$ARGUMENTS`. Focus on lean, auditable steps that unblock the requested upkeep.

## Instructions
- Create a markdown plan under `specs/` with a slug reflecting the chore (e.g., `specs/update-deps-kota-db.md`).
- Use the template exactly as written.
- Identify impacts across tooling, CI, documentation, and runtime configuration.
- Keep scope tight; defer unrelated improvements.
- Call out all affected files (and any new artefacts) in the plan to avoid churn during implementation.

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
- bun run lint
- bun run typecheck
- bun test
- bun run build
- <supplemental checks>

## Deliverables
- Code changes
- Config updates
- Documentation updates
```

## Report
- Summarise key actions in bullets.
- Output the relative path to the new `specs/` plan.
