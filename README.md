# KotaDB

KotaDB is the indexing and query layer for Kota's code intelligence platform. This project exposes a
lightweight HTTP interface for triggering repository indexing jobs and performing code search backed by
SQLite. The long-term goal is to power AI developer workflows via the `adws/` automation scripts.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.1+

### Install dependencies

```bash
bun install
```

### Start the API server

```bash
bun run src/index.ts
```

The server listens on port `3000` by default. Override with `PORT=4000 bun run src/index.ts`.

### Useful scripts

- `bun --watch src/index.ts` – Start the server in watch mode for local development.
- `bun test` – Run the Bun test suite.
- `bunx tsc --noEmit` – Type-check the project.

## API Highlights

- `GET /health` – Simple heartbeat endpoint.
- `POST /index` – Queue a repository for indexing (body: `{ "repository": "org/repo", "localPath": "./repo" }`).
- `GET /search?term=foo` – Search for files containing `foo`. Optional `project` and `limit` parameters.
- `GET /files/recent` – Recent indexing results.

The current indexer expects repositories to be available on disk (`localPath`) while remote cloning is
scaffolded but not implemented.

## Docker & Compose

Build and run the service in a container:

```bash
docker compose up dev
```

A production-flavoured service is available via the `home` target in `docker-compose.yml`. Deployments to
Fly.io can leverage the baseline configuration in `fly.toml`.

## Project Layout

```
Dockerfile             # Bun runtime image
adws/                  # Automation workflows for AI developer agents
src/
  api/                 # HTTP routes and database access
  db/                  # SQLite schema helpers & migrations
  indexer/             # Repository crawling, parsing, and extraction utilities
  types/               # Shared TypeScript types
.github/workflows/     # CI workflows
```

## Next Steps

- Implement repository cloning/checkout inside `src/indexer/repos.ts`.
- Expand `adws/` with runnable automation pipelines.
- Add richer schema migrations for symbols, AST metadata, and search primitives.
