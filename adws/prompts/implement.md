# /implement Prompt Outline

- **Goal**: Execute a previously generated plan without scope creep.
- **Inputs**: Path to plan file.
- **Reminders**:
  - Work in order; track blockers in the report.
  - Run all validation commands specified by the plan (defaults: lint, typecheck, test, build).
  - Keep commits atomic and branch clean.
- **Response Requirements**:
  - Bullet summary of completed work and outstanding items.
  - Status for each validation command run.
  - Include `git diff --stat` output in report.
