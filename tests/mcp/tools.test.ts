// Set test environment variables BEFORE any imports that might use them
process.env.SUPABASE_URL = "http://localhost:54326";
process.env.SUPABASE_SERVICE_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
process.env.SUPABASE_ANON_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
process.env.DATABASE_URL =
	"postgresql://postgres:postgres@localhost:5434/postgres";

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createAuthHeader } from "../helpers/db";

const TEST_PORT = 3098;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
	// Environment variables already set at module level above
	// Import and start test server with real database connection
	// Test data is seeded via scripts/setup-test-db.sh
	const { createRouter } = await import("@api/routes");
	const { getServiceClient } = await import("@db/client");

	const supabase = getServiceClient();
	const router = createRouter(supabase);

	server = Bun.serve({
		port: TEST_PORT,
		fetch: router.handle,
	});
});

afterAll(() => {
	server.stop();
});

describe("MCP Tools Integration", () => {
	const baseUrl = `http://localhost:${TEST_PORT}`;
	const headers = {
		"Content-Type": "application/json",
		"Origin": "http://localhost:3000",
		"MCP-Protocol-Version": "2025-06-18",
		"Accept": "application/json",
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
		expect(data.result.results).toBeArray();
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
		expect(data.result.results).toBeArray();
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
		expect(data.result.results).toBeArray();
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
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();
		expect(data.result.runId).toBeDefined();
		expect(data.result.status).toBe("pending");
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
		expect(data.error.code).toBe(-32602); // Invalid Params
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
		expect(data.error.code).toBe(-32602); // Invalid Params
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
		expect(data.error.code).toBe(-32602); // Invalid Params
	});
});
