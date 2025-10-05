# /pull_request

Create a GitHub pull request for the work on `<branch_name>`.

## Variables
- branch_name: $1
- issue_json: $2
- plan_file: $3 (relative path in `specs/`)
- adw_id: $4

## Instructions
- Derive issue type, number, and title from the JSON.
- PR title format: `<issue_type>: #<issue_number> - <issue_title>` (issue_type lower-case).
- PR body must include:
  - Summary of the change
  - Link to the plan file (`[Plan](./<plan_file>)`)
  - Validation checklist referencing the commands executed
  - `Closes #<issue_number>`
  - `ADW ID: <adw_id>`

## Run
1. `git diff origin/main...HEAD --stat`
2. `git log origin/main..HEAD --oneline`
3. `git diff origin/main...HEAD --name-only`
4. `git push -u origin <branch_name>`
5. `gh pr create --title "<title>" --body "<body>" --base main`

## Report
Return only the PR URL.
