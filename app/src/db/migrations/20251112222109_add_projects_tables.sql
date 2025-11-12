-- Migration: add_projects_tables
-- Description: Create projects and project_repositories tables for multi-repo grouping
-- Author: Claude Code
-- Date: 2025-11-12

-- ============================================================================
-- Projects Management
-- ============================================================================

CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    CHECK ((user_id IS NOT NULL AND org_id IS NULL) OR (user_id IS NULL AND org_id IS NOT NULL))
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_org_id ON projects(org_id);
CREATE UNIQUE INDEX idx_projects_user_name ON projects(user_id, name) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_projects_org_name ON projects(org_id, name) WHERE org_id IS NOT NULL;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select ON projects
    FOR SELECT
    USING (
        user_id = (current_setting('app.user_id', true))::uuid
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
        )
    );

CREATE POLICY projects_insert ON projects
    FOR INSERT
    WITH CHECK (
        user_id = (current_setting('app.user_id', true))::uuid
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
        )
    );

CREATE POLICY projects_update ON projects
    FOR UPDATE
    USING (
        user_id = (current_setting('app.user_id', true))::uuid
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY projects_delete ON projects
    FOR DELETE
    USING (
        user_id = (current_setting('app.user_id', true))::uuid
        OR org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            AND role IN ('owner', 'admin')
        )
    );

-- ============================================================================
-- Project Repositories Association
-- ============================================================================

CREATE TABLE project_repositories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    added_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id, repository_id)
);

CREATE INDEX idx_project_repositories_project_id ON project_repositories(project_id);
CREATE INDEX idx_project_repositories_repository_id ON project_repositories(repository_id);

ALTER TABLE project_repositories ENABLE ROW LEVEL SECURITY;

-- Allow access to project_repositories if user can access the project
CREATE POLICY project_repositories_select ON project_repositories
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM projects
            WHERE user_id = (current_setting('app.user_id', true))::uuid
               OR org_id IN (
                   SELECT org_id FROM user_organizations
                   WHERE user_id = (current_setting('app.user_id', true))::uuid
               )
        )
    );

CREATE POLICY project_repositories_insert ON project_repositories
    FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT id FROM projects
            WHERE user_id = (current_setting('app.user_id', true))::uuid
               OR org_id IN (
                   SELECT org_id FROM user_organizations
                   WHERE user_id = (current_setting('app.user_id', true))::uuid
               )
        )
        AND repository_id IN (
            SELECT id FROM repositories
            WHERE user_id = (current_setting('app.user_id', true))::uuid
               OR org_id IN (
                   SELECT org_id FROM user_organizations
                   WHERE user_id = (current_setting('app.user_id', true))::uuid
               )
        )
    );

CREATE POLICY project_repositories_delete ON project_repositories
    FOR DELETE
    USING (
        project_id IN (
            SELECT id FROM projects
            WHERE user_id = (current_setting('app.user_id', true))::uuid
               OR org_id IN (
                   SELECT org_id FROM user_organizations
                   WHERE user_id = (current_setting('app.user_id', true))::uuid
                   AND role IN ('owner', 'admin')
               )
        )
    );
