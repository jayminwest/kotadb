-- Rollback: 001_initial_schema
-- Description: Drop all tables created in initial schema migration
-- Author: Claude Code
-- Date: 2025-10-07

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS dependencies CASCADE;
DROP TABLE IF EXISTS references CASCADE;
DROP TABLE IF EXISTS symbols CASCADE;
DROP TABLE IF EXISTS indexed_files CASCADE;
DROP TABLE IF EXISTS index_jobs CASCADE;
DROP TABLE IF EXISTS repositories CASCADE;
DROP TABLE IF EXISTS rate_limit_counters CASCADE;
DROP TABLE IF EXISTS user_organizations CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;

-- Drop function
DROP FUNCTION IF EXISTS increment_rate_limit(text, integer);

-- Note: migrations table is preserved to track rollback history
