# KotaDB Database Schema

This document describes the SQLite database schema for KotaDB, a local-only code intelligence tool for repository indexing and search.

## Overview

The schema consists of 8 tables organized into three functional domains:

1. **Repository Management**: Git repository tracking and metadata
2. **Code Intelligence**: File indexing, symbol extraction, and dependency graphs
3. **Organization**: Projects and repository groupings

All tables use TEXT for UUID primary keys (RFC 4122 format) and TEXT for timestamps (ISO 8601 format). Authorization is handled at the application layer.

## Storage Location

The SQLite database is stored at `.kotadb/kota.db` within your project directory. This directory is automatically added to `.gitignore`.

## Table Relationships

```
repositories
    ├── indexed_files (source files)
    │   ├── indexed_files_fts (FTS5 virtual table)
    │   ├── indexed_symbols (functions, classes, types)
    │   └── indexed_references (imports, calls)
    ├── dependency_graph (file/symbol dependencies)
    └── project_repositories (project associations)
            └── projects (user-defined groupings)

schema_migrations (version tracking)
```

## Core Tables

### repositories

Git repositories tracked by KotaDB.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (UUID) |
| user_id | TEXT | User identifier (nullable) |
| org_id | TEXT | Organization identifier (nullable) |
| name | TEXT | Repository name |
| full_name | TEXT | Full name in owner/repo format (unique) |
| git_url | TEXT | Clone URL |
| default_branch | TEXT | Default branch (default: "main") |
| last_indexed_at | TEXT | Last successful index (ISO 8601) |
| created_at | TEXT | Creation timestamp (ISO 8601) |
| updated_at | TEXT | Last update timestamp (ISO 8601) |
| metadata | TEXT | Additional metadata (JSON string) |

**Indexes**:
- `idx_repositories_full_name` on `full_name`
- `idx_repositories_user_id` on `user_id` (partial, WHERE user_id IS NOT NULL)
- `idx_repositories_org_id` on `org_id` (partial, WHERE org_id IS NOT NULL)
- `idx_repositories_last_indexed` on `last_indexed_at`

---

### indexed_files

Source files extracted from repositories.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (UUID) |
| repository_id | TEXT | FK to repositories |
| path | TEXT | File path relative to repo root |
| content | TEXT | Full file content |
| language | TEXT | Programming language |
| size_bytes | INTEGER | File size in bytes |
| content_hash | TEXT | SHA-256 hash of content |
| indexed_at | TEXT | Indexing timestamp (ISO 8601) |
| metadata | TEXT | Additional metadata (JSON string) |

**Constraints**:
- UNIQUE(repository_id, path)
- FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE

**Indexes**:
- `idx_indexed_files_repository_id` on `repository_id`
- `idx_indexed_files_path` on `path`
- `idx_indexed_files_language` on `language`
- `idx_indexed_files_content_hash` on `content_hash`

---

### indexed_files_fts

FTS5 virtual table for full-text search on file content.

This is an **external content FTS5 table** that references `indexed_files`. It does not duplicate content storage but provides efficient full-text search capabilities.

| Column | Description |
|--------|-------------|
| path | File path (searchable) |
| content | File content (searchable) |

**Usage Example**:
```sql
SELECT 
    f.id,
    f.path,
    f.repository_id,
    snippet(indexed_files_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet,
    bm25(indexed_files_fts) AS rank
FROM indexed_files_fts
JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid
WHERE indexed_files_fts MATCH 'search query'
ORDER BY rank
LIMIT 50;
```

**Sync Triggers**:
- `indexed_files_fts_ai`: After INSERT on indexed_files
- `indexed_files_fts_ad`: After DELETE on indexed_files  
- `indexed_files_fts_au`: After UPDATE on indexed_files

---

### indexed_symbols

Functions, classes, types, and other code symbols extracted from files.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (UUID) |
| file_id | TEXT | FK to indexed_files |
| repository_id | TEXT | FK to repositories (denormalized) |
| name | TEXT | Symbol name |
| kind | TEXT | Symbol type (see enum below) |
| line_start | INTEGER | Start line number |
| line_end | INTEGER | End line number |
| signature | TEXT | Function/method signature |
| documentation | TEXT | Docstring/comments |
| metadata | TEXT | Additional metadata (JSON string) |
| created_at | TEXT | Creation timestamp (ISO 8601) |

