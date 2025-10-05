# /commit Prompt Outline

- **Goal**: Stage and commit work with a concise subject referencing the issue.
- **Inputs**: Agent name, issue type, issue JSON.
- **Reminders**:
  - Inspect staged changes before committing.
  - Subject format: `<issue_type>: #<issue_number> - <short description>`.
  - Description must be imperative, ≤ 60 characters, no trailing punctuation.
- **Response Requirements**: Return the commit subject only.
