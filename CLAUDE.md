# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KotaDB is a lightweight HTTP API service for indexing and searching code repositories. It's built with Bun + TypeScript and uses SQLite for storage. The project is designed to power AI developer workflows through automated code intelligence.

## Development Commands

### Running the application
```bash
bun run src/index.ts              # Start server (default port 3000)
PORT=4000 bun run src/index.ts    # Start with custom port
bun --watch src/index.ts          # Watch mode for development
```

### Testing and type-checking
```bash
bun test                # Run test suite
bunx tsc --noEmit      # Type-check without emitting files
```

### Docker
```bash
docker compose up dev   # Run in development container
```

## Architecture

### Path Aliases
The project uses TypeScript path aliases (tsconfig.json:16-20):
- `@api/*` → `src/api/*`
- `@db/*` → `src/db/*`
- `@indexer/*` → `src/indexer/*`
- `@shared/*` → `src/types/*`

Always use these aliases for imports, not relative paths.

### Core Components

**Entry Point (src/index.ts)**
- Bootstraps the HTTP server using Bun.serve
- Opens SQLite database and ensures schema
- Routes all requests through the router with global error handling

**API Layer (src/api/)**
- `routes.ts`: Request routing and handler orchestration
- `queries.ts`: Database query functions for indexed files and search

**Database (src/db/)**
- `schema.ts`: SQLite schema initialization with WAL mode and foreign keys enabled
- Tables: `files`, `index_runs`, `migrations`
- Database path: `data/kotadb.sqlite` (configurable via `KOTA_DB_PATH`)

**Indexer (src/indexer/)**
- `repos.ts`: Git repository management (clone, fetch, checkout)
  - Clones repositories to `data/workspace/` directory
  - Supports local paths or auto-cloning from GitHub (or custom git base via `KOTA_GIT_BASE_URL`)
  - Handles ref/branch resolution with fallback to default branch (main/master)
- `parsers.ts`: File discovery and parsing
  - Supported: `.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`, `.json`
  - Ignores: `.git`, `node_modules`, `dist`, `build`, `out`, `coverage`
- `extractors.ts`: Dependency extraction and snippet generation

### Workflow

1. **POST /index** triggers repository indexing
   - Records index run in database (status: pending → completed/failed/skipped)
   - Queues asynchronous indexing via `queueMicrotask()`
   - Repository preparation: clones if needed, checks out ref
   - File discovery: walks project tree, filters by extension
   - Parsing: extracts content and dependencies
   - Storage: saves to SQLite with `UNIQUE (project_root, path)` constraint

2. **GET /search** queries indexed files
   - Full-text search on content
   - Optional filters: `project` (project_root), `limit`
   - Returns results with context snippets

### Environment Variables
- `PORT`: Server port (default: 3000)
- `KOTA_DB_PATH`: SQLite database path (default: data/kotadb.sqlite)
- `KOTA_GIT_BASE_URL`: Git clone base URL (default: https://github.com)

### AI Developer Workflows (adws/)
Directory structure for future automation pipelines:
- `triggers/`: Webhook handlers for workflow initiation
- `environments/`: Container/runtime configurations
- `prompts/`: Agent prompt templates
- `reviews/`: Code review generation scripts

Currently contains placeholder READMEs—implementation planned for future expansion.
