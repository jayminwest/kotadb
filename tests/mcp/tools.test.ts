import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { createMockAuthHeader } from "../helpers/auth-mock";

const TEST_PORT = 3098;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
	// Set test environment variables for Supabase
	process.env.SUPABASE_URL = "http://localhost:54321";
	process.env.SUPABASE_SERVICE_KEY = "test-service-key";
	process.env.SUPABASE_ANON_KEY = "test-anon-key";

	// Create mock Supabase client with test data
	const mockSupabase = createMockSupabaseClient({
		selectData: [
			{
				id: "test-repo-id",
				repository_id: "test-repo-id",
				path: "src/router.ts",
				content: 'export class Router {\n  handle(req) {}\n}',
				metadata: { dependencies: [] },
				indexed_at: new Date().toISOString(),
			},
			{
				id: "test-file-2",
				repository_id: "test-repo-id",
				path: "src/handler.ts",
				content: 'import { Router } from "./router";\nexport function createHandler() {}',
				metadata: { dependencies: ["./router"] },
				indexed_at: new Date().toISOString(),
			},
		],
		insertData: { id: "test-uuid-123", repository_id: "test-repo-id" },
	});

	// Import and start test server
	const { createRouter } = await import("@api/routes");
	const router = createRouter(mockSupabase);

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
		"Authorization": createMockAuthHeader(),
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
						repository: "test-repo-id",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
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
