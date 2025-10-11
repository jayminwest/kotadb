# /feature

Draft a KotaDB feature implementation plan using the issue context passed in `$ARGUMENTS` (provide JSON with issue number, title, summary, and constraints).

## Instructions
- **Verify issue labels first**: Run `gh issue view <issue-number> --json labels` to ensure the issue has labels from all four categories (component, priority, effort, status). If labels are missing, apply them before proceeding.
- Create a new markdown plan under `docs/specs/` named `feature-<issue-number>-<slug>.md` (e.g., `docs/specs/feature-1024-event-streaming.md`).
- Build `<slug>` from the issue title using 3–6 lowercase, hyphenated words (alphanumeric only).
- Reference issue metadata from `$ARGUMENTS` at the top of the plan for traceability.
- Review `.claude/commands/conditional_docs.md` and read any documentation whose conditions match the feature scope.
- Follow the repo git flow: work from `feat/<issue-number>-<slug>` branching off `develop`, with releases promoted from `develop` to `main`.
- Populate the exact format below so automation can reference each section without guesswork.
- Research existing patterns in `src/**`, `tests/**`, and platform docs before proposing changes.
- Highlight any data contracts, API surfaces, or tooling updates that the feature requires.
- Think critically about risk, rollout, and validation; do not leave placeholders empty.
- Enumerate relevant code paths and new assets in their dedicated sections.
- Incorporate `/anti-mock` guidance: plan for real Supabase coverage, failure injection, and follow-up for any unavoidable skips.
- Ensure the plan’s final tasks rerun validation, push the branch, and call `/pull_request <branch> <issue_json> <plan_path> <adw_id>` so a PR opens immediately (PR titles must end with the issue number, e.g. `feat: add search filters (#210)`).
- If the plan introduces new documentation areas, append or update the relevant entry in `.claude/commands/conditional_docs.md`.

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
- Conclude with a task group that re-validates, pushes (`git push -u origin <branch>`), and runs `/pull_request <branch> <issue_json> <plan_path> <adw_id>`.

## Risks & Mitigations
- <risk> → <mitigation>

## Validation Strategy
- Automated tests (integration/e2e hitting Supabase per `/anti-mock`)
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

## Report
- Summarise the plan in 2–3 bullets.
- Output the relative path to the created plan under `docs/specs/`.
