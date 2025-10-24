-- Migration: Add dependency graph table for file→file and symbol→symbol dependencies
-- Epic: #70 (AST-based code parsing)
-- Issue: #76 (Dependency graph extraction with circular detection)
--
-- This migration creates a new table for storing dependency graphs extracted from source code.
-- The existing `dependencies` table tracks external package dependencies (npm, python, etc.).
-- This new `dependency_graph` table tracks internal code dependencies (imports, function calls).
--
-- Note: Using `dependency_graph` table name to avoid conflict with existing `dependencies` table.

-- ============================================================================
-- Dependency Graph (Internal Code Dependencies)
-- ============================================================================

CREATE TABLE dependency_graph (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    from_file_id uuid REFERENCES indexed_files(id) ON DELETE CASCADE,
    to_file_id uuid REFERENCES indexed_files(id) ON DELETE CASCADE,
    from_symbol_id uuid REFERENCES symbols(id) ON DELETE CASCADE,
    to_symbol_id uuid REFERENCES symbols(id) ON DELETE CASCADE,
    dependency_type text NOT NULL CHECK (dependency_type IN ('file_import', 'symbol_usage')),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- At least one of the dependency relationships must be defined
    CHECK (
        (from_file_id IS NOT NULL AND to_file_id IS NOT NULL) OR
        (from_symbol_id IS NOT NULL AND to_symbol_id IS NOT NULL)
    )
);

-- Indexes for efficient dependency queries
CREATE INDEX idx_dependency_graph_repository_id ON dependency_graph(repository_id);
CREATE INDEX idx_dependency_graph_from_file_id ON dependency_graph(from_file_id);
CREATE INDEX idx_dependency_graph_to_file_id ON dependency_graph(to_file_id);
CREATE INDEX idx_dependency_graph_from_symbol_id ON dependency_graph(from_symbol_id);
CREATE INDEX idx_dependency_graph_to_symbol_id ON dependency_graph(to_symbol_id);
CREATE INDEX idx_dependency_graph_type ON dependency_graph(dependency_type);

-- Composite index for "what depends on file X" queries
CREATE INDEX idx_dependency_graph_to_file_type ON dependency_graph(to_file_id, dependency_type);

-- Composite index for "what does file X depend on" queries
CREATE INDEX idx_dependency_graph_from_file_type ON dependency_graph(from_file_id, dependency_type);

-- RLS Policies: Users can only access dependency graphs for repos they own/access
ALTER TABLE dependency_graph ENABLE ROW LEVEL SECURITY;

CREATE POLICY dependency_graph_select ON dependency_graph
    FOR SELECT
    USING (
        repository_id IN (
            SELECT id FROM repositories
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            OR org_id IN (
                SELECT org_id FROM user_organizations
                WHERE user_id = (current_setting('app.user_id', true))::uuid
            )
        )
    );

CREATE POLICY dependency_graph_insert ON dependency_graph
    FOR INSERT
    WITH CHECK (
        repository_id IN (
            SELECT id FROM repositories
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            OR org_id IN (
                SELECT org_id FROM user_organizations
                WHERE user_id = (current_setting('app.user_id', true))::uuid
            )
        )
    );

CREATE POLICY dependency_graph_delete ON dependency_graph
    FOR DELETE
    USING (
        repository_id IN (
            SELECT id FROM repositories
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            OR org_id IN (
                SELECT org_id FROM user_organizations
                WHERE user_id = (current_setting('app.user_id', true))::uuid
                AND role IN ('owner', 'admin')
            )
        )
    );
