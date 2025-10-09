# /pull_request

Create a GitHub pull request for the work on `<branch_name>`.

## Variables
- branch_name: $1
- issue_json: $2
- plan_file: $3 (relative path in `docs/specs/`)
- adw_id: $4

## Instructions
- Derive issue type, number, and title from the JSON.
- PR title format: `<issue_type>: #<issue_number> - <issue_title>` (issue_type lower-case).
- PR body must include:
  - Summary of the change
  - Link to the plan file (`[Plan](./<plan_file>)`)
  - Validation checklist referencing the `/validate-implementation` level executed and commands run
  - `Closes #<issue_number>`
  - `ADW ID: <adw_id>`
- Confirm Level 2 (or higher) validation has passed before opening the PR; attach evidence in the checklist.
- Treat `develop` as the base branch for diffs and PR creation.
- Reiterate the release flow: work branches (`feat/`, `bug/`, `chore/`, etc.) merge into `develop`; `develop` is promoted to `main` during release.

## Run
1. `git status --short`
2. `git diff origin/develop...HEAD --stat`
3. `git log origin/develop..HEAD --oneline`
4. `git diff origin/develop...HEAD --name-only`
5. `git push -u origin HEAD`
6. `gh pr create --title "<title>" --body "<body>" --base develop`

## Report
Return only the PR URL.
