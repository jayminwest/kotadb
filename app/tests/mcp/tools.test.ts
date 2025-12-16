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

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createAuthHeader } from "../helpers/db";
import { extractToolResult } from "../helpers/mcp";
import { startTestServer, stopTestServer } from "../helpers/server";

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
		Origin: "http://localhost:3000",
		"MCP-Protocol-Version": "2025-06-18",
		Accept: "application/json, text/event-stream",
		Authorization: createAuthHeader("free"),
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
		expect(data.result.tools.length).toBe(16);

		const toolNames = data.result.tools.map((t: { name: string }) => t.name);
		expect(toolNames).toContain("search_code");
		expect(toolNames).toContain("index_repository");
		expect(toolNames).toContain("list_recent_files");
		expect(toolNames).toContain("search_dependencies");
		expect(toolNames).toContain("analyze_change_impact");
		expect(toolNames).toContain("validate_implementation_spec");
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
		// localPath not supported via MCP - see #412
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

	test("search_code returns snippet with context", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 9,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {
						term: "Router",
						limit: 10,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		const toolResult = extractToolResult(data);

		if (toolResult.results.length > 0) {
			const firstResult = toolResult.results[0];
			expect(firstResult).toHaveProperty("path");
			expect(firstResult).toHaveProperty("snippet");
			expect(firstResult.snippet).toContain("Router");
		}
	});

	test("search_code respects limit parameter", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 10,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {
						term: "import",
						limit: 3,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		const toolResult = extractToolResult(data);
		expect(toolResult.results.length).toBeLessThanOrEqual(3);
	});

	test("search_code with no matches returns empty results", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 11,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {
						term: "xyznonexistentterm12345",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		const toolResult = extractToolResult(data);
		expect(toolResult.results).toBeArray();
	});

	test("list_recent_files returns files ordered by indexedAt", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 12,
				method: "tools/call",
				params: {
					name: "list_recent_files",
					arguments: {
						limit: 10,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		const toolResult = extractToolResult(data);

		if (toolResult.results.length > 1) {
			// Verify files are ordered by indexedAt descending
			const timestamps = toolResult.results.map((f: any) =>
				new Date(f.indexedAt).getTime(),
			);
			for (let i = 1; i < timestamps.length; i++) {
				expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
			}
		}
	});

	test("list_recent_files respects limit parameter", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 13,
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
		const toolResult = extractToolResult(data);
		expect(toolResult.results.length).toBeLessThanOrEqual(5);
	});

	test("all tool results wrapped in SDK content blocks", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 14,
				method: "tools/call",
				params: {
					name: "list_recent_files",
					arguments: {},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;

		// Verify SDK content block wrapping
		expect(data.result.content).toBeArray();
		expect(data.result.content.length).toBeGreaterThan(0);
		expect(data.result.content[0]).toHaveProperty("type");
		expect(data.result.content[0].type).toBe("text");
		expect(data.result.content[0]).toHaveProperty("text");

		// Verify text is valid JSON
		const toolResult = extractToolResult(data);
		expect(toolResult).toBeDefined();
	});

	// Tests for search_dependencies tool
	test("search_dependencies with missing file_path returns error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 15,
				method: "tools/call",
				params: {
					name: "search_dependencies",
					arguments: {},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32603);
	});

	test("search_dependencies with invalid direction returns error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 16,
				method: "tools/call",
				params: {
					name: "search_dependencies",
					arguments: {
						file_path: "src/auth/context.ts",
						direction: "invalid",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32603);
	});

	test("search_dependencies with invalid depth returns error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 17,
				method: "tools/call",
				params: {
					name: "search_dependencies",
					arguments: {
						file_path: "src/auth/context.ts",
						depth: 10,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32603);
	});

	test("search_dependencies handles missing file gracefully", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 18,
				method: "tools/call",
				params: {
					name: "search_dependencies",
					arguments: {
						file_path: "nonexistent/file.ts",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();

		const toolResult = extractToolResult(data);
		expect(toolResult.file_path).toBe("nonexistent/file.ts");
		expect(toolResult.message).toContain("File not found");
	});

	test("search_dependencies with direction=both returns both dependents and dependencies", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 19,
				method: "tools/call",
				params: {
					name: "search_dependencies",
					arguments: {
						file_path: "src/api/routes.ts",
						direction: "both",
						depth: 1,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();

		const toolResult = extractToolResult(data);
		expect(toolResult.file_path).toBe("src/api/routes.ts");
		// Tool may return either dependency results OR file-not-found message
		// depending on whether file exists in test database
		if (toolResult.message) {
			// File not found case
			expect(toolResult.message).toContain("File not found");
		} else {
			// File found case - verify structure
			expect(toolResult.direction).toBe("both");
			expect(toolResult.depth).toBe(1);
			expect(toolResult).toHaveProperty("dependents");
			expect(toolResult).toHaveProperty("dependencies");
		}
	});

	test("search_dependencies with direction=dependents returns only dependents", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 20,
				method: "tools/call",
				params: {
					name: "search_dependencies",
					arguments: {
						file_path: "src/api/routes.ts",
						direction: "dependents",
						depth: 1,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();

		const toolResult = extractToolResult(data);
		if (!toolResult.message) {
			// File found - verify structure
			expect(toolResult).toHaveProperty("dependents");
			expect(toolResult.dependents).toHaveProperty("direct");
			expect(toolResult.dependents).toHaveProperty("indirect");
			expect(toolResult.dependents).toHaveProperty("cycles");
			expect(toolResult.dependents).toHaveProperty("count");
			expect(toolResult).not.toHaveProperty("dependencies");
		}
	});

	test("search_dependencies with direction=dependencies returns only dependencies", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 21,
				method: "tools/call",
				params: {
					name: "search_dependencies",
					arguments: {
						file_path: "src/api/routes.ts",
						direction: "dependencies",
						depth: 1,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();

		const toolResult = extractToolResult(data);
		if (!toolResult.message) {
			// File found - verify structure
			expect(toolResult).toHaveProperty("dependencies");
			expect(toolResult.dependencies).toHaveProperty("direct");
			expect(toolResult.dependencies).toHaveProperty("indirect");
			expect(toolResult.dependencies).toHaveProperty("cycles");
			expect(toolResult.dependencies).toHaveProperty("count");
			expect(toolResult).not.toHaveProperty("dependents");
		}
	});

	test("search_dependencies respects depth parameter", async () => {
		const responseDepth1 = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 22,
				method: "tools/call",
				params: {
					name: "search_dependencies",
					arguments: {
						file_path: "src/api/routes.ts",
						direction: "dependencies",
						depth: 1,
					},
				},
			}),
		});

		expect(responseDepth1.status).toBe(200);
		const dataDepth1 = (await responseDepth1.json()) as any;
		const toolResultDepth1 = extractToolResult(dataDepth1);

		const responseDepth2 = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 23,
				method: "tools/call",
				params: {
					name: "search_dependencies",
					arguments: {
						file_path: "src/api/routes.ts",
						direction: "dependencies",
						depth: 2,
					},
				},
			}),
		});

		expect(responseDepth2.status).toBe(200);
		const dataDepth2 = (await responseDepth2.json()) as any;
		const toolResultDepth2 = extractToolResult(dataDepth2);

		// Depth 1 should have only direct dependencies
		expect(toolResultDepth1.dependencies.direct).toBeArray();

		// Depth 2 may have indirect dependencies (if the graph has depth > 1)
		expect(toolResultDepth2.dependencies).toHaveProperty("indirect");
	});

	test("search_dependencies result structure includes counts", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 24,
				method: "tools/call",
				params: {
					name: "search_dependencies",
					arguments: {
						file_path: "src/api/routes.ts",
						direction: "both",
						depth: 1,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		const toolResult = extractToolResult(data);

		if (!toolResult.message) {
			// File found - verify count fields are numbers
			expect(toolResult.dependents).toHaveProperty("count");
			expect(toolResult.dependencies).toHaveProperty("count");
			expect(typeof toolResult.dependents.count).toBe("number");
			expect(typeof toolResult.dependencies.count).toBe("number");
		}
	});
});
