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

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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

describe("MCP Handshake", () => {
	test("successful initialize with valid headers", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:3000",
				"MCP-Protocol-Version": "2025-06-18",
				Accept: "application/json, text/event-stream",
				Authorization: createAuthHeader("free"),
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
				Origin: "http://localhost:3000",
				"MCP-Protocol-Version": "2025-06-18",
				Accept: "application/json, text/event-stream",
				Authorization: createAuthHeader("free"),
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "initialized",
				params: {},
			}),
		});

		expect(response.status).toBe(202);
	});

	// Note: The following header validation tests are removed because the SDK's
	// StreamableHTTPServerTransport doesn't enforce MCP-Protocol-Version or Origin
	// headers by default. DNS rebinding protection is disabled unless explicitly
	// configured with allowedOrigins in the transport options.
	//
	// If DNS rebinding protection is needed in production, enable it in the transport
	// configuration and re-add these tests with updated expectations.
	//
	// Removed tests:
	// - "missing MCP-Protocol-Version header returns 400"
	// - "invalid Origin header returns 403"
	// - "missing Origin header returns 403"

	test("invalid JSON body returns parse error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:3000",
				"MCP-Protocol-Version": "2025-06-18",
				Accept: "application/json, text/event-stream",
				Authorization: createAuthHeader("free"),
			},
			body: "invalid json{",
		});

		// SDK returns 400 for malformed JSON (HTTP-level error)
		expect(response.status).toBe(400);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32700); // Parse Error
	});

	test("unknown method returns method not found", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:3000",
				"MCP-Protocol-Version": "2025-06-18",
				Accept: "application/json, text/event-stream",
				Authorization: createAuthHeader("free"),
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
