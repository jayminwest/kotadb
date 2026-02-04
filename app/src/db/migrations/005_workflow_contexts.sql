-- SQLite Migration: Workflow Context Accumulation
--
-- Migration: 005_workflow_contexts
-- Issue: #144 - ADW context accumulation for inter-phase handoffs
-- Author: Claude Code
-- Date: 2026-02-04
--
-- This migration adds workflow context storage for ADW automation,
-- enabling context accumulation between workflow phases (analysis -> plan -> build -> improve).
-- Context is stored in the main KotaDB database for future MCP tool integration.

-- ============================================================================
-- 1. Workflow Contexts Table
-- ============================================================================
-- Stores curated context data for each workflow phase

CREATE TABLE IF NOT EXISTS workflow_contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id TEXT NOT NULL,           -- 'adw-123-20260204T120000'
    phase TEXT NOT NULL,                 -- 'analysis' | 'plan' | 'build' | 'improve'
    context_data TEXT NOT NULL,          -- JSON blob
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    UNIQUE(workflow_id, phase),
    CHECK (phase IN ('analysis', 'plan', 'build', 'improve'))
);

-- Index for workflow-scoped queries (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_workflow_contexts_workflow_id 
ON workflow_contexts(workflow_id);

-- Index for time-based queries (debugging/monitoring)
CREATE INDEX IF NOT EXISTS idx_workflow_contexts_created_at 
ON workflow_contexts(created_at DESC);

-- ============================================================================
-- 2. Record Migration
-- ============================================================================

INSERT OR IGNORE INTO schema_migrations (name) VALUES ('005_workflow_contexts');
