/**
 * Integration tests for list_recent_files MCP tool
 *
 * Tests the list_recent_files tool with various repository filter scenarios:
 * - No repository filter (should work)
 * - UUID repository filter (should work)
 * - full_name repository filter (Bug #137 fix - should now work)
 * - Invalid repository (should return helpful error)
 *
 * Follows antimocking philosophy - uses real SQLite and real data.
 *
 * @module tests/mcp/list-recent-files.integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { executeListRecentFiles, executeIndexRepository } from "@mcp/tools.js";
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
	let testProjectsDir: string;
	let db: KotaDatabase;
	let originalDbPath: string | undefined;
	const requestId = "test-request";
	const userId = "test-user";

	// Store indexed repository info for tests
	let indexedRepoId: string;
	const repoFullName = "test-owner/list-recent-test";

	beforeAll(async () => {
		tempDir = createTempDir("list-recent-test-");
		dbPath = join(tempDir, "test.db");

		// Create test projects directory within app directory (workspace requirement)
		testProjectsDir = join(process.cwd(), ".test-projects-list-recent");
		if (existsSync(testProjectsDir)) {
			rmSync(testProjectsDir, { recursive: true, force: true });
		}
		mkdirSync(testProjectsDir, { recursive: true });

		originalDbPath = process.env.KOTADB_PATH;
		process.env.KOTADB_PATH = dbPath;
		closeGlobalConnections();

		// Create and index a test project for all tests to use
		const projectDir = join(testProjectsDir, "list-recent-project");
		mkdirSync(projectDir, { recursive: true });
		mkdirSync(join(projectDir, "src"), { recursive: true });

		writeFileSync(
			join(projectDir, "src", "index.ts"),
			"export function main() { return 'hello'; }"
		);
		writeFileSync(
			join(projectDir, "src", "utils.ts"),
			"export const VERSION = '1.0.0';"
		);
		writeFileSync(
			join(projectDir, "src", "helper.ts"),
			"export function helper() { return 42; }"
		);

		// Index the project
		const indexResult = (await executeIndexRepository(
			{
				repository: repoFullName,
				localPath: projectDir,
			},
			requestId,
			userId
		)) as { repositoryId: string };

		indexedRepoId = indexResult.repositoryId;
	});

	afterAll(() => {
		if (originalDbPath !== undefined) {
			process.env.KOTADB_PATH = originalDbPath;
		} else {
			delete process.env.KOTADB_PATH;
		}
		closeGlobalConnections();
		cleanupTempDir(tempDir);

		// Clean up test projects directory
		if (existsSync(testProjectsDir)) {
			rmSync(testProjectsDir, { recursive: true, force: true });
		}
	});

	beforeEach(() => {
		db = getGlobalDatabase();
	});

	describe("without repository filter", () => {
		test("should list recent files from all repositories", async () => {
			const result = (await executeListRecentFiles(
				{ limit: 10 },
				requestId,
				userId
			)) as { results: Array<{ path: string; projectRoot: string }> };

			expect(result.results).toBeDefined();
			expect(Array.isArray(result.results)).toBe(true);
			expect(result.results.length).toBeGreaterThan(0);

			// Should include files from our indexed repository
			const paths = result.results.map((r) => r.path);
			expect(paths.some((p) => p.includes("index.ts"))).toBe(true);
		});

		test("should respect limit parameter", async () => {
			const result = (await executeListRecentFiles(
				{ limit: 2 },
				requestId,
				userId
			)) as { results: Array<{ path: string }> };

			expect(result.results.length).toBeLessThanOrEqual(2);
		});

		test("should use default limit when not specified", async () => {
			const result = (await executeListRecentFiles(
				{},
				requestId,
				userId
			)) as { results: Array<{ path: string }> };

			expect(result.results).toBeDefined();
			// Default limit is 10, so should be at most 10
			expect(result.results.length).toBeLessThanOrEqual(10);
		});
	});

	describe("with UUID repository filter", () => {
		test("should filter files by repository UUID", async () => {
			const result = (await executeListRecentFiles(
				{ limit: 10, repository: indexedRepoId },
				requestId,
				userId
			)) as { results: Array<{ path: string; projectRoot: string }> };

			expect(result.results).toBeDefined();
			expect(result.results.length).toBeGreaterThan(0);

			// All files should be from the specified repository
			for (const file of result.results) {
				expect(file.projectRoot).toBe(indexedRepoId);
			}
		});

		test("should return empty results for non-existent UUID", async () => {
			const fakeUuid = "00000000-0000-0000-0000-000000000000";
			const result = (await executeListRecentFiles(
				{ limit: 10, repository: fakeUuid },
				requestId,
				userId
			)) as { results: Array<{ path: string }> };

			expect(result.results).toBeDefined();
			expect(result.results.length).toBe(0);
		});
	});

	describe("with full_name repository filter (Bug #137 fix)", () => {
		test("should resolve full_name to UUID and filter correctly", async () => {
			// This is the key test for Bug #137 - full_name should be resolved to UUID
			const result = (await executeListRecentFiles(
				{ limit: 10, repository: repoFullName },
				requestId,
				userId
			)) as { results: Array<{ path: string; projectRoot: string }> };

			expect(result.results).toBeDefined();
			expect(result.results.length).toBeGreaterThan(0);

			// All files should be from the resolved repository
			for (const file of result.results) {
				expect(file.projectRoot).toBe(indexedRepoId);
			}
		});

		test("should work with owner/repo format", async () => {
			const result = (await executeListRecentFiles(
				{ limit: 5, repository: repoFullName },
				requestId,
				userId
			)) as { results: Array<{ path: string }> };

			expect(result.results).toBeDefined();
			// Should find our indexed files
			const paths = result.results.map((r) => r.path);
			expect(paths.length).toBeGreaterThan(0);
		});
	});

	describe("with invalid repository filter", () => {
		test("should return empty results for non-existent full_name", async () => {
			const result = (await executeListRecentFiles(
				{ limit: 10, repository: "non-existent/repository" },
				requestId,
				userId
			)) as { results: Array<{ path: string }> };

			// When repository is not found, should return empty results
			// (the resolver returns the string as-is for non-UUID, non-found repos)
			expect(result.results).toBeDefined();
			expect(result.results.length).toBe(0);
		});
	});

	describe("result format", () => {
		test("should include required fields in results", async () => {
			const result = (await executeListRecentFiles(
				{ limit: 1, repository: indexedRepoId },
				requestId,
				userId
			)) as { results: Array<{ path: string; projectRoot: string; dependencies: unknown; indexedAt: string }> };

			expect(result.results.length).toBe(1);

			const file = result.results[0]!;
			expect(file.path).toBeDefined();
			expect(typeof file.path).toBe("string");
			expect(file.projectRoot).toBeDefined();
			expect(typeof file.projectRoot).toBe("string");
			expect(file.dependencies).toBeDefined();
			expect(file.indexedAt).toBeDefined();
			expect(typeof file.indexedAt).toBe("string");
		});

		test("should return indexedAt as ISO string", async () => {
			const result = (await executeListRecentFiles(
				{ limit: 1 },
				requestId,
				userId
			)) as { results: Array<{ indexedAt: string }> };

			expect(result.results.length).toBeGreaterThan(0);

			const file = result.results[0]!;
			// Should be a valid ISO date string
			const date = new Date(file.indexedAt);
			expect(date.toString()).not.toBe("Invalid Date");
		});
	});
});
