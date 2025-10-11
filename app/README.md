# KotaDB Application Layer

This directory contains the TypeScript/Bun HTTP API service for indexing and searching code repositories.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.1+
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (for testing)
- Supabase project (see `../docs/supabase-setup.md`)

### Install Dependencies

```bash
bun install
```

### Configure Environment

1. Copy `.env.sample` to `.env`
2. Add your Supabase credentials:
   - `SUPABASE_URL` - Your project URL
   - `SUPABASE_SERVICE_KEY` - Service role key
   - `SUPABASE_ANON_KEY` - Anonymous/public key

### Run the Server

```bash
# Development mode with watch
bun --watch src/index.ts

# Production mode
bun run src/index.ts

# Custom port
PORT=4000 bun run src/index.ts
```

The server will start on port 3000 by default.

## Development Commands

### Type Checking and Linting

```bash
bunx tsc --noEmit    # Type-check without emitting files
bun run lint         # Biome linting
```

### Testing

```bash
# First-time setup: Start Docker Compose services
bun run test:setup

# Run tests
bun test

# Reset database
bun run test:reset

# Stop services
bun run test:teardown
```

### Validation

```bash
bun run test:validate-migrations  # Check migration sync
bun run test:validate-env         # Check for hardcoded env vars
```

## Project Structure

```
src/
  api/          # HTTP routes and database queries
  auth/         # Authentication middleware and API key management
  db/           # Supabase client and database utilities
  indexer/      # Git repository indexing logic
  mcp/          # Model Context Protocol implementation
  types/        # Shared TypeScript types

tests/          # Test suite (133 tests)
  api/          # API endpoint tests
  auth/         # Authentication tests
  indexer/      # Indexer tests
  mcp/          # MCP protocol tests
  helpers/      # Test utilities

supabase/       # Database migrations (copy of src/db/migrations/)
scripts/        # Bash scripts for test setup and cleanup
```

## API Endpoints

- `GET /health` - Health check (no auth required)
- `POST /index` - Index a repository (requires API key)
- `GET /search?term=query` - Search indexed files (requires API key)
- `GET /files/recent` - List recently indexed files (requires API key)
- `POST /mcp` - Model Context Protocol endpoint

## Testing

This project follows antimocking principles - all tests use real Supabase instances via Docker Compose. No mocks, no stubs.

**Test Environment:**
- Isolated Docker Compose services (PostgreSQL + PostgREST + Kong + Auth)
- Unique project names prevent port conflicts
- Dynamic port allocation with `.env.test` auto-generation
- Full parity between local and CI environments

See `../docs/testing-setup.md` for detailed testing documentation.

## Docker

Build and run in a container:

```bash
# From repository root
docker compose up dev
```

The Dockerfile in this directory is used for both development and production builds.

## Learn More

- [Repository Overview](../README.md)
- [Architecture Documentation](../CLAUDE.md)
- [Database Schema](../docs/schema.md)
- [Testing Setup](../docs/testing-setup.md)
- [Supabase Setup](../docs/supabase-setup.md)
