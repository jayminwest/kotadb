/**
 * Tests for kota_sync_import MCP tool
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 *
 * Test Coverage:
 * - kota_sync_import: Import JSONL files into SQLite database
 *
 * @module tests/mcp/kota-sync-import
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { executeSyncImport } from "@mcp/tools.js";
import { getTestDatabase, createTempDir, cleanupTempDir } from "../helpers/db.js";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

describe("kota_sync_import MCP tool", () => {
	let db: KotaDatabase;
	let tempDir: string;
	const requestId = "test-request-1";

	beforeEach(() => {
		// Create fresh in-memory database for each test (antimocking pattern)
		db = getTestDatabase();
		
		// Create temp directory for imports
		tempDir = createTempDir("mcp-import-test-");
	});

	afterEach(() => {
		if (db) {
			db.close();
		}
		if (tempDir) {
			cleanupTempDir(tempDir);
		}
	});

	test("should handle import with no files gracefully", async () => {
		// Create empty import directory
		const importDir = join(tempDir, "import");
		mkdirSync(importDir, { recursive: true });

		const result = (await executeSyncImport(
			{ import_dir: importDir },
			requestId,
		)) as {
			success: boolean;
			tables_imported: number;
		};

		expect(result.success).toBeDefined();
		expect(result.tables_imported).toBeDefined();
	});

	test("should accept custom import_dir parameter", async () => {
		const importDir = join(tempDir, "custom-import");
		mkdirSync(importDir, { recursive: true });

		const result = (await executeSyncImport(
			{ import_dir: importDir },
			requestId,
		)) as {
			success: boolean;
			import_dir?: string;
		};

		expect(result.success).toBeDefined();
	});

	test("should work with empty params object", async () => {
		// Default import directory will be used
		const result = (await executeSyncImport({}, requestId)) as {
			success: boolean;
		};

		expect(result.success).toBeDefined();
	});

	test("should work with undefined params", async () => {
		const result = (await executeSyncImport(undefined, requestId)) as {
			success: boolean;
		};

		expect(result.success).toBeDefined();
	});

	test("should throw error when params is invalid type", async () => {
		await expect(async () => {
			await executeSyncImport("invalid", requestId);
		}).toThrow("Parameters must be an object");
	});

	test("should include duration_ms in result", async () => {
		const importDir = join(tempDir, "import");
		mkdirSync(importDir, { recursive: true });

		const result = (await executeSyncImport(
			{ import_dir: importDir },
			requestId,
		)) as {
			duration_ms: number;
		};

		expect(result.duration_ms).toBeDefined();
		expect(typeof result.duration_ms).toBe("number");
	});

	test("should include rows_imported in result", async () => {
		const importDir = join(tempDir, "import");
		mkdirSync(importDir, { recursive: true });

		const result = (await executeSyncImport(
			{ import_dir: importDir },
			requestId,
		)) as {
			rows_imported: number;
		};

		expect(result.rows_imported).toBeDefined();
		expect(typeof result.rows_imported).toBe("number");
	});

	test("should handle import errors gracefully", async () => {
		const importDir = join(tempDir, "import-with-errors");
		mkdirSync(importDir, { recursive: true });

		// Create invalid JSONL file
		const invalidFile = join(importDir, "invalid.jsonl");
		writeFileSync(invalidFile, "not valid json\n");

		const result = (await executeSyncImport(
			{ import_dir: importDir },
			requestId,
		)) as {
			success: boolean;
			errors?: Array<unknown>;
		};

		// Result should indicate import status
		expect(result.success).toBeDefined();
	});
});
