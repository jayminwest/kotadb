import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { ensureSchema } from "@db/schema";

const TEST_PORT = 3099;
let server: ReturnType<typeof Bun.serve>;
let db: Database;

beforeAll(async () => {
	// Set up in-memory test database
	db = new Database(":memory:");
	ensureSchema(db);

	// Import and start test server
	const { createRouter } = await import("@api/routes");
	const router = createRouter(db);

	server = Bun.serve({
		port: TEST_PORT,
		fetch: router.handle,
	});
});

afterAll(() => {
	server.stop();
	db.close();
});

describe("MCP Handshake", () => {
	const baseUrl = `http://localhost:${TEST_PORT}`;

	test("successful initialize with valid headers", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Origin": "http://localhost:3000",
				"MCP-Protocol-Version": "2025-06-18",
				"Accept": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "test-client", version: "1.0" },
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.jsonrpc).toBe("2.0");
		expect(data.id).toBe(1);
		expect(data.result).toBeDefined();
		expect(data.result.protocolVersion).toBe("2025-06-18");
		expect(data.result.serverInfo.name).toBe("kotadb");
		expect(data.result.capabilities.tools).toBeDefined();
	});

	test("initialized notification returns 202", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Origin": "http://localhost:3000",
				"MCP-Protocol-Version": "2025-06-18",
				"Accept": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "initialized",
				params: {},
			}),
		});

		expect(response.status).toBe(202);
	});

	test("missing MCP-Protocol-Version header returns 400", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Origin": "http://localhost:3000",
				"Accept": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {},
			}),
		});

		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.error).toContain("MCP-Protocol-Version");
	});

	test("invalid Origin header returns 403", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Origin": "http://evil.com",
				"MCP-Protocol-Version": "2025-06-18",
				"Accept": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {},
			}),
		});

		expect(response.status).toBe(403);
		const data = (await response.json()) as any;
		expect(data.error).toContain("Origin");
	});

	test("missing Origin header returns 403", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"MCP-Protocol-Version": "2025-06-18",
				"Accept": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {},
			}),
		});

		expect(response.status).toBe(403);
	});

	test("invalid JSON body returns parse error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Origin": "http://localhost:3000",
				"MCP-Protocol-Version": "2025-06-18",
				"Accept": "application/json",
			},
			body: "invalid json{",
		});

		expect(response.status).toBe(200); // JSON-RPC errors still return 200
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32700); // Parse Error
	});

	test("unknown method returns method not found", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Origin": "http://localhost:3000",
				"MCP-Protocol-Version": "2025-06-18",
				"Accept": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "unknown_method",
				params: {},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32601); // Method Not Found
	});
});
