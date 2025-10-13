# /implement

Follow the provided plan file (path passed via `$ARGUMENTS`) and implement each step without deviating from scope.

## Instructions
- Read the entire plan before making changes; clarify assumptions in inline notes if something is ambiguous.
- Consult `.claude/commands/docs/conditional_docs.md` for any documentation that matches the implementation scope.
- Execute tasks in the documented order, touching only the files listed unless the plan explicitly allows otherwise.
- Keep commits incremental and logically grouped. Use Conventional Commit subjects referencing the issue.
  - **CRITICAL**: Avoid meta-commentary patterns in commit messages (e.g., "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me")
  - These patterns will fail validation. Use direct statements: `feat: add search filters` not `Based on the changes, the commit should add search filters`
- Stay on the correct work branch (`feat/`, `bug/`, `chore/`, etc.) that will merge into `develop` before promotion to `main`.
- When scoped tasks are complete, rerun the plan's validation level, ensure the tree is clean, push the branch, and call `/pull_request <branch> <issue_json> <plan_path> <adw_id>` so the PR opens with a title ending in the issue number (e.g. `feat: add search filters (#210)`).

## Anti-Mock Guardrails
- Read `/anti-mock` before touching tests; do not introduce new stub helpers (`createMock*`, fake clients, manual spies).
- Exercise real Supabase access paths and failure-injection utilities in new or updated tests; document any temporary skips with a follow-up issue.
- Capture evidence (command output, Supabase logs) that real-service suites ran when preparing the implementation report.

## Validation

Before creating the PR, select and execute the appropriate validation level:

1. Consult `/validate-implementation` to understand the 3 validation levels
2. Determine the correct level based on your changes:
   - **Level 1** (Quick): Docs-only, config comments (lint + typecheck)
   - **Level 2** (Integration): Features, bugs, endpoints (**DEFAULT**)
   - **Level 3** (Release): Schema, auth, migrations, high-risk changes
3. Run all commands for your selected level in order
4. Capture the output and status of each command
5. Stop immediately if any command fails; fix before proceeding

**Commands by Level**:
- Level 1: `bun run lint && bun run typecheck`
- Level 2: `bun run lint && bun run typecheck && bun test --filter integration`
- Level 3: `bun run lint && bun run typecheck && bun test --filter integration && bun test && bun run build`

**Evidence Required**:
- Document which level you selected and why
- Include pass/fail status for each command
- Provide Supabase logs or other proof that integration tests hit real services
- This evidence will be included in the PR body

## Final Steps
- After validation passes, confirm `git status --short` is clean apart from intended artifacts.
- Push the branch (`git push -u origin <branch>`), then run `/pull_request <branch> <issue_json> <plan_path> <adw_id>`.
- Verify the PR body includes validation evidence and the title suffix `(#<issue-number>)`.

## Report
Provide a concise bullet list of the implementation work performed.

**DO NOT include:**
- Markdown formatting (no **bold**, no ` ``` blocks`, no # headers)
- Explanatory preambles (e.g., "Here is the implementation report:")
- Multiple paragraph descriptions

**Correct output:**
```
- Modified app/src/api/routes.ts: added rate limiting middleware (45 lines)
- Created app/tests/api/rate-limit.test.ts: 15 integration tests added
- Updated app/src/auth/middleware.ts: integrated rate limit checks
- Validation: Level 2 selected (feature with new endpoints)
- Commands executed: lint (pass), typecheck (pass), integration tests (pass, 133/133)
- Real-service evidence: Supabase query logs show rate limit increments in api_keys table
- git diff --stat: 4 files changed, 156 insertions(+), 12 deletions(-)
- Pushed branch feat/26-abc12345-rate-limiting
- Created PR: https://github.com/user/repo/pull/123
```

**INCORRECT output (do NOT do this):**
```
# Implementation Report

I have successfully completed the implementation! Here's what I did:

**Files Modified:**
- Modified `app/src/api/routes.ts` to add the rate limiting middleware

**Validation:**
All tests passed successfully! The validation level was Level 2.

You can view the pull request at: https://github.com/user/repo/pull/123
```
