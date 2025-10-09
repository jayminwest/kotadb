# /implement

Follow the provided plan file (path passed via `$ARGUMENTS`) and implement each step without deviating from scope.

## Instructions
- Read the entire plan before making changes; clarify assumptions in inline notes if something is ambiguous.
- Consult `.claude/commands/conditional_docs.md` for any documentation that matches the implementation scope.
- Execute tasks in the documented order, touching only the files listed unless the plan explicitly allows otherwise.
- Keep commits incremental and logically grouped. Use Conventional Commit subjects referencing the issue.
- Stay on the correct work branch (`feat/`, `bug/`, `chore/`, etc.) that will merge into `develop` before promotion to `main`.
- When scoped tasks are complete, rerun the plan’s validation level, ensure the tree is clean, push the branch, and call `/pull_request <branch> <issue_json> <plan_path> <adw_id>` so the PR opens with a title ending in the issue number (e.g. `feat: add search filters (#210)`).

## Anti-Mock Guardrails
- Read `/anti-mock` before touching tests; do not introduce new stub helpers (`createMock*`, fake clients, manual spies).
- Exercise real Supabase access paths and failure-injection utilities in new or updated tests; document any temporary skips with a follow-up issue.
- Capture evidence (command output, Supabase logs) that real-service suites ran when preparing the implementation report.

## Validation
Run every command listed in the plan’s `## Validation Commands` section and select the appropriate level from `/validate-implementation`:
- Level 1: `bun run lint`, `bun run typecheck`
- Level 2 (default for features/bugs): add `bun test --filter integration`
- Level 3 (schema/auth/high-risk): add `bun test --filter integration`, `bun test`, `bun run build`

Capture command output paths or summaries so reviewers can audit results quickly.

## Final Steps
- After validation passes, confirm `git status --short` is clean apart from intended artifacts.
- Push the branch (`git push -u origin <branch>`), then run `/pull_request <branch> <issue_json> <plan_path> <adw_id>`.
- Verify the PR body includes validation evidence and the title suffix `(#<issue-number>)`.

## Report
- Provide a concise bullet list of the implementation work performed.
- Note the validation level chosen and each command executed with pass/fail status.
- Include the output of `git diff --stat` to summarise file/line changes.
