# /generate_branch_name

Generate a Git branch name following KotaDB conventions. DO NOT execute any git commands.

## Variables
- issue_type: $1 (one of `feature`, `bug`, `chore`)
- adw_id: $2 (8 character run id)
- issue_json: $3 (GitHub issue payload)

## Instructions
- Branch format: `<git_prefix>/<issue_number>-<adw_id>-<concise-slug>`.
- Map `issue_type` to `git_prefix` using `feature → feat`, `bug → bug`, `chore → chore`.
- Derive `issue_number` from the JSON.
- Build `concise-slug` from the issue title (3–6 lowercase words, hyphen separated, alphanumeric only).
- Ensure the branch name is ≤ 80 characters and branches originate from `develop` (flow: `feat/|bug/|chore/` → `develop` → `main`).

## Important
- DO NOT run any git commands (git checkout, git fetch, git pull, etc.)
- Only generate and return the branch name
- The worktree-based workflow will create the actual branch

## Report
Return only the branch name.
