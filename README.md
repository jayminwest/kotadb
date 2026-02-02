# KotaDB

KotaDB is a local-only code intelligence tool for CLI Agents like Claude Code and Codex. This project provides a lightweight HTTP interface for repository indexing and code search, backed by SQLite for zero-configuration local storage.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.1+ (required for both development and runtime)

> **Note:** KotaDB requires Bun to run. The package uses TypeScript path aliases that Bun resolves at runtime. Node.js/npx is not supported.

### Installation

KotaDB can be installed globally or run directly with bunx:

```bash
# Run directly (recommended)
bunx kotadb --stdio

# Or install globally
bun add -g kotadb
kotadb --stdio
```

## MCP Configuration

### Stdio Transport (Recommended)

For Claude Code integration, use stdio transport to avoid port conflicts:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "bunx",
      "args": ["kotadb@next", "--stdio"]
    }
  }
}
```

This is the recommended approach for local development. The `--stdio` flag tells kotadb to use standard input/output instead of HTTP, eliminating port conflicts.

### HTTP Transport (Legacy)

For multi-client scenarios or remote access:

```json
{
  "mcpServers": {
    "kotadb": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18"
      }
    }
  }
}
```

You can customize the port with the `PORT` environment variable or `--port` flag:

```bash
kotadb --port 4000
```

### Why Stdio?

- **No port conflicts**: Uses stdin/stdout instead of TCP ports
- **Simpler setup**: No URL configuration needed
- **Better isolation**: Claude Code manages process lifecycle
- **Recommended by MCP**: Official pattern for local tools

## Development

For detailed local development setup, including how to test MCP changes with Claude Code, see [DEVELOPMENT.md](./DEVELOPMENT.md).

### Install dependencies (for development)

```bash
cd app && bun install
```

### Start the API server

```bash
cd app && bun run src/index.ts
```

The server listens on port `3000` by default. Override with `PORT=4000 cd app && bun run src/index.ts`.

Data is stored in `~/.kotadb/kotadb.sqlite` by default.

### Useful scripts

- `cd app && bun --watch src/index.ts` – Start the server in watch mode for local development.
- `cd app && bun test` – Run the Bun test suite.
- `cd app && bunx tsc --noEmit` – Type-check the project.

### Running Tests

KotaDB uses SQLite for local testing with no external dependencies.

```bash
# Run tests
cd app && bun test
```

## API Highlights

### REST Endpoints

- `GET /health` – Simple heartbeat endpoint.
- `POST /index` – Queue a repository for indexing (body: `{ "repository": "org/repo", "localPath": "./repo" }`).
- `GET /search?term=foo` – Search for files containing `foo`. Optional `project` and `limit` parameters.
- `GET /files/recent` – Recent indexing results.

The indexer clones repositories automatically when a `localPath` is not provided. Override the default GitHub clone source by exporting `KOTA_GIT_BASE_URL` (for example, your self-hosted Git service).

### MCP Protocol Endpoint

KotaDB supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) for standardized agent integration. The MCP endpoint enables CLI agents like Claude Code to discover and use KotaDB's capabilities automatically.

**Endpoint:** `POST /mcp`

**Required Headers:**
- `Accept: application/json, text/event-stream` **(CRITICAL: Both types required)**
- `MCP-Protocol-Version: 2025-06-18`
- `Content-Type: application/json`

**Example: Initialize Handshake**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
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
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
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
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
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
- `search_dependencies`: Search the dependency graph for impact analysis
- `analyze_change_impact`: Analyze impact of proposed code changes
- `validate_implementation_spec`: Validate implementation specification files
- `kota_sync_export`: Export SQLite database to JSONL format
- `kota_sync_import`: Import JSONL data into SQLite database

**Tool: `search_dependencies`**

Find files that depend on (dependents) or are depended on by (dependencies) a target file. Useful for:
- **Impact analysis before refactoring**: See what breaks if you change a file
- **Test scope discovery**: Find relevant test files for implementation changes
- **Circular dependency detection**: Identify dependency cycles in your codebase

**Parameters:**
- `file_path` (required): Relative file path within repository (e.g., `"src/auth/context.ts"`)
- `direction` (optional): Search direction - `"dependents"`, `"dependencies"`, or `"both"` (default: `"both"`)
- `depth` (optional): Recursion depth for traversal, 1-5 (default: `1`). Higher values find indirect relationships.
- `include_tests` (optional): Include test files in results (default: `true`)
- `repository` (optional): Repository ID to search within (auto-detected if omitted)

**Example: Find what breaks if you change a file**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "search_dependencies",
      "arguments": {
        "file_path": "src/auth/context.ts",
        "direction": "dependents",
        "depth": 2
      }
    }
  }'
```

## Multi-Repository Support

KotaDB v2.0.0 uses project-local storage in `.kotadb/` directories, providing automatic isolation between projects. All MCP tools support an optional `repository` parameter for filtering results when multiple repositories are indexed.

**Quick Start:**

```typescript
// List all recent files
await tools.list_recent_files({ limit: 20 });

// Filter by repository
await tools.list_recent_files({ 
  limit: 20, 
  repository: "your-org/your-repo" 
});
```

See `docs/guides/multi-repo-best-practices.md` for detailed guidance on working with multiple repositories, including configuration examples and troubleshooting.


**Security & Configuration:**

By default, KotaDB only accepts requests from localhost origins. Configure `KOTA_ALLOWED_ORIGINS` environment variable (comma-separated list of allowed origins) if needed.


## Project Layout

```
app/                   # Application layer (TypeScript/Bun API service)
  src/
    api/               # HTTP routes and database access
    db/                # SQLite client initialization and helpers
    indexer/           # Repository crawling, parsing, and extraction utilities
    mcp/               # Model Context Protocol (MCP) implementation
    types/             # Shared TypeScript types
  tests/               # Test suite
  package.json         # Bun dependencies and scripts
  tsconfig.json        # TypeScript configuration
  scripts/             # Application-specific bash scripts

automation/            # Agentic layer (TypeScript AI developer workflows)
  adws/                # ADW automation scripts and modules

.claude/commands/      # Claude Code slash commands
.github/workflows/     # CI workflows
docs/                  # Documentation
```

See `app/README.md` for application-specific quickstart and `automation/adws/README.md` for automation workflows.
