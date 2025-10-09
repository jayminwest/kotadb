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
bun test                          # Run test suite
bunx tsc --noEmit                # Type-check without emitting files
bun run test:validate-migrations # Validate migration sync (see below)
```

**IMPORTANT: Migration Sync Requirement**
- Database migrations exist in **two locations**: `src/db/migrations/` (source) and `supabase/migrations/` (copy for Supabase CLI)
- When adding or modifying migrations in `src/db/migrations/`, you **must** also update `supabase/migrations/`
- Run `bun run test:validate-migrations` to check for drift between directories
- Keep both directories synchronized to prevent test environment divergence from production schema

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

**Authentication & Rate Limiting (src/auth/)**
- `middleware.ts`: Authentication middleware and rate limit enforcement
- `validator.ts`: API key validation and tier extraction
- `keys.ts`: API key generation with bcrypt hashing
- `rate-limit.ts`: Tier-based rate limiting logic (free=100/hr, solo=1000/hr, team=10000/hr)
- `context.ts`: Auth context passed to handlers (includes user, tier, rate limit status)
- `cache.ts`: In-memory caching for API key lookups (reduces database load)

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

**Authentication & Rate Limiting Flow** (all authenticated endpoints):
1. Request arrives with `Authorization: Bearer <api_key>` header
2. `authenticateRequest()` middleware validates API key and extracts tier
3. `enforceRateLimit()` checks hourly request count via `increment_rate_limit()` DB function
4. If limit exceeded, return 429 with `Retry-After` header
5. If allowed, attach auth context (user, tier, rate limit status) to request
6. Handler executes with rate limit headers injected into response

**POST /index** triggers repository indexing:
- Ensures repository exists in `repositories` table (creates if new)
- Records index job in `index_jobs` table (status: pending → completed/failed/skipped)
- Queues asynchronous indexing via `queueMicrotask()`
- Repository preparation: clones if needed, checks out ref
- File discovery: walks project tree, filters by extension
- Parsing: extracts content and dependencies
- Storage: saves to `indexed_files` table with `UNIQUE (repository_id, path)` constraint

**GET /search** queries indexed files:
- Full-text search on content
- Optional filters: `project` (project_root), `limit`
- Returns results with context snippets

**Rate Limit Response Headers** (all authenticated endpoints):
- `X-RateLimit-Limit`: Total requests allowed per hour for the tier
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when the limit resets
- `Retry-After`: Seconds until retry (429 responses only)

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
