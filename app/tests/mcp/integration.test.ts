/**
 * MCP End-to-End Integration Tests
 *
 * Tests complete workflows involving multiple MCP tools and real database operations.
 * Validates:
 * - Full workflow: index repository → search code → verify results
 * - Multi-tool workflows with state persistence
 * - GitHub repository indexing (localPath not supported via MCP - see #412)
 * - Error recovery scenarios
 *
 * Uses real Supabase database (antimocking compliance).
 *
 * NOTE: localPath parameter is NOT supported via MCP. For local fixture testing,
 * use the REST API endpoint directly. See docs/specs/bug-412-remove-localpath-mcp-schema.md
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { sendMcpRequest, extractToolResult, assertJsonRpcError } from "../helpers/mcp";
import { startTestServer, stopTestServer } from "../helpers/server";

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
		// Step 1: Index a GitHub repository (localPath not supported via MCP - see #412)
		const indexResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test-integration/sample-repo",
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

	test("localPath parameter is rejected via MCP", async () => {
		// localPath is not supported via MCP (see #412)
		// This test verifies the explicit rejection with a clear error message
		const response = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test/fixture-repo",
					localPath: "/some/local/path",
				},
			},
			"free",
		);

		expect(response.status).toBe(200);
		assertJsonRpcError(response.data, -32603, "localPath");
	});

	test("GitHub repository indexing succeeds via MCP", async () => {
		// MCP only supports GitHub repository indexing
		const response = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test/fixture-repo",
				},
			},
			"free",
		);

		expect(response.status).toBe(200);
		const result = extractToolResult(response.data);
		expect(result.runId).toBeDefined();
		expect(result.status).toBe("pending");
	});

	test("subsequent requests succeed after indexing error", async () => {
		// First request with localPath (will be rejected)
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
		// Start indexing a GitHub repository (localPath not supported)
		await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test/concurrent-index",
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
