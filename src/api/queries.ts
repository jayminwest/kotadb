import type { Database } from "bun:sqlite";
import type { IndexRequest, IndexedFile } from "@shared/index";

export interface SearchOptions {
  projectRoot?: string;
  limit?: number;
}

/**
 * Record a new index run for a repository.
 *
 * @param db - SQLite database instance
 * @param request - Index request details
 * @param userId - User UUID for RLS context (will be enforced when migrated to Supabase)
 * @param status - Initial status (default: "pending")
 * @returns Index run ID
 */
export function recordIndexRun(
  db: Database,
  request: IndexRequest,
  userId: string,
  status = "pending"
): number {
  // TODO: Set RLS context when migrated to Supabase
  // For now, userId is accepted but not used in SQLite
  const statement = db.prepare(
    `INSERT INTO index_runs (repository, ref, status)
     VALUES (?, ?, ?)`
  );

  const result = statement.run(request.repository, request.ref ?? null, status);
  return Number(result.lastInsertRowid);
}

export function updateIndexRunStatus(db: Database, id: number, status: string): void {
  const statement = db.prepare(
    `UPDATE index_runs
       SET status = ?,
           updated_at = datetime('now')
     WHERE id = ?`
  );

  statement.run(status, id);
}

/**
 * Save indexed files to database.
 *
 * @param db - SQLite database instance
 * @param files - Array of indexed files
 * @param userId - User UUID for RLS context (will be enforced when migrated to Supabase)
 * @returns Number of files saved
 */
export function saveIndexedFiles(db: Database, files: IndexedFile[], userId: string): number {
  if (files.length === 0) {
    return 0;
  }

  // TODO: Set RLS context when migrated to Supabase
  // For now, userId is accepted but not used in SQLite

  const insert = db.prepare(
    `INSERT INTO files (project_root, path, content, dependencies, indexed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_root, path) DO UPDATE SET
       content = excluded.content,
       dependencies = excluded.dependencies,
       indexed_at = excluded.indexed_at`
  );

  const run = db.transaction((batch: IndexedFile[]) => {
    for (const file of batch) {
      insert.run(
        file.projectRoot,
        file.path,
        file.content,
        JSON.stringify(file.dependencies),
        file.indexedAt.toISOString()
      );
    }
  });

  run(files);
  return files.length;
}

/**
 * Search indexed files by content term.
 *
 * @param db - SQLite database instance
 * @param term - Search term to match in file content
 * @param userId - User UUID for RLS context (will be enforced when migrated to Supabase)
 * @param options - Search options (projectRoot filter, limit)
 * @returns Array of matching indexed files
 */
export function searchFiles(
  db: Database,
  term: string,
  userId: string,
  options: SearchOptions = {}
) {
  // TODO: Set RLS context when migrated to Supabase
  // For now, userId is accepted but not used in SQLite

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const conditions: string[] = [];
  const parameters: Array<string | number> = [];

  conditions.push("content LIKE ?");
  parameters.push(`%${term}%`);

  if (options.projectRoot) {
    conditions.push("project_root = ?");
    parameters.push(options.projectRoot);
  }

  const statement = db.prepare(
    `SELECT project_root, path, content, dependencies, indexed_at
       FROM files
      WHERE ${conditions.join(" AND ")}
      ORDER BY indexed_at DESC
      LIMIT ?`
  );

  parameters.push(limit);

  const rows = statement.all(...parameters) as Array<{
    project_root: string;
    path: string;
    content: string;
    dependencies: string;
    indexed_at: string;
  }>;

  return rows.map((row) => ({
    projectRoot: row.project_root,
    path: row.path,
    content: row.content,
    dependencies: JSON.parse(row.dependencies) as string[],
    indexedAt: new Date(row.indexed_at)
  }));
}

/**
 * List recently indexed files.
 *
 * @param db - SQLite database instance
 * @param limit - Maximum number of files to return
 * @param userId - User UUID for RLS context (will be enforced when migrated to Supabase)
 * @returns Array of recently indexed files
 */
export function listRecentFiles(db: Database, limit: number, userId: string): IndexedFile[] {
  // TODO: Set RLS context when migrated to Supabase
  // For now, userId is accepted but not used in SQLite

  const statement = db.prepare(
    `SELECT project_root, path, content, dependencies, indexed_at
       FROM files
      ORDER BY indexed_at DESC
      LIMIT ?`
  );

  const rows = statement.all(limit) as Array<{
    project_root: string;
    path: string;
    content: string;
    dependencies: string;
    indexed_at: string;
  }>;

  return rows.map((row) => ({
    projectRoot: row.project_root,
    path: row.path,
    content: row.content,
    dependencies: JSON.parse(row.dependencies) as string[],
    indexedAt: new Date(row.indexed_at)
  }));
}
