# /bun_install

**Template Category**: Action

Install dependencies deterministically after modifying `package.json` or Bun lockfiles.

## Relevant files/directories
- `package.json`
- `bun.lock*`
- `logs/kota-db-ts/<env>/`

## Steps
1. Ensure `.env` exists and mirrors required variables from `.env.sample`.
2. Run `bun install` from the repository root.
3. Save stdout/stderr to `logs/kota-db-ts/<env>/bun-install.log`.
4. If `bun.lock` changed, include the diff in the implementation summary.
5. Follow up with the standard validation stack (`bun run lint`, `bun run typecheck`, `bun test`,
   `bun run build`) unless another command handles it.

## Reporting
- State whether dependencies changed and provide the log file path.
- Mention any follow-up actions (e.g., rebuild Docker images, update CI caches).
