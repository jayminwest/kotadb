-- Migration 002: Create SQL views for common ADW observability queries
-- Provides convenient views for metrics analysis and debugging

-- Recent failures view - shows recent failed executions with error details
CREATE VIEW IF NOT EXISTS recent_failures AS
SELECT
    e.id AS execution_id,
    e.issue_id,
    i.title AS issue_title,
    e.phase,
    e.started_at,
    e.completed_at,
    e.error_message,
    e.worktree_name,
    e.branch_name
FROM adw_executions e
LEFT JOIN issues i ON e.issue_id = i.id
WHERE e.status = 'failed'
ORDER BY e.started_at DESC
LIMIT 50;

-- Stale checkpoints view - identifies checkpoints from incomplete workflows
CREATE VIEW IF NOT EXISTS stale_checkpoints AS
SELECT
    c.id AS checkpoint_id,
    c.execution_id,
    c.phase,
    c.checkpoint_name,
    c.created_at,
    e.status AS execution_status,
    e.started_at AS execution_started,
    CAST((julianday('now') - julianday(c.created_at)) * 24 AS INTEGER) AS age_hours
FROM adw_checkpoints c
JOIN adw_executions e ON c.execution_id = e.id
WHERE e.status IN ('pending', 'in_progress')
    AND age_hours > 24
ORDER BY c.created_at DESC;

-- Success rate by issue type view
CREATE VIEW IF NOT EXISTS success_rate_by_issue_type AS
SELECT
    i.issue_type,
    COUNT(*) AS total_executions,
    SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS successful,
    SUM(CASE WHEN e.status = 'failed' THEN 1 ELSE 0 END) AS failed,
    ROUND(
        SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
        2
    ) AS success_rate_pct
FROM adw_executions e
LEFT JOIN issues i ON e.issue_id = i.id
GROUP BY i.issue_type
ORDER BY total_executions DESC;

-- Phase progression funnel - tracks workflow completion through phases
CREATE VIEW IF NOT EXISTS phase_progression_funnel AS
SELECT
    'plan' AS phase,
    COUNT(DISTINCT CASE WHEN phase = 'plan' THEN id END) AS entered,
    COUNT(DISTINCT CASE WHEN phase = 'plan' AND status = 'completed' THEN id END) AS completed
FROM adw_executions
UNION ALL
SELECT
    'build' AS phase,
    COUNT(DISTINCT CASE WHEN phase = 'build' THEN id END) AS entered,
    COUNT(DISTINCT CASE WHEN phase = 'build' AND status = 'completed' THEN id END) AS completed
FROM adw_executions
UNION ALL
SELECT
    'review' AS phase,
    COUNT(DISTINCT CASE WHEN phase = 'review' THEN id END) AS entered,
    COUNT(DISTINCT CASE WHEN phase = 'review' AND status = 'completed' THEN id END) AS completed
FROM adw_executions;

-- Migration metadata
INSERT INTO schema_version (version, description, rollback_sql)
VALUES (
    '002',
    'Create SQL views for ADW observability queries',
    'DROP VIEW IF EXISTS phase_progression_funnel; DROP VIEW IF EXISTS success_rate_by_issue_type; DROP VIEW IF EXISTS stale_checkpoints; DROP VIEW IF EXISTS recent_failures;'
);
