# /ci-update

Implement approved CI improvements. Provide reference ID via `$ARGUMENTS` (issue/PR).

## Preflight
- `git fetch --all --prune`, sync `develop` (`git pull --rebase`), and ensure a clean tree with `git status --short`.
- Create a branch from `develop` (e.g., `ci/<issue>-adjustment`) and plan for the standard merge path (`ci/…` → `develop` → `main` after validation).
- Review audit notes or plan documents linked to `$ARGUMENTS`.

## Implementation Breakdown
1. Update workflow files (`.github/workflows/**`) as specified (new jobs, concurrency, caching).
2. Modify supporting scripts/config (`adws/**`, `scripts/**`, Dockerfiles) to align with workflow changes.
3. Document adjustments in README/CLAUDE.md if developer actions change.
4. Maintain git hygiene: stage intentionally (`git add --patch`) and keep commits atomic with Conventional Commit subjects referencing the issue.

## Validation
- Run **Level 2** from `/validate-implementation` (`bun run lint`, `bun run typecheck`, `bun test`); escalate to **Level 3** if build or deployment scripts change.
- Execute workflow-focused validation: `gh workflow run <name> --ref <branch>` or local dry-runs where feasible.
- Re-check `git status --short` and `git diff --stat` after edits.

## Reporting
- Summary of modifications (workflows, scripts, docs) with file paths.
- Validation commands executed and CI run links.
- Follow-up tasks, remaining risks, and rollout plan.