**Valid `kind` values**:
- `function`, `class`, `interface`, `type`, `variable`, `constant`
- `method`, `property`, `module`, `namespace`, `enum`, `enum_member`

**Constraints**:
- FOREIGN KEY (file_id) REFERENCES indexed_files(id) ON DELETE CASCADE
- FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
- CHECK constraint on `kind` enum values

**Indexes**:
- `idx_indexed_symbols_file_id` on `file_id`
- `idx_indexed_symbols_repository_id` on `repository_id`
- `idx_indexed_symbols_name` on `name`
- `idx_indexed_symbols_kind` on `kind`

---

### indexed_references

Cross-file symbol references (imports, function calls, etc.).

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (UUID) |
| file_id | TEXT | FK to indexed_files (source) |
| repository_id | TEXT | FK to repositories (denormalized) |
| symbol_name | TEXT | Referenced symbol name |
| target_symbol_id | TEXT | FK to indexed_symbols (nullable) |
| target_file_path | TEXT | Target file path (for cross-file refs) |
| line_number | INTEGER | Reference line number |
| column_number | INTEGER | Reference column number |
| reference_type | TEXT | Type of reference (see enum below) |
| metadata | TEXT | Additional metadata (JSON string) |
| created_at | TEXT | Creation timestamp (ISO 8601) |

**Valid `reference_type` values**:
- `import`, `call`, `extends`, `implements`
- `property_access`, `type_reference`, `variable_reference`

**Constraints**:
- FOREIGN KEY (file_id) REFERENCES indexed_files(id) ON DELETE CASCADE
- FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
- FOREIGN KEY (target_symbol_id) REFERENCES indexed_symbols(id) ON DELETE SET NULL
- CHECK constraint on `reference_type` enum values

**Indexes**:
- `idx_indexed_references_file_id` on `file_id`
- `idx_indexed_references_repository_id` on `repository_id`
- `idx_indexed_references_symbol_name` on `symbol_name`
- `idx_indexed_references_target_symbol` on `target_symbol_id`
- `idx_indexed_references_type` on `reference_type`

---

### projects

User-defined groupings of repositories.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (UUID) |
| user_id | TEXT | User identifier (nullable) |
| org_id | TEXT | Organization identifier (nullable) |
| name | TEXT | Project name |
| description | TEXT | Project description |
| created_at | TEXT | Creation timestamp (ISO 8601) |
| updated_at | TEXT | Last update timestamp (ISO 8601) |
| metadata | TEXT | Additional metadata (JSON string) |

**Indexes**:
- `idx_projects_user_id` on `user_id` (partial, WHERE user_id IS NOT NULL)
- `idx_projects_org_id` on `org_id` (partial, WHERE org_id IS NOT NULL)
- `idx_projects_name` on `name`
- `idx_projects_user_name` on (user_id, name) - unique per user
- `idx_projects_org_name` on (org_id, name) - unique per org

---

### project_repositories

Many-to-many relationship between projects and repositories.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (UUID) |
| project_id | TEXT | FK to projects |
| repository_id | TEXT | FK to repositories |
| added_at | TEXT | Association timestamp (ISO 8601) |

**Constraints**:
- UNIQUE(project_id, repository_id)
- FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
- FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE

**Indexes**:
- `idx_project_repositories_project_id` on `project_id`
- `idx_project_repositories_repository_id` on `repository_id`

---

### dependency_graph

File and symbol dependency relationships for impact analysis.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (UUID) |
| repository_id | TEXT | FK to repositories |
| from_file_id | TEXT | Source file (nullable) |
| to_file_id | TEXT | Target file (nullable) |
| from_symbol_id | TEXT | Source symbol (nullable) |
| to_symbol_id | TEXT | Target symbol (nullable) |
| dependency_type | TEXT | Type: 'file_import' or 'symbol_usage' |
| metadata | TEXT | Additional metadata (JSON string) |
| created_at | TEXT | Creation timestamp (ISO 8601) |

**Constraints**:
- At least one dependency relationship must be defined (file-to-file OR symbol-to-symbol)
- FOREIGN KEY constraints with ON DELETE CASCADE

