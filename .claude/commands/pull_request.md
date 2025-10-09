# /pull_request

Open a GitHub pull request as soon as implementation work is complete and validated.

## Variables
- branch_name: $1
- issue_json: $2
- plan_file: $3 (relative path within `docs/specs/`)
- adw_id: $4

## Preconditions
- Working tree is clean (`git status --short` empty) and the current branch matches `<branch_name>`.
- All commits for the issue exist locally and remotely (`feat/`, `bug/`, `chore/`, etc. → `develop` → `main`).
- Level 2 or higher validation from `/validate-implementation` has been rerun with passing results captured for the PR body.
- Plan document and issue references are up to date with final status and validation notes.

## Preparation Checklist
1. `git branch --show-current` – verify you are on `<branch_name>`.
2. `git fetch --all --prune` – make sure remotes are current.
3. `git status --short` – confirm no unstaged or untracked files remain.
4. `git log origin/develop..HEAD --oneline` – review commits that will ship.
5. `gh pr status` – ensure the branch does not already have an open PR.
6. Re-run the selected validation level; fix issues immediately before continuing.

## Prepare Metadata
- Parse `issue_json` for `issue_type`, number, and title.
- PR title format: `<issue_type>: <short summary> (#<issue_number>)` where `issue_type` is lower-case (`feature`, `bug`, `chore`, etc.).
- Compose the PR body including:
  - Summary of changes
  - Validation checklist referencing the level executed with evidence
  - Link to the plan (`[Plan](./<plan_file>)` when present)
  - `Closes #<issue_number>`
  - `ADW ID: <adw_id>`
- Capture any screenshots, logs, or rollout notes required by the issue.

## Commands
1. `git status --short`
2. `git diff origin/develop...HEAD --stat`
3. `git log origin/develop..HEAD --oneline`
4. `git diff origin/develop...HEAD --name-only`
5. `git push -u origin HEAD`
6. `gh pr create --base develop --title "<title>" --body "<body>"`

## Post-Creation
- `gh pr view --web` (optional) to verify the rendered description and metadata.
- Share the PR link with reviewers, ensure labels/reviewers are applied, and monitor `gh pr status` for CI progress.

## Report
Return only the PR URL.
