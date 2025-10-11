# /bug

Author a remediation plan for the bug described in `$ARGUMENTS` (issue metadata JSON). The plan must equip the implementor to fix the defect with minimal churn.

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
- Ensure the plan’s closing tasks rerun validation, push the branch, and call `/pull_request <branch> <issue_json> <plan_path> <adw_id>` so a PR is raised immediately (PR titles must end with the issue number, e.g. `fix: correct row filters (#210)`).
- Consult `.claude/commands/docs/conditional_docs.md` and read only the documentation whose conditions align with the defect.
- When the remediation introduces new documentation, add or update the relevant conditional entry so future agents can discover it quickly.

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
- End with a task group that re-validates, pushes (`git push -u origin <branch>`), and runs `/pull_request <branch> <issue_json> <plan_path> <adw_id>`.

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
```

## Report
- Provide a bullet summary of the strategy.
- Print the relative `docs/specs/` path for the generated plan.
