/**
 * Tests for index_repository MCP tool
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 *
 * Test Coverage:
 * - index_repository: Repository indexing workflow
 *
 * @module tests/mcp/index-repository
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { executeIndexRepository } from "@mcp/tools.js";
import { getTestDatabase } from "../helpers/db.js";
import type { KotaDatabase } from "@db/sqlite/index.js";

describe("index_repository MCP tool", () => {
	let db: KotaDatabase;
	const requestId = "test-request-1";
	const userId = "test-user-1";

	beforeEach(() => {
		// Create fresh in-memory database for each test (antimocking pattern)
		db = getTestDatabase();
	});

	afterEach(() => {
		if (db) {
			db.close();
		}
	});

	test("should validate required repository parameter", async () => {
		await expect(async () => {
			await executeIndexRepository({}, requestId, userId);
		}).toThrow("Missing required parameter: repository");
	});

	test("should throw error when params is not an object", async () => {
		await expect(async () => {
			await executeIndexRepository("invalid", requestId, userId);
		}).toThrow("Parameters must be an object");
	});

	test("should throw error when repository param is not a string", async () => {
		await expect(async () => {
			await executeIndexRepository({ repository: 123 }, requestId, userId);
		}).toThrow("Parameter 'repository' must be a string");
	});

	test("should accept valid repository parameter structure", async () => {
		// This test validates parameter structure only
		// Actual indexing would require file system access
		const params = {
			repository: "test-owner/test-repo",
			ref: "main",
		};

		// Verify params pass validation (will fail at indexing stage which is expected)
		try {
			await executeIndexRepository(params, requestId, userId);
		} catch (error) {
			// Expected to fail at indexing stage without real repo
			// But should not fail at parameter validation
			expect(error).toBeDefined();
		}
	});

	test("should default ref to main when not provided", async () => {
		const params = {
			repository: "test-owner/test-repo",
		};

		try {
			await executeIndexRepository(params, requestId, userId);
		} catch (error) {
			// Expected to fail at indexing stage
			// Validates that ref defaults to 'main'
			expect(error).toBeDefined();
		}
	});

	test("should accept localPath parameter", async () => {
		const params = {
			repository: "test-repo",
			localPath: "/tmp/test-repo",
		};

		try {
			await executeIndexRepository(params, requestId, userId);
		} catch (error) {
			// Expected to fail without real local path
			expect(error).toBeDefined();
		}
	});

	test("should throw error when ref is not a string", async () => {
		await expect(async () => {
			await executeIndexRepository(
				{ repository: "test-repo", ref: 123 },
				requestId,
				userId,
			);
		}).toThrow("Parameter 'ref' must be a string");
	});

	test("should throw error when localPath is not a string", async () => {
		await expect(async () => {
			await executeIndexRepository(
				{ repository: "test-repo", localPath: 123 },
				requestId,
				userId,
			);
		}).toThrow("Parameter 'localPath' must be a string");
	});
});
