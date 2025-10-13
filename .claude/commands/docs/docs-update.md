# /docs-update

Synchronise documentation with recent code changes. Provide related PR/issue identifier via `$ARGUMENTS`.

## Git Prep
- `git fetch --all --prune`, `git pull --rebase`, update `develop`, and ensure a clean tree (`git status --short`).
- If you're not on the feature branch, create/checkout doc branch if needed (e.g., `docs/<issue>-update`), remembering documentation work still flows `docs/…` → `develop` → `main`.
- If you're already on the feature branch, make docs updates directly in the open PR. DO NOT CREATE A NEW docs/ branch if there is already a feature branch open. 

## Diff Analysis
- Review `git diff` for merged changes impacting docs.
- Identify files requiring updates (README, CLAUDE.md, `docs/specs/**`, adws notes).

## Execution Steps
1. Outline documentation changes (sections, screenshots, examples) referencing `$ARGUMENTS`.
2. Edit relevant files, ensuring Bun commands and tooling references stay accurate.
3. Cross-reference other docs for consistency (CLI guides, automation playbooks).
4. Validate formatting (markdown lint if available) and run Level 1 from `/validate-implementation` (`bun run lint`, `bun run typecheck`) where relevant.
5. Maintain git hygiene: stage with `git add --patch`, confirm `git status --short`, and capture `git diff --stat`.
6. Push the documentation branch (`git push -u origin <branch>`) and execute `/pull_request <branch> <issue_json> <plan_path> <adw_id>` so the PR opens immediately; ensure the PR title ends with the issue number (e.g. `docs: refresh api usage (#210)`).
7. If you create significant new documentation, add or update the relevant entry in `.claude/commands/docs/conditional_docs.md`.

## CRITICAL: Output Format Requirements

This template is used as a fallback by automation when `/document` fails. Return a JSON object matching this exact schema:

```json
{
  "success": boolean,
  "documentation_created": boolean,
  "documentation_path": string | null,
  "summary": string | null,
  "error_message": string | null
}
```

**Field Requirements:**
- `success`: `true` if task completed successfully, `false` if errors occurred
- `documentation_created`: `true` if docs were created/updated, `false` if not needed
- `documentation_path`: Relative path to main doc file if updated (e.g., `README.md`, `CLAUDE.md`), `null` if none
- `summary`: 2-4 sentence description including PR URL if created, validation performed, and follow-ups needed
- `error_message`: Error description if `success: false`, `null` otherwise

**DO NOT include:**
- Markdown formatting around JSON (no ``` backticks in output)
- Explanatory text (e.g., "Here is the documentation result:")
- Comments within JSON
- Trailing commas

**Example output:**
```json
{
  "success": true,
  "documentation_created": true,
  "documentation_path": "CLAUDE.md",
  "summary": "Updated CLAUDE.md to document new rate limiting middleware and response headers. Updated conditional_docs.md with new spec reference. PR created at https://github.com/user/kota-db-ts/pull/123. No translations or screenshots needed.",
  "error_message": null
}
```
