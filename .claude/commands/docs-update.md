# /docs-update

Synchronise documentation with recent code changes. Provide related PR/issue identifier via `$ARGUMENTS`.

## Git Prep
- `git fetch --all --prune`, `git pull --rebase`, update `develop`, and ensure a clean tree (`git status --short`).
- Checkout the feature branch tied to the target PR and stay on it; docs updates belong on that branch so no extra branches/PRs are created.

## Diff Analysis
- Review `git diff` for merged changes impacting docs.
- Identify files requiring updates (README, CLAUDE.md, `docs/specs/**`, adws notes).

## Execution Steps
1. Outline documentation changes (sections, screenshots, examples) referencing `$ARGUMENTS`.
2. Edit relevant files, ensuring Bun commands and tooling references stay accurate.
3. Cross-reference other docs for consistency (CLI guides, automation playbooks).
4. Validate formatting (markdown lint if available) and run Level 1 from `/validate-implementation` (`bun run lint`, `bun run typecheck`) where relevant.
5. Maintain git hygiene: stage with `git add --patch`, confirm `git status --short`, and capture `git diff --stat`.
6. Push your updates to the current feature branch (`git push`) and reference the existing PR (e.g. via `/pull_request <branch> <issue_json> <plan_path> <adw_id>` when the PR is not yet opened). Never create a separate docs branch or PR for these updates.
7. If you create significant new documentation, add or update the relevant entry in `.claude/commands/conditional_docs.md`.

## Reporting
- Summary of documentation sections updated with file paths.
- Validation or preview steps performed.
- PR URL (or confirmation it was appended to an existing PR) and remaining follow-ups (translations, screenshots, release notes).
