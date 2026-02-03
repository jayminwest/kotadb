/**
 * Tests for generateTaskContext MCP tool
 *
 * Following antimocking philosophy: uses real file-based SQLite databases
 * with proper KOTADB_PATH environment isolation.
 *
 * Test Coverage:
 * - generateTaskContext: Context generation for agent workflows
 * - File dependency lookups
 * - Test file discovery
 * - Graceful degradation for non-existent files
 * - Performance requirements (<100ms)
 *
 * @module tests/mcp/generateTaskContext
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { createTempDir, cleanupTempDir, clearTestData } from "../helpers/db.js";
import { executeGenerateTaskContext } from "@mcp/tools.js";

describe("generateTaskContext MCP tool", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let originalDbPath: string | undefined;
	let repoId: string;
	const requestId = "test-request-1";
	const userId = "test-user-1";

	beforeAll(() => {
		// Create temp directory and set KOTADB_PATH for test isolation
		tempDir = createTempDir("mcp-task-context-test-");
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

		// Create test repository with last_indexed_at set
		repoId = randomUUID();
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch, last_indexed_at) VALUES (?, ?, ?, ?, ?)",
			[repoId, "test-repo", "test-owner/test-repo", "main", new Date().toISOString()],
		);

		// Create a dependency chain for testing:
		// src/db/client.ts (base file with many dependents)
		// src/api/queries.ts (depends on client.ts)
		// src/mcp/tools.ts (depends on queries.ts)
		// tests/db/client.test.ts (test file for client.ts)

		const clientFileId = randomUUID();
		db.run(
			`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				clientFileId,
				repoId,
				"src/db/client.ts",
				'export function getClient() { return db; }',
				"typescript",
				new Date().toISOString(),
				randomUUID(),
			],
		);

		const queriesFileId = randomUUID();
		db.run(
			`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				queriesFileId,
				repoId,
				"src/api/queries.ts",
				'import { getClient } from "../db/client";',
				"typescript",
				new Date().toISOString(),
				randomUUID(),
			],
		);

		// Add import reference: queries -> client
		db.run(
			`INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				randomUUID(),
				queriesFileId,
				repoId,
				"getClient",
				"src/db/client.ts",
				1,
				"import",
				JSON.stringify({ importSource: "../db/client" }),
			],
		);

		const toolsFileId = randomUUID();
		db.run(
			`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				toolsFileId,
				repoId,
				"src/mcp/tools.ts",
				'import { searchFiles } from "../api/queries";',
				"typescript",
				new Date().toISOString(),
				randomUUID(),
			],
		);

		// Add import reference: tools -> queries
		db.run(
			`INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				randomUUID(),
				toolsFileId,
				repoId,
				"searchFiles",
				"src/api/queries.ts",
				1,
				"import",
				JSON.stringify({ importSource: "../api/queries" }),
			],
		);

		// Test file for client.ts
		const testFileId = randomUUID();
		db.run(
			`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				testFileId,
				repoId,
				"src/db/client.test.ts",
				'import { getClient } from "./client";',
				"typescript",
				new Date().toISOString(),
				randomUUID(),
			],
		);

		// Add import reference: test -> client
		db.run(
			`INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_file_path, line_number, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				randomUUID(),
				testFileId,
				repoId,
				"getClient",
				"src/db/client.ts",
				1,
				"import",
				JSON.stringify({ importSource: "./client" }),
			],
		);

		// Add symbols for completeness
		db.run(
			`INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[randomUUID(), clientFileId, repoId, "getClient", "function", 1, 1, JSON.stringify({})],
		);
	});

	afterEach(() => {
		clearTestData(db);
	});

	// ========================================================================
	// Parameter Validation Tests
	// ========================================================================

	test("should require files parameter", async () => {
		await expect(async () => {
			await executeGenerateTaskContext({}, requestId, userId);
		}).toThrow("Missing required parameter: files");
	});

	test("should throw error when params is not an object", async () => {
		await expect(async () => {
			await executeGenerateTaskContext("invalid", requestId, userId);
		}).toThrow("Parameters must be an object");
	});

	test("should throw error when files is not an array", async () => {
		await expect(async () => {
			await executeGenerateTaskContext({ files: "not-an-array" }, requestId, userId);
		}).toThrow("Parameter 'files' must be an array");
	});

	test("should accept empty files array", async () => {
		const result = await executeGenerateTaskContext(
			{ files: [], repository: repoId },
			requestId,
			userId
		) as any;
		expect(result.targetFiles).toEqual([]);
		expect(result.impactedFiles).toEqual([]);
		expect(result.testFiles).toEqual([]);
	});

	// ========================================================================
	// Core Functionality Tests
	// ========================================================================

	test("should return dependent count for indexed file", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts"], repository: repoId },
			requestId,
			userId
		) as {
			targetFiles: Array<{ path: string; dependentCount: number }>;
		};

		expect(result.targetFiles).toHaveLength(1);
		expect(result.targetFiles[0]!.path).toBe("src/db/client.ts");
		// Should have 2 dependents: queries.ts and client.test.ts
		expect(result.targetFiles[0]!.dependentCount).toBe(2);
	});

	test("should find impacted files (direct dependents)", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts"], repository: repoId },
			requestId,
			userId
		) as {
			impactedFiles: string[];
		};

		// Direct dependents of client.ts
		expect(result.impactedFiles).toContain("src/api/queries.ts");
	});

	test("should discover test files for target", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts"], include_tests: true, repository: repoId },
			requestId,
			userId
		) as {
			testFiles: string[];
		};

		expect(result.testFiles).toContain("src/db/client.test.ts");
	});

	test("should handle multiple files", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts", "src/api/queries.ts"], repository: repoId },
			requestId,
			userId
		) as {
			targetFiles: Array<{ path: string; dependentCount: number }>;
		};

		expect(result.targetFiles).toHaveLength(2);
		const clientFile = result.targetFiles.find(f => f.path === "src/db/client.ts");
		const queriesFile = result.targetFiles.find(f => f.path === "src/api/queries.ts");
		expect(clientFile).toBeDefined();
		expect(queriesFile).toBeDefined();
	});

	// ========================================================================
	// Graceful Degradation Tests
	// ========================================================================

	test("should handle non-existent file gracefully", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/nonexistent.ts"], repository: repoId },
			requestId,
			userId
		) as {
			targetFiles: Array<{ path: string; dependentCount: number }>;
		};

		expect(result.targetFiles).toHaveLength(1);
		expect(result.targetFiles[0]!.path).toBe("src/nonexistent.ts");
		expect(result.targetFiles[0]!.dependentCount).toBe(0);
	});

	test("should handle mix of existing and non-existing files", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts", "src/nonexistent.ts"], repository: repoId },
			requestId,
			userId
		) as {
			targetFiles: Array<{ path: string; dependentCount: number }>;
		};

		const existing = result.targetFiles.find(f => f.path === "src/db/client.ts");
		const missing = result.targetFiles.find(f => f.path === "src/nonexistent.ts");
		expect(existing?.dependentCount).toBeGreaterThan(0);
		expect(missing?.dependentCount).toBe(0);
	});

	test("should indicate stale index when repository has no last_indexed_at", async () => {
		// Create a repo without last_indexed_at
		const staleRepoId = randomUUID();
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[staleRepoId, "stale-repo", "test-owner/stale-repo", "main"],
		);

		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts"], repository: staleRepoId },
			requestId,
			userId
		) as {
			indexStale: boolean;
			staleReason?: string;
		};

		expect(result.indexStale).toBe(true);
		expect(result.staleReason).toBeDefined();
	});

	// ========================================================================
	// Performance Tests
	// ========================================================================

	test("should complete in under 100ms for typical workload", async () => {
		// Create additional files to simulate realistic workload
		for (let i = 0; i < 20; i++) {
			const fileId = randomUUID();
			db.run(
				`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[
					fileId,
					repoId,
					`src/module${i}.ts`,
					`export const value${i} = ${i};`,
					"typescript",
					new Date().toISOString(),
					randomUUID(),
				],
			);
		}

		const startTime = performance.now();

		await executeGenerateTaskContext(
			{ files: ["src/db/client.ts"], repository: repoId },
			requestId,
			userId
		);

		const endTime = performance.now();
		const duration = endTime - startTime;

		// Should complete in under 100ms
		expect(duration).toBeLessThan(100);
	});

	// ========================================================================
	// Repository Resolution Tests
	// ========================================================================

	test("should accept optional repository parameter", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts"], repository: repoId },
			requestId,
			userId
		) as {
			targetFiles: Array<{ path: string }>;
		};

		expect(result.targetFiles).toHaveLength(1);
	});

	test("should use first repository when not specified", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts"] },
			requestId,
			userId
		) as {
			targetFiles: Array<{ path: string }>;
		};

		// Should not error even without repository param
		expect(result.targetFiles).toBeDefined();
	});

	// ========================================================================
	// Symbol Information Tests
	// ========================================================================

	test("should include symbol information when include_symbols is true", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts"], include_symbols: true, repository: repoId },
			requestId,
			userId
		) as {
			targetFiles: Array<{
				path: string;
				symbols: Array<{ name: string; kind: string }>;
			}>;
		};

		expect(result.targetFiles[0]!.symbols).toBeDefined();
		expect(result.targetFiles[0]!.symbols.length).toBeGreaterThan(0);
		expect(result.targetFiles[0]!.symbols[0]!).toHaveProperty("name");
		expect(result.targetFiles[0]!.symbols[0]!).toHaveProperty("kind");
	});

	test("should not include symbols by default", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts"], repository: repoId },
			requestId,
			userId
		) as {
			targetFiles: Array<{
				path: string;
				symbols: Array<{ name: string; kind: string }>;
			}>;
		};

		expect(result.targetFiles[0]!.symbols).toEqual([]);
	});

	// ========================================================================
	// Duration Tracking Tests
	// ========================================================================

	test("should include durationMs in response", async () => {
		const result = await executeGenerateTaskContext(
			{ files: ["src/db/client.ts"], repository: repoId },
			requestId,
			userId
		) as {
			durationMs: number;
		};

		expect(result.durationMs).toBeDefined();
		expect(typeof result.durationMs).toBe("number");
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
	});
});
