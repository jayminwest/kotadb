/**
 * Tests for Deletion Manifest - Tracking removed entities during sync
 * 
 * Following antimocking philosophy: uses real SQLite databases and file system
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabase, type KotaDatabase } from "@db/sqlite/sqlite-client.js";
import {
  recordDeletion,
  loadDeletionManifest,
  applyDeletionManifest,
  clearDeletionManifest
} from "@sync/deletion-manifest.js";

describe("Deletion Manifest", () => {
  let tempDir: string;
  let exportDir: string;
  let db: KotaDatabase | null = null;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "deletion-test-"));
    exportDir = join(tempDir, "export");
    mkdirSync(exportDir, { recursive: true });
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("recordDeletion() appends entry to manifest", async () => {
    await recordDeletion("repositories", "abc-123", exportDir);

    const entries = await loadDeletionManifest(join(exportDir, ".deletions.jsonl"));
    expect(entries.length).toBe(1);
    expect(entries[0]?.table).toBe("repositories");
    expect(entries[0]?.id).toBe("abc-123");
    expect(entries[0]?.deleted_at).toBeDefined();
  });

  test("loadDeletionManifest() returns empty array if file missing", async () => {
    const entries = await loadDeletionManifest(join(exportDir, ".deletions.jsonl"));
    expect(entries.length).toBe(0);
  });

  test("applyDeletionManifest() removes records from database", async () => {
    db = createDatabase({ path: join(tempDir, "test.db") });
    db.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    db.run("INSERT INTO repositories VALUES (?, ?)", ["1", "repo-1"]);
    db.run("INSERT INTO repositories VALUES (?, ?)", ["2", "repo-2"]);

    // Record deletion of repo-1
    await recordDeletion("repositories", "1", exportDir);

    // Apply deletions
    const result = await applyDeletionManifest(db, join(exportDir, ".deletions.jsonl"));

    expect(result.deletedCount).toBe(1);
    expect(result.errors.length).toBe(0);

    // Verify repo-1 deleted, repo-2 remains
    const rows = db.query<{ id: string }>("SELECT id FROM repositories");
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe("2");
  });

  test("applyDeletionManifest() handles non-existent table gracefully", async () => {
    db = createDatabase({ path: join(tempDir, "test.db") });

    await recordDeletion("nonexistent_table", "123", exportDir);

    const result = await applyDeletionManifest(db, join(exportDir, ".deletions.jsonl"));

    expect(result.deletedCount).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Table not found");
  });

  test("clearDeletionManifest() empties the file", async () => {
    await recordDeletion("repositories", "1", exportDir);
    await recordDeletion("repositories", "2", exportDir);
    
    let entries = await loadDeletionManifest(join(exportDir, ".deletions.jsonl"));
    expect(entries.length).toBe(2);

    await clearDeletionManifest(exportDir);

    entries = await loadDeletionManifest(join(exportDir, ".deletions.jsonl"));
    expect(entries.length).toBe(0);
  });

  test("applyDeletionManifest() handles multiple deletions across tables", async () => {
    db = createDatabase({ path: join(tempDir, "test.db") });
    db.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE indexed_files (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL
      );
    `);
    
    db.run("INSERT INTO repositories VALUES (?, ?)", ["repo-1", "test-repo"]);
    db.run("INSERT INTO repositories VALUES (?, ?)", ["repo-2", "another-repo"]);
    db.run("INSERT INTO indexed_files VALUES (?, ?)", ["file-1", "/path/to/file"]);

    // Record deletions across tables
    await recordDeletion("repositories", "repo-1", exportDir);
    await recordDeletion("indexed_files", "file-1", exportDir);

    const result = await applyDeletionManifest(db, join(exportDir, ".deletions.jsonl"));

    expect(result.deletedCount).toBe(2);
    expect(result.errors.length).toBe(0);

    // Verify deletions
    const repos = db.query<{ id: string }>("SELECT id FROM repositories");
    expect(repos.length).toBe(1);
    expect(repos[0]?.id).toBe("repo-2");

    const files = db.query<{ id: string }>("SELECT id FROM indexed_files");
    expect(files.length).toBe(0);
  });

  test("loadDeletionManifest() skips invalid entries", async () => {
    const manifestPath = join(exportDir, ".deletions.jsonl");
    
    // Write valid and invalid entries
    await Bun.write(manifestPath, [
      JSON.stringify({ table: "repositories", id: "1", deleted_at: "2025-12-15T10:00:00Z" }),
      "{ invalid json }", // Should be skipped
      JSON.stringify({ table: "repositories", id: "2", deleted_at: "2025-12-15T10:01:00Z" })
    ].join("\n") + "\n");

    const entries = await loadDeletionManifest(manifestPath);
    
    // Should load only valid entries
    expect(entries.length).toBe(2);
    expect(entries[0]?.id).toBe("1");
    expect(entries[1]?.id).toBe("2");
  });

  test("applyDeletionManifest() returns immediately if manifest is empty", async () => {
    db = createDatabase({ path: join(tempDir, "test.db") });
    
    const result = await applyDeletionManifest(db, join(exportDir, ".deletions.jsonl"));

    expect(result.deletedCount).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  test("applyDeletionManifest() batches deletions by table", async () => {
    db = createDatabase({ path: join(tempDir, "test.db") });
    db.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    
    // Insert 5 repositories
    for (let i = 1; i <= 5; i++) {
      db.run("INSERT INTO repositories VALUES (?, ?)", [`repo-${i}`, `Repository ${i}`]);
    }

    // Record multiple deletions for same table
    await recordDeletion("repositories", "repo-1", exportDir);
    await recordDeletion("repositories", "repo-2", exportDir);
    await recordDeletion("repositories", "repo-3", exportDir);

    const result = await applyDeletionManifest(db, join(exportDir, ".deletions.jsonl"));

    expect(result.deletedCount).toBe(3);
    expect(result.errors.length).toBe(0);

    // Verify remaining repositories
    const repos = db.query<{ id: string }>("SELECT id FROM repositories ORDER BY id");
    expect(repos.length).toBe(2);
    expect(repos[0]?.id).toBe("repo-4");
    expect(repos[1]?.id).toBe("repo-5");
  });

  test("clearDeletionManifest() handles non-existent file gracefully", async () => {
    // Should not throw even if file doesn't exist
    await clearDeletionManifest(exportDir);
    
    // Verify it completed successfully by checking that no error was thrown
    const entries = await loadDeletionManifest(join(exportDir, ".deletions.jsonl"));
    expect(entries.length).toBe(0);
  });

  test("recordDeletion() creates manifest file if it doesn't exist", async () => {
    await recordDeletion("repositories", "test-id", exportDir);

    const entries = await loadDeletionManifest(join(exportDir, ".deletions.jsonl"));
    expect(entries.length).toBe(1);
    expect(entries[0]?.table).toBe("repositories");
    expect(entries[0]?.id).toBe("test-id");
  });
});
