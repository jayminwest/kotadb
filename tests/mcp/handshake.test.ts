/**
 * MCP Handshake Integration Tests
 *
 * Tests the MCP protocol handshake flow with real database connection.
 * Environment variables are loaded from .env.test in CI or default to local Supabase ports.
 *
 * Required environment variables:
 * - SUPABASE_URL (defaults to http://localhost:54322)
 * - SUPABASE_SERVICE_KEY (defaults to local demo key)
 * - SUPABASE_ANON_KEY (defaults to local demo key)
 * - DATABASE_URL (defaults to postgresql://postgres:postgres@localhost:5434/postgres)
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createAuthHeader } from "../helpers/db";

const TEST_PORT = 3099;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
	// Environment variables loaded from .env.test (CI) or fallback to local defaults
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
				"Authorization": createAuthHeader("free"),
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
				"Authorization": createAuthHeader("free"),
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
				"Authorization": createAuthHeader("free"),
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
				"Authorization": createAuthHeader("free"),
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
				"Authorization": createAuthHeader("free"),
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
				"Authorization": createAuthHeader("free"),
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
				"Authorization": createAuthHeader("free"),
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
