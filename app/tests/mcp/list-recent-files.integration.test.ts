/**
 * Integration tests for list_recent_files MCP tool
 * 
 * Tests actual recent files retrieval with seeded SQLite database fixtures.
 * Follows antimocking philosophy - no mocks, real database operations.
 * 
 * Uses file-based test database with KOTADB_PATH environment variable.
 * 
 * @module tests/mcp/list-recent-files.integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { executeListRecentFiles } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { 
  createTempDir, 
  cleanupTempDir, 
  clearTestData,
} from "../helpers/db.js";

describe("list_recent_files integration tests", () => {
  let tempDir: string;
  let dbPath: string;
  let db: KotaDatabase;
  let originalDbPath: string | undefined;
  let repoId: string;
  const requestId = "test-request";
  const userId = "test-user";
  
  beforeAll(() => {
    tempDir = createTempDir("list-recent-test-");
    dbPath = join(tempDir, "test.db");
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
    
    // Create test repository
    repoId = randomUUID();
    db.run(
      `INSERT INTO repositories (id, name, full_name, default_branch)
       VALUES (?, ?, ?, ?)`,
      [repoId, "test-repo", "test-org/test-repo", "main"]
    );
    
    // Create files with different indexed_at timestamps
    const now = new Date();
    
    const oldFileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        oldFileId,
        repoId,
        "src/old.ts",
        "export const OLD = true;",
        "typescript",
        new Date(now.getTime() - 3000).toISOString(),
        randomUUID(),
      ]
    );
    
    const recentFileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        recentFileId,
        repoId,
        "src/recent.ts",
        "export const RECENT = true;",
        "typescript",
        new Date(now.getTime() - 1000).toISOString(),
        randomUUID(),
      ]
    );
    
    const newestFileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newestFileId,
        repoId,
        "src/newest.ts",
        "export const NEWEST = true;",
        "typescript",
        now.toISOString(),
        randomUUID(),
      ]
    );
  });
  
  afterEach(() => {
    clearTestData(db);
  });
  
  test("should list files ordered by recency", async () => {
    const result = await executeListRecentFiles(
      { limit: 10 },
      requestId,
      userId
    ) as { results: Array<{ path: string }> };
    
    expect(result.results.length).toBe(3);
    expect(result.results[0]!.path).toBe("src/newest.ts");
    expect(result.results[2]!.path).toBe("src/old.ts");
  });
  
  test("should respect limit parameter", async () => {
    const result = await executeListRecentFiles(
      { limit: 2 },
      requestId,
      userId
    ) as { results: Array<{ path: string }> };
    
    expect(result.results.length).toBe(2);
    expect(result.results[0]!.path).toBe("src/newest.ts");
  });
  
  test("should use default limit when not specified", async () => {
    const result = await executeListRecentFiles(
      undefined,
      requestId,
      userId
    ) as { results: Array<unknown> };
    
    expect(result.results).toBeDefined();
    expect(result.results.length).toBeLessThanOrEqual(10);
  });
  
  test("should include all required fields", async () => {
    const result = await executeListRecentFiles(
      { limit: 1 },
      requestId,
      userId
    ) as { results: Array<{ projectRoot: string; path: string; indexedAt: string; dependencies: string[] }> };
    
    if (result.results.length > 0) {
      const file = result.results[0]!;
      expect(file.projectRoot).toBeDefined();
      expect(file.path).toBeDefined();
      expect(file.indexedAt).toBeDefined();
      expect(file.dependencies).toBeDefined();
    }
  });
  
  test("should return empty array when no files indexed", async () => {
    // Clear all files
    db.run("DELETE FROM indexed_files");
    
    const result = await executeListRecentFiles(
      { limit: 10 },
      requestId,
      userId
    ) as { results: Array<unknown> };
    
    expect(result.results).toEqual([]);
  });
});
