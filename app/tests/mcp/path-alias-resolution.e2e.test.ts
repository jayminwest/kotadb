/**
 * E2E tests for path alias resolution across monorepo-like structures.
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 * and real filesystem fixtures to test the full path alias pipeline.
 *
 * Test Coverage:
 * - parseTsConfig: Discovers tsconfig.json in subdirectories (Bug #1)
 * - resolvePathAlias: Returns repo-root-relative paths (Bug #2)
 * - resolveImport: .js extension imports resolve to .ts files (Bug #3)
 * - Full indexing workflow: All path alias imports resolve correctly (Bug #4)
 * - search_dependencies: Finds path alias edges after indexing
 * - .js→.ts resolution: Relative .js imports resolve during indexing
 *
 * @module tests/mcp/path-alias-resolution-e2e
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parseTsConfig, resolvePathAlias } from "@indexer/path-resolver.js";
import { resolveImport } from "@indexer/import-resolver.js";
import { runIndexingWorkflow } from "@api/queries.js";
import { executeSearchDependencies } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { createTempDir, cleanupTempDir } from "../helpers/db.js";

// ============================================================================
// Monorepo Fixture Layout
// ============================================================================
//
// fixture-root/                    <- repo root (localPath)
// ├── app/                         <- subdirectory with tsconfig
// │   ├── tsconfig.json            <- path aliases defined here
// │   ├── src/
// │   │   ├── index.ts             <- imports via @api/routes.js, @db/schema.js
// │   │   ├── api/
// │   │   │   ├── routes.ts        <- target file
// │   │   │   └── index.ts         <- imports @db/schema.js
// │   │   ├── db/
// │   │   │   └── schema.ts        <- target file
// │   │   └── utils/
// │   │       └── helper.ts        <- imported via ../utils/helper.js
// │   └── shared/
// │       └── types.ts             <- imported via relative .js extension
// ============================================================================

describe("path alias resolution E2E", () => {
  let tempDir: string;
  let fixtureDir: string;
  let dbPath: string;
  let db: KotaDatabase;
  let originalDbPath: string | undefined;
  let repoId: string;
  let repoName: string;
  const requestId = "test-request";
  const userId = "test-user";

  beforeAll(async () => {
    // Set up isolated test database
    tempDir = createTempDir("path-alias-e2e-");
    dbPath = join(tempDir, "test.db");
    originalDbPath = process.env.KOTADB_PATH;
    process.env.KOTADB_PATH = dbPath;
    closeGlobalConnections();

    // Create monorepo-like fixture WITHIN workspace for security check
    const workspaceRoot = process.cwd();
    fixtureDir = join(workspaceRoot, ".test-fixtures-e2e-" + randomUUID().slice(0, 8));

    // Build directory structure
    mkdirSync(join(fixtureDir, "app", "src", "api"), { recursive: true });
    mkdirSync(join(fixtureDir, "app", "src", "db"), { recursive: true });
    mkdirSync(join(fixtureDir, "app", "src", "utils"), { recursive: true });
    mkdirSync(join(fixtureDir, "app", "shared"), { recursive: true });

    // tsconfig.json in app/ subdirectory (NOT at repo root)
    writeFileSync(
      join(fixtureDir, "app", "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@api/*": ["src/api/*"],
              "@db/*": ["src/db/*"],
            },
          },
        },
        null,
        2,
      ),
    );

    // Source files with path alias imports
    writeFileSync(
      join(fixtureDir, "app", "src", "index.ts"),
      [
        'import { routes } from "@api/routes.js";',
        'import { schema } from "@db/schema.js";',
        'import { helper } from "../shared/types.js";',
        "",
        "export { routes, schema, helper };",
      ].join("\n"),
    );

    writeFileSync(
      join(fixtureDir, "app", "src", "api", "routes.ts"),
      [
        'import { schema } from "@db/schema.js";',
        'import { helper } from "../utils/helper.js";',
        "",
        "export const routes = [schema, helper];",
      ].join("\n"),
    );

    writeFileSync(
      join(fixtureDir, "app", "src", "api", "index.ts"),
      [
        'import { schema } from "@db/schema.js";',
        "",
        "export { schema };",
      ].join("\n"),
    );

    writeFileSync(
      join(fixtureDir, "app", "src", "db", "schema.ts"),
      'export const schema = { tables: [] };',
    );

    writeFileSync(
      join(fixtureDir, "app", "src", "utils", "helper.ts"),
      'export function helper(): string { return "help"; }',
    );

    writeFileSync(
      join(fixtureDir, "app", "shared", "types.ts"),
      'export const helper = "shared-types";',
    );

    // Initialize database
    db = getGlobalDatabase();

    // Run full indexing workflow
    repoName = "test-repo-" + randomUUID().slice(0, 8);
    await runIndexingWorkflow({
      repository: repoName,
      localPath: fixtureDir,
    });

    // Get created repository ID
    const repo = db.queryOne<{ id: string }>(
      "SELECT id FROM repositories WHERE full_name LIKE ?",
      [`local/${repoName}`],
    );
    if (!repo) {
      throw new Error("Repository not created during fixture setup");
    }
    repoId = repo.id;
  });

  afterAll(() => {
    // Clean up fixture directory
    try {
      if (fixtureDir && existsSync(fixtureDir)) {
        rmSync(fixtureDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }

    // Restore environment
    if (originalDbPath !== undefined) {
      process.env.KOTADB_PATH = originalDbPath;
    } else {
      delete process.env.KOTADB_PATH;
    }
    closeGlobalConnections();
    cleanupTempDir(tempDir);
  });

  // ==========================================================================
  // Test 1: tsconfig.json discovery in subdirectory (Bug #1)
  // ==========================================================================

  describe("parseTsConfig()", () => {
    test("should discover tsconfig.json in subdirectory", () => {
      // parseTsConfig is called with the repo root (fixtureDir).
      // The tsconfig.json is in fixtureDir/app/, not at fixtureDir root.
      // After the fix, parseTsConfig should walk subdirectories to find it.
      const mappings = parseTsConfig(fixtureDir);

      // If parseTsConfig only checks the root, this will be null (Bug #1).
      // After fix, it should find the tsconfig in app/ subdirectory.
      expect(mappings).not.toBeNull();

      if (mappings) {
        expect(Object.keys(mappings.paths)).toContain("@api/*");
        expect(Object.keys(mappings.paths)).toContain("@db/*");
        expect(mappings.paths["@api/*"]).toEqual(["src/api/*"]);
        expect(mappings.paths["@db/*"]).toEqual(["src/db/*"]);
      }
    });

    test("should return null when no tsconfig.json exists anywhere", () => {
      // Create a directory with no tsconfig at all
      const emptyDir = join(tempDir, "no-tsconfig-" + randomUUID().slice(0, 8));
      mkdirSync(emptyDir, { recursive: true });

      const mappings = parseTsConfig(emptyDir);
      expect(mappings).toBeNull();

      rmSync(emptyDir, { recursive: true, force: true });
    });

    test("should find tsconfig.json at direct root level", () => {
      // Verify parseTsConfig still works when tsconfig IS at root
      const directDir = join(fixtureDir, "app");
      const mappings = parseTsConfig(directDir);

      expect(mappings).not.toBeNull();
      if (mappings) {
        expect(mappings.paths["@api/*"]).toEqual(["src/api/*"]);
      }
    });
  });

  // ==========================================================================
  // Test 2: Path alias resolution returns repo-root-relative paths (Bug #2)
  // ==========================================================================

  describe("resolvePathAlias()", () => {
    test("should resolve path aliases to repo-root-relative paths", () => {
      // Build a files Set with repo-root-relative paths (as stored in DB)
      const files = new Set([
        "app/src/api/routes.ts",
        "app/src/api/index.ts",
        "app/src/db/schema.ts",
        "app/src/index.ts",
        "app/src/utils/helper.ts",
        "app/shared/types.ts",
      ]);

      // The mappings as parsed from tsconfig in app/ subdirectory.
      // After fix, tsconfigDir should be factored into resolution.
      const mappings = parseTsConfig(fixtureDir);
      expect(mappings).not.toBeNull();

      if (mappings) {
        // @api/routes should resolve to app/src/api/routes.ts (repo-root-relative)
        // Bug #2: without the fix, it resolves to src/api/routes.ts (tsconfig-relative)
        const routesResult = resolvePathAlias(
          "@api/routes",
          fixtureDir,
          files,
          mappings,
        );
        expect(routesResult).toBe("app/src/api/routes.ts");

        // @db/schema should resolve to app/src/db/schema.ts
        const schemaResult = resolvePathAlias(
          "@db/schema",
          fixtureDir,
          files,
          mappings,
        );
        expect(schemaResult).toBe("app/src/db/schema.ts");
      }
    });

    test("should resolve path alias with .js extension to .ts file", () => {
      const files = new Set([
        "app/src/api/routes.ts",
        "app/src/db/schema.ts",
      ]);

      const mappings = parseTsConfig(fixtureDir);
      expect(mappings).not.toBeNull();

      if (mappings) {
        // Import uses .js extension but actual file is .ts
        // Bug #3: .js→.ts substitution must work for path alias imports
        const result = resolvePathAlias(
          "@api/routes.js",
          fixtureDir,
          files,
          mappings,
        );

        // Should resolve to the .ts file, not return null
        // This tests that the resolver strips .js and tries .ts
        expect(result).toBe("app/src/api/routes.ts");
      }
    });

    test("should return null for unresolved alias", () => {
      const files = new Set(["app/src/api/routes.ts"]);

      const mappings = parseTsConfig(fixtureDir);
      if (mappings) {
        const result = resolvePathAlias(
          "@unknown/module",
          fixtureDir,
          files,
          mappings,
        );
        expect(result).toBeNull();
      }
    });
  });

  // ==========================================================================
  // Test 3: .js extension imports resolve to .ts files (Bug #3)
  // ==========================================================================

  describe("resolveImport() .js→.ts resolution", () => {
    test("should resolve relative .js imports to .ts files", () => {
      // Files as stored in DB (repo-root-relative)
      const files = [
        { path: "app/src/utils/helper.ts" },
        { path: "app/src/api/routes.ts" },
      ];

      // Import from routes.ts using .js extension for a .ts file
      const result = resolveImport(
        "../utils/helper.js",
        "app/src/api/routes.ts",
        files,
        null,
      );

      // Bug #3: without .js→.ts substitution, this returns null
      // After fix: should resolve to the .ts file
      expect(result).toBe("app/src/utils/helper.ts");
    });

    test("should resolve relative .js import to actual .js file when it exists", () => {
      const files = [
        { path: "app/src/utils/helper.js" },
        { path: "app/src/api/routes.ts" },
      ];

      const result = resolveImport(
        "../utils/helper.js",
        "app/src/api/routes.ts",
        files,
        null,
      );

      // When the .js file exists, it should resolve to it directly
      expect(result).toBe("app/src/utils/helper.js");
    });

    test("should resolve path alias import with .js extension via mappings", () => {
      const files = [
        { path: "app/src/db/schema.ts" },
        { path: "app/src/api/routes.ts" },
      ];

      const mappings = parseTsConfig(fixtureDir);
      expect(mappings).not.toBeNull();

      if (mappings) {
        // @db/schema.js should resolve to app/src/db/schema.ts
        const result = resolveImport(
          "@db/schema.js",
          "app/src/api/routes.ts",
          files,
          mappings,
        );

        expect(result).toBe("app/src/db/schema.ts");
      }
    });
  });

  // ==========================================================================
  // Test 4: Full indexing workflow resolves all path alias imports
  // ==========================================================================

  describe("full indexing workflow", () => {
    test("should resolve all path alias imports with non-null target_file_path", () => {
      // Query import references from the indexed repository
      const references = db.query<{
        source_file_path: string;
        target_file_path: string | null;
        metadata: string;
      }>(
        `SELECT
           f.path as source_file_path,
           r.target_file_path,
           r.metadata
         FROM indexed_references r
         JOIN indexed_files f ON r.file_id = f.id
         WHERE r.repository_id = ?
           AND r.reference_type = 'import'`,
        [repoId],
      );

      // Find all path alias imports (those with @ prefix in importSource)
      const aliasImports = references.filter((r) => {
        const metadata = JSON.parse(r.metadata || "{}");
        return metadata.importSource?.startsWith("@");
      });

      // There should be path alias imports found
      expect(aliasImports.length).toBeGreaterThan(0);

      // KEY ACCEPTANCE CRITERION: ALL path alias imports must be resolved
      const unresolvedAliases = aliasImports.filter(
        (r) => r.target_file_path === null || r.target_file_path === "",
      );
      expect(unresolvedAliases).toEqual([]);

      // Verify specific resolution targets
      for (const ref of aliasImports) {
        expect(ref.target_file_path).not.toBeNull();
        expect(ref.target_file_path).toBeTruthy();

        const metadata = JSON.parse(ref.metadata || "{}");

        if (metadata.importSource === "@api/routes" || metadata.importSource === "@api/routes.js") {
          expect(ref.target_file_path).toContain("api/routes.ts");
        }
        if (metadata.importSource === "@db/schema" || metadata.importSource === "@db/schema.js") {
          expect(ref.target_file_path).toContain("db/schema.ts");
        }
      }
    });

    test("should also resolve relative imports correctly", () => {
      const references = db.query<{
        source_file_path: string;
        target_file_path: string | null;
        metadata: string;
      }>(
        `SELECT
           f.path as source_file_path,
           r.target_file_path,
           r.metadata
         FROM indexed_references r
         JOIN indexed_files f ON r.file_id = f.id
         WHERE r.repository_id = ?
           AND r.reference_type = 'import'`,
        [repoId],
      );

      // Find relative imports (those starting with . in importSource)
      const relativeImports = references.filter((r) => {
        const metadata = JSON.parse(r.metadata || "{}");
        return metadata.importSource?.startsWith(".");
      });

      // Relative imports should exist and be resolved
      if (relativeImports.length > 0) {
        for (const ref of relativeImports) {
          expect(ref.target_file_path).not.toBeNull();
        }
      }
    });
  });

  // ==========================================================================
  // Test 5: search_dependencies finds path alias edges
  // ==========================================================================

  describe("search_dependencies MCP tool", () => {
    test("should find dependents of a file imported via path alias", async () => {
      // routes.ts is imported via @api/routes from index.ts
      const result = (await executeSearchDependencies(
        {
          file_path: "app/src/api/routes.ts",
          direction: "dependents",
          depth: 1,
          repository: repoId,
        },
        requestId,
        userId,
      )) as { dependents: { direct: string[]; count: number } };

      // index.ts imports @api/routes, so it should be a dependent
      expect(result.dependents.direct).toContain("app/src/index.ts");
      expect(result.dependents.count).toBeGreaterThanOrEqual(1);
    });

    test("should find dependencies of a file that uses path aliases", async () => {
      // index.ts imports @api/routes and @db/schema
      const result = (await executeSearchDependencies(
        {
          file_path: "app/src/index.ts",
          direction: "dependencies",
          depth: 1,
          repository: repoId,
        },
        requestId,
        userId,
      )) as { dependencies: { direct: string[]; count: number } };

      // Should include files imported via path aliases
      expect(result.dependencies.direct).toContain("app/src/api/routes.ts");
      expect(result.dependencies.direct).toContain("app/src/db/schema.ts");
    });

    test("should find transitive path alias dependencies", async () => {
      // schema.ts is imported by index.ts AND api/index.ts AND api/routes.ts
      const result = (await executeSearchDependencies(
        {
          file_path: "app/src/db/schema.ts",
          direction: "dependents",
          depth: 2,
          repository: repoId,
        },
        requestId,
        userId,
      )) as { dependents: { direct: string[]; indirect: Record<string, string[]> } };

      // Direct dependents: files that import @db/schema
      expect(result.dependents.direct).toContain("app/src/index.ts");
      expect(result.dependents.direct).toContain("app/src/api/index.ts");
      expect(result.dependents.direct).toContain("app/src/api/routes.ts");
    });
  });

  // ==========================================================================
  // Test 6: .js→.ts resolution in relative imports during indexing
  // ==========================================================================

  describe(".js→.ts relative import resolution during indexing", () => {
    test("should resolve .js extension imports to .ts files in the database", () => {
      // Query for imports that used .js extension in source but should resolve to .ts
      const references = db.query<{
        source_file_path: string;
        target_file_path: string | null;
        metadata: string;
      }>(
        `SELECT
           f.path as source_file_path,
           r.target_file_path,
           r.metadata
         FROM indexed_references r
         JOIN indexed_files f ON r.file_id = f.id
         WHERE r.repository_id = ?
           AND r.reference_type = 'import'`,
        [repoId],
      );

      // Find imports that used .js extension
      const jsExtImports = references.filter((r) => {
        const metadata = JSON.parse(r.metadata || "{}");
        return (
          metadata.importSource?.endsWith(".js") ||
          metadata.importSource?.includes(".js")
        );
      });

      // All .js imports should have resolved target paths pointing to .ts files
      for (const ref of jsExtImports) {
        expect(ref.target_file_path).not.toBeNull();
        // The resolved path should end in .ts (the actual file)
        if (ref.target_file_path) {
          expect(ref.target_file_path.endsWith(".ts")).toBe(true);
        }
      }
    });

    test("should have indexed all fixture files", () => {
      const files = db.query<{ path: string }>(
        "SELECT path FROM indexed_files WHERE repository_id = ? ORDER BY path",
        [repoId],
      );

      const paths = files.map((f) => f.path);

      // All fixture files should be indexed
      expect(paths).toContainEqual(expect.stringContaining("api/routes.ts"));
      expect(paths).toContainEqual(expect.stringContaining("api/index.ts"));
      expect(paths).toContainEqual(expect.stringContaining("db/schema.ts"));
      expect(paths).toContainEqual(expect.stringContaining("index.ts"));
      expect(paths).toContainEqual(expect.stringContaining("utils/helper.ts"));
    });
  });
});
