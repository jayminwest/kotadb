/**
 * Tests for search_dependencies MCP tool
 *
 * Following antimocking philosophy: uses real file-based SQLite databases
 * with proper KOTADB_PATH environment isolation.
 *
 * Test Coverage:
 * - search_dependencies: Dependency graph traversal with direction options
 *
 * @module tests/mcp/search-dependencies
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { executeSearchDependencies } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { createTempDir, cleanupTempDir, clearTestData } from "../helpers/db.js";

describe("search_dependencies MCP tool", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let originalDbPath: string | undefined;
	const requestId = "test-request-1";
	const userId = "test-user-1";

	beforeAll(() => {
		// Create temp directory and set KOTADB_PATH for test isolation
		tempDir = createTempDir("mcp-search-deps-test-");
		dbPath = join(tempDir, "test.db");
		
		originalDbPath = process.env.KOTADB_PATH;
		process.env.KOTADB_PATH = dbPath;
		closeGlobalConnections();
	});

	afterAll(() => {
		// Restore original KOTADB_PATH
		if (originalDbPath !== undefined) {
			process.env.KOTADB_PATH = originalDbPath;
		} else {
			delete process.env.KOTADB_PATH;
		}
		closeGlobalConnections();
		cleanupTempDir(tempDir);
	});

	beforeEach(() => {
		// Get database after KOTADB_PATH is set
		db = getGlobalDatabase();
		
		// Seed a test repository and file for tests that need it
		const repoId = randomUUID();
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[repoId, "test-repo", "test-owner/test-repo", "main"],
		);
		db.run(
			`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
			[
				randomUUID(),
				repoId,
				"src/test.ts",
				"export const test = true;",
				"typescript",
				new Date().toISOString(),
			],
		);
	});

	afterEach(() => {
		clearTestData(db);
	});

	test("should require file_path parameter", async () => {
		await expect(async () => {
			await executeSearchDependencies({}, requestId, userId);
		}).toThrow("Missing required parameter: file_path");
	});

	test("should throw error when params is not an object", async () => {
		await expect(async () => {
			await executeSearchDependencies("invalid", requestId, userId);
		}).toThrow("Parameters must be an object");
	});

	test("should throw error when file_path is not a string", async () => {
		await expect(async () => {
			await executeSearchDependencies({ file_path: 123 }, requestId, userId);
		}).toThrow("Parameter 'file_path' must be a string");
	});

	test("should search dependencies with default direction", async () => {
		const result = (await executeSearchDependencies(
			{ file_path: "src/test.ts" },
			requestId,
			userId,
		)) as { file_path: string; direction: string };

		expect(result.file_path).toBe("src/test.ts");
		expect(result.direction).toBe("both"); // default
	});

	test("should handle non-existent file gracefully", async () => {
		const result = (await executeSearchDependencies(
			{ file_path: "src/nonexistent12345.ts" },
			requestId,
			userId,
		)) as { file_path: string };

		expect(result.file_path).toBe("src/nonexistent12345.ts");
	});

	test("should accept direction parameter", async () => {
		const result = (await executeSearchDependencies(
			{ file_path: "src/test.ts", direction: "dependents" },
			requestId,
			userId,
		)) as { direction: string };

		expect(result.direction).toBe("dependents");
	});

	test("should throw error for invalid direction", async () => {
		await expect(async () => {
			await executeSearchDependencies(
				{ file_path: "src/test.ts", direction: "invalid" },
				requestId,
				userId,
			);
		}).toThrow("Parameter 'direction' must be one of: dependents, dependencies, both");
	});

	test("should accept depth parameter", async () => {
		const result = (await executeSearchDependencies(
			{ file_path: "src/test.ts", depth: 2 },
			requestId,
			userId,
		)) as { depth: number };

		expect(result.depth).toBe(2);
	});

	test("should throw error for invalid depth", async () => {
		await expect(async () => {
			await executeSearchDependencies(
				{ file_path: "src/test.ts", depth: 10 },
				requestId,
				userId,
			);
		}).toThrow("Parameter 'depth' must be between 1 and 5");
	});

	test("should throw error when depth is not a number", async () => {
		await expect(async () => {
			await executeSearchDependencies(
				{ file_path: "src/test.ts", depth: "invalid" },
				requestId,
				userId,
			);
		}).toThrow("Parameter 'depth' must be a number");
	});

	test("should accept include_tests parameter", async () => {
		const result = (await executeSearchDependencies(
			{ file_path: "src/test.ts", include_tests: false },
			requestId,
			userId,
		)) as { file_path: string };

		expect(result.file_path).toBe("src/test.ts");
	});

	test("should throw error when include_tests is not boolean", async () => {
		await expect(async () => {
			await executeSearchDependencies(
				{ file_path: "src/test.ts", include_tests: "yes" },
				requestId,
				userId,
			);
		}).toThrow("Parameter 'include_tests' must be a boolean");
	});
});
