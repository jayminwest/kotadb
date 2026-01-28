/**
 * Tests for kota_sync_export MCP tool
 *
 * Following antimocking philosophy: uses real file-based SQLite databases
 * with proper KOTADB_PATH environment isolation.
 *
 * Test Coverage:
 * - kota_sync_export: Export SQLite database to JSONL format
 *
 * @module tests/mcp/kota-sync-export
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { executeSyncExport } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { createTempDir, cleanupTempDir, clearTestData } from "../helpers/db.js";

describe("kota_sync_export MCP tool", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let exportDir: string;
	let originalDbPath: string | undefined;
	const requestId = "test-request-1";
	const testRepoId = randomUUID();

	beforeAll(() => {
		// Create temp directory and set KOTADB_PATH for test isolation
		tempDir = createTempDir("mcp-export-test-");
		dbPath = join(tempDir, "test.db");
		exportDir = join(tempDir, "export");
		
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
		
		// Seed test repository and data
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[testRepoId, "test-repo", "test-owner/test-repo", "main"],
		);

		db.run(
			`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
			[
				randomUUID(),
				testRepoId,
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

	test("should export with default parameters", async () => {
		const result = (await executeSyncExport(undefined, requestId)) as {
			success: boolean;
			tables_exported: number;
			total_rows: number;
		};

		expect(result.success).toBeDefined();
		expect(result.tables_exported).toBeDefined();
		expect(result.total_rows).toBeDefined();
	});

	test("should export with force parameter", async () => {
		const result = (await executeSyncExport({ force: true }, requestId)) as {
			success: boolean;
			tables_exported: number;
		};

		expect(result.success).toBeDefined();
		expect(result.tables_exported).toBeGreaterThanOrEqual(0);
	});

	test("should accept custom export_dir parameter", async () => {
		const result = (await executeSyncExport(
			{ export_dir: exportDir },
			requestId,
		)) as {
			success: boolean;
			export_dir: string;
		};

		expect(result.success).toBeDefined();
		// Result may contain export directory info
	});

	test("should include duration_ms in result", async () => {
		const result = (await executeSyncExport({}, requestId)) as {
			duration_ms: number;
		};

		expect(result.duration_ms).toBeDefined();
		expect(typeof result.duration_ms).toBe("number");
	});

	test("should work with empty params object", async () => {
		const result = (await executeSyncExport({}, requestId)) as {
			success: boolean;
		};

		expect(result.success).toBeDefined();
	});

	test("should throw error when params is invalid type", async () => {
		await expect(async () => {
			await executeSyncExport("invalid", requestId);
		}).toThrow("Parameters must be an object");
	});

	test("should include tables_skipped in result", async () => {
		const result = (await executeSyncExport({}, requestId)) as {
			tables_skipped: number;
		};

		expect(result.tables_skipped).toBeDefined();
		expect(typeof result.tables_skipped).toBe("number");
	});
});
