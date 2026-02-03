/**
 * Metrics storage using SQLite for workflow tracking
 */
import { Database } from "bun:sqlite";
import { join, dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

export interface WorkflowMetrics {
  id?: number;
  issue_number: number;
  started_at: string;
  completed_at: string | null;
  success: boolean;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  pr_url: string | null;
  error_message: string | null;
  session_id: string | null;
}

let db: Database | null = null;

function getDbPath(): string {
  const dataDir = join(dirname(import.meta.dir), ".data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return join(dataDir, "metrics.db");
}

function getDb(): Database {
  if (!db) {
    const dbPath = getDbPath();
    db = new Database(dbPath);
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS workflow_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_number INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost_usd REAL NOT NULL DEFAULT 0,
      pr_url TEXT,
      error_message TEXT,
      session_id TEXT
    )
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_workflow_metrics_issue 
    ON workflow_metrics(issue_number)
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_workflow_metrics_started 
    ON workflow_metrics(started_at DESC)
  `);
}

export function recordMetrics(metrics: WorkflowMetrics): number {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO workflow_metrics (
      issue_number, started_at, completed_at, success, duration_ms,
      input_tokens, output_tokens, total_cost_usd, pr_url, error_message, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    metrics.issue_number,
    metrics.started_at,
    metrics.completed_at,
    metrics.success ? 1 : 0,
    metrics.duration_ms,
    metrics.input_tokens,
    metrics.output_tokens,
    metrics.total_cost_usd,
    metrics.pr_url,
    metrics.error_message,
    metrics.session_id
  );

  return Number(result.lastInsertRowid);
}

export interface RecentMetricsResult {
  id: number;
  issue_number: number;
  started_at: string;
  completed_at: string | null;
  success: number;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  pr_url: string | null;
  error_message: string | null;
  session_id: string | null;
}

export function getRecentMetrics(limit = 10): RecentMetricsResult[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT * FROM workflow_metrics 
    ORDER BY started_at DESC 
    LIMIT ?
  `);
  return stmt.all(limit) as RecentMetricsResult[];
}

export function closeMetricsDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
