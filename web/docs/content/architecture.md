---
title: Architecture
description: Understanding KotaDB internals
order: 4
last_updated: 2026-02-03
version: 2.0.1
reviewed_by: documentation-build-agent
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
|  +---------------+  +-------v--------+  +-------------------+      |
|  | Memory Layer  |--|   SQLite DB    |--| Expertise Layer   |      |
|  +---------------+  +----------------+  +-------------------+      |
|                                                                    |
|  +------------------------------------------------------------+   |
|  |                   Context Seeding (Hooks)                   |   |
|  +------------------------------------------------------------+   |
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

The indexer uses @typescript-eslint/parser for AST parsing, providing:
- Full TypeScript and JavaScript syntax support
- Precise source location information (line, column, range)
- Comment and token preservation for JSDoc extraction
- Graceful error handling with structured logging

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

### Error Tracking

Sentry integration provides comprehensive error monitoring:

- **Exception capture** - Automatic error collection with context
- **Structured logging** - Correlation with request IDs
- **Privacy compliance** - Sensitive headers automatically scrubbed
- **Environment-aware** - Different sampling rates for dev/prod
- **Request correlation** - Links errors to specific API requests

### Authentication Middleware

JWT-based authentication protects all endpoints (except health checks):

- **Token validation** - Verifies JWT signature and expiration
- **Rate limiting** - Per-user request limits with headers
- **Context injection** - Attaches user context to requests
- **Header sanitization** - Removes sensitive data from logs
- **CORS support** - Configurable origin policies

### Memory Layer

The Memory Layer provides persistent cross-session intelligence, enabling agents to learn from past decisions and avoid repeating mistakes. All tables use FTS5 for full-text search.

**Database Tables:**

- **`decisions`** - Architectural decisions with status tracking (active, superseded, deprecated)
  - Stores title, context, decision, rationale, and alternatives considered
  - Scoped by category: architecture, pattern, convention, workaround
  - Searchable via `search_decisions` MCP tool

- **`failures`** / **`failed_approaches`** - Records what didn't work
  - Captures problem, approach tried, and why it failed
  - Links to related files for context
  - Searchable via `search_failures` MCP tool

- **`patterns`** / **`pattern_annotations`** - Codebase patterns for consistency
  - Pattern type, name, description, and example code
  - Evidence counting and confidence scoring (0.0-1.0)
  - Searchable via `search_patterns` MCP tool

- **`insights`** / **`session_insights`** - Session discoveries and workarounds
  - Types: discovery, failure, workaround
  - Links to agent sessions and related files
  - Recorded via `record_insight` MCP tool

- **`agent_sessions`** - Tracks agent work sessions
  - Agent type, task summary, outcome (success/failure/partial)
  - Files modified during session
  - Enables learning and analysis across sessions

**MCP Tools:**

| Tool | Purpose |
|------|---------|
| `search_decisions` | Search past architectural decisions using FTS5 |
| `record_decision` | Record a new architectural decision |
| `search_failures` | Search failed approaches to avoid repeating mistakes |
| `record_failure` | Record a failed approach |
| `search_patterns` | Find codebase patterns by type or file |
| `record_insight` | Store a session insight |
| `get_recent_patterns` | Get recently observed patterns |

### Dynamic Expertise Layer

The Dynamic Expertise Layer provides real-time expertise based on indexed code, enabling domain-specific knowledge to stay synchronized with the actual codebase.

**Core Capabilities:**

- **Domain Key File Discovery** - Identifies the most-depended-on files for each domain using dependency graph analysis. Key files are core infrastructure that many other files depend on.

- **Pattern Validation** - Validates that patterns defined in `expertise.yaml` files exist in the indexed codebase. Checks for stale or missing file references.

- **Expertise Synchronization** - Syncs patterns from `expertise.yaml` files to the patterns table, extracting pattern definitions and storing them for future reference.

**Supported Domains:**

- `database` - SQLite schema, FTS5, migrations, queries
- `api` - HTTP endpoints, MCP tools, Express patterns
- `indexer` - AST parsing, symbol extraction, code analysis
- `testing` - Antimocking, Bun tests, SQLite test patterns
- `claude-config` - .claude/ configuration (commands, hooks, settings)
- `agent-authoring` - Agent creation (frontmatter, tools, registry)
- `automation` - ADW workflows, agent orchestration, worktree isolation
- `github` - Issues, PRs, branches, GitHub CLI workflows
- `documentation` - Documentation management, content organization

