import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createAuthHeader } from "../helpers/db";

const TEST_PORT = 3097;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
	// Set test environment variables to point to Supabase Local
	process.env.SUPABASE_URL = "http://localhost:54326";
	process.env.SUPABASE_SERVICE_KEY =
		"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
	process.env.SUPABASE_ANON_KEY =
		"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
	process.env.DATABASE_URL =
		"postgresql://postgres:postgres@localhost:5434/postgres";

	// Import and start test server with real database connection
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

describe("MCP JSON-RPC Error Handling", () => {
	const baseUrl = `http://localhost:${TEST_PORT}`;
	const headers = {
		"Content-Type": "application/json",
		"Origin": "http://localhost:3000",
		"MCP-Protocol-Version": "2025-06-18",
		"Accept": "application/json",
		"Authorization": createAuthHeader("free"),
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
