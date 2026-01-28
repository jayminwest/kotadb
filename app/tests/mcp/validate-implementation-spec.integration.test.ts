/**
 * Integration tests for validate_implementation_spec MCP tool
 * 
 * Tests implementation spec validation with seeded SQLite database fixtures.
 * Follows antimocking philosophy - no mocks, real database operations.
 * 
 * Uses file-based test database with KOTADB_PATH environment variable.
 * 
 * @module tests/mcp/validate-implementation-spec.integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { executeValidateImplementationSpec } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { 
  createTempDir, 
  cleanupTempDir, 
  clearTestData,
} from "../helpers/db.js";

describe("validate_implementation_spec integration tests", () => {
  let tempDir: string;
  let dbPath: string;
  let db: KotaDatabase;
  let originalDbPath: string | undefined;
  let repoId: string;
  const requestId = "test-request";
  const userId = "test-user";
  
  beforeAll(() => {
    tempDir = createTempDir("validate-spec-test-");
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
    
    // Create existing file for conflict detection
    const fileId = randomUUID();
    db.run(
      `INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId,
        repoId,
        "src/existing.ts",
        "export const EXISTING = true;",
        "typescript",
        new Date().toISOString(),
        randomUUID(),
      ]
    );
  });
  
  afterEach(() => {
    clearTestData(db);
  });
  
  test("should detect file conflicts", async () => {
    const result = await executeValidateImplementationSpec(
      {
        feature_name: "Duplicate File Feature",
        files_to_create: [
          { path: "src/existing.ts", purpose: "New implementation" },
        ],
      },
      requestId,
      userId
    ) as { valid: boolean; errors: Array<{ message: string }> };
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => 
      e.message.toLowerCase().includes("already exists") || e.message.toLowerCase().includes("conflict")
    )).toBe(true);
  });
  
  test("should validate migration naming conventions", async () => {
    const result = await executeValidateImplementationSpec(
      {
        feature_name: "Database Changes",
        migrations: [
          {
            filename: "invalid_migration.sql",
            description: "Add users table",
          },
        ],
      },
      requestId,
      userId
    ) as { valid: boolean; errors: Array<{ message: string }> };
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => 
      e.message.toLowerCase().includes("migration") && e.message.toLowerCase().includes("filename")
    )).toBe(true);
  });
  
  test("should accept valid migration naming", async () => {
    const result = await executeValidateImplementationSpec(
      {
        feature_name: "Valid Migration",
        migrations: [
          {
            filename: "20250128120000_add_users.sql",
            description: "Add users table",
            tables_affected: ["users"],
          },
        ],
      },
      requestId,
      userId
    ) as { errors: Array<{ type: string }> };
    
    const namingErrors = result.errors.filter(e => e.type === "naming_convention");
    expect(namingErrors.length).toBe(0);
  });
  
  test("should warn about low test coverage", async () => {
    const result = await executeValidateImplementationSpec(
      {
        feature_name: "Low Coverage Feature",
        files_to_create: [
          { path: "src/feature1.ts", purpose: "Implementation" },
          { path: "src/feature2.ts", purpose: "Implementation" },
          { path: "src/feature3.ts", purpose: "Implementation" },
        ],
      },
      requestId,
      userId
    ) as { warnings: Array<{ type: string }> };
    
    expect(result.warnings.some(w => 
      w.type === "test_coverage" || w.type.toLowerCase().includes("coverage")
    )).toBe(true);
  });
  
  test("should calculate risk assessment", async () => {
    const result = await executeValidateImplementationSpec(
      {
        feature_name: "High Risk Feature",
        breaking_changes: true,
        files_to_modify: Array.from({ length: 25 }, (_, i) => ({
          path: `src/file${i}.ts`,
          purpose: "Update",
        })),
      },
      requestId,
      userId
    ) as { risk_assessment: string };
    
    expect(result.risk_assessment.toLowerCase()).toContain("high");
  });
  
  test("should handle no repository gracefully", async () => {
    db.run("DELETE FROM repositories");
    
    const result = await executeValidateImplementationSpec(
      {
        feature_name: "No Repo Feature",
      },
      requestId,
      userId
    ) as { valid: boolean; errors: Array<{ message: string }> };
    
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message.toLowerCase()).toContain("no repository");
  });
});
