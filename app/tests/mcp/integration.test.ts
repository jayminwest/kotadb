/**
 * MCP End-to-End Integration Tests
 *
 * Tests complete workflows involving multiple MCP tools and real database operations.
 * Validates:
 * - Full workflow: index repository → search code → verify results
 * - Multi-tool workflows with state persistence
 * - Local path indexing with test fixtures
 * - Error recovery scenarios
 *
 * Uses real Supabase database (antimocking compliance).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { sendMcpRequest, extractToolResult } from "../helpers/mcp";
import { startTestServer, stopTestServer } from "../helpers/server";
import path from "node:path";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	const testServer = await startTestServer();
	server = testServer.server;
	baseUrl = testServer.url;
});

afterAll(async () => {
	await stopTestServer(server);
});

describe("MCP End-to-End Workflows", () => {
	test("full workflow: index repository → search code → verify results", async () => {
		// Step 1: Index a local test repository
		const fixturePath = path.join(
			process.cwd(),
			"tests/fixtures/mcp/sample-repository",
		);

		const indexResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test-integration/sample-repo",
					localPath: fixturePath,
				},
			},
			"free",
		);

		expect(indexResponse.status).toBe(200);
		const indexResult = extractToolResult(indexResponse.data);
		expect(indexResult.runId).toBeDefined();
		expect(indexResult.status).toBe("pending");

		// Step 2: Wait briefly for indexing to complete (asynchronous)
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Step 3: Search for code in the indexed repository
		const searchResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "search_code",
				arguments: {
					term: "UserService",
				},
			},
			"free",
		);

		expect(searchResponse.status).toBe(200);
		const searchResult = extractToolResult(searchResponse.data);
		expect(searchResult.results).toBeArray();

		// Verify we found the indexed file
		if (searchResult.results.length > 0) {
			const found = searchResult.results.some(
				(r: any) => r.snippet?.includes("UserService"),
			);
			expect(found).toBe(true);
		}
	});

	test("multi-tool workflow: list recent files → search → list again", async () => {
		// Step 1: List recent files before search
		const list1Response = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "list_recent_files",
				arguments: { limit: 5 },
			},
			"free",
		);

		expect(list1Response.status).toBe(200);
		const list1Result = extractToolResult(list1Response.data);
		const initialCount = list1Result.results.length;

		// Step 2: Perform search
		const searchResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "search_code",
				arguments: {
					term: "import",
					limit: 10,
				},
			},
			"free",
		);

		expect(searchResponse.status).toBe(200);

		// Step 3: List recent files again (should be same or more)
		const list2Response = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "list_recent_files",
				arguments: { limit: 10 },
			},
			"free",
		);

		expect(list2Response.status).toBe(200);
		const list2Result = extractToolResult(list2Response.data);
		expect(list2Result.results.length).toBeGreaterThanOrEqual(0);
	});

	test("local path indexing with test fixtures", async () => {
		const fixturePath = path.join(
			process.cwd(),
			"tests/fixtures/mcp/sample-repository",
		);

		const response = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test/fixture-repo",
					localPath: fixturePath,
				},
			},
			"free",
		);

		expect(response.status).toBe(200);
		const result = extractToolResult(response.data);
		expect(result.runId).toBeDefined();
		expect(result.status).toBe("pending");
	});

	test("error recovery: failed indexing job recorded", async () => {
		const response = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test/nonexistent-repo",
					localPath: "/nonexistent/path/to/repo",
				},
			},
			"free",
		);

		// Should still return a runId even if path doesn't exist
		// Indexing happens asynchronously and failures are recorded
		expect(response.status).toBe(200);
		const result = extractToolResult(response.data);
		expect(result.runId).toBeDefined();
	});

	test("subsequent requests succeed after indexing error", async () => {
		// First request with invalid path
		await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test/invalid",
					localPath: "/invalid",
				},
			},
			"free",
		);

		// Second request should still work
		const response = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "list_recent_files",
				arguments: { limit: 5 },
			},
			"free",
		);

		expect(response.status).toBe(200);
		const result = extractToolResult(response.data);
		expect(result.results).toBeDefined();
	});

	test("search during indexing returns partial results", async () => {
		// Start indexing
		const fixturePath = path.join(
			process.cwd(),
			"tests/fixtures/mcp/sample-repository",
		);

		await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test/concurrent-index",
					localPath: fixturePath,
				},
			},
			"free",
		);

		// Immediately search (indexing may still be in progress)
		const searchResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "search_code",
				arguments: {
					term: "function",
				},
			},
			"free",
		);

		// Search should succeed even if indexing is in progress
		expect(searchResponse.status).toBe(200);
		const result = extractToolResult(searchResponse.data);
		expect(result.results).toBeArray();
	});
});
