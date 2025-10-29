-- Migration 001: Add ADW execution tracking tables
-- Creates tables for tracking ADW workflow executions and checkpoints
-- Links to beads issues table via foreign key for unified issue + execution tracking

-- ADW execution records table
-- Tracks workflow execution metadata with foreign key to beads issues
CREATE TABLE IF NOT EXISTS adw_executions (
    id TEXT PRIMARY KEY,                           -- ADW ID (e.g., abc-123)
    issue_id TEXT,                                 -- Beads issue ID (foreign key to issues table)
    phase TEXT NOT NULL,                           -- Current phase (plan, build, review)
    status TEXT NOT NULL DEFAULT 'pending',        -- Status (pending, in_progress, completed, failed)
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,                         -- NULL until workflow completes
    error_message TEXT,                            -- Error details for failed executions
    worktree_name TEXT,                            -- Worktree name for isolated execution
    worktree_path TEXT,                            -- Worktree absolute path
    branch_name TEXT,                              -- Git branch name
    pr_created BOOLEAN DEFAULT 0,                  -- Whether PR was created
    test_project_name TEXT,                        -- Test project identifier
    extra_data TEXT,                               -- JSON blob for additional metadata
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    CHECK (phase IN ('plan', 'build', 'review'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_executions_issue ON adw_executions(issue_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON adw_executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_phase ON adw_executions(phase);
CREATE INDEX IF NOT EXISTS idx_executions_started ON adw_executions(started_at);

-- ADW checkpoints table for recovery
-- Stores checkpoint data for workflow recovery after failures
CREATE TABLE IF NOT EXISTS adw_checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT NOT NULL,                    -- Foreign key to adw_executions
    phase TEXT NOT NULL,                           -- Phase when checkpoint created
    checkpoint_name TEXT NOT NULL,                 -- Checkpoint identifier
    checkpoint_data TEXT NOT NULL,                 -- JSON blob with checkpoint state
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES adw_executions(id) ON DELETE CASCADE,
    CHECK (phase IN ('plan', 'build', 'review'))
);

-- Indexes for checkpoint retrieval
CREATE INDEX IF NOT EXISTS idx_checkpoints_execution ON adw_checkpoints(execution_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_phase ON adw_checkpoints(phase);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON adw_checkpoints(created_at);

-- Migration metadata
INSERT INTO schema_version (version, description, rollback_sql)
VALUES (
    '001',
    'Add ADW execution and checkpoint tracking tables',
    'DROP TABLE IF EXISTS adw_checkpoints; DROP TABLE IF EXISTS adw_executions;'
);
