# /generate_branch_name

Use the variables to create a Git branch following KotaDB conventions, then output the branch name.

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

## Run
1. `git fetch --all --prune`
2. `git checkout develop`
3. `git pull origin develop`
4. `git checkout -b <branch_name>`

## Report
Return only the branch name.
