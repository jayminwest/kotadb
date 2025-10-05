# /classify_issue Prompt Outline

- **Goal**: Map issue context to `/feature`, `/bug`, `/chore`, or `0`.
- **Inputs**: Full GitHub issue JSON.
- **Reminders**:
  - Prioritise impact and goal described; ignore labels unless essential.
  - Only return a single token.
- **Response Requirements**: Exact string `/feature`, `/bug`, `/chore`, or `0`.
