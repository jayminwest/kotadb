/**
 * Tests for list_recent_files MCP tool
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 *
 * Test Coverage:
 * - list_recent_files: List recently indexed files ordered by timestamp
 *
 * @module tests/mcp/list-recent-files
 */

import { describe, expect, test } from "bun:test";
import { executeListRecentFiles } from "@mcp/tools.js";

describe("list_recent_files MCP tool", () => {
	const requestId = "test-request-1";
	const userId = "test-user-1";

	test("should list recent files with default limit", async () => {
		const result = (await executeListRecentFiles(undefined, requestId, userId)) as {
			results: Array<unknown>;
		};

		expect(result.results).toBeDefined();
		expect(Array.isArray(result.results)).toBe(true);
	});

	test("should respect custom limit parameter", async () => {
		const result = (await executeListRecentFiles({ limit: 5 }, requestId, userId)) as {
			results: Array<unknown>;
		};

		expect(result.results).toBeDefined();
		expect(result.results.length).toBeLessThanOrEqual(5);
	});

	test("should handle limit of 1", async () => {
		const result = (await executeListRecentFiles({ limit: 1 }, requestId, userId)) as {
			results: Array<unknown>;
		};

		expect(result.results).toBeDefined();
		expect(result.results.length).toBeLessThanOrEqual(1);
	});

	test("should work with no params", async () => {
		const result = (await executeListRecentFiles(undefined, requestId, userId)) as {
			results: Array<unknown>;
		};

		expect(result.results).toBeDefined();
	});

	test("should work with empty params object", async () => {
		const result = (await executeListRecentFiles({}, requestId, userId)) as {
			results: Array<unknown>;
		};

		expect(result.results).toBeDefined();
	});
});
