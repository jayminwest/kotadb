-- Add GIN index for full-text search on indexed_files.content
-- This migration optimizes the search query to use PostgreSQL's full-text search
-- capabilities instead of ILIKE pattern matching.

CREATE INDEX IF NOT EXISTS idx_indexed_files_content_fts
ON indexed_files
USING GIN (to_tsvector('english', content));
