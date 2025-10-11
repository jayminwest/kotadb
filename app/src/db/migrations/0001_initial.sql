-- 0001_initial.sql
-- Record of the bootstrap schema for KotaDB. Future schema changes should
-- append new numbered files in this directory.

CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
