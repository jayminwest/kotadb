# /docs-update

Synchronise documentation with recent code changes. Provide related PR/issue identifier via `$ARGUMENTS`.

## Git Prep
- `git fetch --all --prune`, `git pull --rebase`, update `develop`, and ensure a clean tree (`git status --short`).
- Create/checkout doc branch if needed (e.g., `docs/<issue>-update`), remembering documentation work still flows `docs/…` → `develop` → `main`.

## Diff Analysis
- Review `git diff` for merged changes impacting docs.
- Identify files requiring updates (README, CLAUDE.md, `docs/specs/**`, adws notes).

## Execution Steps
1. Outline documentation changes (sections, screenshots, examples) referencing `$ARGUMENTS`.
2. Edit relevant files, ensuring Bun commands and tooling references stay accurate.
3. Cross-reference other docs for consistency (CLI guides, automation playbooks).
4. Validate formatting (markdown lint if available) and run Level 1 from `/validate-implementation` (`bun run lint`, `bun run typecheck`) where relevant.
5. Maintain git hygiene: stage with `git add --patch`, confirm `git status --short`, and capture `git diff --stat`.

## Reporting
- Summary of documentation sections updated with file paths.
- Validation or preview steps performed.
- Remaining follow-ups (translations, screenshots, release notes).
