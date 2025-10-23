-- Migration: Add installation_id to repositories table
-- Issue: #259 - GitHub App installation token generation
-- Description: Adds installation_id column to repositories table for GitHub App authentication

-- Add installation_id column to repositories table
ALTER TABLE repositories
ADD COLUMN installation_id INTEGER;

-- Create index for efficient lookup by installation_id
CREATE INDEX idx_repositories_installation_id ON repositories(installation_id);

-- Add column comment for documentation
COMMENT ON COLUMN repositories.installation_id IS 'GitHub App installation ID for private repository access. NULL for public repositories or unauthenticated cloning.';
