---
title: Architecture
description: Understanding KotaDB internals
order: 4
---

# Architecture

KotaDB is designed as a local-first code intelligence tool that runs entirely on your machine.

## Overview

```
+------------------+     +------------------+     +------------------+
|   MCP Client     |     |   HTTP Client    |     |   CLI            |
|   (Claude, etc)  |     |   (curl, etc)    |     |   (kotadb)       |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         v                        v                        v
+--------+------------------------+------------------------+---------+
|                           KotaDB Server                            |
|  +----------------+  +----------------+  +--------------------+    |
|  |   MCP Server   |  |   HTTP API     |  |   CLI Commands     |    |
|  +-------+--------+  +-------+--------+  +---------+----------+    |
|          |                   |                     |               |
|          +---------+---------+----------+----------+               |
|                    |                    |                          |
|            +-------v--------+   +-------v--------+                 |
|            |    Indexer     |   |    Search      |                 |
|            +-------+--------+   +-------+--------+                 |
|                    |                    |                          |
|            +-------v--------+   +-------v--------+                 |
|            |   AST Parser   |   |   FTS5 Engine  |                 |
|            +-------+--------+   +-------+--------+                 |
|                    |                    |                          |
|                    +--------+----------++                          |
|                             |                                      |
|                    +--------v--------+                             |
|                    |   SQLite DB     |                             |
|                    +-----------------+                             |
+--------------------------------------------------------------------+
```

## Components

### SQLite Database

The core storage engine. SQLite was chosen for:

- **Zero configuration** - No separate database server to manage
- **Portability** - Single file, easy to backup or move
- **Performance** - Fast enough for most codebases
- **Full-text search** - Built-in FTS5 extension for code search

The database schema includes:
- `files` - File metadata (path, hash, timestamps)
- `symbols` - Extracted code symbols (functions, classes, variables)
- `dependencies` - Import/export relationships
- `files_fts` - Full-text search index

### AST Parser / Indexer

Parses source files to extract meaningful information:

- **Language support** - TypeScript, JavaScript, Python, Go, Rust, and more
- **Symbol extraction** - Functions, classes, interfaces, types
- **Dependency tracking** - Import statements, require calls
- **Incremental updates** - Only re-index changed files

The indexer uses tree-sitter for parsing, providing:
- Fast, parallel parsing
- Error recovery (partial parses for invalid code)
- Consistent AST structure across languages

### MCP Server

Implements the Model Context Protocol for AI assistant integration:

- **Tool exposure** - Surfaces search, indexing, and analysis as MCP tools
- **Streaming** - Efficient handling of large results
- **Context-aware** - Tools designed for AI consumption

### HTTP API

RESTful API for programmatic access:

- **Express-based** - Standard Node.js web framework
- **JSON responses** - Easy to integrate with any client
- **CORS support** - Works with browser-based tools

## Data Flow

### Indexing Flow

1. **File discovery** - Walk repository, respecting ignore patterns
2. **Change detection** - Compare file hashes to detect modifications
3. **Parsing** - Parse changed files with tree-sitter
4. **Symbol extraction** - Extract functions, classes, imports
5. **Storage** - Write to SQLite with proper transactions
6. **FTS update** - Update full-text search index

### Search Flow

1. **Query parsing** - Tokenize and normalize search terms
2. **FTS5 query** - Execute against full-text index
3. **Result ranking** - Score by relevance and recency
4. **Context extraction** - Pull surrounding code for snippets
5. **Response formatting** - Package for client consumption

### Dependency Analysis Flow

1. **Graph construction** - Build in-memory dependency graph
2. **Traversal** - BFS/DFS based on direction parameter
3. **Filtering** - Apply depth limits and test file filters
4. **Impact scoring** - Calculate change impact metrics

## Design Principles

### Local-First

Everything runs on your machine:
- No network calls for core functionality
- No data leaves your system
- Works offline
- Fast response times

### Minimal Dependencies

Keep the dependency tree small:
- SQLite for storage (bundled with Bun)
- tree-sitter for parsing
- Express for HTTP (optional)

### Incremental by Default

Optimize for the common case:
- Most operations are small updates
- Full re-index only when needed
- Cache parsed ASTs where beneficial

## File Structure

```
kotadb/
├── app/
│   └── src/
│       ├── api/        # HTTP endpoints
│       ├── db/         # SQLite operations
│       ├── indexer/    # File parsing and indexing
│       ├── mcp/        # MCP server implementation
│       └── cli.ts      # Command-line interface
└── ~/.kotadb/
    └── kotadb.db       # SQLite database
```

## Next Steps

- Get started with [Installation](#installation)
- Configure your setup in [Configuration](#configuration)
- Explore the [API Reference](#api-reference)
