-- Add missing UPDATE policy for index_jobs table
-- This policy allows users to update jobs for repositories they own or have access to
-- USING clause: determines which existing rows can be selected for UPDATE
-- WITH CHECK clause: validates the new values after update (usually same as USING for UPDATE)

CREATE POLICY index_jobs_update ON index_jobs
    FOR UPDATE
    USING (
        repository_id IN (
            SELECT id FROM repositories
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            OR org_id IN (
                SELECT org_id FROM user_organizations
                WHERE user_id = (current_setting('app.user_id', true))::uuid
            )
        )
    )
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
