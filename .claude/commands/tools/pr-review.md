# /pr-review

**Template Category**: Action
**Prompt Level**: 2 (Parameterized)

Review another contributor's pull request. Provide the PR number via `$ARGUMENTS`.

## Pre-review Setup
- `git fetch --all --prune`, `git pull --rebase`, ensure local `develop` is up to date, and start from a clean tree (`git status --short`) while verifying the PR follows the branch flow (`feat/`, `bug/`, `chore/`, etc.) into `develop` before promotion to `main`.
- Checkout the PR branch with `gh pr checkout $ARGUMENTS` or `gh pr checkout <pr-number>`.

## Context Gathering
- Read linked issues, plans, and PR description.
- Note validation commands claimed, environments impacted, and any attached logs.

## Code Inspection
- Examine diffs module-by-module (`gh pr diff --stat`, `git diff`), focusing on correctness, performance, and security.
- Highlight risky changes, missing edge cases, or deviations from plan/architecture.
- Reject new mocks/stubs unless covered by `/anti-mock` exceptions with documented follow-up.

## Tests & Tooling
- Execute the validation level appropriate to the changes (Level 2 from `/validate-implementation` minimum; Level 3 for high-risk work).
- Record outcomes and failures with logs, calling out any deviations from the contributor’s reported results.
- Confirm integration suites hit real services (Supabase logs, command output) and request evidence if missing.

## Documentation & Release Notes
- Verify docs updated where behaviour changes (README, CLAUDE.md, `docs/specs/**`).
- Check release impact/rollback notes if provided.

## Manual Verification
- If feasible, run local smoke tests or start services via `./scripts/start.sh` to validate behaviour.

## Feedback & Decision
- Provide actionable feedback grouped by severity (blocking vs. nit).
- Decide on `Approve`, `Request Changes`, or `Comment` in GitHub; ensure summary references validation results.
- Post the review summary as a PR comment (e.g., `gh pr review --comment` or `gh pr comment`) so the feedback lives on the discussion thread before handing off.
- State explicitly whether anti-mock expectations were satisfied and cite supporting evidence or gaps.

## Reporting
- Decision taken and justification.
- Key findings (bugs, risks, missing tests/docs) with file/line references.
- Follow-up actions or open questions.
- URL to the posted GitHub review comment or confirmation that it was delivered via the PR interface.

## Output Schema

This command's output is validated against the following structure for orchestrator consumption:

```json
{
  "type": "object",
  "properties": {
    "review_status": {
      "type": "string",
      "enum": ["approved", "changes_requested", "commented"],
      "description": "Review decision submitted to GitHub"
    },
    "comment_count": {
      "type": "integer",
      "description": "Number of review comments or suggestions posted"
    },
    "blocking_issues": {
      "type": "integer",
      "description": "Number of blocking issues found (if status is changes_requested)"
    },
    "review_url": {
      "type": "string",
      "pattern": "^https://github\\.com/.*#pullrequestreview-\\d+$",
      "description": "URL to the posted GitHub review"
    }
  },
  "required": ["review_status"]
}
```

The orchestrator parses the reporting output to extract review decision and metadata. Example parseable output:
```
- Review decision: Approved
- Comments posted: 2 minor suggestions
- Review URL: https://github.com/user/kota-db-ts/pull/123#pullrequestreview-456789
```
