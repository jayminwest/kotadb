# /prime

Use this command when first entering the repository to build baseline context.

## Steps
1. **Sync git state**: `git fetch --all --prune`, `git pull --rebase`, record the current branch via `git rev-parse --abbrev-ref HEAD` with awareness of the `feat/|bug/|chore/` → `develop` → `main` flow, and capture `git status --short`.
2. **Inventory tracked files**: run `git ls-files` (sample representative paths) and note key domains (API, indexer, automation).
3. **Review critical docs**: skim `README.md`, `CLAUDE.md`, `adws/README.md`, and any specs under `docs/specs/` to understand workflow expectations and Bun tooling.
4. **Synthesize learnings**: summarise architecture highlights (services, scripts, data flows) and list required commands (`bun install`, `bun run typecheck`, etc.).
5. **Capture issue context**: inspect open tasks or discussions relevant to the current initiative and ensure the working tree stays clean before proceeding.

## Required Outputs
- Current branch and cleanliness status.
- Highlighted file groups and notable directories.
- Key documentation insights (tooling, workflows, constraints).
- Pending questions or risks to resolve before deeper work.