**MCP Tools:**

| Tool | Purpose |
|------|---------|
| `get_domain_key_files` | Get most-depended-on files for a domain |
| `validate_expertise` | Validate expertise.yaml against indexed code |
| `sync_expertise` | Sync patterns from expertise.yaml to patterns table |

### Context Seeding

Context Seeding provides hook-based context injection with a target of less than 100ms response time. It automatically injects relevant context into agent workflows.

**Hook Integration:**

Context seeding integrates with Claude Code hooks defined in `.claude/settings.json`:

- **PreToolUse** - Injects context before Edit/Write/MultiEdit operations
  - Runs: `pre-edit-context.py`
  - Provides dependency counts, impacted files, and test files for files being modified

- **SubagentStart** - Injects context when build or Explore agents start
  - Runs: `agent-context.py`
  - Provides relevant context for the agent's task

- **SessionStart** - Loads domain expertise at session start
  - Runs: `session-expertise.py`
  - Seeds relevant expertise based on working context

**generate_task_context Tool:**

The `generate_task_context` MCP tool generates structured context for a set of files:

```json
{
  "files": ["src/api/routes.ts", "src/db/queries.ts"],
  "include_tests": true,
  "include_symbols": false,
  "max_impacted_files": 20
}
```

**Returns:**
- Dependency counts for each file
- List of impacted files (files that depend on the target files)
- Related test files for test scope discovery
- Recent changes to the files

**Performance Target:** <100ms for typical file sets, enabling real-time context injection without noticeable latency.

## Data Flow

### Indexing Flow

1. **File discovery** - Walk repository, respecting ignore patterns
2. **Change detection** - Compare file hashes to detect modifications
3. **Parsing** - Parse changed files with @typescript-eslint/parser
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

### Memory Layer Flow

1. **Recording** - Agent makes a decision, encounters a failure, or discovers a pattern
2. **Storage** - Record stored in appropriate table with FTS5 indexing
3. **Retrieval** - Future agents search memory before making similar decisions
4. **Learning** - Patterns reinforce through evidence counting and confidence scoring

```
+------------------+     +------------------+     +------------------+
|  Agent Session   |---->|   Record Entry   |---->|   SQLite + FTS5  |
+------------------+     +------------------+     +------------------+
                                                          |
+------------------+     +------------------+              |
|  Future Agent    |<----|  Search Memory   |<------------+
+------------------+     +------------------+
```

### Context Seeding Flow

1. **Hook Trigger** - PreToolUse, SubagentStart, or SessionStart event fires
2. **Context Generation** - Hook script calls `generate_task_context`
3. **Dependency Analysis** - Tool queries dependency graph for impacted files
4. **Test Discovery** - Related test files identified
5. **Context Injection** - Structured context returned to agent workflow

```
+------------------+     +------------------+     +------------------+
|   Hook Event     |---->|   Python Script  |---->|  MCP Tool Call   |
+------------------+     +------------------+     +------------------+
                                                          |
+------------------+                                       |
|  Agent Context   |<--------------------------------------+
+------------------+
```

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
- @typescript-eslint/parser for AST parsing
- Express for HTTP (optional)

### Incremental by Default

Optimize for the common case:
- Most operations are small updates
- Full re-index only when needed
- Cache parsed ASTs where beneficial

### Cross-Session Learning

Enable agents to build on past work:
- Persistent memory layer survives session boundaries
- Decisions and failures inform future agents
- Pattern confidence grows with evidence

## File Structure

```
kotadb/
├── app/
│   └── src/
│       ├── api/        # HTTP endpoints
│       ├── db/         # SQLite operations
│       │   └── migrations/  # Schema migrations including memory layer
│       ├── indexer/    # File parsing and indexing
│       ├── mcp/        # MCP server implementation
│       └── cli.ts      # Command-line interface
├── .claude/
│   ├── hooks/          # Context seeding hook scripts
│   │   └── kotadb/
│   │       ├── pre-edit-context.py
│   │       ├── agent-context.py
│   │       └── session-expertise.py
│   ├── agents/
│   │   └── experts/    # Domain expertise definitions
│   └── settings.json   # Hook configuration
└── .kotadb/           # Project-local directory
    ├── kota.db        # SQLite database
    └── export/        # JSONL export files for git sync
```

## Next Steps

- Get started with [Installation](#installation)
- Configure your setup in [Configuration](#configuration)
- Explore the [API Reference](#api-reference)
