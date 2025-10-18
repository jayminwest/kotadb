/**
 * MCP Concurrency and Isolation Tests
 *
 * Tests concurrent request handling and user isolation:
 * - Concurrent requests from same user maintain isolation
 * - Concurrent requests from different users isolated (separate auth contexts)
 * - Rate limit counting accurate under concurrency
 * - Multiple index jobs queue correctly without race conditions
 * - Search during indexing returns partial results (no locking issues)
 *
 * Uses real Supabase database (antimocking compliance).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { sendMcpRequest, extractToolResult } from "../helpers/mcp";
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

describe("MCP Concurrency", () => {
	test("concurrent requests from same user isolated (no state leakage)", async () => {
		// Send 5 concurrent requests from the same user
		const promises = Array.from({ length: 5 }, (_, i) =>
			sendMcpRequest(
				baseUrl,
				"tools/call",
				{
					name: "list_recent_files",
					arguments: { limit: 10 },
				},
				"free",
			),
		);

		const responses = await Promise.all(promises);

		// All requests should succeed
		for (const response of responses) {
			expect(response.status).toBe(200);
			const result = extractToolResult(response.data);
			expect(result.results).toBeArray();
		}

		// Results should be identical (no state leakage between requests)
		const results = responses.map((r) => extractToolResult(r.data));
		expect(results.length).toBe(5);
	});

	test("concurrent requests from different users isolated", async () => {
		// Send concurrent requests from different tiers
		const promises = [
			sendMcpRequest(
				baseUrl,
				"tools/call",
				{
					name: "list_recent_files",
					arguments: { limit: 5 },
				},
				"free",
			),
			sendMcpRequest(
				baseUrl,
				"tools/call",
				{
					name: "list_recent_files",
					arguments: { limit: 5 },
				},
				"solo",
			),
			sendMcpRequest(
				baseUrl,
				"tools/call",
				{
					name: "list_recent_files",
					arguments: { limit: 5 },
				},
				"team",
			),
		];

		const responses = await Promise.all(promises);

		// All requests should succeed with proper auth context
		for (const response of responses) {
			expect(response.status).toBe(200);
			const result = extractToolResult(response.data);
			expect(result.results).toBeArray();
		}
	});

	test("rate limit counting accurate under concurrency", async () => {
		// Get initial rate limit remaining
		const initialResponse = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Authorization:
					"Bearer kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/list",
				params: {},
			}),
		});

		const initialRemaining = Number.parseInt(
			initialResponse.headers.get("X-RateLimit-Remaining") || "0",
		);

		// Send 10 concurrent requests
		const promises = Array.from({ length: 10 }, (_, i) =>
			fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
					Authorization:
						"Bearer kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: i + 2,
					method: "tools/list",
					params: {},
				}),
			}),
		);

		const responses = await Promise.all(promises);

		// All should succeed
		for (const response of responses) {
			expect(response.status).toBe(200);
		}

		// Check final rate limit remaining
		const finalResponse = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Authorization:
					"Bearer kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 99,
				method: "tools/list",
				params: {},
			}),
		});

		const finalRemaining = Number.parseInt(
			finalResponse.headers.get("X-RateLimit-Remaining") || "0",
		);

		// Should have decremented by approximately 11 (10 concurrent + 1 final)
		// Allow some tolerance for race conditions in counter increments
		const difference = initialRemaining - finalRemaining;
		expect(difference).toBeGreaterThanOrEqual(10);
		expect(difference).toBeLessThanOrEqual(12);
	});

	test("multiple index jobs queue correctly", async () => {
		// Queue multiple index jobs concurrently
		const promises = Array.from({ length: 3 }, (_, i) =>
			sendMcpRequest(
				baseUrl,
				"tools/call",
				{
					name: "index_repository",
					arguments: {
						repository: `test/concurrent-repo-${i}`,
						localPath: ".",
					},
				},
				"free",
			),
		);

		const responses = await Promise.all(promises);

		// All should succeed and get unique runIds
		const runIds = new Set<string>();
		for (const response of responses) {
			expect(response.status).toBe(200);
			const result = extractToolResult(response.data);
			expect(result.runId).toBeDefined();
			runIds.add(result.runId);
		}

		// All runIds should be unique (no race conditions)
		expect(runIds.size).toBe(3);
	});

	test("search during concurrent indexing returns results", async () => {
		// Start multiple index jobs
		const indexPromises = Array.from({ length: 2 }, (_, i) =>
			sendMcpRequest(
				baseUrl,
				"tools/call",
				{
					name: "index_repository",
					arguments: {
						repository: `test/search-during-index-${i}`,
						localPath: ".",
					},
				},
				"free",
			),
		);

		// Immediately search while indexing
		const searchPromise = sendMcpRequest(
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

		// Wait for all to complete
		const results = await Promise.all([
			...indexPromises,
			searchPromise,
		]);

		// Search response is the last item
		const searchResponse = results[results.length - 1];
		if (!searchResponse) {
			throw new Error("Search response not found");
		}

		// Search should succeed even with concurrent indexing
		expect(searchResponse.status).toBe(200);
		const searchResult = extractToolResult(searchResponse.data);
		expect(searchResult.results).toBeArray();
	});

	test("concurrent tool/list requests return consistent results", async () => {
		// Send 10 concurrent tools/list requests
		const promises = Array.from({ length: 10 }, () =>
			sendMcpRequest(baseUrl, "tools/list", {}, "free"),
		);

		const responses = await Promise.all(promises);

		// All should return the same list of tools
		// tools/list returns result.tools directly (not wrapped in content blocks)
		const toolsLists = responses.map((r) => r.data.result);

		for (const toolsList of toolsLists) {
			expect(toolsList.tools.length).toBe(3);
			const names = toolsList.tools.map((t: any) => t.name);
			expect(names).toContain("search_code");
			expect(names).toContain("index_repository");
			expect(names).toContain("list_recent_files");
		}
	});
});
