/**
 * Integration tests for kota_sync_import MCP tool
 * 
 * Tests JSONL to SQLite import with real filesystem operations.
 * Follows antimocking philosophy - no mocks, real database and files.
 * 
 * Uses file-based test database with KOTADB_PATH environment variable.
 * 
 * Note: Import logic has strict requirements and may skip rows with validation errors.
 * 
 * @module tests/mcp/kota-sync-import.integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { executeSyncImport } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { 
  createTempDir, 
  cleanupTempDir, 
  clearTestData,
} from "../helpers/db.js";

describe("kota_sync_import integration tests", () => {
  let tempDir: string;
  let dbPath: string;
  let importDir: string;
  let db: KotaDatabase;
  let originalDbPath: string | undefined;
  const requestId = "test-request";
  
  beforeAll(() => {
    tempDir = createTempDir("sync-import-test-");
    dbPath = join(tempDir, "test.db");
    importDir = join(tempDir, "import");
    
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
    
    // Clean and recreate import directory
    if (importDir) {
      rmSync(importDir, { recursive: true, force: true });
    }
    mkdirSync(importDir, { recursive: true });
  });
  
  afterEach(() => {
    clearTestData(db);
  });
  
  test("should execute import with JSONL files", async () => {
    // Create valid JSONL file with all required fields
    const repoData = {
      id: randomUUID(),
      name: "test-repo",
      full_name: "test-owner/test-repo",
      owner: "test-owner",
      default_branch: "main",
      created_at: new Date().toISOString(),
    };
    
    writeFileSync(
      join(importDir, "repositories.jsonl"),
      JSON.stringify(repoData) + "\n"
    );
    
    const result = await executeSyncImport(
      { import_dir: importDir },
      requestId
    ) as { tables_imported: number };
    
    // Import executes and processes tables
    expect(result.tables_imported).toBeGreaterThan(0);
  });
  
  test("should include duration_ms in result", async () => {
    const result = await executeSyncImport(
      { import_dir: importDir },
      requestId
    ) as { duration_ms: number };
    
    expect(result.duration_ms).toBeDefined();
    expect(typeof result.duration_ms).toBe("number");
  });
  
  test("should handle invalid JSONL gracefully", async () => {
    // Create invalid JSONL
    writeFileSync(
      join(importDir, "repositories.jsonl"),
      "not valid json\n"
    );
    
    const result = await executeSyncImport(
      { import_dir: importDir },
      requestId
    ) as { success: boolean };
    
    // Invalid JSON is detected
    expect(result.success).toBe(false);
  });
  
  test("should process multiple table files", async () => {
    const repoId = randomUUID();
    const fileId = randomUUID();
    
    // Create repositories JSONL
    writeFileSync(
      join(importDir, "repositories.jsonl"),
      JSON.stringify({
        id: repoId,
        name: "multi-table",
        full_name: "test/multi-table",
        owner: "test",
        default_branch: "main",
        created_at: new Date().toISOString(),
      }) + "\n"
    );
    
    // Create indexed_files JSONL
    writeFileSync(
      join(importDir, "indexed_files.jsonl"),
      JSON.stringify({
        id: fileId,
        repository_id: repoId,
        path: "src/test.ts",
        content: "export {}",
        language: "typescript",
        indexed_at: new Date().toISOString(),
        content_hash: randomUUID(),
      }) + "\n"
    );
    
    const result = await executeSyncImport(
      { import_dir: importDir },
      requestId
    ) as { tables_imported: number };
    
    // Multiple tables are processed
    expect(result.tables_imported).toBeGreaterThanOrEqual(2);
  });
  
  test("should handle empty import directory", async () => {
    const result = await executeSyncImport(
      { import_dir: importDir },
      requestId
    ) as { success: boolean; tables_imported: number; rows_imported: number };
    
    expect(result.success).toBe(true);
    expect(result.tables_imported).toBe(0);
    expect(result.rows_imported).toBe(0);
  });
  
  test("should detect errors in data", async () => {
    // Create partial valid data followed by invalid data
    const repoId = randomUUID();
    writeFileSync(
      join(importDir, "repositories.jsonl"),
      JSON.stringify({
        id: repoId,
        name: "valid",
        full_name: "test/valid",
        owner: "test",
        default_branch: "main",
        created_at: new Date().toISOString(),
      }) + "\n" +
      "invalid json\n"
    );
    
    const result = await executeSyncImport(
      { import_dir: importDir },
      requestId
    ) as { success: boolean };
    
    // Errors are detected
    expect(result.success).toBe(false);
  });
});
