# /pull_request

Open a GitHub pull request as soon as implementation work is complete and validated.

## Variables
- branch_name: $1
- issue_json: $2
- plan_file: $3 (relative path within `docs/specs/`)
- adw_id: $4

## CRITICAL: Output Format Requirements

Return **ONLY** the PR URL as plain text on a single line.

**DO NOT include:**
- Explanatory text (e.g., "Successfully created pull request!", "The PR is ready for review")
- Markdown formatting (no **bold**, no ` ``` blocks`)
- Multiple lines or additional commentary
- PR metadata (title, description, etc.)

**Correct output:**
```
https://github.com/user/kota-db-ts/pull/123
```

**INCORRECT output (do NOT do this):**
```
Successfully created pull request!

PR URL: https://github.com/user/kota-db-ts/pull/123

The pull request is now ready for review. It includes validation evidence and anti-mock compliance notes.
```

```
**Pull Request Created**

https://github.com/user/kota-db-ts/pull/123
```

## Preconditions
- Working tree is clean (`git status --short` empty) and the current branch matches `<branch_name>`.
- All commits for the issue exist locally and remotely (`feat/`, `bug/`, `chore/`, etc. → `develop` → `main`).
- **Commit messages validated**: All commit messages follow Conventional Commits format (verified by validation system)
- **Staged files verified**: All files mentioned in plan are properly staged (verified by validation system)
- Level 2 or higher validation from `/validate-implementation` has been rerun with passing results captured for the PR body.
- Anti-mock evidence is ready: note which real-service suites ran, data seeded, and any temporary skips with follow-up issues.
- Plan document and issue references are up to date with final status and validation notes.

## Preparation Checklist
1. `git branch --show-current` – verify you are on `<branch_name>`.
2. `git fetch --all --prune` – make sure remotes are current.
3. `git status --short` – confirm no unstaged or untracked files remain.
4. `git log origin/develop..HEAD --oneline` – review commits that will ship.
5. **Verify commit messages**: Review commit messages with `git log --oneline` to ensure Conventional Commits format
6. **Verify PR description**: Ensure validation evidence section is complete with actual command output
7. `gh pr status` – ensure the branch does not already have an open PR.
8. Re-run the selected validation level; fix issues immediately before continuing.

## Prepare Metadata
- Parse `issue_json` for `issue_type`, number, and title.
- **Determine PR type** (planning vs implementation):
  1. Run `git diff origin/develop...HEAD --name-only` to get list of changed files
  2. Count lines changed outside `docs/` with `git diff origin/develop...HEAD --stat | grep -v 'docs/' | tail -1`
  3. If PR contains ONLY changes to `docs/specs/*.md` files → **planning PR**
  4. If PR contains changes to `app/src/`, `automation/`, or >50 lines outside `docs/` → **implementation PR**
- **PR title format**:
  - **Planning PRs**: `<issue_type>: add [specification|plan] for <feature name> (#<issue_number>)`
    - Extract feature name from issue title (remove "feat:", "chore:", etc. prefix)
    - Use "specification" for chore-type issues, "plan" for feature-type issues
  - **Implementation PRs**: `<issue_type>: <imperative verb> <feature name> (#<issue_number>)`
    - Extract imperative description from issue title (remove issue type prefix)
    - If issue title starts with "add specification" or "add plan", replace with appropriate implementation verb:
      - For feat issues: use "implement" (e.g., "implement structured output validation")
      - For bug issues: use "fix" (e.g., "fix rate limiting edge case")
      - For chore issues: use verb from issue title or "update" (e.g., "update CI configuration")
    - Otherwise use the issue title as-is (already has imperative verb)
  - All `issue_type` values are lower-case: `feat`, `bug`, `chore`, `docs`, `refactor`, `test`
- Compose the PR body including:
  - Summary of changes
  - Validation evidence section (see template below)
  - Anti-mock statement: confirm no new mocks were introduced and list any temporary exceptions with links to follow-up issues
  - Link to the plan (`[Plan](./<plan_file>)` when present)
  - `Closes #<issue_number>`
  - `ADW ID: <adw_id>`
- Capture any screenshots, logs, or rollout notes required by the issue.

**PR Body Template for Validation Evidence**:

```markdown
## Validation Evidence

### Validation Level: [1/2/3]
**Justification**: [Why this level was selected - e.g., "Level 1: docs-only changes" or "Level 2: feature with new endpoints" or "Level 3: schema migration"]

**Commands Run**:
- ✅/❌ `bun run lint` - [status/output snippet]
- ✅/❌ `bun run typecheck` - [status/output snippet]
- ✅/❌ `bun test --filter integration` - [X tests passed, include if Level 2+]
- ✅/❌ `bun test` - [X tests passed, include if Level 3]
- ✅/❌ `bun run build` - [build output, include if Level 3]

**Real-Service Evidence** (Level 2+ only):
- Supabase integration tests: [log snippet showing DB queries or "N/A for Level 1"]
- Background jobs: [worker logs if applicable or "N/A"]
- Webhook endpoints: [request/response samples if applicable or "N/A"]
```

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
- Double-check the PR body captures anti-mock evidence and that labels (e.g., `methodology:anti-mock`) are applied when relevant.
<<<<<<< HEAD

## Output Schema

This command's output is validated against the following structure for orchestrator consumption:

```json
{
  "type": "string",
  "pattern": "^https://github\\.com/[^/]+/[^/]+/pull/\\d+$",
  "description": "GitHub pull request URL"
}
```

The orchestrator extracts two values from the URL:
- `pr_number`: The numeric PR identifier (extracted from URL path)
- `pr_url`: The complete GitHub URL

Example valid output: `https://github.com/user/kota-db-ts/pull/123`
=======
>>>>>>> origin/main
