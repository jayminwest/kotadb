-- Migration: Add last_push_at to repositories table and deduplication index
-- Issue: #261 - Integrate GitHub webhooks with job queue for auto-indexing
-- Description: Adds last_push_at column to track webhook events and composite index for job deduplication

-- Add last_push_at column to repositories table
ALTER TABLE repositories
ADD COLUMN last_push_at TIMESTAMPTZ;

-- Add column comment for documentation
COMMENT ON COLUMN repositories.last_push_at IS 'Timestamp of the last push event received via webhook. Used to track repository activity and webhook delivery.';

-- Create composite index for efficient job deduplication queries
-- This index allows fast lookups of pending jobs for a specific repository and commit SHA
CREATE INDEX idx_index_jobs_dedup ON index_jobs(repository_id, commit_sha, status) WHERE status = 'pending';

-- Add comment for index documentation
COMMENT ON INDEX idx_index_jobs_dedup IS 'Partial index for fast deduplication of pending jobs by repository and commit SHA. Used by webhook processor to prevent duplicate job creation.';
