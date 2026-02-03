# KotaDB

**Ask Claude about your code. Get instant answers.**

KotaDB gives Claude Code superpowers for understanding your codebase. Index your repository once, then ask questions like *"What breaks if I change this file?"* and get accurate, dependency-aware answers.

## For Users

### What KotaDB Does

KotaDB is a local code intelligence tool that helps Claude Code understand your codebase structure:

- **Impact Analysis**: Know exactly what files depend on what you're changing
- **Code Search**: Find code by meaning, not just text matching
- **Dependency Graphs**: See how your files connect to each other
- **Zero Cloud**: Everything runs locally - your code never leaves your machine

### 5-Minute Setup

**Prerequisites:** [Bun](https://bun.sh) v1.1+ (required)

**Step 1: Add to Claude Code**

Add this to your Claude Code MCP config (`~/.claude/mcp.json`):

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

**Step 2: Start Asking Questions**

Just ask! KotaDB auto-indexes on first use:
> "What files depend on src/index.ts?"

KotaDB automatically indexes your codebase and answers your question. No manual setup needed.

Once indexed, Claude can answer questions like:
- "What files import this module?"
- "What would break if I refactored this function?"
- "Find all files related to authentication"

### Key Questions KotaDB Answers

| Question | KotaDB Tool |
|----------|-------------|
| "What breaks if I change this file?" | `search_dependencies` |
| "How risky is this refactor?" | `analyze_change_impact` |
| "Find code that does X" | `search_code` |
| "What files were recently indexed?" | `list_recent_files` |

### Why Stdio Transport?

KotaDB uses stdio (standard input/output) instead of HTTP ports:

- **No port conflicts**: Works alongside other tools without configuration
- **Simpler setup**: Just add the MCP config and go
- **Better isolation**: Claude Code manages the process lifecycle
- **Recommended by MCP**: Official pattern for local tools

---

## Learn to Build AI Dev Tools

KotaDB is part of my journey building AI-powered developer tools. I share everything I learn:

🎥 **YouTube** - Tutorials on Claude Code, MCP, and building tools like this  
→ [youtube.com/@jaymin-west](https://youtube.com/@jaymin-west)

👥 **Prompt to Prod Community** - Learn to ship AI apps, not just prompt  
→ [skool.com/prompt-to-prod](https://skool.com/prompt-to-prod)

Built by [Jaymin West](https://jayminwest.com)

---

## For Contributors

### Development Setup

```bash
# Install dependencies
cd app && bun install

# Start the API server
cd app && bun run src/index.ts

# Run tests
cd app && bun test

# Type-check
cd app && bunx tsc --noEmit
```

The server listens on port `3000` by default. Override with `PORT=4000`.

Data is stored in `~/.kotadb/kotadb.sqlite` by default.

### Useful Scripts

- `cd app && bun --watch src/index.ts` - Start server in watch mode
- `cd app && bun test` - Run the test suite
- `cd app && bunx tsc --noEmit` - Type-check the project

For detailed development setup, see [DEVELOPMENT.md](./DEVELOPMENT.md).

### Project Layout

```
app/                   # Application layer (TypeScript/Bun API service)
  src/
    api/               # HTTP routes and database access
    db/                # SQLite client initialization and helpers
    indexer/           # Repository crawling, parsing, and extraction
    mcp/               # Model Context Protocol implementation
    types/             # Shared TypeScript types
  tests/               # Test suite

automation/            # Agentic layer (AI developer workflows)
  adws/                # ADW automation scripts

.claude/commands/      # Claude Code slash commands
.github/workflows/     # CI workflows
docs/                  # Documentation
```

---

## API Reference

### MCP Tools

KotaDB provides these tools through the Model Context Protocol:

| Tool | Purpose |
|------|---------|
| `search_code` | Search indexed code files for a term |
| `index_repository` | Index a git repository |
| `list_recent_files` | List recently indexed files |
| `search_dependencies` | Find file dependencies and dependents |
| `analyze_change_impact` | Analyze impact of proposed changes |
| `validate_implementation_spec` | Validate implementation specs |
| `kota_sync_export` | Export database to JSONL |
| `kota_sync_import` | Import JSONL into database |

### REST Endpoints

- `GET /health` - Heartbeat endpoint
- `POST /index` - Queue repository for indexing
- `GET /search?term=foo` - Search for files containing term
- `GET /files/recent` - Recent indexing results

### HTTP Transport (Alternative)

For multi-client scenarios or remote access, use HTTP transport:

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

Customize the port with `--port`:

```bash
kotadb --port 4000
```

### MCP Protocol Details

**Endpoint:** `POST /mcp`

**Required Headers:**
- `Accept: application/json, text/event-stream`
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

**Example: Search Dependencies**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
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

---

## Multi-Repository Support

KotaDB v2.0.0 uses project-local storage in `.kotadb/` directories, providing automatic isolation between projects. All MCP tools support an optional `repository` parameter for filtering results.

```typescript
// List all recent files
await tools.list_recent_files({ limit: 20 });

// Filter by repository
await tools.list_recent_files({ 
  limit: 20, 
  repository: "your-org/your-repo" 
});
```

See `docs/guides/multi-repo-best-practices.md` for detailed guidance.

---

## Security

By default, KotaDB only accepts requests from localhost origins. Configure `KOTA_ALLOWED_ORIGINS` environment variable (comma-separated) if needed.

The indexer clones repositories automatically when `localPath` is not provided. Override the GitHub clone source with `KOTA_GIT_BASE_URL`.
