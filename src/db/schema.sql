-- KotaDB Database Schema (PostgreSQL/Supabase)
-- This is a reference schema; actual migrations are in src/db/migrations/

-- ============================================================================
-- Core Authentication & API Key Management
-- ============================================================================

-- API Keys Table: Stores hashed API keys for authentication and rate limiting
-- Format: kota_<tier>_<key_id>_<secret>
CREATE TABLE api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_id text NOT NULL UNIQUE,  -- Public portion of key (16 hex chars)
    secret_hash text NOT NULL,     -- Bcrypt hash of secret (32 hex chars)
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

-- ============================================================================
-- Organization & Team Management
-- ============================================================================

-- Organizations Table: Team workspaces for multi-user collaboration
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

-- User-Organization Membership: Many-to-many with role-based access
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

-- ============================================================================
-- Rate Limiting
-- ============================================================================

-- Rate Limit Counters: Track API usage per key per hour
-- Note: No FK constraint on key_id to allow counters to persist after key deletion for auditing
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

-- ============================================================================
-- Repository Management
-- ============================================================================

-- Repositories Table: Git repositories owned by users or organizations
CREATE TABLE repositories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
    full_name text NOT NULL,  -- e.g., "owner/repo" or "org/repo"
    git_url text,
    default_branch text DEFAULT 'main',
    last_indexed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    -- Uniqueness enforced by partial indexes (see idx_repositories_user_full_name, idx_repositories_org_full_name)
    -- Cannot use UNIQUE constraints here because they fail when user_id or org_id is NULL
    CHECK ((user_id IS NOT NULL AND org_id IS NULL) OR (user_id IS NULL AND org_id IS NOT NULL))
);

CREATE UNIQUE INDEX idx_repositories_user_full_name ON repositories(user_id, full_name) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_repositories_org_full_name ON repositories(org_id, full_name) WHERE org_id IS NOT NULL;
CREATE INDEX idx_repositories_user_id ON repositories(user_id);
CREATE INDEX idx_repositories_org_id ON repositories(org_id);
CREATE INDEX idx_repositories_full_name ON repositories(full_name);

-- Index Jobs Table: Track indexing job status and statistics
CREATE TABLE index_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    ref text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    started_at timestamptz,
    completed_at timestamptz,
    error_message text,
    stats jsonb DEFAULT '{}'::jsonb,  -- { files_indexed: N, symbols_extracted: M, ... }
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_index_jobs_repository_id ON index_jobs(repository_id);
CREATE INDEX idx_index_jobs_status ON index_jobs(status);
CREATE INDEX idx_index_jobs_created_at ON index_jobs(created_at DESC);

-- ============================================================================
-- Code Intelligence
-- ============================================================================

-- Indexed Files Table: Source files extracted from repositories
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

-- Symbols Table: Functions, classes, types extracted from code
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

-- References Table: Cross-file symbol references (imports, calls)
CREATE TABLE references (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file_id uuid NOT NULL REFERENCES indexed_files(id) ON DELETE CASCADE,
    target_symbol_id uuid REFERENCES symbols(id) ON DELETE SET NULL,
    target_file_path text,  -- Fallback if symbol not extracted
    line_number integer NOT NULL,
    reference_type text NOT NULL CHECK (reference_type IN ('import', 'call', 'extends', 'implements')),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_references_source_file_id ON references(source_file_id);
CREATE INDEX idx_references_target_symbol_id ON references(target_symbol_id);
CREATE INDEX idx_references_reference_type ON references(reference_type);

-- Dependencies Table: Package/module dependencies
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

-- ============================================================================
-- Migration Tracking
-- ============================================================================

-- Migrations Table: Track applied schema migrations
CREATE TABLE migrations (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_migrations_applied_at ON migrations(applied_at DESC);
