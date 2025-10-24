-- Migration: Add job tracking columns to index_jobs table
-- Epic: #234 (Job Queue & Background Processing)
-- Issue: #236 (Job Status Tracking)
--
-- This migration adds columns to correlate index_jobs with pg-boss queue jobs
-- and capture git commit SHA for job context tracking.
--
-- queue_job_id: UUID reference to pg-boss job ID (nullable until #235 integration)
-- commit_sha: Git commit SHA for tracking which code version was indexed

-- Add queue_job_id column for pg-boss correlation
ALTER TABLE index_jobs ADD COLUMN IF NOT EXISTS queue_job_id uuid;

-- Add commit_sha column for job context tracking
ALTER TABLE index_jobs ADD COLUMN IF NOT EXISTS commit_sha text;

-- Update status constraint to include 'processing' status (replaces 'running')
ALTER TABLE index_jobs DROP CONSTRAINT IF EXISTS index_jobs_status_check;
ALTER TABLE index_jobs ADD CONSTRAINT index_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped'));

-- Create index on queue_job_id for fast lookups by pg-boss job ID
CREATE INDEX IF NOT EXISTS idx_index_jobs_queue_job_id ON index_jobs(queue_job_id);
