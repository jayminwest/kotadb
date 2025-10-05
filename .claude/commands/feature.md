# /feature

Draft a KotaDB feature implementation plan using the issue context passed in `$ARGUMENTS` (provide JSON with issue number, title, summary, and constraints).

## Instructions
- Create a new markdown plan under `specs/` named after the feature (slugified).
- Populate the exact format below so automation can reference each section without guesswork.
- Research existing patterns in `src/**`, `tests/**`, and platform docs before proposing changes.
- Highlight any data contracts, API surfaces, or tooling updates that the feature requires.
- Think critically about risk, rollout, and validation; do not leave placeholders empty.
- Enumerate relevant code paths and new assets in their dedicated sections.

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

## Risks & Mitigations
- <risk> → <mitigation>

## Validation Strategy
- Automated tests
- Manual checks
- Release guardrails

## Validation Commands
- bun run lint
- bun run typecheck
- bun test
- bun run build
- <domain-specific checks>
```

## Validation Commands
Run every command to prove the feature works end-to-end:
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run build`

Add any domain-specific scripts (seed data, preview builds) required to validate the feature.

## Report
- Summarise the plan in 2–3 bullets.
- Output the relative path to the created plan under `specs/`.
