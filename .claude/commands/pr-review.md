# /pr-review

Review another contributor’s pull request. Provide the PR number via `$ARGUMENTS`.

## Pre-review Setup
- `git fetch --all --prune`, `git pull --rebase`, ensure local `develop` is up to date, and start from a clean tree (`git status --short`) while verifying the PR follows the branch flow (`feat/`, `bug/`, `chore/`, etc.) into `develop` before promotion to `main`.
- Checkout the PR branch with `gh pr checkout $ARGUMENTS` or `gh pr checkout <pr-number>`.

## Context Gathering
- Read linked issues, plans, and PR description.
- Note validation commands claimed, environments impacted, and any attached logs.

## Code Inspection
- Examine diffs module-by-module (`gh pr diff --stat`, `git diff`), focusing on correctness, performance, and security.
- Highlight risky changes, missing edge cases, or deviations from plan/architecture.

## Tests & Tooling
- Execute the validation level appropriate to the changes (Level 2 from `/validate-implementation` minimum; Level 3 for high-risk work).
- Record outcomes and failures with logs, calling out any deviations from the contributor’s reported results.

## Documentation & Release Notes
- Verify docs updated where behaviour changes (README, CLAUDE.md, `docs/specs/**`).
- Check release impact/rollback notes if provided.

## Manual Verification
- If feasible, run local smoke tests or start services via `./scripts/start.sh` to validate behaviour.

## Feedback & Decision
- Provide actionable feedback grouped by severity (blocking vs. nit).
- Decide on `Approve`, `Request Changes`, or `Comment` in GitHub; ensure summary references validation results.

## Reporting
- Decision taken and justification.
- Key findings (bugs, risks, missing tests/docs) with file/line references.
- Follow-up actions or open questions.
