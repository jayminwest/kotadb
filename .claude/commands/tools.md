# /tools

Catalog repository tooling for quick agent reference. No arguments required.

## Steps
1. **Git prep**: `git fetch --all --prune`, `git pull --rebase`, confirm clean tree (`git status --short`), and stay on `develop` (read-only task).
2. **Review documentation**: scan `README.md`, `CLAUDE.md`, `adws/README.md`, and workflow specs for tooling mentions (Bun, Biome, Playwright, Docker, etc.).
3. **Inventory commands**: list scripts from `package.json`, automation helpers under `adws/**`, and supporting binaries (uv, gh, sqlite3).
4. **Produce catalog**: document tools as TypeScript-style signatures with concise comments, e.g., ``bun run typecheck(): Promise<void> // TypeScript gate``.
5. **Validate**: ensure the list is comprehensive, deduplicated, and reflects current versions/usage.

## Reporting
- Tool catalog (signatures + comments) stored in the agreed location (e.g., `docs/tooling.md`).
- Summary of sources consulted and any missing/optional tools.
