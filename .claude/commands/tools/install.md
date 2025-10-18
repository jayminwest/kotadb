# /install

Use this to provision a fresh environment or verify dependencies remain healthy. No arguments required.

## Steps
1. **Sync repository**: `git fetch --all --prune`, switch to `develop`, `git pull --rebase`, and confirm a clean tree with `git status --short`.
2. **Prime knowledge**: run `/prime` to understand repo layout, critical docs, and tooling expectations before installing.
3. **Verify runtimes**: capture `node --version`, `pnpm --version` (if present), and `bun --version` to ensure supported toolchains are available.
4. **Install dependencies**: execute `bun install`; if pnpm-managed tooling exists, run `pnpm install` as a secondary check. Capture logs for both runs.
5. **Manage env files**: copy `.env.sample` to `.env` (if absent), fill required secrets, and confirm git remains clean afterwards.
6. **Optional tooling**: note supplementary setup (e.g., `uv` for Python helpers, Docker for services) and validate availability if needed.
7. **Final verification**: re-run `git status --short`, list key commands (`bun run typecheck`, `bun test`, `bun run lint`), and document any outstanding setup tasks.

## Reporting
- Tool versions recorded.
- Outcome of install commands with log paths.
- Environment file status and remaining action items.
