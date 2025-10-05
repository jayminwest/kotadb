# /find_plan_file Prompt Outline

- **Goal**: Return the relative path to the most recent plan file under `specs/`.
- **Inputs**: Planner output log.
- **Reminders**:
  - Prefer git commands over fuzzy search to avoid stale files.
  - If nothing new is detected, respond with `0`.
- **Response Requirements**: Single relative path (e.g., `specs/add-metrics-plan.md`) or `0`.
