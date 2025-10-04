import type { Database } from "bun:sqlite";
import type { IndexRequest, IndexedFile } from "@shared/index";

export interface SearchOptions {
  projectRoot?: string;
  limit?: number;
}

export function recordIndexRun(db: Database, request: IndexRequest, status = "pending"): number {
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

export function saveIndexedFiles(db: Database, files: IndexedFile[]): number {
  if (files.length === 0) {
    return 0;
  }

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

export function searchFiles(db: Database, term: string, options: SearchOptions = {}) {
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

export function listRecentFiles(db: Database, limit = 10): IndexedFile[] {
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
