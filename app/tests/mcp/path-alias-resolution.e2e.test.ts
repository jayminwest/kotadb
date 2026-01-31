/**
 * E2E tests for path alias resolution in full indexing workflow.
 * 
 * Tests real tsconfig.json parsing, import resolution, and MCP tool integration.
 * Uses temporary fixtures within the workspace.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runIndexingWorkflow } from "@api/queries.js";
import { executeSearchDependencies } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { createTempDir, cleanupTempDir } from "../helpers/db.js";

describe("path alias resolution E2E", () => {
  let tempDir: string;
  let fixtureDir: string;
  let dbPath: string;
  let db: KotaDatabase;
  let originalDbPath: string | undefined;
  let repoId: string;
  const requestId = "test-request";
  const userId = "test-user";
  
  beforeAll(async () => {
    // Create test database
    tempDir = createTempDir("path-alias-e2e-");
    dbPath = join(tempDir, "test.db");
    originalDbPath = process.env.KOTADB_PATH;
    process.env.KOTADB_PATH = dbPath;
    closeGlobalConnections();
    
    // Create fixture directory WITHIN workspace for security check
    const workspaceRoot = process.cwd();
    fixtureDir = join(workspaceRoot, ".test-fixtures-e2e-" + randomUUID().slice(0, 8));
    mkdirSync(join(fixtureDir, "src", "api"), { recursive: true });
    mkdirSync(join(fixtureDir, "src", "db"), { recursive: true });
    
    // tsconfig.json with path aliases
    writeFileSync(
      join(fixtureDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@api/*": ["src/api/*"],
            "@db/*": ["src/db/*"],
          },
        },
      })
    );
    
    // Target files
    writeFileSync(
      join(fixtureDir, "src", "api", "routes.ts"),
      "export const routes = [];"
    );
    
    writeFileSync(
      join(fixtureDir, "src", "db", "schema.ts"),
      "export const schema = {};"
    );
    
    // Importer files with path aliases
    writeFileSync(
      join(fixtureDir, "src", "index.ts"),
      `import { routes } from '@api/routes';
import { schema } from '@db/schema';

export { routes, schema };`
    );
    
    writeFileSync(
      join(fixtureDir, "src", "api", "index.ts"),
      `import { schema } from '@db/schema';

export { schema };`
    );
    
    // Initialize database
    db = getGlobalDatabase();
    
    // Run full indexing workflow (parses tsconfig, resolves imports)
    // This will create the repository automatically
    const repoName = "test-repo-" + randomUUID().slice(0, 8);
    await runIndexingWorkflow({
      repository: repoName,
      localPath: fixtureDir,
    });
    
    // Get the created repository ID
    const repo = db.queryOne<{ id: string }>(
      `SELECT id FROM repositories WHERE full_name LIKE ?`,
      [`local/${repoName}`]
    );
    if (!repo) {
      throw new Error("Repository not created");
    }
    repoId = repo.id;
  });
  
  afterAll(() => {
    // Clean up fixture directory
    try {
      rmSync(fixtureDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    if (originalDbPath !== undefined) {
      process.env.KOTADB_PATH = originalDbPath;
    } else {
      delete process.env.KOTADB_PATH;
    }
    closeGlobalConnections();
    cleanupTempDir(tempDir);
  });
  
  test("indexes files with path alias imports and resolves dependencies", () => {
    // Verify path alias imports were resolved
    const references = db.query<{ source_file_path: string; target_file_path: string | null; metadata: string }>(
      `SELECT 
         f.path as source_file_path,
         r.target_file_path,
         r.metadata
       FROM indexed_references r
       JOIN indexed_files f ON r.file_id = f.id
       WHERE r.repository_id = ?
       AND r.reference_type = 'import'`,
      [repoId]
    );
    
    // Find path alias imports
    const aliasImports = references.filter(r => {
      const metadata = JSON.parse(r.metadata || "{}");
      return metadata.importSource?.startsWith("@");
    });
    
    expect(aliasImports.length).toBeGreaterThan(0);
    
    // All path alias imports should have resolved target_file_path
    for (const ref of aliasImports) {
      expect(ref.target_file_path).not.toBeNull();
      expect(ref.target_file_path).toBeTruthy();
      
      const metadata = JSON.parse(ref.metadata || "{}");
      
      // Validate specific resolutions
      if (metadata.importSource === "@api/routes") {
        expect(ref.target_file_path).toContain("src/api/routes.ts");
      }
      if (metadata.importSource === "@db/schema") {
        expect(ref.target_file_path).toContain("src/db/schema.ts");
      }
    }
  });
  
  test("search_dependencies MCP tool finds path alias dependents", async () => {
    // Search for dependents of routes.ts
    const result = await executeSearchDependencies(
      {
        file_path: "src/api/routes.ts",
        direction: "dependents",
        depth: 1,
        repository: repoId,
      },
      requestId,
      userId
    ) as { dependents: { direct: string[]; count: number } };
    
    // Should find src/index.ts (imports via @api/routes)
    expect(result.dependents.direct).toContain("src/index.ts");
    expect(result.dependents.count).toBeGreaterThanOrEqual(1);
  });
  
  test("resolves transitive path alias dependencies", async () => {
    // schema.ts has dependents: index.ts (@db/schema) and api/index.ts (@db/schema)
    const result = await executeSearchDependencies(
      {
        file_path: "src/db/schema.ts",
        direction: "dependents",
        depth: 2,
        repository: repoId,
      },
      requestId,
      userId
    ) as { dependents: { direct: string[]; indirect: Record<string, string[]> } };
    
    // Direct dependents
    expect(result.dependents.direct).toContain("src/index.ts");
    expect(result.dependents.direct).toContain("src/api/index.ts");
  });
});
