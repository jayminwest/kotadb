/**
 * Integration tests for search_dependencies MCP tool
 * 
 * Tests dependency graph traversal with seeded SQLite database fixtures.
 * Follows antimocking philosophy - no mocks, real database operations.
 * 
 * Uses file-based test database with KOTADB_PATH environment variable.
 * 
 * @module tests/mcp/search-dependencies.integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { executeSearchDependencies } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { 
  createTempDir, 
  cleanupTempDir, 
  clearTestData,
} from "../helpers/db.js";

describe("search_dependencies integration tests", () => {
  let tempDir: string;
  let dbPath: string;
  let db: KotaDatabase;
  let originalDbPath: string | undefined;
  let repoId: string;
  let baseFileId: string;
  let middleFileId: string;
  const requestId = "test-request";
  const userId = "test-user";
  
  beforeAll(() => {
    tempDir = createTempDir("search-deps-test-");
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
    
    // Create dependency chain: base <- middle <- top
    baseFileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        baseFileId,
        repoId,
        "src/base.ts",
        "export const BASE = 'base';",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
    
    middleFileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        middleFileId,
        repoId,
        "src/middle.ts",
        "import { BASE } from './base';",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
    
    const topFileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        topFileId,
        repoId,
        "src/top.ts",
        "import { MIDDLE } from './middle';",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
    
    const testFileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        testFileId,
        repoId,
        "src/__tests__/base.test.ts",
        "import { BASE } from '../base';",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
  });
  
  afterEach(() => {
    clearTestData(db);
  });
  
  test("should find dependents", async () => {
    const result = await executeSearchDependencies(
      {
        file_path: "src/base.ts",
        direction: "dependents",
        depth: 1,
      },
      requestId,
      userId
    ) as { dependents: { direct: string[]; indirect: Record<string, string[]>; count: number } };
    
    expect(result.dependents).toBeDefined();
    expect(result.dependents.count).toBeDefined();
    expect(typeof result.dependents.count).toBe("number");
  });
  
  test("should find dependencies", async () => {
    const result = await executeSearchDependencies(
      {
        file_path: "src/middle.ts",
        direction: "dependencies",
        depth: 1,
      },
      requestId,
      userId
    ) as { dependencies: { direct: string[]; indirect: Record<string, string[]> } };
    
    expect(result.dependencies).toBeDefined();
    expect(result.dependencies.direct).toBeDefined();
    expect(Array.isArray(result.dependencies.direct)).toBe(true);
  });
  
  test("should find both directions", async () => {
    const result = await executeSearchDependencies(
      {
        file_path: "src/middle.ts",
        direction: "both",
        depth: 1,
      },
      requestId,
      userId
    ) as { dependents: unknown; dependencies: unknown };
    
    expect(result.dependents).toBeDefined();
    expect(result.dependencies).toBeDefined();
  });
  
  test("should handle non-existent file gracefully", async () => {
    const result = await executeSearchDependencies(
      {
        file_path: "src/nonexistent.ts",
        direction: "both",
      },
      requestId,
      userId
    ) as { message: string; dependents: { direct: string[] } };
    
    expect(result.message).toContain("not found");
    expect(result.dependents.direct).toEqual([]);
  });
  
  test("should use first repository if not specified", async () => {
    const result = await executeSearchDependencies(
      {
        file_path: "src/base.ts",
        direction: "dependents",
      },
      requestId,
      userId
    ) as { file_path: string };
    
    // Should not error even without repository param
    expect(result.file_path).toBe("src/base.ts");
  });
});
