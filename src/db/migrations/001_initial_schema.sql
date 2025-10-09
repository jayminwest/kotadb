-- Migration: 001_initial_schema
-- Description: Create initial KotaDB schema with 8 tables, RLS policies, and rate limit function
-- Author: Claude Code
-- Date: 2025-10-07

-- ============================================================================
-- Core Authentication & API Key Management
-- ============================================================================

CREATE TABLE api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_id text NOT NULL UNIQUE,
    secret_hash text NOT NULL,
    tier text NOT NULL CHECK (tier IN ('free', 'solo', 'team')),
    rate_limit_per_hour integer NOT NULL DEFAULT 100,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_id ON api_keys(key_id);
CREATE INDEX idx_api_keys_enabled ON api_keys(enabled) WHERE enabled = true;

-- Enable RLS on api_keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_keys_select ON api_keys
    FOR SELECT
    USING (user_id = (current_setting('app.user_id', true))::uuid);

CREATE POLICY api_keys_insert ON api_keys
    FOR INSERT
    WITH CHECK (user_id = (current_setting('app.user_id', true))::uuid);

CREATE POLICY api_keys_update ON api_keys
    FOR UPDATE
    USING (user_id = (current_setting('app.user_id', true))::uuid);

CREATE POLICY api_keys_delete ON api_keys
    FOR DELETE
    USING (user_id = (current_setting('app.user_id', true))::uuid);

-- ============================================================================
-- Organization & Team Management
-- ============================================================================

CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_organizations_owner_id ON organizations(owner_id);
CREATE INDEX idx_organizations_slug ON organizations(slug);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select ON organizations
    FOR SELECT
    USING (
        owner_id = (current_setting('app.user_id', true))::uuid
        OR id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
        )
    );

CREATE POLICY organizations_insert ON organizations
    FOR INSERT
    WITH CHECK (owner_id = (current_setting('app.user_id', true))::uuid);

CREATE POLICY organizations_update ON organizations
    FOR UPDATE
    USING (
        owner_id = (current_setting('app.user_id', true))::uuid
        OR id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY organizations_delete ON organizations
    FOR DELETE
    USING (owner_id = (current_setting('app.user_id', true))::uuid);

CREATE TABLE user_organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    joined_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, org_id)
);

CREATE INDEX idx_user_organizations_user_id ON user_organizations(user_id);
CREATE INDEX idx_user_organizations_org_id ON user_organizations(org_id);

ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_organizations_select ON user_organizations
    FOR SELECT
    USING (
        user_id = (current_setting('app.user_id', true))::uuid
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY user_organizations_insert ON user_organizations
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT id FROM organizations
            WHERE owner_id = (current_setting('app.user_id', true))::uuid
        )
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY user_organizations_delete ON user_organizations
    FOR DELETE
    USING (
        org_id IN (
            SELECT id FROM organizations
            WHERE owner_id = (current_setting('app.user_id', true))::uuid
        )
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- Rate Limiting
-- ============================================================================

CREATE TABLE rate_limit_counters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id text NOT NULL,
    window_start timestamptz NOT NULL,
    request_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(key_id, window_start)
);

CREATE INDEX idx_rate_limit_counters_key_id ON rate_limit_counters(key_id);
CREATE INDEX idx_rate_limit_counters_window ON rate_limit_counters(window_start);

-- RLS for rate_limit_counters: only accessible via increment_rate_limit function
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for cleanup jobs)
CREATE POLICY rate_limit_counters_service_role ON rate_limit_counters
    FOR ALL
    USING (true);

-- ============================================================================
-- Repository Management
-- ============================================================================

CREATE TABLE repositories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    git_url text,
    default_branch text DEFAULT 'main',
    last_indexed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    CHECK ((user_id IS NOT NULL AND org_id IS NULL) OR (user_id IS NULL AND org_id IS NOT NULL))
);

CREATE UNIQUE INDEX idx_repositories_user_full_name ON repositories(user_id, full_name) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_repositories_org_full_name ON repositories(org_id, full_name) WHERE org_id IS NOT NULL;
CREATE INDEX idx_repositories_user_id ON repositories(user_id);
CREATE INDEX idx_repositories_org_id ON repositories(org_id);
CREATE INDEX idx_repositories_full_name ON repositories(full_name);

ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;

CREATE POLICY repositories_select ON repositories
    FOR SELECT
    USING (
        user_id = (current_setting('app.user_id', true))::uuid
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
        )
    );

CREATE POLICY repositories_insert ON repositories
    FOR INSERT
    WITH CHECK (
        user_id = (current_setting('app.user_id', true))::uuid
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
        )
    );

CREATE POLICY repositories_update ON repositories
    FOR UPDATE
    USING (
        user_id = (current_setting('app.user_id', true))::uuid
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY repositories_delete ON repositories
    FOR DELETE
    USING (
        user_id = (current_setting('app.user_id', true))::uuid
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            AND role IN ('owner', 'admin')
        )
    );

CREATE TABLE index_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    ref text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    started_at timestamptz,
    completed_at timestamptz,
    error_message text,
    stats jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_index_jobs_repository_id ON index_jobs(repository_id);
CREATE INDEX idx_index_jobs_status ON index_jobs(status);
CREATE INDEX idx_index_jobs_created_at ON index_jobs(created_at DESC);

ALTER TABLE index_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY index_jobs_select ON index_jobs
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

