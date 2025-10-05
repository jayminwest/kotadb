# /feature Prompt Outline

- **Goal**: Generate a feature implementation plan saved under `specs/`.
- **Inputs**: Issue JSON (number, title, body, labels, metadata).
- **Reminders**:
  - Analyse existing patterns in `src/**` and `tests/**`.
  - Document risks, dependencies, and validation strategy.
  - Call out Bun validation commands explicitly.
- **Response Requirements**:
  - Use the canonical plan format (Overview, Technical Approach, Task Breakdown, Risks, Validation Strategy).
  - Include plan file path in reporting step.
