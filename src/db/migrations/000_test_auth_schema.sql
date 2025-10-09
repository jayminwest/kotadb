-- Test Migration: 000_test_auth_schema
-- Description: Create minimal auth schema for testing (mimics Supabase auth.users)
-- This file is only used in test environments, not in production Supabase

-- Create auth schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS auth;

-- Create minimal auth.users table for testing
-- In production, this is managed by Supabase Auth service
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth.users(email);

-- Record migration
INSERT INTO migrations (name) VALUES ('000_test_auth_schema')
ON CONFLICT (name) DO NOTHING;
