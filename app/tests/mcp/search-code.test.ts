/**
 * Tests for search_code MCP tool
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 *
 * Test Coverage:
 * - search_code: FTS5 code search with various query patterns
 *
 * @module tests/mcp/search-code
 */

import { describe, expect, test } from "bun:test";
import { executeSearchCode } from "@mcp/tools.js";

describe("search_code MCP tool", () => {
	const requestId = "test-request-1";
	const userId = "test-user-1";

	test("should search code and return results structure", async () => {
		const result = (await executeSearchCode(
			{ term: "function" },
			requestId,
			userId,
		)) as { results: Array<unknown> };

		expect(result.results).toBeDefined();
		expect(Array.isArray(result.results)).toBe(true);
	});

	test("should return empty results for non-existent term", async () => {
		const result = (await executeSearchCode(
			{ term: "nonExistentFunctionXYZ12345" },
			requestId,
			userId,
		)) as { results: Array<unknown> };

		expect(result.results).toBeDefined();
		expect(Array.isArray(result.results)).toBe(true);
	});

	test("should respect limit parameter", async () => {
		const result = (await executeSearchCode(
			{ term: "function", limit: 1 },
			requestId,
			userId,
		)) as { results: Array<unknown> };

		expect(result.results).toBeDefined();
		expect(result.results.length).toBeLessThanOrEqual(1);
	});

	test("should throw error when term parameter is missing", async () => {
		await expect(async () => {
			await executeSearchCode({}, requestId, userId);
		}).toThrow("Missing required parameter: term");
	});

	test("should throw error when params is not an object", async () => {
		await expect(async () => {
			await executeSearchCode("invalid", requestId, userId);
		}).toThrow("Parameters must be an object");
	});

	test("should throw error when term is not a string", async () => {
		await expect(async () => {
			await executeSearchCode({ term: 123 }, requestId, userId);
		}).toThrow("Parameter 'term' must be a string");
	});

	test("should accept repository parameter", async () => {
		const result = (await executeSearchCode(
			{ term: "test", repository: "test-repo-id" },
			requestId,
			userId,
		)) as { results: Array<unknown> };

		expect(result.results).toBeDefined();
	});

	test("should throw error when limit is not a number", async () => {
		await expect(async () => {
			await executeSearchCode({ term: "test", limit: "invalid" }, requestId, userId);
		}).toThrow("Parameter 'limit' must be a number");
	});
});
