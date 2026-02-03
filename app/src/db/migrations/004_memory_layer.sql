-- SQLite Migration: Memory Layer Schema Extensions
--
-- Migration: 004_memory_layer
-- Issue: Memory Layer for Agent Intelligence
-- Author: Claude Code
-- Date: 2026-02-03
--
-- This migration extends the memory layer tables with additional schema:
-- - decisions: Add status column (active, superseded, deprecated)
-- - failed_approaches: Alternative to failures with clearer naming
-- - pattern_annotations: Enhanced patterns with evidence/confidence scoring
-- - agent_sessions: Track agent work sessions
-- - session_insights: Insights linked to sessions with file references
--
-- Note: The base sqlite-schema.sql already has decisions, failures, patterns,
-- and insights tables. This migration adds enhanced versions and the missing
-- agent_sessions table for complete session tracking.

-- ============================================================================
-- 1. Extend Decisions Table - Add status column
-- ============================================================================
-- Add status column to track decision lifecycle

ALTER TABLE decisions ADD COLUMN status TEXT DEFAULT 'active';

-- Add index for active decisions (most common query)
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status) WHERE status = 'active';

-- ============================================================================
-- 2. Failed Approaches Table (alternative to failures with clearer naming)
-- ============================================================================
-- Tracks what didn't work to prevent repeating mistakes

CREATE TABLE IF NOT EXISTS failed_approaches (
    id TEXT PRIMARY KEY,                         -- uuid → TEXT
    repository_id TEXT NOT NULL,                 -- Foreign key to repositories
    title TEXT NOT NULL,                         -- Short description
    problem TEXT NOT NULL,                       -- What problem was being solved
    approach TEXT NOT NULL,                      -- What was tried
    failure_reason TEXT NOT NULL,                -- Why it failed
    related_files TEXT,                          -- JSON array of related file paths
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_failed_approaches_repository_id ON failed_approaches(repository_id);
CREATE INDEX IF NOT EXISTS idx_failed_approaches_created_at ON failed_approaches(created_at DESC);

-- ============================================================================
-- 3. Failed Approaches FTS5 Virtual Table
-- ============================================================================
-- External content FTS5 for searching failed approaches

CREATE VIRTUAL TABLE IF NOT EXISTS failed_approaches_fts USING fts5(
    title,
    problem,
    approach,
    failure_reason,
    content='failed_approaches',
    content_rowid='rowid'
);

-- ============================================================================
-- 4. Failed Approaches FTS5 Sync Triggers
-- ============================================================================

-- After INSERT: Add new failed approach to FTS index
CREATE TRIGGER IF NOT EXISTS failed_approaches_fts_ai 
AFTER INSERT ON failed_approaches 
BEGIN
    INSERT INTO failed_approaches_fts(rowid, title, problem, approach, failure_reason) 
    VALUES (new.rowid, new.title, new.problem, new.approach, new.failure_reason);
END;

-- After DELETE: Remove failed approach from FTS index
CREATE TRIGGER IF NOT EXISTS failed_approaches_fts_ad 
AFTER DELETE ON failed_approaches 
BEGIN
    INSERT INTO failed_approaches_fts(failed_approaches_fts, rowid, title, problem, approach, failure_reason) 
    VALUES ('delete', old.rowid, old.title, old.problem, old.approach, old.failure_reason);
END;

-- After UPDATE: Update failed approach in FTS index (delete old, insert new)
CREATE TRIGGER IF NOT EXISTS failed_approaches_fts_au 
AFTER UPDATE ON failed_approaches 
BEGIN
    INSERT INTO failed_approaches_fts(failed_approaches_fts, rowid, title, problem, approach, failure_reason) 
    VALUES ('delete', old.rowid, old.title, old.problem, old.approach, old.failure_reason);
    INSERT INTO failed_approaches_fts(rowid, title, problem, approach, failure_reason) 
    VALUES (new.rowid, new.title, new.problem, new.approach, new.failure_reason);
END;

-- ============================================================================
-- 5. Pattern Annotations Table
-- ============================================================================
-- Enhanced pattern detection with evidence counting and confidence scoring

CREATE TABLE IF NOT EXISTS pattern_annotations (
    id TEXT PRIMARY KEY,                         -- uuid → TEXT
    repository_id TEXT NOT NULL,                 -- Foreign key to repositories
    pattern_type TEXT NOT NULL,                  -- Pattern category (logging, error-handling, testing, etc.)
    pattern_name TEXT NOT NULL,                  -- Pattern identifier
    description TEXT NOT NULL,                   -- Human-readable description
    example_code TEXT,                           -- Code example (optional)
    evidence_count INTEGER NOT NULL DEFAULT 1,   -- Number of occurrences found
    confidence REAL NOT NULL DEFAULT 1.0,        -- Confidence score (0.0-1.0)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
    CHECK (evidence_count >= 1)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pattern_annotations_repository_id ON pattern_annotations(repository_id);
CREATE INDEX IF NOT EXISTS idx_pattern_annotations_pattern_type ON pattern_annotations(pattern_type);
CREATE INDEX IF NOT EXISTS idx_pattern_annotations_confidence ON pattern_annotations(confidence DESC);
-- Composite index for high-confidence patterns by type
CREATE INDEX IF NOT EXISTS idx_pattern_annotations_type_confidence 
ON pattern_annotations(repository_id, pattern_type, confidence DESC);

-- ============================================================================
-- 6. Agent Sessions Table
-- ============================================================================
-- Tracks agent work sessions for learning and analysis

CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,                         -- uuid → TEXT
    repository_id TEXT NOT NULL,                 -- Foreign key to repositories
    agent_type TEXT,                             -- Type of agent (plan, build, improve, etc.)
    task_summary TEXT,                           -- What the agent was working on
    outcome TEXT,                                -- Session outcome
    files_modified TEXT,                         -- JSON array of modified file paths
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,                               -- NULL if session is ongoing
    
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    
    CHECK (outcome IS NULL OR outcome IN ('success', 'failure', 'partial'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agent_sessions_repository_id ON agent_sessions(repository_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_type ON agent_sessions(agent_type) WHERE agent_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_outcome ON agent_sessions(outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_sessions_started_at ON agent_sessions(started_at DESC);
-- Partial index for ongoing sessions
CREATE INDEX IF NOT EXISTS idx_agent_sessions_ongoing ON agent_sessions(repository_id) WHERE ended_at IS NULL;

-- ============================================================================
-- 7. Session Insights Table
-- ============================================================================
-- Insights discovered during agent sessions with proper foreign keys

CREATE TABLE IF NOT EXISTS session_insights (
    id TEXT PRIMARY KEY,                         -- uuid → TEXT
    session_id TEXT NOT NULL,                    -- Foreign key to agent_sessions
    insight_type TEXT NOT NULL,                  -- Type of insight
    content TEXT NOT NULL,                       -- The insight content
    related_file_id TEXT,                        -- Optional reference to indexed_files
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (related_file_id) REFERENCES indexed_files(id) ON DELETE SET NULL,
    
    CHECK (insight_type IN ('discovery', 'failure', 'workaround'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_session_insights_session_id ON session_insights(session_id);
CREATE INDEX IF NOT EXISTS idx_session_insights_insight_type ON session_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_session_insights_related_file ON session_insights(related_file_id) 
WHERE related_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_insights_created_at ON session_insights(created_at DESC);

-- ============================================================================
-- 8. Record Migration
-- ============================================================================

INSERT OR IGNORE INTO schema_migrations (name) VALUES ('004_memory_layer');
