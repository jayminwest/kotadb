# /implement

Follow the provided plan file (path passed via `$ARGUMENTS`) and implement each step without deviating from scope.

## Instructions
- Read the entire plan before making changes; clarify assumptions in inline notes if something is ambiguous.
- Execute tasks in the documented order, touching only the files listed unless the plan explicitly allows otherwise.
- Keep commits incremental and logically grouped. Use Conventional Commit subjects referencing the issue.
- Stay on the correct work branch (`feat/`, `bug/`, `chore/`, etc.) that will merge into `develop` before promotion to `main`.
- After completing the plan, ensure the working tree is clean and the branch contains all commits.

## Validation
Run every command listed in the plan’s `## Validation Commands` section and select the appropriate level from `/validate-implementation`:
- Level 1: `bun run lint`, `bun run typecheck`
- Level 2 (default for features/bugs): add `bun test`
- Level 3 (schema/auth/high-risk): add `bun run build`

Capture command output paths or summaries so reviewers can audit results quickly.

## Report
- Provide a concise bullet list of the implementation work performed.
- Note the validation level chosen and each command executed with pass/fail status.
- Include the output of `git diff --stat` to summarise file/line changes.
