# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KotaDB is a lightweight HTTP API service for indexing and searching code repositories. It's built with Bun + TypeScript and uses Supabase (PostgreSQL) for storage with Row Level Security (RLS) for multi-tenant data isolation. The project is designed to power AI developer workflows through automated code intelligence.

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
- Initializes Supabase client and verifies database connection
- Routes all requests through the router with global error handling

**API Layer (src/api/)**
- `routes.ts`: Request routing and handler orchestration
- `queries.ts`: Database query functions for indexed files and search

**Database (src/db/)**
- `client.ts`: Supabase client initialization (service role and anon clients)
- Tables: 10 tables including `api_keys`, `organizations`, `repositories`, `index_jobs`, `indexed_files`, `symbols`, `references`, `dependencies`, etc.
- Connection: Configured via `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `SUPABASE_ANON_KEY` environment variables
- RLS enabled for multi-tenant data isolation with user-scoped and organization-scoped policies

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
   - Ensures repository exists in `repositories` table (creates if new)
   - Records index job in `index_jobs` table (status: pending → completed/failed/skipped)
   - Queues asynchronous indexing via `queueMicrotask()`
   - Repository preparation: clones if needed, checks out ref
   - File discovery: walks project tree, filters by extension
   - Parsing: extracts content and dependencies
   - Storage: saves to `indexed_files` table with `UNIQUE (repository_id, path)` constraint

2. **GET /search** queries indexed files
   - Full-text search on content
   - Optional filters: `project` (project_root), `limit`
   - Returns results with context snippets

### Environment Variables
- `PORT`: Server port (default: 3000)
- `SUPABASE_URL`: Supabase project URL (required)
- `SUPABASE_SERVICE_KEY`: Supabase service role key for admin operations (required)
- `SUPABASE_ANON_KEY`: Supabase anon key for RLS-enforced queries (required)
- `KOTA_GIT_BASE_URL`: Git clone base URL (default: https://github.com)

### AI Developer Workflows (adws/)
Python-based automation pipeline for autonomous GitHub issue workflows:
- `adw_plan.py`, `adw_build.py`, `adw_test.py`, `adw_review.py`, `adw_document.py`: Phase scripts for SDLC automation
- `adw_modules/`: Shared utilities (Claude CLI wrapper, git ops, GitHub integration, state management)
- `adw_tests/`: Pytest suite for workflow validation
- `trigger_webhook.py`, `trigger_cron.py`: Webhook and polling-based trigger systems

See `adws/README.md` for complete automation architecture and usage examples.
