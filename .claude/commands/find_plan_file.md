# /find_plan_file

Determine the relative path to the plan file created in the previous step.

## Instructions
- Inspect git for newly created or modified files under `specs/`.
- You may use:
  - `git status --short specs/`
  - `git diff --name-only origin/develop...HEAD specs/`
  - `ls -t specs/`
- Return **only** the plan file path (e.g., `specs/add-analytics-plan.md`).
- If no plan file can be found, respond with `0`.

## Previous Output

$ARGUMENTS
