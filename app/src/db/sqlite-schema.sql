-- SQLite Schema for KotaDB Local-First Architecture
-- 
-- Migration: Phase 1B - Schema Translation (PostgreSQL → SQLite)
-- Issue: #538 (parent: #532)
-- Author: Claude Code
-- Date: 2025-12-15
--
-- This schema implements the "local-first essentials" as defined in issue #543:
-- - repositories: Git repository metadata
-- - indexed_files: Source files (with FTS5 for code search)
-- - indexed_symbols: Functions, classes, variables
-- - indexed_references: Dependency graph edges
-- - projects: User-defined groupings
-- - project_repositories: Project-repo associations
--
-- Type Mappings (PostgreSQL → SQLite):
-- - uuid → TEXT (RFC 4122 format, 36 chars)
-- - timestamptz → TEXT (ISO 8601 format)
-- - jsonb → TEXT (JSON string, use JSON1 extension)
-- - boolean → INTEGER (0 = false, 1 = true)
-- - text[] → TEXT (JSON array string)
--
-- Note: RLS policies from PostgreSQL are NOT translated.
-- Authorization is handled at the application layer (AuthContext).

-- ============================================================================
-- Schema Version Tracking
-- ============================================================================

-- Use PRAGMA user_version for schema versioning
-- PRAGMA user_version = 1;

-- ============================================================================
-- 1. Repositories Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,                         -- uuid → TEXT
    user_id TEXT,                                -- uuid → TEXT (nullable for local-first)
    org_id TEXT,                                 -- uuid → TEXT (nullable for local-first)
    name TEXT NOT NULL,                          -- Repository name
    full_name TEXT NOT NULL UNIQUE,              -- owner/repo format
    git_url TEXT,                                -- Clone URL
    default_branch TEXT NOT NULL DEFAULT 'main',
    last_indexed_at TEXT,                        -- timestamptz → TEXT (ISO 8601)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT DEFAULT '{}'                   -- jsonb → TEXT (JSON string)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_repositories_full_name ON repositories(full_name);
