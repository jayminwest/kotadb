# /find_plan_file

Determine the relative path to the plan file created in the previous step.

## Instructions
- Inspect git for newly created or modified files under `docs/specs/`.
- You may use:
  - `git status --short docs/specs/`
  - `git diff --name-only origin/develop...HEAD docs/specs/`
  - `ls -t docs/specs/`
- Return **only** the plan file path (e.g., `docs/specs/feature-1234-event-streaming.md`).
- If no plan file can be found, respond with `0`.

## Previous Output

$ARGUMENTS
