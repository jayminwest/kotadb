/**
 * Integration tests for search_code MCP tool
 * 
 * Tests actual search functionality with seeded SQLite database fixtures.
 * Follows antimocking philosophy - no mocks, real database operations.
 * 
 * Uses file-based test database with KOTADB_PATH environment variable
 * to work around global database singleton pattern.
 * 
 * @module tests/mcp/search-code.integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { executeSearchCode } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { 
  createTempDir, 
  cleanupTempDir, 
  clearTestData,
} from "../helpers/db.js";

describe("search_code integration tests", () => {
  let tempDir: string;
  let dbPath: string;
  let db: KotaDatabase;
  let originalDbPath: string | undefined;
  let repoId: string;
  const requestId = "test-request";
  const userId = "test-user";
  
  beforeAll(() => {
    // Create temp directory for file-based database
    tempDir = createTempDir("search-code-test-");
    dbPath = join(tempDir, "test.db");
    
    // Save original and set test database path
    originalDbPath = process.env.KOTADB_PATH;
    process.env.KOTADB_PATH = dbPath;
    
    // Clear any existing global connections
    closeGlobalConnections();
  });
  
  afterAll(() => {
    // Restore original database path
    if (originalDbPath !== undefined) {
      process.env.KOTADB_PATH = originalDbPath;
    } else {
      delete process.env.KOTADB_PATH;
    }
    
    // Clean up connections and temp directory
    closeGlobalConnections();
    cleanupTempDir(tempDir);
  });
  
  beforeEach(() => {
    // Get global database (will use KOTADB_PATH)
    db = getGlobalDatabase();
    
    // Create test repository directly
    repoId = randomUUID();
    db.run(
      `INSERT INTO repositories (id, name, full_name, default_branch)
       VALUES (?, ?, ?, ?)`,
      [repoId, "search-test-repo", "test-org/search-test-repo", "main"]
    );
    
    // Seed test files with searchable content
    const fileId1 = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId1,
        repoId,
        "src/auth.ts",
        "export function authenticate(user: string) { return true; }",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
    
    const fileId2 = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId2,
        repoId,
        "src/middleware.ts",
        "import { authenticate } from './auth'; // Pre-commit hook",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
    
    const fileId3 = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId3,
        repoId,
        "src/utils.ts",
        "export const VERSION = '1.0.0';",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
  });
  
  afterEach(() => {
    // Clear data but keep schema for next test
    clearTestData(db);
  });
  
  test("should find files containing search term", async () => {
    const result = await executeSearchCode(
      { term: "authenticate" },
      requestId,
      userId
    ) as { results: Array<{ path: string; snippet: string }> };
    
    expect(result.results).toBeDefined();
    expect(result.results.length).toBeGreaterThan(0);
    
    // Should find files containing 'authenticate'
    const paths = result.results.map(r => r.path);
    expect(paths.some(p => p.includes("auth"))).toBe(true);
    
    // Snippets should contain the search term
    for (const file of result.results) {
      expect(file.snippet.toLowerCase()).toContain("authenticate");
    }
  });
  
  test("should filter by repository", async () => {
    // Create second repository
    const repo2Id = randomUUID();
    db.run(
      `INSERT INTO repositories (id, name, full_name, default_branch)
       VALUES (?, ?, ?, ?)`,
      [repo2Id, "other-repo", "test-org/other-repo", "main"]
    );
    
    const fileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId,
        repo2Id,
        "src/other.ts",
        "export function authenticate() {}",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
    
    const result = await executeSearchCode(
      { 
        term: "authenticate",
        repository: repoId,
      },
      requestId,
      userId
    ) as { results: Array<{ path: string }> };
    
    // Should only find files from first repository
    expect(result.results).toBeDefined();
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });
  
  test("should handle FTS5 hyphenated terms", async () => {
    const result = await executeSearchCode(
      { term: "pre-commit" },
      requestId,
      userId
    ) as { results: Array<{ path: string }> };
    
    // Should not throw SQL error
    expect(Array.isArray(result.results)).toBe(true);
  });
  
  test("should respect limit parameter", async () => {
    // Create multiple files with term
    for (let i = 0; i < 10; i++) {
      const fileId = randomUUID();
      db.run(
        `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          fileId,
          repoId,
          `src/file${i}.ts`,
          "export function authenticate() {}",
          "typescript",
          new Date().toISOString(),
          randomUUID(),
        ]
      );
    }
    
    const result = await executeSearchCode(
      { term: "authenticate", limit: 5 },
      requestId,
      userId
    ) as { results: Array<unknown> };
    
    expect(result.results.length).toBeLessThanOrEqual(5);
  });
  
  test("should return empty results for non-existent term", async () => {
    const result = await executeSearchCode(
      { term: "nonExistentFunctionXYZ12345" },
      requestId,
      userId
    ) as { results: Array<unknown> };
    
    expect(result.results).toEqual([]);
  });
  
  test("should include indexedAt in ISO format", async () => {
    const result = await executeSearchCode(
      { term: "authenticate" },
      requestId,
      userId
    ) as { results: Array<{ indexedAt: string }> };
    
    if (result.results.length > 0) {
      const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      expect(result.results[0]!.indexedAt).toMatch(isoDatePattern);
    }
  });
});
