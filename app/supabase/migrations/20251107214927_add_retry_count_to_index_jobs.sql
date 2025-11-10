-- Add retry_count column to index_jobs table for observability
ALTER TABLE index_jobs ADD COLUMN retry_count integer DEFAULT 0 NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN index_jobs.retry_count IS 'Number of retry attempts for this job (incremented by pg-boss on retry)';
