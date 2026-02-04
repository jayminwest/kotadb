---
title: Configuration
description: Configure KotaDB for your environment
order: 2
last_updated: 2026-02-04
version: 2.2.0
reviewed_by: documentation-build-agent
---

# Configuration

Customize KotaDB to fit your development workflow.

## Environment Variables

KotaDB can be configured using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `KOTADB_PORT` | `3000` | HTTP server port |
| `KOTADB_HOST` | `127.0.0.1` | HTTP server host |
| `KOTADB_DB_PATH` | `~/.kotadb/kota.db` | SQLite database location |
| `KOTADB_LOG_LEVEL` | `info` | Logging verbosity (debug, info, warn, error) |

Example:

```bash
KOTADB_PORT=8080 KOTADB_DB_PATH=/custom/path/db.sqlite kotadb serve
```

## Database Location

By default, KotaDB stores its SQLite database at `~/.kotadb/kota.db`. You can change this location using the `KOTADB_DB_PATH` environment variable.

The database contains:
- Indexed file metadata
- Full-text search indices
- Dependency graph data
- Symbol tables
- Memory layer tables (decisions, failures, patterns, insights)

### Database Size

The database size depends on your codebase. As a rough estimate:
- Small projects (<1000 files): ~10-50MB
- Medium projects (1000-10000 files): ~50-200MB
- Large projects (10000+ files): ~200MB-1GB

## Memory Layer Configuration

KotaDB includes a persistent memory layer that enables cross-session intelligence. This allows agents to learn from past decisions, avoid repeated mistakes, and follow established patterns.

### Auto-Migration

Memory layer tables are automatically created and migrated on startup. No manual configuration is required. The following tables are managed automatically:

| Table | Purpose |
|-------|---------|
| `decisions` | Architectural decisions with rationale and alternatives |
| `failures` | Failed approaches to avoid repeating mistakes |
| `patterns` | Codebase conventions and coding patterns |
| `insights` | Session discoveries, failures, and workarounds |
| `agent_sessions` | Track agent work sessions for learning |

### Full-Text Search

All memory layer tables have FTS5 indexes for fast full-text search:

- `decisions_fts` - Search decision titles, context, and rationale
- `failures_fts` - Search failure titles, problems, and approaches
- `patterns_fts` - Search pattern names and descriptions
- `insights_fts` - Search insight content

### Storage

Memory data is stored in the same SQLite database as indexed code. No separate configuration is needed.

## Context Seeding Configuration

KotaDB supports hook-based context injection to provide agents with relevant dependency and impact information before they begin work.

### Using generate_task_context

The `generate_task_context` MCP tool generates structured context for a set of files:

```json
{
  "files": ["src/db/client.ts", "src/api/routes.ts"],
  "include_tests": true,
  "include_symbols": false,
  "max_impacted_files": 20,
  "repository": "owner/repo"
}
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `files` | (required) | List of file paths to analyze (relative to repository root) |
| `include_tests` | `true` | Include test file discovery |
| `include_symbols` | `false` | Include symbol information for each file |
| `max_impacted_files` | `20` | Maximum number of impacted files to return |
| `repository` | (auto) | Repository ID or full_name (uses most recent if not specified) |

### Performance

Context seeding is designed for hook-based injection with a target response time of **<100ms**. This enables real-time context injection without noticeable delay.

### Hook Integration

Use `generate_task_context` in Claude Code hooks to inject context:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "kotadb context-seed --files $CLAUDE_FILE_PATH"
      }
    ]
  }
}
```

## MCP Server Setup

To use KotaDB with Claude or other MCP-compatible clients, add it to your configuration.

### Claude Code (Recommended: stdio mode)

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "bunx",
      "args": ["kotadb", "--stdio"]
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "bunx",
      "args": ["kotadb", "--stdio"]
    }
  }
}
```

### HTTP Mode (Alternative)

For HTTP-based integration, start the server without `--stdio`:

```bash
bunx kotadb --port 3000
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
