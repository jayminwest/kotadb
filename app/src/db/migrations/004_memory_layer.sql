-- SQLite Migration: Memory Layer Schema Extensions
--
-- Migration: 004_memory_layer
-- Issue: Memory Layer for Agent Intelligence
-- Author: Claude Code
-- Date: 2026-02-03 (UPDATED: 2026-02-04)
--
-- This migration extends the memory layer with:
-- - decisions.status column (active, superseded, deprecated)
-- - agent_sessions table for tracking agent work
--
-- Note: The base sqlite-schema.sql already has decisions, failures, patterns,
-- and insights tables. This migration only adds what's missing.

-- ============================================================================
-- 1. Extend Decisions Table - Add status column
-- ============================================================================
-- Add status column to track decision lifecycle
-- Note: SQLite ALTER TABLE ADD COLUMN will fail if column exists,
-- which is the expected behavior (migration already applied)

ALTER TABLE decisions ADD COLUMN status TEXT DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status) WHERE status = 'active';

-- ============================================================================
-- 2. Agent Sessions Table
-- ============================================================================
-- Tracks agent work sessions for learning and analysis

CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    agent_type TEXT,
    task_summary TEXT,
    outcome TEXT,
    files_modified TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    CHECK (outcome IS NULL OR outcome IN ('success', 'failure', 'partial'))
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_repository_id ON agent_sessions(repository_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_type ON agent_sessions(agent_type) WHERE agent_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_outcome ON agent_sessions(outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_started_at ON agent_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_ongoing ON agent_sessions(repository_id) WHERE ended_at IS NULL;

-- ============================================================================
-- 3. Record Migration
-- ============================================================================

INSERT OR IGNORE INTO schema_migrations (name) VALUES ('004_memory_layer');
