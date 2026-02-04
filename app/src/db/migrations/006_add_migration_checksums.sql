-- SQLite Migration: Add Checksum Tracking to Schema Migrations
--
-- Migration: 006_add_migration_checksums
-- Issue: #166 - Migration infrastructure
-- Author: Claude Code
-- Date: 2026-02-04
--
-- Adds checksum column to schema_migrations table for drift detection.
-- Existing migrations will have NULL checksums (validation skipped).

ALTER TABLE schema_migrations ADD COLUMN checksum TEXT;

CREATE INDEX IF NOT EXISTS idx_schema_migrations_name ON schema_migrations(name);

INSERT OR IGNORE INTO schema_migrations (name) VALUES ('006_add_migration_checksums');