CREATE INDEX IF NOT EXISTS idx_repositories_user_id ON repositories(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repositories_org_id ON repositories(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repositories_last_indexed ON repositories(last_indexed_at);

-- ============================================================================
-- 2. Indexed Files Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS indexed_files (
    id TEXT PRIMARY KEY,                         -- uuid → TEXT
    repository_id TEXT NOT NULL,                 -- Foreign key to repositories
    path TEXT NOT NULL,                          -- File path relative to repo root
    content TEXT NOT NULL,                       -- Full file content (for FTS5)
    language TEXT,                               -- Programming language
    size_bytes INTEGER,                          -- File size in bytes
    content_hash TEXT,                           -- SHA-256 hash of content
    indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT DEFAULT '{}',                  -- jsonb → TEXT
    
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    UNIQUE (repository_id, path)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_indexed_files_repository_id ON indexed_files(repository_id);
CREATE INDEX IF NOT EXISTS idx_indexed_files_path ON indexed_files(path);
CREATE INDEX IF NOT EXISTS idx_indexed_files_language ON indexed_files(language);
CREATE INDEX IF NOT EXISTS idx_indexed_files_content_hash ON indexed_files(content_hash);

-- ============================================================================
-- 3. FTS5 Virtual Table for Code Search
-- ============================================================================

-- FTS5 virtual table for full-text search on file content
-- content='' creates an "external content" FTS table (no duplicate storage)
-- content_rowid='rowid' links to indexed_files via SQLite's internal rowid
CREATE VIRTUAL TABLE IF NOT EXISTS indexed_files_fts USING fts5(
    path,
    content,
    content='indexed_files',
    content_rowid='rowid'
);

-- ============================================================================
-- 4. FTS5 Sync Triggers
-- ============================================================================

-- After INSERT: Add new file to FTS index
CREATE TRIGGER IF NOT EXISTS indexed_files_fts_ai 
AFTER INSERT ON indexed_files 
BEGIN
    INSERT INTO indexed_files_fts(rowid, path, content) 
    VALUES (new.rowid, new.path, new.content);
END;

-- After DELETE: Remove file from FTS index
-- Note: FTS5 uses 'delete' command in first column for deletions
CREATE TRIGGER IF NOT EXISTS indexed_files_fts_ad 
AFTER DELETE ON indexed_files 
BEGIN
    INSERT INTO indexed_files_fts(indexed_files_fts, rowid, path, content) 
    VALUES ('delete', old.rowid, old.path, old.content);
END;

-- After UPDATE: Update file in FTS index (delete old, insert new)
CREATE TRIGGER IF NOT EXISTS indexed_files_fts_au 
AFTER UPDATE ON indexed_files 
BEGIN
    INSERT INTO indexed_files_fts(indexed_files_fts, rowid, path, content) 
    VALUES ('delete', old.rowid, old.path, old.content);
    INSERT INTO indexed_files_fts(rowid, path, content) 
    VALUES (new.rowid, new.path, new.content);
END;

-- ============================================================================
-- 5. Indexed Symbols Table (PostgreSQL: symbols)
-- ============================================================================

CREATE TABLE IF NOT EXISTS indexed_symbols (
    id TEXT PRIMARY KEY,                         -- uuid → TEXT
    file_id TEXT NOT NULL,                       -- Foreign key to indexed_files
    repository_id TEXT NOT NULL,                 -- Denormalized for query performance
    name TEXT NOT NULL,                          -- Symbol name (function/class/etc)
    kind TEXT NOT NULL,                          -- Symbol type
    line_start INTEGER NOT NULL,                 -- Start line number
    line_end INTEGER NOT NULL,                   -- End line number
    signature TEXT,                              -- Function signature
    documentation TEXT,                          -- Docstring/comments
    metadata TEXT DEFAULT '{}',                  -- jsonb → TEXT
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (file_id) REFERENCES indexed_files(id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    
    -- CHECK constraint replaces PostgreSQL enum
    CHECK (kind IN ('function', 'class', 'interface', 'type', 'variable', 'constant', 'method', 'property', 'module', 'namespace', 'enum', 'enum_member'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_indexed_symbols_file_id ON indexed_symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_indexed_symbols_repository_id ON indexed_symbols(repository_id);
CREATE INDEX IF NOT EXISTS idx_indexed_symbols_name ON indexed_symbols(name);
CREATE INDEX IF NOT EXISTS idx_indexed_symbols_kind ON indexed_symbols(kind);

-- ============================================================================
-- 6. Indexed References Table (PostgreSQL: references)
-- ============================================================================

-- Note: Table name is indexed_references (not "references" which is a SQL keyword)
CREATE TABLE IF NOT EXISTS indexed_references (
    id TEXT PRIMARY KEY,                         -- uuid → TEXT
    file_id TEXT NOT NULL,                       -- Source file
    repository_id TEXT NOT NULL,                 -- Denormalized for query performance
    symbol_name TEXT NOT NULL,                   -- Referenced symbol name
    target_symbol_id TEXT,                       -- Target symbol (nullable for external refs)
    target_file_path TEXT,                       -- Target file path (for cross-file refs)
    line_number INTEGER NOT NULL,                -- Line number of reference
    column_number INTEGER DEFAULT 0,             -- Column number (optional)
    reference_type TEXT NOT NULL,                -- Type of reference
    metadata TEXT DEFAULT '{}',                  -- jsonb → TEXT
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (file_id) REFERENCES indexed_files(id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    FOREIGN KEY (target_symbol_id) REFERENCES indexed_symbols(id) ON DELETE SET NULL,
    
    -- CHECK constraint replaces PostgreSQL enum
    CHECK (reference_type IN ('import', 'call', 'extends', 'implements', 'type_reference', 'variable_reference'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_indexed_references_file_id ON indexed_references(file_id);
CREATE INDEX IF NOT EXISTS idx_indexed_references_repository_id ON indexed_references(repository_id);
CREATE INDEX IF NOT EXISTS idx_indexed_references_symbol_name ON indexed_references(symbol_name);
CREATE INDEX IF NOT EXISTS idx_indexed_references_target_symbol ON indexed_references(target_symbol_id);
CREATE INDEX IF NOT EXISTS idx_indexed_references_type ON indexed_references(reference_type);

-- ============================================================================
-- 7. Projects Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,                         -- uuid → TEXT
    user_id TEXT,                                -- uuid → TEXT (nullable for local-first)
    org_id TEXT,                                 -- uuid → TEXT (nullable for local-first)
    name TEXT NOT NULL,                          -- Project name
    description TEXT,                            -- Project description
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT DEFAULT '{}'                   -- jsonb → TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);

-- Unique constraint: user can't have duplicate project names
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_name ON projects(user_id, name) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_name ON projects(org_id, name) WHERE org_id IS NOT NULL;

-- ============================================================================
-- 8. Project Repositories Junction Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_repositories (
    id TEXT PRIMARY KEY,                         -- uuid → TEXT
    project_id TEXT NOT NULL,                    -- Foreign key to projects
    repository_id TEXT NOT NULL,                 -- Foreign key to repositories
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    UNIQUE (project_id, repository_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_project_repositories_project_id ON project_repositories(project_id);
CREATE INDEX IF NOT EXISTS idx_project_repositories_repository_id ON project_repositories(repository_id);

-- ============================================================================
-- 9. Schema Migrations Tracking Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,                   -- Migration name
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied ON schema_migrations(applied_at DESC);

-- Record this migration
INSERT OR IGNORE INTO schema_migrations (name) VALUES ('001_initial_sqlite_schema');

-- ============================================================================
-- Query Examples (for reference, not executed)
-- ============================================================================

-- FTS5 Search Example:
-- SELECT 
--     f.id,
--     f.path,
--     f.repository_id,
--     snippet(indexed_files_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet,
--     bm25(indexed_files_fts) AS rank
-- FROM indexed_files_fts
-- JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid
-- WHERE indexed_files_fts MATCH 'search query'
-- ORDER BY rank
-- LIMIT 50;

-- Dependency Graph (Recursive CTE) Example:
-- WITH RECURSIVE dep_tree AS (
--     SELECT id, symbol_name, file_id, target_symbol_id, 1 AS depth
--     FROM indexed_references
--     WHERE target_symbol_id = ?
--     
--     UNION ALL
--     
--     SELECT r.id, r.symbol_name, r.file_id, r.target_symbol_id, dt.depth + 1
--     FROM indexed_references r
--     JOIN dep_tree dt ON r.target_symbol_id = (
--         SELECT id FROM indexed_symbols WHERE id = dt.id
--     )
--     WHERE dt.depth < 5
-- )
-- SELECT DISTINCT * FROM dep_tree ORDER BY depth;
