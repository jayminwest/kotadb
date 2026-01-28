# KotaDB Application Layer

This directory contains the TypeScript/Bun HTTP API service for indexing and searching code repositories.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.1+

### Install Dependencies

```bash
bun install
```

### Run the Server

```bash
# Development mode with watch
bun --watch src/index.ts

# Production mode
bun run src/index.ts

# Custom port
PORT=4000 bun run src/index.ts
```

The server will start on port 3000 by default. Data is stored in `.kotadb/kota.db` within your project directory.

## Development Commands

### Type Checking and Linting

```bash
bunx tsc --noEmit    # Type-check without emitting files
bun run lint         # Biome linting
```

### Testing

```bash
# Run tests
bun test
```

## Project Structure

```
src/
  api/          # HTTP routes and database queries
  db/           # SQLite client and database utilities
  indexer/      # Git repository indexing logic
  mcp/          # Model Context Protocol implementation
  types/        # Shared TypeScript types

tests/          # Test suite
  api/          # API endpoint tests
  indexer/      # Indexer tests
  mcp/          # MCP protocol tests
  helpers/      # Test utilities

scripts/        # Bash scripts for development
```

## API Endpoints

- `GET /health` - Health check
- `POST /index` - Index a repository
- `GET /search?term=query` - Search indexed files
- `GET /files/recent` - List recently indexed files
- `POST /mcp` - Model Context Protocol endpoint

## Learn More

- [Repository Overview](../README.md)
- [Architecture Documentation](../CLAUDE.md)
- [Database Schema](../docs/schema.md)
