-- Test Migration: 000_test_auth_schema
-- Description: Ensure auth.users table exists for testing
-- In Supabase Local, the auth schema is created and managed by gotrue service
-- This migration verifies the auth.users table is available

-- Note: Supabase Local automatically creates auth schema and auth.users table
-- via gotrue service. This migration is a no-op in Supabase Local environments.
-- For non-Supabase PostgreSQL (legacy), it creates a minimal auth.users table.

-- Check if auth.users already exists (it should in Supabase Local)
-- Only create if missing (backward compatibility with non-Supabase test setups)
DO $$
BEGIN
    -- Create auth schema only if it doesn't exist
    CREATE SCHEMA IF NOT EXISTS auth;

    -- Check if auth.users table exists
    IF NOT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'auth' AND tablename = 'users'
    ) THEN
        -- Create minimal auth.users table (only runs in non-Supabase environments)
        CREATE TABLE auth.users (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            email text UNIQUE,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            metadata jsonb DEFAULT '{}'::jsonb
        );

        CREATE INDEX idx_auth_users_email ON auth.users(email);
    END IF;
EXCEPTION
    WHEN insufficient_privilege THEN
        -- Supabase Local: auth schema exists and is managed by gotrue
        -- This is expected - auth.users table is already present
        RAISE NOTICE 'auth schema managed by Supabase - skipping table creation';
END$$;

-- Note: Migration tracking is handled by the initial_schema migration
-- which creates the migrations table. This early migration cannot
-- record itself because the migrations table doesn't exist yet.