**Indexes**:
- `idx_dependency_graph_repository_id` on `repository_id`
- `idx_dependency_graph_from_file_id` on `from_file_id`
- `idx_dependency_graph_to_file_id` on `to_file_id`
- `idx_dependency_graph_from_symbol_id` on `from_symbol_id`
- `idx_dependency_graph_to_symbol_id` on `to_symbol_id`
- `idx_dependency_graph_dependency_type` on `dependency_type`
- `idx_dependency_graph_from_file_to_file` on (to_file_id, dependency_type) - "what depends on X"
- `idx_dependency_graph_composite` on (from_file_id, dependency_type) - "what does X depend on"

---

### schema_migrations

Tracks applied schema migrations.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (autoincrement) |
| name | TEXT | Migration name (unique) |
| applied_at | TEXT | Application timestamp (ISO 8601) |

**Indexes**:
- `idx_schema_migrations_applied` on `applied_at DESC`

---

## SQLite-Specific Features

### Type Mappings

KotaDB uses these PostgreSQL to SQLite type mappings:

| PostgreSQL | SQLite | Notes |
|------------|--------|-------|
| uuid | TEXT | RFC 4122 format (36 characters) |
| timestamptz | TEXT | ISO 8601 format with timezone |
| jsonb | TEXT | JSON string, use JSON1 extension |
| boolean | INTEGER | 0 = false, 1 = true |
| text[] | TEXT | JSON array string |

### FTS5 Full-Text Search

The `indexed_files_fts` virtual table provides efficient full-text search using SQLite's FTS5 extension:

- **External content table**: No duplicate storage, synced via triggers
- **BM25 ranking**: Relevance scoring built-in
- **Snippet extraction**: Context around matches

### WAL Mode

The database runs in WAL (Write-Ahead Logging) mode for:
- Better concurrent read performance
- Improved write performance
- Crash resilience

### Connection Pooling

Application uses connection pooling via better-sqlite3 for optimal performance.

---

## Foreign Key Cascade Behavior

| Table | Foreign Key | On Delete |
|-------|-------------|-----------|
| indexed_files | repository_id | CASCADE |
| indexed_symbols | file_id | CASCADE |
| indexed_symbols | repository_id | CASCADE |
| indexed_references | file_id | CASCADE |
| indexed_references | repository_id | CASCADE |
| indexed_references | target_symbol_id | SET NULL |
| project_repositories | project_id | CASCADE |
| project_repositories | repository_id | CASCADE |
| dependency_graph | repository_id | CASCADE |
| dependency_graph | from_file_id | CASCADE |
| dependency_graph | to_file_id | CASCADE |
| dependency_graph | from_symbol_id | CASCADE |
| dependency_graph | to_symbol_id | CASCADE |

**Note**: Deleting a repository cascades to all indexed files, symbols, references, and dependencies.

---

## Query Examples

### Full-Text Search

```sql
SELECT 
    f.id,
    f.path,
    f.repository_id,
    snippet(indexed_files_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet,
    bm25(indexed_files_fts) AS rank
FROM indexed_files_fts
JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid
WHERE indexed_files_fts MATCH 'search query'
ORDER BY rank
LIMIT 50;
```

### Dependency Tree (Recursive CTE)

```sql
WITH RECURSIVE dep_tree AS (
    SELECT id, symbol_name, file_id, target_symbol_id, 1 AS depth
    FROM indexed_references
    WHERE target_symbol_id = ?
    
    UNION ALL
    
    SELECT r.id, r.symbol_name, r.file_id, r.target_symbol_id, dt.depth + 1
    FROM indexed_references r
    JOIN dep_tree dt ON r.target_symbol_id = (
        SELECT id FROM indexed_symbols WHERE id = dt.id
    )
    WHERE dt.depth < 5
)
SELECT DISTINCT * FROM dep_tree ORDER BY depth;
```

### Files Depending on Target

```sql
SELECT DISTINCT f.path, f.id
FROM dependency_graph dg
JOIN indexed_files f ON dg.from_file_id = f.id
WHERE dg.to_file_id = ?
AND dg.dependency_type = 'file_import';
```

---

## Schema Version

Current schema version: **001** (initial SQLite migration)

Last updated: 2025-01-28
