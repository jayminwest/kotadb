/**
 * MCP Tools Integration Tests
 *
 * Tests the MCP tools (search_code, index_repository, list_recent_files) with real database connection.
 * Environment variables are loaded from .env.test in CI or default to local Supabase ports.
 *
 * Required environment variables:
 * - SUPABASE_URL (defaults to http://localhost:54322)
 * - SUPABASE_SERVICE_KEY (defaults to local demo key)
 * - SUPABASE_ANON_KEY (defaults to local demo key)
 * - DATABASE_URL (defaults to postgresql://postgres:postgres@localhost:5434/postgres)
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import { createAuthHeader } from "../helpers/db";
import { startTestServer, stopTestServer } from "../helpers/server";
import { extractToolResult } from "../helpers/mcp";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	// Start Express test server with real database connection
	// Test data is seeded via scripts/setup-test-db.sh
	const testServer = await startTestServer();
	server = testServer.server;
	baseUrl = testServer.url;
});

afterAll(async () => {
	await stopTestServer(server);
});

describe("MCP Tools Integration", () => {
	const headers = {
		"Content-Type": "application/json",
		"Origin": "http://localhost:3000",
		"MCP-Protocol-Version": "2025-06-18",
		"Accept": "application/json, text/event-stream",
		"Authorization": createAuthHeader("free"),
	};

	test("tools/list returns available tools", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/list",
				params: {},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.jsonrpc).toBe("2.0");
		expect(data.result).toBeDefined();
		expect(data.result.tools).toBeArray();
		expect(data.result.tools.length).toBe(3);

		const toolNames = data.result.tools.map((t: { name: string }) => t.name);
		expect(toolNames).toContain("search_code");
		expect(toolNames).toContain("index_repository");
		expect(toolNames).toContain("list_recent_files");
	});

	test("search_code tool finds matching files", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {
						term: "Router",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.jsonrpc).toBe("2.0");
		expect(data.result).toBeDefined();

		// SDK wraps tool results in content blocks
		const toolResult = extractToolResult(data);
		expect(toolResult.results).toBeArray();
	});

	test("search_code with repository filter", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {
						term: "Router",
						repository: "20000000-0000-0000-0000-000000000001", // Test repository ID from seed
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();

		// SDK wraps tool results in content blocks
		const toolResult = extractToolResult(data);
		expect(toolResult.results).toBeArray();
	});

	test("list_recent_files tool returns indexed files", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 4,
				method: "tools/call",
				params: {
					name: "list_recent_files",
					arguments: {
						limit: 5,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();

		// SDK wraps tool results in content blocks
		const toolResult = extractToolResult(data);
		expect(toolResult.results).toBeArray();
	});

	test("index_repository tool queues indexing", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 5,
				method: "tools/call",
				params: {
					name: "index_repository",
					arguments: {
						repository: "test/repo",
						ref: "main",
						localPath: ".",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();

		// SDK wraps tool results in content blocks
		const toolResult = extractToolResult(data);
		expect(toolResult.runId).toBeDefined();
		expect(toolResult.status).toBe("pending");
	});

	test("tools/call with missing name returns error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 6,
				method: "tools/call",
				params: {
					arguments: { term: "test" },
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32603); // Internal Error (SDK error handling)
	});

	test("tools/call with unknown tool returns error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 7,
				method: "tools/call",
				params: {
					name: "unknown_tool",
					arguments: {},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32603); // Internal Error (SDK error handling)
	});

	test("search_code with missing term returns error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 8,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32603); // Internal Error (SDK error handling)
	});
});
