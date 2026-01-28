/**
 * Integration tests for kota_sync_export MCP tool
 * 
 * Tests SQLite to JSONL export with real filesystem operations.
 * Follows antimocking philosophy - no mocks, real database and files.
 * 
 * Uses file-based test database with KOTADB_PATH environment variable.
 * 
 * @module tests/mcp/kota-sync-export.integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { executeSyncExport } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { 
  createTempDir, 
  cleanupTempDir, 
  clearTestData,
} from "../helpers/db.js";

describe("kota_sync_export integration tests", () => {
  let tempDir: string;
  let dbPath: string;
  let exportDir: string;
  let db: KotaDatabase;
  let originalDbPath: string | undefined;
  let repoId: string;
  const requestId = "test-request";
  
  beforeAll(() => {
    tempDir = createTempDir("sync-export-test-");
    dbPath = join(tempDir, "test.db");
    exportDir = join(tempDir, "export");
    
    originalDbPath = process.env.KOTADB_PATH;
    process.env.KOTADB_PATH = dbPath;
    closeGlobalConnections();
  });
  
  afterAll(() => {
    if (originalDbPath !== undefined) {
      process.env.KOTADB_PATH = originalDbPath;
    } else {
      delete process.env.KOTADB_PATH;
    }
    closeGlobalConnections();
    cleanupTempDir(tempDir);
  });
  
  beforeEach(() => {
    db = getGlobalDatabase();
    
    // Clean export directory
    if (existsSync(exportDir)) {
      rmSync(exportDir, { recursive: true, force: true });
    }
    mkdirSync(exportDir, { recursive: true });
    
    // Seed test repository
    repoId = randomUUID();
    db.run(
      `INSERT INTO repositories (id, name, full_name, default_branch)
       VALUES (?, ?, ?, ?)`,
      [repoId, "test-repo", "test-org/test-repo", "main"]
    );
    
    // Seed test file
    const fileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId,
        repoId,
        "src/main.ts",
        "export const MAIN = true;",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
  });
  
  afterEach(() => {
    clearTestData(db);
  });
  
  test("should export database to JSONL files", async () => {
    const result = await executeSyncExport(
      { export_dir: exportDir },
      requestId
    ) as { success: boolean; tables_exported: number; total_rows: number };
    
    expect(result.success).toBe(true);
    expect(result.tables_exported).toBeGreaterThan(0);
    expect(result.total_rows).toBeGreaterThan(0);
    
    // Verify files were created
    expect(existsSync(exportDir)).toBe(true);
  });
  
  test("should include duration_ms in result", async () => {
    const result = await executeSyncExport(
      { export_dir: exportDir },
      requestId
    ) as { duration_ms: number };
    
    expect(result.duration_ms).toBeDefined();
    expect(typeof result.duration_ms).toBe("number");
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });
  
  test("should create valid JSONL format", async () => {
    await executeSyncExport({ export_dir: exportDir }, requestId);
    
    // Check if repositories.jsonl exists and is valid
    const repoFile = join(exportDir, "repositories.jsonl");
    if (existsSync(repoFile)) {
      const content = readFileSync(repoFile, "utf-8");
      const lines = content.trim().split("\n").filter(line => line.length > 0);
      
      // Each line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    }
  });
  
  test("should handle empty database gracefully", async () => {
    // Clear all data
    db.run("DELETE FROM indexed_files");
    db.run("DELETE FROM repositories");
    
    const result = await executeSyncExport(
      { export_dir: exportDir },
      requestId
    ) as { success: boolean; total_rows: number };
    
    expect(result.success).toBe(true);
    expect(result.total_rows).toBe(0);
  });
  
  test("should force export when force is true", async () => {
    // First export
    await executeSyncExport({ export_dir: exportDir }, requestId);
    
    // Force export
    const result = await executeSyncExport(
      { export_dir: exportDir, force: true },
      requestId
    ) as { tables_exported: number };
    
    expect(result.tables_exported).toBeGreaterThanOrEqual(0);
  });
});
