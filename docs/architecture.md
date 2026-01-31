# KotaDB v2.0.0 Architecture

> A local-first code intelligence tool built with Bun + TypeScript + SQLite

## Overview

KotaDB is a local-only code intelligence API that provides:
- **Full-text code search** using SQLite FTS5
- **AST-based symbol extraction** (functions, classes, types, interfaces)
- **Dependency graph analysis** via import/reference tracking
- **MCP tools** for AI agent integration

The v2.0.0 architecture is designed around a single principle: **everything runs locally**. No cloud dependencies, no external databases, no network requirements for core functionality.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │  Claude Code    │    │   HTTP Client   │    │    CLI Tool     │        │
│   │  (MCP Client)   │    │   (curl/fetch)  │    │   (bun run)     │        │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │
│            │                      │                      │                  │
└────────────┼──────────────────────┼──────────────────────┼──────────────────┘
             │                      │                      │
             ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API Layer                                      │
│                           (Express Server)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │   /mcp (POST)   │    │  /search (GET)  │    │  /health (GET)  │        │
│   │  MCP Protocol   │    │   FTS5 Search   │    │   Status Check  │        │
│   └────────┬────────┘    └────────┬────────┘    └─────────────────┘        │
│            │                      │                                         │
│   ┌────────┴────────┐    ┌────────┴────────┐    ┌─────────────────┐        │
│   │   MCP Server    │    │    Queries      │    │  /files/recent  │        │
│   │   (SDK-based)   │    │   (queries.ts)  │    │  /validate-out  │        │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │
│            │                      │                      │                  │
└────────────┼──────────────────────┼──────────────────────┼──────────────────┘
             │                      │                      │
             ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Core Services                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                        Indexer                               │          │
│   │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │          │
│   │  │ AST Parser  │  │   Symbol     │  │    Reference     │   │          │
│   │  │ (TS-ESLint) │  │  Extractor   │  │    Extractor     │   │          │
│   │  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘   │          │
│   │         │                │                   │              │          │
│   │         └────────────────┼───────────────────┘              │          │
│   │                          ▼                                  │          │
│   │              ┌───────────────────────┐                      │          │
│   │              │    Path Resolver      │                      │          │
│   │              │  (tsconfig aliases)   │                      │          │
│   │              └───────────────────────┘                      │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                     MCP Tools                                │          │
│   │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │          │
│   │  │ search_code │  │   index_     │  │     search_      │   │          │
│   │  │             │  │  repository  │  │   dependencies   │   │          │
│   │  └─────────────┘  └──────────────┘  └──────────────────┘   │          │
│   │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │          │
│   │  │   analyze_  │  │   validate_  │  │ kota_sync_export │   │          │
│   │  │change_impact│  │  impl_spec   │  │ kota_sync_import │   │          │
│   │  └─────────────┘  └──────────────┘  └──────────────────┘   │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
             │                      │                      │
             ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Database Layer                                    │
│                       (SQLite + bun:sqlite)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                   KotaDatabase                               │          │
│   │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │          │
│   │  │   Writer    │  │   Readers    │  │   Prepared Stmt  │   │          │
│   │  │ Connection  │  │ Pool (N=CPU) │  │      Cache       │   │          │
│   │  └─────────────┘  └──────────────┘  └──────────────────┘   │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                   SQLite Tables                              │          │
│   │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │          │
│   │  │repositories │  │indexed_files │  │ indexed_symbols  │   │          │
│   │  └─────────────┘  └──────────────┘  └──────────────────┘   │          │
│   │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │          │
│   │  │indexed_refs │  │  projects    │  │indexed_files_fts │   │          │
│   │  └─────────────┘  └──────────────┘  └──────────────────┘   │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
│                     .kotadb/kota.db (project-local)                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### API Layer (\`app/src/api/\`)

The API layer provides HTTP endpoints for interacting with KotaDB.

