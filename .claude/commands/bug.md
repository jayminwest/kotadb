# /bug

Author a remediation plan for the bug described in `$ARGUMENTS` (issue metadata JSON). The plan must equip the implementor to fix the defect with minimal churn.

## Instructions
- Create a new markdown plan under `docs/specs/` named `bug-<issue-number>-<slug>.md` (e.g., `docs/specs/bug-2210-missing-search-results.md`).
- Build `<slug>` from the issue title using 3–6 lowercase, hyphenated words (alphanumeric only).
- Follow the format exactly so orchestrators can parse sections reliably.
- Reproduce the bug mentally using the provided context and outline how to confirm both failure and resolution.
- Investigate impacted modules in `src/**`, `tests/**`, and any infrastructure noted in the issue before proposing changes.
- Capture all impacted files (and any new assets) in the dedicated section so implementors have clear scope boundaries.
- Reference the repo git flow: work from `bug/<issue-number>-<slug>` off `develop`, with `develop` promoted to `main` on release.

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
- Tests to add/update
- Manual checks to run

## Step by Step Tasks
### <ordered task group>
- <actionable bullet in execution order>

## Regression Risks
- Adjacent features to watch
- Follow-up work if risk materialises

## Validation Commands
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run build`
- <additional targeted checks aligned with `/validate-implementation` Level 2 or Level 3, depending on impact>
```

## Report
- Provide a bullet summary of the strategy.
- Print the relative `docs/specs/` path for the generated plan.
