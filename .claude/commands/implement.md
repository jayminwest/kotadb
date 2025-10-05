# /implement

Follow the provided plan file (path passed via `$ARGUMENTS`) and implement each step without deviating from scope.

## Instructions
- Read the entire plan before making changes; clarify assumptions in inline notes if something is ambiguous.
- Execute tasks in the documented order, touching only the files listed unless the plan explicitly allows otherwise.
- Keep commits incremental and logically grouped. Use Conventional Commit subjects referencing the issue.
- After completing the plan, ensure the working tree is clean and the branch contains all commits.

## Validation
Run every command listed in the plan’s `## Validation Commands` section. At minimum expect:
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run build`

Capture command output paths or summaries so reviewers can audit results quickly.

## Report
- Provide a concise bullet list of the implementation work performed.
- Note each validation command executed and whether it passed.
- Include the output of `git diff --stat` to summarise file/line changes.
