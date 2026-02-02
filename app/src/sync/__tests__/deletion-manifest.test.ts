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
  clearDeletionManifest,
  SecurityError,
  ValidationError,
  validateDeletionEntry,
  validateDeletionTableName,
  isAllowedDeletionTable,
  ALLOWED_DELETION_TABLES
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
    db = createDatabase({ path: join(tempDir, "test.db"), skipSchemaInit: true });
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
    expect(result.securityIssues.length).toBe(0);

    // Verify repo-1 deleted, repo-2 remains
    const rows = db.query<{ id: string }>("SELECT id FROM repositories");
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe("2");
  });

  test("recordDeletion() rejects non-whitelisted table names", async () => {
    expect(() => recordDeletion("nonexistent_table", "123", exportDir)).toThrow(SecurityError);
    expect(() => recordDeletion("sqlite_master", "123", exportDir)).toThrow(SecurityError);
    expect(() => recordDeletion("users; DROP TABLE repositories; --", "123", exportDir)).toThrow(SecurityError);
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
    db = createDatabase({ path: join(tempDir, "test.db"), skipSchemaInit: true });
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
    expect(result.securityIssues.length).toBe(0);

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
    db = createDatabase({ path: join(tempDir, "test.db"), skipSchemaInit: true });
    
    const result = await applyDeletionManifest(db, join(exportDir, ".deletions.jsonl"));

    expect(result.deletedCount).toBe(0);
    expect(result.errors.length).toBe(0);
    expect(result.securityIssues.length).toBe(0);
  });

  test("applyDeletionManifest() batches deletions by table", async () => {
    db = createDatabase({ path: join(tempDir, "test.db"), skipSchemaInit: true });
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
    expect(result.securityIssues.length).toBe(0);

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

describe('Deletion Manifest Security', () => {
  let tempDir: string;
  let exportDir: string;
  let db: KotaDatabase | null = null;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'security-test-'));
    exportDir = join(tempDir, 'export');
    mkdirSync(exportDir, { recursive: true });
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('isAllowedDeletionTable() validates table whitelist', () => {
    // Valid tables
    expect(isAllowedDeletionTable('repositories')).toBe(true);
    expect(isAllowedDeletionTable('indexed_files')).toBe(true);
    expect(isAllowedDeletionTable('indexed_symbols')).toBe(true);
    expect(isAllowedDeletionTable('indexed_references')).toBe(true);
    expect(isAllowedDeletionTable('projects')).toBe(true);
    expect(isAllowedDeletionTable('project_repositories')).toBe(true);

    // Invalid tables
    expect(isAllowedDeletionTable('sqlite_master')).toBe(false);
    expect(isAllowedDeletionTable('users')).toBe(false);
    expect(isAllowedDeletionTable('schema_migrations')).toBe(false);
    expect(isAllowedDeletionTable('malicious_table')).toBe(false);
  });

  test('validateDeletionTableName() throws SecurityError for invalid tables', () => {
    expect(() => validateDeletionTableName('sqlite_master')).toThrow(SecurityError);
    expect(() => validateDeletionTableName('users; DROP TABLE repositories; --')).toThrow(SecurityError);
    expect(() => validateDeletionTableName('(SELECT name FROM sqlite_master)')).toThrow(SecurityError);
    expect(() => validateDeletionTableName('nonexistent_table')).toThrow(SecurityError);

    // Valid tables should not throw
    expect(() => validateDeletionTableName('repositories')).not.toThrow();
    expect(() => validateDeletionTableName('indexed_files')).not.toThrow();
  });

  test('validateDeletionEntry() validates entry structure', () => {
    // Valid entry
    const validEntry = {
      table: 'repositories',
      id: 'test-123',
      deleted_at: '2025-01-01T00:00:00Z'
    };
    expect(() => validateDeletionEntry(validEntry)).not.toThrow();

    // Invalid table
    expect(() => validateDeletionEntry({
      table: 'sqlite_master',
      id: 'test-123',
      deleted_at: '2025-01-01T00:00:00Z'
    })).toThrow(SecurityError);

    // Missing required fields
    expect(() => validateDeletionEntry({
      id: 'test-123',
      deleted_at: '2025-01-01T00:00:00Z'
    })).toThrow(ValidationError);

    expect(() => validateDeletionEntry({
      table: 'repositories',
      deleted_at: '2025-01-01T00:00:00Z'
    })).toThrow(ValidationError);

    expect(() => validateDeletionEntry({
      table: 'repositories',
      id: 'test-123'
    })).toThrow(ValidationError);

    // Invalid types
    expect(() => validateDeletionEntry({
      table: 123,
      id: 'test-123',
      deleted_at: '2025-01-01T00:00:00Z'
    })).toThrow(ValidationError);

    expect(() => validateDeletionEntry({
      table: 'repositories',
      id: 123,
      deleted_at: '2025-01-01T00:00:00Z'
    })).toThrow(ValidationError);

    // Invalid timestamp
    expect(() => validateDeletionEntry({
      table: 'repositories',
      id: 'test-123',
      deleted_at: 'invalid-date'
    })).toThrow(ValidationError);

    // Empty ID
    expect(() => validateDeletionEntry({
      table: 'repositories',
      id: '',
      deleted_at: '2025-01-01T00:00:00Z'
    })).toThrow(ValidationError);

    expect(() => validateDeletionEntry({
      table: 'repositories',
      id: '   ',
      deleted_at: '2025-01-01T00:00:00Z'
    })).toThrow(ValidationError);
  });

  test('loadDeletionManifest() rejects oversized manifests', async () => {
    const manifestPath = join(exportDir, '.deletions.jsonl');

    // Create a large manifest (over 10MB)
    const largeEntry = JSON.stringify({
      table: 'repositories',
      id: 'x'.repeat(1024 * 1024), // 1MB ID
      deleted_at: '2025-01-01T00:00:00Z'
    });

    const largeContent = Array(12).fill(largeEntry).join('\n'); // 12MB
    await Bun.write(manifestPath, largeContent);

    await expect(loadDeletionManifest(manifestPath)).rejects.toThrow(SecurityError);
  });

  test('loadDeletionManifest() handles high error rates', async () => {
    const manifestPath = join(exportDir, '.deletions.jsonl');

    // Create manifest with many invalid entries (potential attack)
    const lines = [];
    for (let i = 0; i < 50; i++) {
      if (i < 5) {
        // Valid entries
        lines.push(JSON.stringify({
          table: 'repositories',
          id: `valid-${i}`,
          deleted_at: '2025-01-01T00:00:00Z'
        }));
      } else {
        // Invalid entries
        lines.push('{ invalid json }');
      }
    }

    await Bun.write(manifestPath, lines.join('\n'));

    await expect(loadDeletionManifest(manifestPath)).rejects.toThrow(SecurityError);
  });

  test('loadDeletionManifest() skips entries with invalid table names', async () => {
    const manifestPath = join(exportDir, '.deletions.jsonl');

    const entries = [
      JSON.stringify({ table: 'repositories', id: '1', deleted_at: '2025-01-01T00:00:00Z' }),
      JSON.stringify({ table: 'sqlite_master', id: '2', deleted_at: '2025-01-01T00:00:00Z' }),
      JSON.stringify({ table: 'indexed_files', id: '3', deleted_at: '2025-01-01T00:00:00Z' }),
      JSON.stringify({ table: 'users; DROP TABLE repositories; --', id: '4', deleted_at: '2025-01-01T00:00:00Z' })
    ];

    await Bun.write(manifestPath, entries.join('\n'));

    const validEntries = await loadDeletionManifest(manifestPath);

    // Only valid whitelisted tables should be loaded
    expect(validEntries.length).toBe(2);
    expect(validEntries[0]?.table).toBe('repositories');
    expect(validEntries[1]?.table).toBe('indexed_files');
  });

  test('applyDeletionManifest() handles missing tables in securityIssues', async () => {
    db = createDatabase({ path: join(tempDir, 'test.db'), skipSchemaInit: true });

    // Create manifest with valid table name that doesn't exist in DB
    const manifestPath = join(exportDir, '.deletions.jsonl');
    await Bun.write(manifestPath, JSON.stringify({
      table: 'indexed_symbols', // Valid but not in test DB
      id: 'test-123',
      deleted_at: '2025-01-01T00:00:00Z'
    }));

    const result = await applyDeletionManifest(db, manifestPath);

    expect(result.deletedCount).toBe(0);
    expect(result.errors.length).toBe(0);
    expect(result.securityIssues.length).toBe(1);
    expect(result.securityIssues[0]).toContain('Table not found: indexed_symbols');
  });

  test('buildSecureDeletionQuery() generates safe SQL', async () => {
    // This is tested indirectly through applyDeletionManifest()
    db = createDatabase({ path: join(tempDir, 'test.db'), skipSchemaInit: true });
    db.exec('CREATE TABLE repositories (id TEXT PRIMARY KEY, name TEXT)');
    db.run('INSERT INTO repositories VALUES (?, ?)', ['1', 'repo-1']);
    db.run('INSERT INTO repositories VALUES (?, ?)', ['2', 'repo-2']);

    const manifestPath = join(exportDir, '.deletions.jsonl');
    await Bun.write(manifestPath, [
      JSON.stringify({ table: 'repositories', id: '1', deleted_at: '2025-01-01T00:00:00Z' }),
      JSON.stringify({ table: 'repositories', id: '2', deleted_at: '2025-01-01T00:00:00Z' })
    ].join('\n'));

    const result = await applyDeletionManifest(db, manifestPath);

    expect(result.deletedCount).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(result.securityIssues.length).toBe(0);

    // Verify all rows deleted
    const rows = db.query<{ count: number }>('SELECT COUNT(*) as count FROM repositories');
    expect(rows[0]?.count).toBe(0);
  });
});
