---
title: Configuration
description: Configure KotaDB for your environment
order: 2
---

# Configuration

Customize KotaDB to fit your development workflow.

## Environment Variables

KotaDB can be configured using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `KOTADB_PORT` | `3000` | HTTP server port |
| `KOTADB_HOST` | `127.0.0.1` | HTTP server host |
| `KOTADB_DB_PATH` | `~/.kotadb/kotadb.db` | SQLite database location |
| `KOTADB_LOG_LEVEL` | `info` | Logging verbosity (debug, info, warn, error) |

Example:

```bash
KOTADB_PORT=8080 KOTADB_DB_PATH=/custom/path/db.sqlite kotadb serve
```

## Database Location

By default, KotaDB stores its SQLite database at `~/.kotadb/kotadb.db`. You can change this location using the `KOTADB_DB_PATH` environment variable.

The database contains:
- Indexed file metadata
- Full-text search indices
- Dependency graph data
- Symbol tables

### Database Size

The database size depends on your codebase. As a rough estimate:
- Small projects (<1000 files): ~10-50MB
- Medium projects (1000-10000 files): ~50-200MB
- Large projects (10000+ files): ~200MB-1GB

## MCP Server Setup

To use KotaDB with Claude or other MCP-compatible clients, add it to your Claude configuration.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "kotadb",
      "args": ["mcp"]
    }
  }
}
```

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "kotadb",
      "args": ["mcp"]
    }
  }
}
```

## Indexing Configuration

Control what gets indexed using `.kotadbignore` files (similar to `.gitignore`):

```
# Ignore node_modules
node_modules/

# Ignore build outputs
dist/
build/

# Ignore large binary files
*.png
*.jpg
*.pdf
```

## Performance Tuning

For large codebases, consider these optimizations:

### Incremental Indexing

By default, KotaDB performs incremental indexing, only updating changed files:

```bash
kotadb index --incremental /path/to/repo
```

### Parallel Processing

Control the number of worker threads:

```bash
KOTADB_WORKERS=4 kotadb index /path/to/repo
```

## Next Steps

- Explore the [API Reference](#api-reference) for available tools
- Learn about the [Architecture](#architecture) to understand how KotaDB works
