-- Schema version tracking table for ADW database migrations
-- This table tracks which migrations have been applied to the beads database

CREATE TABLE IF NOT EXISTS schema_version (
    version TEXT PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    rollback_sql TEXT
);

-- Insert initial version marker
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('000', 'Schema version tracking initialization');
