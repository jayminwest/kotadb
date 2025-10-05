# /schema_plan

## Scope
Plan database schema migrations for KotaDB (SQLite) prior to implementation work in `src/db/**` or
migration scripts under `data/`.

## Relevant files/directories
- `src/db/**`
- `data/`
- `specs/**`
- `docker-compose.yml`
- `tsconfig.json`

## Preparation
- Confirm target environment (LOCAL/STAGING/PROD) and ensure credentials remain gated via orchestrator.
- Copy `.env.sample` to `.env` if missing and set database paths (`KOTA_DB_PATH`, `DATABASE_URL_*`).

## Planning Checklist
1. Describe current schema state and desired end state (tables, indices, constraints).
2. List migration operations in order (SQL statements or helper scripts) with expected outputs.
3. Call out data backfill or verification tasks and tooling required.
4. Define rollback steps with precise commands.

## Validation Steps
- Dry-run migrations against a local database snapshot (`sqlite3` or Bun-powered scripts).
- Execute Bun validation commands in order, capturing logs under `logs/kota-db-ts/<env>/schema/`:
  1. `bun run lint`
  2. `bun run typecheck`
  3. `bun test`
  4. `bun run build`

## Reporting
- Produce a summary referencing migration files and validation logs.
- Highlight any manual steps required for higher environments.
