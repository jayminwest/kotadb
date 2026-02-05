/**
 * Integration tests for unified search tool - snippet output mode
 * 
 * Tests the snippet output mode feature added in issue #152.
 * Follows antimocking philosophy - no mocks, real database operations.
 * 
 * @module tests/mcp/search-snippet-mode.integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { executeSearch } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { 
  createTempDir, 
  cleanupTempDir, 
} from "../helpers/db.js";

describe("Unified search - snippet output mode", () => {
  let tempDir: string;
  let dbPath: string;
  let db: KotaDatabase;
  let originalDbPath: string | undefined;
  let repoId: string;
  const requestId = "test-request";
  const userId = "test-user";
  
  beforeAll(() => {
    // Create temp directory for file-based database
    tempDir = createTempDir("search-snippet-test-");
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
      [repoId, "snippet-test-repo", "test-org/snippet-test-repo", "main"]
    );
    
    // Seed test file with multi-line content
    const fileId = randomUUID();
    const testContent = [
      "// File header",
      "import { KotaDatabase } from '@db/sqlite';",
      "",
      "export function authenticate(user: string) {",
      "  // Authentication logic here",
      "  return checkCredentials(user);",
      "}",
      "",
      "export function authorize(user: string, resource: string) {",
      "  // Authorization logic",
      "  if (!authenticate(user)) {",
      "    return false;",
      "  }",
      "  return checkPermissions(user, resource);",
      "}",
    ].join('\n');
    
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId,
        repoId,
        "src/auth.ts",
        testContent,
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
  });
  
  afterEach(() => {
    // Clean up test data
    if (db) {
      db.run("DELETE FROM indexed_files WHERE repository_id = ?", [repoId]);
      db.run("DELETE FROM repositories WHERE id = ?", [repoId]);
    }
  });
  
  test("should return snippets with matches and context for code scope", async () => {
    const result = await executeSearch(
      {
        query: "authenticate",
        scope: ["code"],
        output: "snippet",
        context_lines: 2,
        filters: { repository: repoId }
      },
      requestId,
      userId
    ) as any;
    
    expect(result.results.code).toBeDefined();
    expect(Array.isArray(result.results.code)).toBe(true);
    expect(result.results.code.length).toBeGreaterThan(0);
    
    const firstResult = result.results.code[0];
    expect(firstResult.path).toBe("src/auth.ts");
    expect(firstResult.matches).toBeDefined();
    expect(Array.isArray(firstResult.matches)).toBe(true);
    
    // Should have 2 matches (line 4 and line 11)
    expect(firstResult.matches.length).toBeGreaterThanOrEqual(2);
    
    const firstMatch = firstResult.matches[0];
    expect(firstMatch.line).toBeDefined();
    expect(firstMatch.content).toContain("authenticate");
    expect(Array.isArray(firstMatch.context_before)).toBe(true);
    expect(Array.isArray(firstMatch.context_after)).toBe(true);
  });
  
  test("should respect context_lines parameter", async () => {
    const result = await executeSearch(
      {
        query: "authenticate",
        scope: ["code"],
        output: "snippet",
        context_lines: 1,
        filters: { repository: repoId }
      },
      requestId,
      userId
    ) as any;
    
    const firstMatch = result.results.code[0]?.matches[0];
    expect(firstMatch.context_before.length).toBeLessThanOrEqual(1);
    expect(firstMatch.context_after.length).toBeLessThanOrEqual(1);
  });
  
  test("should default to 3 lines of context when context_lines not specified", async () => {
    const result = await executeSearch(
      {
        query: "authenticate",
        scope: ["code"],
        output: "snippet",
        filters: { repository: repoId }
      },
      requestId,
      userId
    ) as any;
    
    const firstMatch = result.results.code[0]?.matches[0];
    // Default is 3 lines, but may be less at file boundaries
    expect(firstMatch.context_before.length).toBeLessThanOrEqual(3);
    expect(firstMatch.context_after.length).toBeLessThanOrEqual(3);
  });
  
  test("should default to compact output for code scope when output not specified", async () => {
    const result = await executeSearch(
      {
        query: "authenticate",
        scope: ["code"],
        filters: { repository: repoId }
      },
      requestId,
      userId
    ) as any;
    
    // Default should be compact for code scope
    expect(result.results.code).toBeDefined();
    const firstResult = result.results.code[0];
    expect(firstResult.path).toBeDefined();
    expect(firstResult.match_count).toBeDefined();
    // Should NOT have full content field
    expect(firstResult.content).toBeUndefined();
    // Should NOT have matches field (that's snippet mode)
    expect(firstResult.matches).toBeUndefined();
  });
  
  test("should validate context_lines parameter range", async () => {
    // Test invalid context_lines (too high)
    await expect(
      executeSearch(
        {
          query: "authenticate",
          scope: ["code"],
          output: "snippet",
          context_lines: 11,  // Max is 10
          filters: { repository: repoId }
        },
        requestId,
        userId
      )
    ).rejects.toThrow("context_lines' must be between 0 and 10");
  });
  
  test("should validate context_lines type", async () => {
    await expect(
      executeSearch(
        {
          query: "authenticate",
          scope: ["code"],
          output: "snippet",
          context_lines: "invalid",  // Should be number
          filters: { repository: repoId }
        },
        requestId,
        userId
      )
    ).rejects.toThrow("context_lines' must be a number");
  });
  
  test("should validate output parameter includes snippet", async () => {
    // Just verify snippet is a valid output option (no error)
    const result = await executeSearch(
      {
        query: "authenticate",
        scope: ["code"],
        output: "snippet",
        filters: { repository: repoId }
      },
      requestId,
      userId
    ) as any;
    
    expect(result.results).toBeDefined();
  });
});
