import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";

const DEFAULT_DB_PATH = process.env.KOTA_DB_PATH ?? "data/kotadb.sqlite";

export interface OpenDatabaseResult {
  db: Database;
  path: string;
}

export function openDatabase(filePath: string = DEFAULT_DB_PATH): OpenDatabaseResult {
  const absolutePath = resolve(filePath);
  const directory = dirname(absolutePath);

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  const db = new Database(absolutePath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  return { db, path: absolutePath };
}

export function ensureSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_root TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      dependencies TEXT NOT NULL DEFAULT '[]',
      indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_root, path)
    );

    CREATE INDEX IF NOT EXISTS idx_files_project_path
      ON files (project_root, path);

    CREATE TABLE IF NOT EXISTS index_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repository TEXT NOT NULL,
      ref TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