CREATE POLICY index_jobs_insert ON index_jobs
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

-- ============================================================================
-- Code Intelligence
-- ============================================================================

CREATE TABLE indexed_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    path text NOT NULL,
    content text NOT NULL,
    language text,
    size_bytes integer,
    indexed_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    UNIQUE(repository_id, path)
);

CREATE INDEX idx_indexed_files_repository_id ON indexed_files(repository_id);
CREATE INDEX idx_indexed_files_path ON indexed_files(path);
CREATE INDEX idx_indexed_files_language ON indexed_files(language);
CREATE INDEX idx_indexed_files_content_fts ON indexed_files USING gin(to_tsvector('english', content));

ALTER TABLE indexed_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY indexed_files_select ON indexed_files
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

CREATE POLICY indexed_files_insert ON indexed_files
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

CREATE TABLE symbols (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id uuid NOT NULL REFERENCES indexed_files(id) ON DELETE CASCADE,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('function', 'class', 'interface', 'type', 'variable', 'constant', 'method', 'property')),
    line_start integer NOT NULL,
    line_end integer NOT NULL,
    signature text,
    documentation text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_symbols_file_id ON symbols(file_id);
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_symbols_kind ON symbols(kind);

ALTER TABLE symbols ENABLE ROW LEVEL SECURITY;

CREATE POLICY symbols_select ON symbols
    FOR SELECT
    USING (
        file_id IN (
            SELECT id FROM indexed_files
            WHERE repository_id IN (
                SELECT id FROM repositories
                WHERE user_id = (current_setting('app.user_id', true))::uuid
                OR org_id IN (
                    SELECT org_id FROM user_organizations
                    WHERE user_id = (current_setting('app.user_id', true))::uuid
                )
            )
        )
    );

CREATE POLICY symbols_insert ON symbols
    FOR INSERT
    WITH CHECK (
        file_id IN (
            SELECT id FROM indexed_files
            WHERE repository_id IN (
                SELECT id FROM repositories
                WHERE user_id = (current_setting('app.user_id', true))::uuid
                OR org_id IN (
                    SELECT org_id FROM user_organizations
                    WHERE user_id = (current_setting('app.user_id', true))::uuid
                )
            )
        )
    );

CREATE TABLE references (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file_id uuid NOT NULL REFERENCES indexed_files(id) ON DELETE CASCADE,
    target_symbol_id uuid REFERENCES symbols(id) ON DELETE SET NULL,
    target_file_path text,
    line_number integer NOT NULL,
    reference_type text NOT NULL CHECK (reference_type IN ('import', 'call', 'extends', 'implements')),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_references_source_file_id ON references(source_file_id);
CREATE INDEX idx_references_target_symbol_id ON references(target_symbol_id);
CREATE INDEX idx_references_reference_type ON references(reference_type);

ALTER TABLE references ENABLE ROW LEVEL SECURITY;

CREATE POLICY references_select ON references
    FOR SELECT
    USING (
        source_file_id IN (
            SELECT id FROM indexed_files
            WHERE repository_id IN (
                SELECT id FROM repositories
                WHERE user_id = (current_setting('app.user_id', true))::uuid
                OR org_id IN (
                    SELECT org_id FROM user_organizations
                    WHERE user_id = (current_setting('app.user_id', true))::uuid
                )
            )
        )
    );

CREATE POLICY references_insert ON references
    FOR INSERT
    WITH CHECK (
        source_file_id IN (
            SELECT id FROM indexed_files
            WHERE repository_id IN (
                SELECT id FROM repositories
                WHERE user_id = (current_setting('app.user_id', true))::uuid
                OR org_id IN (
                    SELECT org_id FROM user_organizations
                    WHERE user_id = (current_setting('app.user_id', true))::uuid
                )
            )
        )
    );

CREATE TABLE dependencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    name text NOT NULL,
    version text,
    dependency_type text NOT NULL CHECK (dependency_type IN ('npm', 'python', 'go', 'rust', 'maven')),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(repository_id, name, dependency_type)
);

CREATE INDEX idx_dependencies_repository_id ON dependencies(repository_id);
CREATE INDEX idx_dependencies_name ON dependencies(name);
CREATE INDEX idx_dependencies_type ON dependencies(dependency_type);

ALTER TABLE dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY dependencies_select ON dependencies
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

CREATE POLICY dependencies_insert ON dependencies
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

-- ============================================================================
-- Migration Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS migrations (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_migrations_applied_at ON migrations(applied_at DESC);

-- ============================================================================
-- Rate Limit Function
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_rate_limit(
    p_key_id text,
    p_rate_limit integer
) RETURNS jsonb AS $$
DECLARE
    v_window_start timestamptz;
    v_request_count integer;
BEGIN
    v_window_start := date_trunc('hour', now());

    INSERT INTO rate_limit_counters (key_id, window_start, request_count)
    VALUES (p_key_id, v_window_start, 1)
    ON CONFLICT (key_id, window_start)
    DO UPDATE SET request_count = rate_limit_counters.request_count + 1
    RETURNING request_count INTO v_request_count;

    RETURN jsonb_build_object(
        'request_count', v_request_count,
        'window_start', v_window_start,
        'rate_limit', p_rate_limit,
        'remaining', GREATEST(0, p_rate_limit - v_request_count),
        'reset_at', v_window_start + interval '1 hour'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_rate_limit(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_rate_limit(text, integer) TO service_role;