| File | Purpose |
|------|---------|
| \`routes.ts\` | Express app factory with all route handlers |
| \`queries.ts\` | Database query functions (search, store, resolve) |
| \`auto-reindex.ts\` | Background re-indexing triggers |
| \`openapi/\` | OpenAPI 3.1 specification generation |

**Key Endpoints:**

\`\`\`typescript
// Health check (public)
GET /health → { status, version, mode, timestamp }

// Full-text search
GET /search?term=<query>&repository=<id>&limit=<n>
→ { results: [{ path, snippet, dependencies, indexedAt }] }

// Recent files
GET /files/recent?limit=<n>
→ { results: [{ path, dependencies, indexedAt }] }

// MCP protocol
POST /mcp
→ JSON-RPC 2.0 (tools/list, tools/call)

// Schema validation
POST /validate-output
→ { valid: boolean, errors?: [] }

// OpenAPI spec
GET /openapi.json
→ OpenAPI 3.1 specification
\`\`\`

### Indexer (\`app/src/indexer/\`)

The indexer extracts code intelligence from source files using AST analysis.

| File | Purpose |
|------|---------|
| \`ast-parser.ts\` | Parse TypeScript/JavaScript to AST using @typescript-eslint/parser |
| \`symbol-extractor.ts\` | Extract functions, classes, interfaces, types from AST |
| \`reference-extractor.ts\` | Extract imports, calls, type references from AST |
| \`import-resolver.ts\` | Resolve import paths to actual file paths |
| \`path-resolver.ts\` | Handle tsconfig path aliases (@api/*, @db/*) |
| \`repos.ts\` | Repository preparation (validate local paths) |
| \`parsers.ts\` | Source file discovery and parsing |
| \`storage.ts\` | Batch storage operations |
| \`extractors.ts\` | Snippet generation utilities |
| \`circular-detector.ts\` | Detect circular dependencies |

**Symbol Extraction Example:**

\`\`\`typescript
// Input: TypeScript source code
export function createDatabase(config?: DatabaseConfig): KotaDatabase {
  return new KotaDatabase(config);
}

// Output: Extracted symbol
{
  name: "createDatabase",
  kind: "function",
  lineStart: 1,
  lineEnd: 3,
  signature: "(config?) => <return-type>",
  documentation: null,
  isExported: true,
  isAsync: false
}
\`\`\`

**Reference Extraction Example:**

\`\`\`typescript
// Input: Import statement
import { KotaDatabase } from "@db/sqlite/index.js";

// Output: Extracted reference
{
  targetName: "KotaDatabase",
  referenceType: "import",
  lineNumber: 1,
  metadata: {
    importSource: "@db/sqlite/index.js",
    isDefaultImport: false
  }
}
\`\`\`

### MCP Tools (\`app/src/mcp/\`)

MCP (Model Context Protocol) tools enable AI agents to interact with KotaDB.

| File | Purpose |
|------|---------|
| \`server.ts\` | MCP server factory using @modelcontextprotocol/sdk |
| \`tools.ts\` | Tool definitions and execution handlers |
| \`impact-analysis.ts\` | Change impact analysis logic |
| \`spec-validation.ts\` | Implementation spec validation |
| \`jsonrpc.ts\` | JSON-RPC error helpers |
| \`lifecycle.ts\` | Server lifecycle management |
| \`session.ts\` | Session handling |

**Available Tools:**

| Tool | Description |
|------|-------------|
| \`search_code\` | Full-text search across indexed files |
| \`index_repository\` | Index a local repository |
| \`list_recent_files\` | List recently indexed files |
| \`search_dependencies\` | Query dependency graph (dependents/dependencies) |
| \`analyze_change_impact\` | Analyze impact of proposed changes |
| \`validate_implementation_spec\` | Validate implementation plans |
| \`kota_sync_export\` | Export SQLite to JSONL for git sync |
| \`kota_sync_import\` | Import JSONL into SQLite |

**Tool Usage Example:**

\`\`\`json
// Request
{
  "method": "tools/call",
  "params": {
    "name": "search_code",
    "arguments": {
      "term": "createDatabase",
      "limit": 10
    }
  }
}

// Response
{
  "content": [{
    "type": "text",
    "text": "{\"results\":[{\"path\":\"src/db/client.ts\",\"snippet\":\"...createDatabase...\"}]}"
  }]
}
\`\`\`

### Database (\`app/src/db/\`)

SQLite database layer with connection pooling and FTS5 support.

| File | Purpose |
|------|---------|
| \`client.ts\` | Database client factory |
| \`sqlite/sqlite-client.ts\` | KotaDatabase class (WAL mode, connection pool) |
| \`sqlite/jsonl-exporter.ts\` | Export tables to JSONL for git sync |
| \`sqlite/jsonl-importer.ts\` | Import JSONL into SQLite |
| \`sqlite-schema.sql\` | Complete schema definition |

**Connection Pool Architecture:**

\`\`\`typescript
// 1 writer + N readers (N = CPU count)
class ConnectionPool {
  private writer: KotaDatabase;      // Write operations
  private readers: KotaDatabase[];   // Read operations (round-robin)
}

// Usage
const pool = getGlobalPool();
pool.write(db => db.run("INSERT INTO ..."));
pool.read(db => db.query("SELECT ..."));
\`\`\`

**Database Configuration:**

\`\`\`typescript
const DEFAULT_CONFIG: DatabaseConfig = {
  path: "",                    // Auto-resolved to .kotadb/kota.db
  readonly: false,
  wal: true,                   // WAL mode for concurrent access
  busyTimeout: 30000,          // 30s timeout for locks
  foreignKeys: true,
  cacheSize: -64000,           // 64MB cache
  skipSchemaInit: false,
};
\`\`\`

### Validation (\`app/src/validation/\`)

Zod-based schema validation for API inputs and command outputs.

| File | Purpose |
|------|---------|
| \`schemas.ts\` | Core validation logic (JSON Schema to Zod conversion) |
| \`common-schemas.ts\` | Reusable schema definitions |

**Validation Example:**

\`\`\`typescript
const result = validateOutput(
  { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  '{"name": "test"}'
);
// { valid: true }

const result = validateOutput(
  { type: "object", properties: { count: { type: "number" } }, required: ["count"] },
  '{"count": "not-a-number"}'
);
// { valid: false, errors: [{ path: "count", message: "Expected number" }] }
\`\`\`

## Data Flow

### Indexing Flow

\`\`\`
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Local Repo  │────▶│   Discover   │────▶│    Parse     │
│  Directory   │     │   Sources    │     │  Source File │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Store     │◀────│   Extract    │◀────│  Parse AST   │
│   SQLite     │     │   Symbols    │     │  (TS-ESLint) │
└──────────────┘     │  References  │     └──────────────┘
       │             └──────────────┘
       ▼
┌──────────────┐
│    Index     │
│    FTS5      │
└──────────────┘
\`\`\`

**Step-by-Step:**

1. **Discover Sources** (\`parsers.ts:discoverSources\`)
   - Walk directory tree respecting .gitignore
   - Filter by supported extensions (.ts, .tsx, .js, .jsx)
   - Skip node_modules, dist, build directories

2. **Parse Source File** (\`parsers.ts:parseSourceFile\`)
   - Read file content
   - Detect language from extension
   - Create IndexedFile record

3. **Parse AST** (\`ast-parser.ts:parseFile\`)
   - Use @typescript-eslint/parser
   - Enable loc, range, comments, tokens
   - Graceful error handling (returns null on failure)

4. **Extract Symbols** (\`symbol-extractor.ts:extractSymbols\`)
   - Traverse AST nodes
   - Extract functions, classes, interfaces, types, enums
   - Capture JSDoc comments, signatures, export status

5. **Extract References** (\`reference-extractor.ts:extractReferences\`)
   - Traverse AST nodes
   - Extract imports, calls, property access, type references
   - Resolve import paths using path aliases

6. **Store SQLite** (\`queries.ts:saveIndexedFiles\`, \`storeSymbols\`, \`storeReferences\`)
   - Batch insert with transactions
   - FTS5 triggers auto-update search index

### Search Flow

\`\`\`
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Search     │────▶│    FTS5      │────▶│   BM25       │
│   Query      │     │    MATCH     │     │   Ranking    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Return     │◀────│   Build      │◀────│    Join      │
│   Results    │     │   Snippets   │     │ indexed_files│
└──────────────┘     └──────────────┘     └──────────────┘
\`\`\`

**Search Query Example:**

\`\`\`sql
SELECT
    f.id,
    f.path,
    f.content,
    snippet(indexed_files_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet
FROM indexed_files_fts fts
JOIN indexed_files f ON fts.rowid = f.rowid
WHERE indexed_files_fts MATCH '"createDatabase"'  -- Escaped for exact match
ORDER BY bm25(indexed_files_fts)
LIMIT 20;
\`\`\`

### Dependency Graph Query

\`\`\`
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   File ID    │────▶│  Recursive   │────▶│   Cycle      │
│              │     │     CTE      │     │  Detection   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Return     │◀────│   Filter     │◀────│   Traverse   │
│   Results    │     │   Tests      │     │    Depth     │
└──────────────┘     └──────────────┘     └──────────────┘
\`\`\`

**Dependency Query Example:**

\`\`\`sql
WITH RECURSIVE dependents AS (
    -- Base case: direct dependents
    SELECT f.path, 1 AS depth, '|' || f.path || '|' AS path_tracker
    FROM indexed_references r
    JOIN indexed_files f ON r.file_id = f.id
    WHERE r.reference_type = 'import'
      AND r.target_file_path = 'src/db/sqlite/sqlite-client.ts'
    
    UNION ALL
    
    -- Recursive case: indirect dependents
    SELECT f2.path, d.depth + 1, d.path_tracker || f2.path || '|'
    FROM indexed_references r2
    JOIN indexed_files f2 ON r2.file_id = f2.id
    JOIN dependents d ON r2.target_file_path = (
        SELECT path FROM indexed_files WHERE path = d.path
    )
    WHERE r2.reference_type = 'import'
      AND d.depth < 3  -- Max depth
      AND INSTR(d.path_tracker, '|' || f2.path || '|') = 0  -- Cycle detection
)
SELECT DISTINCT path, depth FROM dependents ORDER BY depth, path;
\`\`\`

## Key Design Decisions

### 1. Local-Only SQLite

**Decision:** Use SQLite as the sole database, stored in \`.kotadb/kota.db\` relative to project root.

**Rationale:**
- Zero configuration required
- No network dependencies
- Fast startup (no connection pool warmup)
- Portable (database travels with project)
- Works offline

**Implementation:**
\`\`\`typescript
// Database location resolution
function getDefaultDbPath(): string {
  const projectRoot = findProjectRoot();  // Find .git directory
  return join(projectRoot, ".kotadb", "kota.db");
}
\`\`\`

### 2. FTS5 for Full-Text Search

**Decision:** Use SQLite FTS5 extension for code search.

**Rationale:**
- Native SQLite feature (no external dependency)
- BM25 ranking for relevance
- Snippet generation built-in
- Efficient for code patterns

**Implementation:**
\`\`\`sql
-- External content FTS table (no duplicate storage)
CREATE VIRTUAL TABLE indexed_files_fts USING fts5(
    path,
    content,
    content='indexed_files',
    content_rowid='rowid'
);

-- Auto-sync triggers maintain FTS index
CREATE TRIGGER indexed_files_fts_ai AFTER INSERT ON indexed_files ...
CREATE TRIGGER indexed_files_fts_ad AFTER DELETE ON indexed_files ...
CREATE TRIGGER indexed_files_fts_au AFTER UPDATE ON indexed_files ...
\`\`\`

### 3. Path Aliases for Clean Imports

**Decision:** Use TypeScript path aliases (@api/*, @db/*, etc.) throughout the codebase.

**Rationale:**
- Avoid relative path hell (../../..)
- Self-documenting module boundaries
- Easy to refactor

**Configuration (tsconfig.json):**
\`\`\`json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@api/*": ["src/api/*"],
      "@db/*": ["src/db/*"],
      "@indexer/*": ["src/indexer/*"],
      "@mcp/*": ["src/mcp/*"],
      "@validation/*": ["src/validation/*"],
      "@shared/*": ["./shared/*"]
    }
  }
}
\`\`\`

### 4. Bun Runtime for Performance

**Decision:** Use Bun as the JavaScript runtime.

**Rationale:**
- Native SQLite support (bun:sqlite)
- Faster startup than Node.js
- Built-in TypeScript support
- Excellent test runner

**Key Bun Features Used:**
\`\`\`typescript
import { Database } from "bun:sqlite";  // Native SQLite
import { $ } from "bun";                 // Shell commands
import { serve } from "bun";             // HTTP server (if needed)
\`\`\`

### 5. WAL Mode for Concurrent Access

**Decision:** Enable WAL (Write-Ahead Logging) mode for SQLite.

**Rationale:**
- Concurrent readers don't block writer
- Writer doesn't block readers
- Faster writes for typical workloads
- Crash-safe

**Implementation:**
\`\`\`typescript
// Enabled by default in KotaDatabase
configurePragmas(): void {
  this.db.exec("PRAGMA journal_mode = WAL");
  this.db.exec("PRAGMA synchronous = NORMAL");
  this.db.exec("PRAGMA busy_timeout = 30000");
  this.db.exec("PRAGMA cache_size = -64000");  // 64MB
}
\`\`\`

### 6. JSONL Sync for Git Collaboration

**Decision:** Export/import database as JSONL files for version control.

**Rationale:**
- Share indexed data via git
- Merge-friendly format (line-per-record)
- Human-readable for debugging

**Flow:**
\`\`\`bash
# Export to JSONL
$ kota_sync_export
→ .kotadb/export/indexed_files.jsonl
→ .kotadb/export/indexed_symbols.jsonl
→ .kotadb/export/indexed_references.jsonl

# Commit and push
$ git add .kotadb/export/
$ git commit -m "Update indexed data"

# On another machine
$ git pull
$ kota_sync_import
\`\`\`

## Directory Structure

\`\`\`
app/
├── src/
│   ├── api/                    # HTTP API layer
│   │   ├── routes.ts           # Express routes and handlers
│   │   ├── queries.ts          # Database query functions
│   │   ├── auto-reindex.ts     # Background reindexing
│   │   └── openapi/            # OpenAPI spec generation
│   │       ├── builder.ts
│   │       ├── paths.ts
│   │       └── schemas.ts
│   │
│   ├── db/                     # Database layer
│   │   ├── client.ts           # Client factory
│   │   ├── sqlite-schema.sql   # Schema definition
│   │   └── sqlite/             # SQLite implementation
│   │       ├── sqlite-client.ts    # KotaDatabase, ConnectionPool
│   │       ├── jsonl-exporter.ts   # Export to JSONL
│   │       └── jsonl-importer.ts   # Import from JSONL
│   │
│   ├── indexer/                # Code indexing
│   │   ├── ast-parser.ts       # TypeScript/JS AST parsing
│   │   ├── symbol-extractor.ts # Extract functions, classes, etc.
│   │   ├── reference-extractor.ts # Extract imports, calls
│   │   ├── import-resolver.ts  # Resolve import paths
│   │   ├── path-resolver.ts    # Handle tsconfig aliases
│   │   ├── repos.ts            # Repository preparation
│   │   ├── parsers.ts          # Source file discovery
│   │   ├── storage.ts          # Batch storage
│   │   ├── extractors.ts       # Snippet utilities
│   │   └── circular-detector.ts # Cycle detection
│   │
│   ├── mcp/                    # MCP protocol
│   │   ├── server.ts           # MCP server factory
│   │   ├── tools.ts            # Tool definitions
│   │   ├── impact-analysis.ts  # Change impact analysis
│   │   ├── spec-validation.ts  # Spec validation
│   │   ├── jsonrpc.ts          # JSON-RPC helpers
│   │   ├── lifecycle.ts        # Server lifecycle
│   │   └── session.ts          # Session management
│   │
│   ├── validation/             # Schema validation
│   │   ├── schemas.ts          # Zod validation logic
│   │   └── common-schemas.ts   # Reusable schemas
│   │
│   ├── config/                 # Configuration
│   │   ├── environment.ts      # Environment detection
│   │   ├── constants.ts        # App constants
│   │   ├── project-root.ts     # Project root detection
│   │   └── gitignore.ts        # .gitignore handling
│   │
│   ├── logging/                # Structured logging
│   │   ├── logger.ts           # Logger factory
│   │   └── middleware.ts       # Express logging middleware
│   │
│   ├── auth/                   # Authentication
│   │   └── middleware.ts       # Auth middleware (local mode)
│   │
│   ├── sync/                   # Git sync utilities
│   │   ├── watcher.ts          # File watcher
│   │   ├── merge-driver.ts     # JSONL merge driver
│   │   └── deletion-manifest.ts # Track deletions
│   │
│   ├── index.ts                # Application entry point
│   └── cli.ts                  # CLI entry point
│
├── shared/                     # Shared types
│   └── types/                  # TypeScript interfaces
│
├── tests/                      # Test suites
│   ├── api/
│   ├── db/
│   ├── indexer/
│   └── mcp/
│
├── data/                       # Runtime data (gitignored)
│   └── kotadb.db               # SQLite database (legacy location)
│
├── package.json
├── tsconfig.json
└── bunfig.toml
\`\`\`

## Database Schema

The SQLite schema defines six core tables:

### repositories
Stores git repository metadata.

\`\`\`sql
CREATE TABLE repositories (
    id TEXT PRIMARY KEY,              -- UUID
    name TEXT NOT NULL,               -- Repository name
    full_name TEXT NOT NULL UNIQUE,   -- owner/repo format
    git_url TEXT,                     -- Clone URL
    default_branch TEXT DEFAULT 'main',
    last_indexed_at TEXT,             -- ISO 8601 timestamp
    created_at TEXT,
    updated_at TEXT,
    metadata TEXT DEFAULT '{}'        -- JSON metadata
);
\`\`\`

### indexed_files
Stores source file content and metadata.

\`\`\`sql
CREATE TABLE indexed_files (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id),
    path TEXT NOT NULL,               -- Relative file path
    content TEXT NOT NULL,            -- Full file content
    language TEXT,                    -- Programming language
    size_bytes INTEGER,
    content_hash TEXT,                -- SHA-256 hash
    indexed_at TEXT,
    metadata TEXT DEFAULT '{}',
    UNIQUE (repository_id, path)
);
\`\`\`

### indexed_files_fts
FTS5 virtual table for full-text search.

\`\`\`sql
CREATE VIRTUAL TABLE indexed_files_fts USING fts5(
    path,
    content,
    content='indexed_files',          -- External content
    content_rowid='rowid'
);
\`\`\`

### indexed_symbols
Stores extracted code symbols.

\`\`\`sql
CREATE TABLE indexed_symbols (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL REFERENCES indexed_files(id),
    repository_id TEXT NOT NULL,
    name TEXT NOT NULL,               -- Symbol name
    kind TEXT NOT NULL,               -- function, class, interface, etc.
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    signature TEXT,                   -- Function signature
    documentation TEXT,               -- JSDoc/comments
    metadata TEXT DEFAULT '{}',
    CHECK (kind IN ('function', 'class', 'interface', 'type', 
                    'variable', 'constant', 'method', 'property', 
                    'module', 'namespace', 'enum', 'enum_member'))
);
\`\`\`

### indexed_references
Stores code references (imports, calls, etc.).

\`\`\`sql
CREATE TABLE indexed_references (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL REFERENCES indexed_files(id),
    repository_id TEXT NOT NULL,
    symbol_name TEXT NOT NULL,        -- Referenced symbol
    target_symbol_id TEXT REFERENCES indexed_symbols(id),
    target_file_path TEXT,            -- Resolved import path
    line_number INTEGER NOT NULL,
    column_number INTEGER DEFAULT 0,
    reference_type TEXT NOT NULL,     -- import, call, type_reference, etc.
    metadata TEXT DEFAULT '{}',
    CHECK (reference_type IN ('import', 'call', 'extends', 'implements',
                               'property_access', 'type_reference', 
                               'variable_reference'))
);
\`\`\`

### projects
User-defined groupings of repositories.

\`\`\`sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT,
    updated_at TEXT,
    metadata TEXT DEFAULT '{}'
);
\`\`\`

## Quick Reference

### Starting Development

\`\`\`bash
# Start the server
cd app && bun run src/index.ts

# Run tests
cd app && bun test

# Type-check
cd app && bunx tsc --noEmit

# Lint
cd app && bun run lint
\`\`\`

### MCP Client Configuration

\`\`\`json
{
  "mcpServers": {
    "kotadb": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "transport": "http"
    }
  }
}
\`\`\`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| \`PORT\` | HTTP server port | \`3000\` |
| \`KOTADB_PATH\` | Custom database path | \`.kotadb/kota.db\` |
| \`NODE_ENV\` | Environment mode | \`development\` |

### Path Alias Reference

| Alias | Maps To |
|-------|---------|
| \`@api/*\` | \`src/api/*\` |
| \`@auth/*\` | \`src/auth/*\` |
| \`@config/*\` | \`src/config/*\` |
| \`@db/*\` | \`src/db/*\` |
| \`@indexer/*\` | \`src/indexer/*\` |
| \`@mcp/*\` | \`src/mcp/*\` |
| \`@validation/*\` | \`src/validation/*\` |
| \`@shared/*\` | \`shared/*\` |
| \`@logging/*\` | \`src/logging/*\` |
| \`@sync/*\` | \`src/sync/*\` |

---

*Generated for KotaDB v2.0.0 - Local-First Code Intelligence*
