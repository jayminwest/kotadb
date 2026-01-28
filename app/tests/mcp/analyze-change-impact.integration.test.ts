/**
 * Integration tests for analyze_change_impact MCP tool
 * 
 * Tests change impact analysis with seeded SQLite database fixtures.
 * Follows antimocking philosophy - no mocks, real database operations.
 * 
 * Uses file-based test database with KOTADB_PATH environment variable.
 * 
 * @module tests/mcp/analyze-change-impact.integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { executeAnalyzeChangeImpact } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { 
  createTempDir, 
  cleanupTempDir, 
  clearTestData,
} from "../helpers/db.js";

describe("analyze_change_impact integration tests", () => {
  let tempDir: string;
  let dbPath: string;
  let db: KotaDatabase;
  let originalDbPath: string | undefined;
  let repoId: string;
  const requestId = "test-request";
  const userId = "test-user";
  
  beforeAll(() => {
    tempDir = createTempDir("impact-test-");
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
    
    // Seed test files
    for (let i = 1; i <= 5; i++) {
      const fileId = randomUUID();
      db.run(
        `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          fileId,
          repoId,
          `src/module${i}.ts`,
          `export function function${i}() { return ${i}; }`,
          "typescript",
          new Date().toISOString(),
          randomUUID(),
        ]
      );
    }
    
    // Add test file
    const testFileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        testFileId,
        repoId,
        "src/__tests__/module1.test.ts",
        "import { function1 } from '../module1';",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
  });
  
  afterEach(() => {
    clearTestData(db);
  });
  
  test("should analyze impact for feature change", async () => {
    const result = await executeAnalyzeChangeImpact(
      {
        change_type: "feature",
        description: "Add new authentication feature",
        files_to_create: ["src/auth/oauth.ts"],
      },
      requestId,
      userId
    ) as { affected_files: unknown[]; test_scope: unknown; risk_level: string; summary: string };
    
    expect(result.affected_files).toBeDefined();
    expect(result.test_scope).toBeDefined();
    expect(result.risk_level).toBeDefined();
    expect(result.summary).toBeDefined();
  });
  
  test("should calculate test scope", async () => {
    const result = await executeAnalyzeChangeImpact(
      {
        change_type: "refactor",
        description: "Refactor authentication",
        files_to_modify: ["src/module1.ts"],
      },
      requestId,
      userId
    ) as { test_scope: { test_files: unknown; recommended_test_files: unknown; coverage_impact: string } };
    
    expect(result.test_scope.test_files).toBeDefined();
    expect(result.test_scope.recommended_test_files).toBeDefined();
    expect(result.test_scope.coverage_impact).toBeDefined();
  });
  
  test("should escalate risk level for breaking changes", async () => {
    const result = await executeAnalyzeChangeImpact(
      {
        change_type: "refactor",
        description: "Breaking API changes",
        files_to_modify: ["src/api/handlers.ts"],
        breaking_changes: true,
      },
      requestId,
      userId
    ) as { risk_level: string; architectural_warnings: string[] };
    
    expect(result.risk_level).toBe("high");
    expect(Array.isArray(result.architectural_warnings)).toBe(true);
  });
  
  test("should detect database migration warnings", async () => {
    const result = await executeAnalyzeChangeImpact(
      {
        change_type: "feature",
        description: "Add user profile table",
        files_to_create: ["app/src/db/migrations/20250128_add_profiles.sql"],
      },
      requestId,
      userId
    ) as { architectural_warnings: string[] };
    
    expect(result.architectural_warnings.some(w => 
      w.toLowerCase().includes("migration") || w.toLowerCase().includes("database")
    )).toBe(true);
  });
  
  test("should provide deployment impact assessment", async () => {
    const result = await executeAnalyzeChangeImpact(
      {
        change_type: "fix",
        description: "Fix authentication bug",
        files_to_modify: ["src/auth.ts"],
      },
      requestId,
      userId
    ) as { deployment_impact: string };
    
    expect(result.deployment_impact).toBeDefined();
    expect(typeof result.deployment_impact).toBe("string");
  });
  
  test("should handle no repository gracefully", async () => {
    // Clear repositories
    db.run("DELETE FROM indexed_files");
    db.run("DELETE FROM repositories");
    
    const result = await executeAnalyzeChangeImpact(
      {
        change_type: "feature",
        description: "New feature",
      },
      requestId,
      userId
    ) as { affected_files: unknown[]; summary: string };
    
    expect(result.affected_files).toEqual([]);
    expect(result.summary.toLowerCase()).toContain("no repository");
  });
});
