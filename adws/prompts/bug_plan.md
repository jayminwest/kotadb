# /bug Prompt Outline

- **Goal**: Produce a remediation plan detailing repro, root cause hypothesis, fix steps, and validation.
- **Inputs**: Bug issue JSON (includes description, logs, severity when available).
- **Reminders**:
  - Document exact reproducible steps and expected vs actual behaviour.
  - Identify touched modules and potential regression areas.
  - Keep scope tightly focused on the bug.
- **Response Requirements**:
  - Follow the Bug Plan template (Summary, Root Cause Hypothesis, Fix Strategy, Task Breakdown, Regression Risks, Validation Commands).
  - Provide plan path in report section.
