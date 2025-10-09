import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createMockSupabaseClient } from "../helpers/supabase-mock";

const TEST_PORT = 3097;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
	// Create mock Supabase client for testing
	const mockSupabase = createMockSupabaseClient();

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

describe("MCP JSON-RPC Error Handling", () => {
	const baseUrl = `http://localhost:${TEST_PORT}`;
	const headers = {
		"Content-Type": "application/json",
		"Origin": "http://localhost:3000",
		"MCP-Protocol-Version": "2025-06-18",
		"Accept": "application/json",
	};

	test("invalid JSON body returns -32700 Parse Error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: "not valid json {[",
		});

		expect(response.status).toBe(200); // JSON-RPC errors use 200
		const data = (await response.json()) as any;
		expect(data.jsonrpc).toBe("2.0");
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32700);
		expect(data.error.message).toContain("JSON");
	});

	test("invalid JSON-RPC format returns -32600 Invalid Request", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				// Missing jsonrpc version
				id: 1,
				method: "initialize",
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32600);
	});

	test("unknown method returns -32601 Method Not Found", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "nonexistent_method",
				params: {},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32601);
		expect(data.error.message).toContain("Method not found");
	});

	test("tools/call without name returns -32602 Invalid Params", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					// Missing name field
					arguments: {},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32602);
		expect(data.error.message).toContain("name");
	});

	test("search_code with invalid params returns -32602", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {
						// Missing required 'term' field
						repository: "test-repo-uuid",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32602);
	});

	test("index_repository with invalid params returns -32602", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "index_repository",
					arguments: {
						// Missing required 'repository' field
						ref: "main",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32602);
	});

	test("tools/call with wrong param types returns -32602", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {
						term: 123, // Should be string
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32602);
	});

	test("error response includes request id", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 99,
				method: "unknown_method",
				params: {},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.id).toBe(99);
		expect(data.error).toBeDefined();
	});

	test("parse error has null id", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: "invalid json",
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.id).toBeNull();
		expect(data.error).toBeDefined();
	});
});
