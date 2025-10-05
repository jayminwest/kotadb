# /generate_branch_name Prompt Outline

- **Goal**: Produce and check out a branch name that encodes issue type, number, ADW ID, and a concise slug.
- **Inputs**: Issue type string, ADW ID, full issue JSON.
- **Reminders**:
  - Slug must be lowercase, hyphenated, and derived from the issue title.
  - Length ≤ 80 characters, avoid duplicate hyphens.
  - Checkout sequence: `git checkout main`, `git pull`, `git checkout -b <branch>`.
- **Response Requirements**: Output branch name only.
