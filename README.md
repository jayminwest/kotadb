# KotaDB

KotaDB is the indexing and query layer for CLI Agents like Claude Code and Codex. This project exposes a
lightweight HTTP interface for triggering repository indexing jobs and performing code search backed by
Supabase (PostgreSQL). Development is done autonomously through AI developer workflows via the `adws/` automation scripts.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.1+
- [Supabase](https://supabase.com) account with project created (see `docs/supabase-setup.md`)

### Install dependencies

```bash
bun install
```

### Configure Supabase

1. Create a Supabase project at https://supabase.com/dashboard
2. Copy `.env.sample` to `.env` and add your Supabase credentials:
   - `SUPABASE_URL` - Your project URL
   - `SUPABASE_SERVICE_KEY` - Service role key (keep secret)
   - `SUPABASE_ANON_KEY` - Anonymous/public key
3. Run database migrations (see `docs/supabase-setup.md` for details)

For detailed setup instructions, see `docs/supabase-setup.md`.

### Start the API server

```bash
bun run src/index.ts
```

The server listens on port `3000` by default. Override with `PORT=4000 bun run src/index.ts`.

### Useful scripts

- `bun --watch src/index.ts` – Start the server in watch mode for local development.
- `bun test` – Run the Bun test suite.
- `bunx tsc --noEmit` – Type-check the project.

### Running Tests

KotaDB uses real PostgreSQL database connections for testing (no mocks). The test environment uses **Docker Compose** with isolated services to ensure exact parity between local and CI testing environments, with full project isolation to prevent port conflicts.

**Prerequisites:** Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
```bash
# Verify Docker is installed and running
docker --version
```

**Quick Start:**
```bash
# First-time setup: Start Docker Compose services and auto-generate .env.test
bun run test:setup

# Run tests
bun test

# Reset database if needed
bun run test:reset

# Stop services when done
bun run test:teardown
```

**Note:** The `.env.test` file is auto-generated from Docker Compose container ports and should not be committed to git.

**Project Isolation:** Each test run uses a unique Docker Compose project name (e.g., `kotadb-test-1234567890-98765`), enabling multiple projects or branches to run tests simultaneously without port conflicts.

**CI Testing:** GitHub Actions CI uses the same Docker Compose environment with unique project names, ensuring tests run against identical infrastructure locally and in CI (PostgreSQL + PostgREST + Kong + Auth). See `.github/workflows/ci.yml` for details.

For detailed testing setup and troubleshooting, see [`docs/testing-setup.md`](docs/testing-setup.md).

## API Highlights

### REST Endpoints

- `GET /health` – Simple heartbeat endpoint.
- `POST /index` – Queue a repository for indexing (body: `{ "repository": "org/repo", "localPath": "./repo" }`).
- `GET /search?term=foo` – Search for files containing `foo`. Optional `project` and `limit` parameters.
- `GET /files/recent` – Recent indexing results.

The indexer clones repositories automatically when a `localPath` is not provided. Override the default GitHub clone source by exporting `KOTA_GIT_BASE_URL` (for example, your self-hosted Git service).

### Rate Limiting

All authenticated endpoints enforce tier-based rate limiting to prevent API abuse:

**Tier Limits** (requests per hour):
- **Free**: 100 requests/hour
- **Solo**: 1,000 requests/hour
- **Team**: 10,000 requests/hour

**Response Headers** (included in all authenticated responses):
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1728475200
```

**Rate Limit Exceeded** (429 response):
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 3456
}
```

Response includes headers:
- `X-RateLimit-Limit` – Total requests allowed per hour for your tier
- `X-RateLimit-Remaining` – Requests remaining in current window
- `X-RateLimit-Reset` – Unix timestamp when the limit resets
- `Retry-After` – Seconds until you can retry (429 responses only)

Rate limits reset at the top of each hour. The `/health` endpoint is exempt from rate limiting.

### MCP Protocol Endpoint

KotaDB supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) for standardized agent integration. The MCP endpoint enables CLI agents like Claude Code to discover and use KotaDB's capabilities automatically.

**Endpoint:** `POST /mcp`

**Required Headers:**
- `Origin`: Must match allowed origins (default: localhost variants)
- `MCP-Protocol-Version: 2025-06-18`
- `Accept: application/json`

**Example: Initialize Handshake**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {"name": "my-client", "version": "1.0"}
    }
  }'
```

**Example: List Available Tools**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

**Example: Search Code**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search_code",
      "arguments": {"term": "Router"}
    }
  }'
```

**Available MCP Tools:**
- `search_code`: Search indexed code files for a specific term
- `index_repository`: Index a git repository by cloning/updating it
- `list_recent_files`: List recently indexed files

**Security & Configuration:**

By default, KotaDB only accepts requests from localhost origins. For production deployments:
- Set `KOTA_ALLOWED_ORIGINS` environment variable (comma-separated list of allowed origins)
- Use a reverse proxy with authentication (e.g., nginx with basic auth)
- Bind to localhost only and use network policies to control access

**Session Management:**

The optional `Mcp-Session-Id` header is validated but not currently used for state management. Future versions may support persistent sessions with server-side storage.

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
  auth/                # Authentication middleware and API key validation
  db/                  # Supabase client initialization and helpers
  indexer/             # Repository crawling, parsing, and extraction utilities
  mcp/                 # Model Context Protocol (MCP) implementation
  types/               # Shared TypeScript types
.github/workflows/     # CI workflows
docs/                  # Documentation (schema, specs, setup guides)
```

## Next Steps

- Harden repository checkout logic with retry/backoff and temporary workspace isolation.
- Expand `adws/` with runnable automation pipelines.
- Add richer schema migrations for symbols, AST metadata, and search primitives.
