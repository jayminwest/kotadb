/**
 * Integration tests for Sync Layer - End-to-end sync workflow
 * 
 * Following antimocking philosophy: uses real SQLite databases and file system
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabase, type KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { createExporter } from "@db/sqlite/jsonl-exporter.js";
import { importFromJSONL } from "@db/sqlite/jsonl-importer.js";
import { recordDeletion } from "@sync/deletion-manifest.js";

describe("Sync Integration", () => {
  let tempDir: string;
  let exportDir: string;
  let sourceDb: KotaDatabase | null = null;
  let targetDb: KotaDatabase | null = null;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sync-integration-test-"));
    exportDir = join(tempDir, "export");
    mkdirSync(exportDir, { recursive: true });
  });

  afterEach(() => {
    if (sourceDb) {
      sourceDb.close();
      sourceDb = null;
    }
    if (targetDb) {
      targetDb.close();
      targetDb = null;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("full sync cycle: export, delete, import", async () => {
    // Setup: Create source database
    sourceDb = createDatabase({ path: join(tempDir, "source.db"), skipSchemaInit: true });
    sourceDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    sourceDb.run("INSERT INTO repositories VALUES (?, ?)", ["1", "repo-1"]);
    sourceDb.run("INSERT INTO repositories VALUES (?, ?)", ["2", "repo-2"]);

    // Export
    const exporter = createExporter(sourceDb, exportDir, [{ name: "repositories" }]);
    await exporter.exportNow();
    exporter.cancel();

    // Simulate deletion
    sourceDb.run("DELETE FROM repositories WHERE id = ?", ["1"]);

    // Re-export (repo-1 now absent from JSONL)
    const exporter2 = createExporter(sourceDb, exportDir, [{ name: "repositories" }]);
    await exporter2.exportNow();
    exporter2.cancel();

    // Record deletion AFTER export (since exporter clears manifest)
    await recordDeletion("repositories", "1", exportDir);

    // Import to target database
    targetDb = createDatabase({ path: join(tempDir, "target.db"), skipSchemaInit: true });
    targetDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    await importFromJSONL(targetDb, exportDir, [
      { name: "repositories", primaryKey: "id" }
    ]);

    // Verify: Only repo-2 present (repo-1 deleted)
    const rows = targetDb.query<{ id: string; name: string }>(
      "SELECT * FROM repositories"
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe("2");
    expect(rows[0]?.name).toBe("repo-2");
  });

  test("sync preserves data integrity across multiple tables", async () => {
    // Setup: Create source database with multiple tables
    sourceDb = createDatabase({ path: join(tempDir, "source.db"), skipSchemaInit: true });
    sourceDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE indexed_files (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        path TEXT NOT NULL
      );
    `);
    
    sourceDb.run("INSERT INTO repositories VALUES (?, ?)", ["repo-1", "test-repo"]);
    sourceDb.run("INSERT INTO indexed_files VALUES (?, ?, ?)", ["file-1", "repo-1", "/path/to/file.ts"]);
    sourceDb.run("INSERT INTO indexed_files VALUES (?, ?, ?)", ["file-2", "repo-1", "/path/to/other.ts"]);

    // Export
    const exporter = createExporter(sourceDb, exportDir, [
      { name: "repositories" },
      { name: "indexed_files" }
    ]);
    await exporter.exportNow();
    exporter.cancel();

    // Import to target database
    targetDb = createDatabase({ path: join(tempDir, "target.db"), skipSchemaInit: true });
    targetDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE indexed_files (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        path TEXT NOT NULL
      );
    `);

    await importFromJSONL(targetDb, exportDir, [
      { name: "repositories", primaryKey: "id" },
      { name: "indexed_files", primaryKey: "id" }
    ]);

    // Verify repositories
    const repos = targetDb.query<{ id: string; name: string }>(
      "SELECT * FROM repositories"
    );
    expect(repos.length).toBe(1);
    expect(repos[0]?.id).toBe("repo-1");

    // Verify indexed_files
    const files = targetDb.query<{ id: string; path: string }>(
      "SELECT * FROM indexed_files ORDER BY id"
    );
    expect(files.length).toBe(2);
    expect(files[0]?.id).toBe("file-1");
    expect(files[1]?.id).toBe("file-2");
  });

  test("sync handles updates correctly", async () => {
    // Setup: Create source database
    sourceDb = createDatabase({ path: join(tempDir, "source.db"), skipSchemaInit: true });
    sourceDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    sourceDb.run("INSERT INTO repositories VALUES (?, ?)", ["1", "original-name"]);

    // Initial export
    const exporter1 = createExporter(sourceDb, exportDir, [{ name: "repositories" }]);
    await exporter1.exportNow();
    exporter1.cancel();

    // Create target and import
    targetDb = createDatabase({ path: join(tempDir, "target.db"), skipSchemaInit: true });
    targetDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    await importFromJSONL(targetDb, exportDir, [
      { name: "repositories", primaryKey: "id" }
    ]);

    // Verify initial state
    let rows = targetDb.query<{ name: string }>("SELECT name FROM repositories WHERE id = ?", ["1"]);
    expect(rows[0]?.name).toBe("original-name");

    // Update in source
    sourceDb.run("UPDATE repositories SET name = ? WHERE id = ?", ["updated-name", "1"]);

    // Re-export
    const exporter2 = createExporter(sourceDb, exportDir, [{ name: "repositories" }]);
    await exporter2.exportNow();
    exporter2.cancel();

    // Re-import to target
    await importFromJSONL(targetDb, exportDir, [
      { name: "repositories", primaryKey: "id" }
    ]);

    // Verify update
    rows = targetDb.query<{ name: string }>("SELECT name FROM repositories WHERE id = ?", ["1"]);
    expect(rows[0]?.name).toBe("updated-name");
  });

  test("sync handles cascading deletions with deletion manifest", async () => {
    // Setup: Create source database
    sourceDb = createDatabase({ path: join(tempDir, "source.db"), skipSchemaInit: true });
    sourceDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE indexed_files (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        path TEXT NOT NULL
      );
    `);
    
    sourceDb.run("INSERT INTO repositories VALUES (?, ?)", ["repo-1", "test-repo"]);
    sourceDb.run("INSERT INTO indexed_files VALUES (?, ?, ?)", ["file-1", "repo-1", "/file1.ts"]);
    sourceDb.run("INSERT INTO indexed_files VALUES (?, ?, ?)", ["file-2", "repo-1", "/file2.ts"]);

    // Initial export
    const exporter1 = createExporter(sourceDb, exportDir, [
      { name: "repositories" },
      { name: "indexed_files" }
    ]);
    await exporter1.exportNow();
    exporter1.cancel();

    // Create target database and import initial data
    targetDb = createDatabase({ path: join(tempDir, "target.db"), skipSchemaInit: true });
    targetDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE indexed_files (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        path TEXT NOT NULL
      );
    `);

    await importFromJSONL(targetDb, exportDir, [
      { name: "repositories", primaryKey: "id" },
      { name: "indexed_files", primaryKey: "id" }
    ]);

    // Verify initial data loaded
    let repos = targetDb.query<{ id: string }>("SELECT id FROM repositories");
    expect(repos.length).toBe(1);
    let files = targetDb.query<{ id: string }>("SELECT id FROM indexed_files");
    expect(files.length).toBe(2);

    // Delete repository and associated files in source
    sourceDb.run("DELETE FROM indexed_files WHERE repository_id = ?", ["repo-1"]);
    sourceDb.run("DELETE FROM repositories WHERE id = ?", ["repo-1"]);

    // Re-export (tables now empty in JSONL)
    const exporter2 = createExporter(sourceDb, exportDir, [
      { name: "repositories" },
      { name: "indexed_files" }
    ]);
    await exporter2.exportNow();
    exporter2.cancel();

    // Record deletions AFTER export (since exporter clears manifest)
    await recordDeletion("indexed_files", "file-1", exportDir);
    await recordDeletion("indexed_files", "file-2", exportDir);
    await recordDeletion("repositories", "repo-1", exportDir);

    // Import to target (should apply deletion manifest)
    await importFromJSONL(targetDb, exportDir, [
      { name: "repositories", primaryKey: "id" },
      { name: "indexed_files", primaryKey: "id" }
    ]);

    // Verify all deleted
    repos = targetDb.query<{ id: string }>("SELECT id FROM repositories");
    expect(repos.length).toBe(0);

    files = targetDb.query<{ id: string }>("SELECT id FROM indexed_files");
    expect(files.length).toBe(0);
  });

  test("empty database exports and imports successfully", async () => {
    // Setup: Create empty source database
    sourceDb = createDatabase({ path: join(tempDir, "source.db"), skipSchemaInit: true });
    sourceDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    // Export empty table
    const exporter = createExporter(sourceDb, exportDir, [{ name: "repositories" }]);
    await exporter.exportNow();
    exporter.cancel();

    // Import to target
    targetDb = createDatabase({ path: join(tempDir, "target.db"), skipSchemaInit: true });
    targetDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    const result = await importFromJSONL(targetDb, exportDir, [
      { name: "repositories", primaryKey: "id" }
    ]);

    // Verify import completed (even though no rows)
    expect(result.errors.length).toBe(0);
    
    const rows = targetDb.query<{ id: string }>("SELECT * FROM repositories");
    expect(rows.length).toBe(0);
  });
});
