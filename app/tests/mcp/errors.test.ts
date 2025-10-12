/**
 * MCP JSON-RPC Error Handling Tests
 *
 * Tests JSON-RPC error codes and handling with real database connection.
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

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	// Start Express test server with real database connection
	const testServer = await startTestServer();
	server = testServer.server;
	baseUrl = testServer.url;
});

afterAll(async () => {
	await stopTestServer(server);
});

describe("MCP JSON-RPC Error Handling", () => {
	const headers = {
		"Content-Type": "application/json",
		"Origin": "http://localhost:3000",
		"MCP-Protocol-Version": "2025-06-18",
		"Accept": "application/json, text/event-stream",
		"Authorization": createAuthHeader("free"),
	};

	test("invalid JSON body returns -32700 Parse Error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: "not valid json {[",
		});

		// SDK returns 400 for malformed JSON (HTTP-level error)
		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.jsonrpc).toBe("2.0");
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32700);
		expect(data.error.message).toContain("Parse");
	});

	test("invalid JSON-RPC format returns -32700 Parse Error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				// Missing jsonrpc version
				id: 1,
				method: "initialize",
			}),
		});

		// SDK returns 400 for invalid JSON-RPC structure
		// SDK treats structural validation errors as parse errors (-32700)
		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32700);
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

	test("tools/call without name returns -32603 Internal Error", async () => {
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
		expect(data.error.code).toBe(-32603); // SDK returns Internal Error for tool validation
		expect(data.error.message).toContain("name");
	});

	test("search_code with invalid params returns -32603", async () => {
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
		expect(data.error.code).toBe(-32603); // SDK returns Internal Error for tool validation
	});

	test("index_repository with invalid params returns -32603", async () => {
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
		expect(data.error.code).toBe(-32603); // SDK returns Internal Error for tool validation
	});

	test("tools/call with wrong param types returns -32603", async () => {
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
		expect(data.error.code).toBe(-32603); // SDK returns Internal Error for type validation
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

		// SDK returns 400 for malformed JSON (HTTP-level error)
		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.id).toBeNull();
		expect(data.error).toBeDefined();
	});
});
