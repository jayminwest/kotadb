# /pull_request Prompt Outline

- **Goal**: Push the working branch and open a PR summarising the change.
- **Inputs**: Branch name, issue JSON, plan file path, ADW ID.
- **Reminders**:
  - Title format: `<issue_type>: #<issue_number> - <issue_title>`.
  - Body must link to the plan, list validation commands with status, and close the issue.
  - Include `ADW ID: <adw_id>` in the body for traceability.
- **Response Requirements**: Return the PR URL only.
