# /playwright-setup

Introduce or expand Playwright-based end-to-end testing. Supply tracking info via `$ARGUMENTS` (issue/PR IDs).

## Git Setup
- `git fetch --all --prune`, sync `develop` (`git pull --rebase`), ensure clean state (`git status --short`).
- Create branch `playwright/<issue>-setup` before committing changes.

## Assessment & Planning
1. Review existing test infrastructure (`tests/**`, `package.json` scripts, CI workflows).
2. Identify target user journeys and environments (local, CI, staging).
3. Determine dependencies (browsers, Playwright config, fixtures, seed data).

## Implementation Tasks
- Add dependencies (`bun install`, optionally `npx playwright install` or `bunx playwright install`).
- Create configuration (`playwright.config.ts`), helpers, and fixtures under `tests/e2e/**`.
- Scaffold sample tests demonstrating navigation, assertions, and teardown.
- Integrate environment variables into `.env.sample` and automation (adws helpers).
- Wire Playwright into CI (`.github/workflows/**`) with caching and artifact uploads.
- Update developer scripts (`package.json` -> `bun run e2e`) and documentation.

## Environment & Data
- Document required services; use `/start` if local APIs are needed.
- Provide seed scripts or mock data for deterministic runs.
- Ensure secrets are scoped (LOCAL/STAGING/PROD) and stored securely.

## Validation
- Run `bun run lint`, `bun run typecheck`, `bun test`, `bun run build`.
- Execute Playwright suites locally (`bun run e2e` or `bunx playwright test`).
- Trigger CI workflow (manual `gh workflow run` or push to branch) and capture logs.
- Record `git status --short` and `git diff --stat` after changes.

## Documentation & Reporting
- Update README/CLAUDE.md with Playwright usage and troubleshooting.
- Provide summary of implemented tasks, validation results, CI run links.
- Note outstanding follow-ups (flaky tests, cross-browser gaps, infra requests).
