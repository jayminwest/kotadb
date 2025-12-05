# /start

**Template Category**: Action
**Prompt Level**: 1 (Static)

Run before manual QA or end-to-end sessions to ensure local services start cleanly via `./scripts/start.sh`.

## Checklist
1. **Pre-flight git hygiene**: `git fetch --all --prune`, `git pull --rebase`, confirm you are on the intended branch (`git rev-parse --abbrev-ref HEAD`) following the `feat/|bug/|chore/` → `develop` → `main` flow, and verify a clean tree with `git status --short`.
2. **Inspect configuration**: review `.env` against `.env.sample`, confirm required Bun tooling (`bun --version`), and note any recent dependency updates in `package.json`/`bun.lock`.
3. **Launch services**: run `./scripts/start.sh`, monitor output for failures, and capture logs/ports exposed.
4. **Post-run verification**: re-check `git status --short` for generated files, confirm processes are healthy, and record the endpoint(s) needed for QA.

## Reporting
- Branch + status before/after running the script.
- Summary of services started and relevant URLs or ports.
- Any follow-up tasks or issues blocking validation.
