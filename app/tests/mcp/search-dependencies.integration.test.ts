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
  let topFileId: string;
  let testFileId: string;
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
    // base.ts (no dependencies)
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
    
    // middle.ts (imports from base.ts)
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
    
    // Add import reference: middle -> base
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        middleFileId,
        repoId,
        "BASE",
        "src/base.ts",  // Resolved target_file_path
        1,
        "import",
        JSON.stringify({ importSource: "./base" }),
      ]
    );
    
    // top.ts (imports from middle.ts)
    topFileId = randomUUID();
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
    
    // Add import reference: top -> middle
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        topFileId,
        repoId,
        "MIDDLE",
        "src/middle.ts",  // Resolved target_file_path
        1,
        "import",
        JSON.stringify({ importSource: "./middle" }),
      ]
    );
    
    // base.test.ts (imports from base.ts) - test file
    testFileId = randomUUID();
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
    
    // Add import reference: test -> base
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        testFileId,
        repoId,
        "BASE",
        "src/base.ts",  // Resolved target_file_path
        1,
        "import",
        JSON.stringify({ importSource: "../base" }),
      ]
    );
  });
  
  afterEach(() => {
    clearTestData(db);
  });
  
  test("should find direct dependents (depth 1)", async () => {
    const result = await executeSearchDependencies(
      {
        file_path: "src/base.ts",
        direction: "dependents",
        depth: 1,
        include_tests: true,
      },
      requestId,
      userId
    ) as { dependents: { direct: string[]; indirect: Record<string, string[]>; count: number } };
    
    expect(result.dependents).toBeDefined();
    expect(result.dependents.direct).toContain("src/middle.ts");
    expect(result.dependents.direct).toContain("src/__tests__/base.test.ts");
    expect(result.dependents.count).toBe(2);
  });
  
  test("should find indirect dependents at depth 2", async () => {
    const result = await executeSearchDependencies(
      {
        file_path: "src/base.ts",
        direction: "dependents",
        depth: 2,
        include_tests: false,
      },
      requestId,
      userId
    ) as { dependents: { direct: string[]; indirect: Record<string, string[]> } };
    
    expect(result.dependents.direct).toContain("src/middle.ts");
    expect(result.dependents.indirect.depth_2).toBeDefined();
    expect(result.dependents.indirect.depth_2).toContain("src/top.ts");
  });
  
  test("should find dependencies (forward lookup)", async () => {
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
    expect(result.dependencies.direct).toContain("src/base.ts");
    expect(Array.isArray(result.dependencies.direct)).toBe(true);
  });
  
  test("should exclude test files when include_tests=false", async () => {
    const result = await executeSearchDependencies(
      {
        file_path: "src/base.ts",
        direction: "dependents",
        depth: 1,
        include_tests: false,
      },
      requestId,
      userId
    ) as { dependents: { direct: string[] } };
    
    expect(result.dependents.direct).toContain("src/middle.ts");
    expect(result.dependents.direct).not.toContain("src/__tests__/base.test.ts");
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
    ) as { dependents: { direct: string[] }; dependencies: { direct: string[] } };
    
    expect(result.dependents).toBeDefined();
    expect(result.dependents.direct).toContain("src/top.ts");
    expect(result.dependencies).toBeDefined();
    expect(result.dependencies.direct).toContain("src/base.ts");
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
  
  test("should respect depth limit", async () => {
    const result = await executeSearchDependencies(
      {
        file_path: "src/base.ts",
        direction: "dependents",
        depth: 1,
        include_tests: false,
      },
      requestId,
      userId
    ) as { dependents: { direct: string[]; indirect: Record<string, string[]> } };
    
    // At depth 1, should only see middle.ts (direct dependent)
    expect(result.dependents.direct).toContain("src/middle.ts");
    // Should not have depth_2 results
    expect(result.dependents.indirect.depth_2).toBeUndefined();
  });
  
  test("should return empty arrays for file with no dependencies", async () => {
    const result = await executeSearchDependencies(
      {
        file_path: "src/top.ts",
        direction: "dependents",
        depth: 1,
      },
      requestId,
      userId
    ) as { dependents: { direct: string[]; count: number } };
    
    expect(result.dependents.direct).toEqual([]);
    expect(result.dependents.count).toBe(0);
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

  test("should detect direct cycle (A -> B -> A)", async () => {
    // Create files with circular dependency
    const fileA = randomUUID();
    const fileB = randomUUID();
    
    // A imports B
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileA, repoId, "src/a.ts", "import { B } from './b';", "typescript", new Date().toISOString(), randomUUID()]
    );
    
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), fileA, repoId, "B", "src/b.ts", 1, "import", "{}"]
    );
    
    // B imports A (creates cycle)
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileB, repoId, "src/b.ts", "import { A } from './a';", "typescript", new Date().toISOString(), randomUUID()]
    );
    
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), fileB, repoId, "A", "src/a.ts", 1, "import", "{}"]
    );
    
    const result = await executeSearchDependencies(
      {
        file_path: "src/a.ts",
        direction: "both",
        depth: 3,
      },
      requestId,
      userId
    ) as { dependents: { cycles: string[][] }; dependencies: { cycles: string[][] } };
    
    // Should detect the cycle in dependencies (A -> B -> A)
    expect(result.dependencies.cycles.length).toBeGreaterThan(0);
    
    // Cycle should contain both files
    const cycle = result.dependencies.cycles[0];
    expect(cycle).toContain("src/a.ts");
    expect(cycle).toContain("src/b.ts");
  });

  test("should detect transitive cycle (A -> B -> C -> A)", async () => {
    // Create three files with circular dependency
    const fileA = randomUUID();
    const fileB = randomUUID();
    const fileC = randomUUID();
    
    // A imports B
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileA, repoId, "src/cycle/a.ts", "import { B } from './b';", "typescript", new Date().toISOString(), randomUUID()]
    );
    
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), fileA, repoId, "B", "src/cycle/b.ts", 1, "import", "{}"]
    );
    
    // B imports C
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileB, repoId, "src/cycle/b.ts", "import { C } from './c';", "typescript", new Date().toISOString(), randomUUID()]
    );
    
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), fileB, repoId, "C", "src/cycle/c.ts", 1, "import", "{}"]
    );
    
    // C imports A (creates cycle)
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileC, repoId, "src/cycle/c.ts", "import { A } from './a';", "typescript", new Date().toISOString(), randomUUID()]
    );
    
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), fileC, repoId, "A", "src/cycle/a.ts", 1, "import", "{}"]
    );
    
    const result = await executeSearchDependencies(
      {
        file_path: "src/cycle/a.ts",
        direction: "dependencies",
        depth: 5,
      },
      requestId,
      userId
    ) as { dependencies: { cycles: string[][] } };
    
    expect(result.dependencies.cycles.length).toBeGreaterThan(0);
    const cycle = result.dependencies.cycles[0];
    expect(cycle).toContain("src/cycle/a.ts");
    expect(cycle).toContain("src/cycle/b.ts");
    expect(cycle).toContain("src/cycle/c.ts");
  });

  test("should not report false cycles for diamond dependencies", async () => {
    // Create diamond: A -> B, A -> C, B -> D, C -> D
    // This is NOT a cycle, just a convergent dependency
    const fileA = randomUUID();
    const fileB = randomUUID();
    const fileC = randomUUID();
    const fileD = randomUUID();
    
    // D - base file
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileD, repoId, "src/diamond/d.ts", "export const D = 'd';", "typescript", new Date().toISOString(), randomUUID()]
    );
    
    // C imports D
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileC, repoId, "src/diamond/c.ts", "import { D } from './d';", "typescript", new Date().toISOString(), randomUUID()]
    );
    
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), fileC, repoId, "D", "src/diamond/d.ts", 1, "import", "{}"]
    );
    
    // B imports D
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileB, repoId, "src/diamond/b.ts", "import { D } from './d';", "typescript", new Date().toISOString(), randomUUID()]
    );
    
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), fileB, repoId, "D", "src/diamond/d.ts", 1, "import", "{}"]
    );
    
    // A imports both B and C
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileA, repoId, "src/diamond/a.ts", "import { B } from './b'; import { C } from './c';", "typescript", new Date().toISOString(), randomUUID()]
    );
    
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), fileA, repoId, "B", "src/diamond/b.ts", 1, "import", "{}"]
    );
    
    db.run(
      `INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), fileA, repoId, "C", "src/diamond/c.ts", 1, "import", "{}"]
    );
    
    const result = await executeSearchDependencies(
      {
        file_path: "src/diamond/d.ts",
        direction: "dependents",
        depth: 3,
      },
      requestId,
      userId
    ) as { dependents: { cycles: string[][] } };
    
    // Should not report any cycles - diamond is not a cycle
    expect(result.dependents.cycles).toEqual([]);
  });

  test("should handle files with no cycles in existing linear chain", async () => {
    // Use existing test data (linear: base <- middle <- top)
    const result = await executeSearchDependencies(
      {
        file_path: "src/base.ts",
        direction: "both",
        depth: 3,
      },
      requestId,
      userId
    ) as { dependents: { cycles: string[][] }; dependencies: { cycles: string[][] } };
    
    expect(result.dependents.cycles).toEqual([]);
    expect(result.dependencies.cycles).toEqual([]);
  });
});
