/**
 * MCP Protocol Lifecycle Integration Tests
 *
 * Tests the complete MCP protocol lifecycle including:
 * - Protocol handshake (initialize → initialized)
 * - Tool discovery (tools/list)
 * - Tool execution (tools/call)
 * - Connection management
 *
 * Uses real Supabase database connection (antimocking compliance).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { sendMcpRequest, extractToolResult } from "../helpers/mcp";
import { startTestServer, stopTestServer } from "../helpers/server";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	const testServer = await startTestServer();
	server = testServer.server;
	baseUrl = testServer.url;
});

afterAll(async () => {
	await stopTestServer(server);
});

describe("MCP Protocol Lifecycle", () => {
	test("full handshake flow: initialize → tools/list → tools/call", async () => {
		// Step 1: Initialize connection
		const initResponse = await sendMcpRequest(
			baseUrl,
			"initialize",
			{
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "test-client", version: "1.0" },
			},
			"free",
		);

		expect(initResponse.status).toBe(200);
		expect(initResponse.data.result).toBeDefined();
		expect(initResponse.data.result.protocolVersion).toBe("2025-06-18");
		expect(initResponse.data.result.serverInfo.name).toBe("kotadb");

		// Step 2: List available tools
		const toolsListResponse = await sendMcpRequest(
			baseUrl,
			"tools/list",
			{},
			"free",
		);

		expect(toolsListResponse.status).toBe(200);
		// tools/list returns result.tools directly (not wrapped in content blocks)
		const toolsList = toolsListResponse.data.result;
		expect(toolsList.tools).toBeDefined();
		expect(Array.isArray(toolsList.tools)).toBe(true);
		expect(toolsList.tools.length).toBe(6);

		// Verify all six tools are advertised
		const toolNames = toolsList.tools.map((t: any) => t.name);
		expect(toolNames).toContain("search_code");
		expect(toolNames).toContain("index_repository");
		expect(toolNames).toContain("list_recent_files");
		expect(toolNames).toContain("search_dependencies");
		expect(toolNames).toContain("get_adw_state");
		expect(toolNames).toContain("list_adw_workflows");

		// Step 3: Call a tool (list_recent_files - simplest tool)
		const toolCallResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "list_recent_files",
				arguments: { limit: 5 },
			},
			"free",
		);

		expect(toolCallResponse.status).toBe(200);
		const toolResult = extractToolResult(toolCallResponse.data);
		expect(toolResult.results).toBeDefined();
		expect(Array.isArray(toolResult.results)).toBe(true);
	});

	test("protocol version negotiation matches server version", async () => {
		const response = await sendMcpRequest(
			baseUrl,
			"initialize",
			{
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "version-test", version: "1.0" },
			},
			"free",
		);

		expect(response.status).toBe(200);
		expect(response.data.result.protocolVersion).toBe("2025-06-18");
	});

	test("capability advertising includes tools capability", async () => {
		const response = await sendMcpRequest(
			baseUrl,
			"initialize",
			{
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "capability-test", version: "1.0" },
			},
			"free",
		);

		expect(response.status).toBe(200);
		expect(response.data.result.capabilities).toBeDefined();
		expect(response.data.result.capabilities.tools).toBeDefined();
	});

	test("tools/list returns all tool schemas with input definitions", async () => {
		const response = await sendMcpRequest(baseUrl, "tools/list", {}, "free");

		expect(response.status).toBe(200);
		// tools/list returns result.tools directly (not wrapped in content blocks)
		const result = response.data.result;

		// Verify search_code tool schema
		const searchTool = result.tools.find((t: any) => t.name === "search_code");
		expect(searchTool).toBeDefined();
		expect(searchTool.description).toBeDefined();
		expect(searchTool.inputSchema).toBeDefined();
		expect(searchTool.inputSchema.type).toBe("object");
		expect(searchTool.inputSchema.properties).toBeDefined();
		expect(searchTool.inputSchema.properties.term).toBeDefined();
		expect(searchTool.inputSchema.required).toContain("term");

		// Verify index_repository tool schema
		const indexTool = result.tools.find(
			(t: any) => t.name === "index_repository",
		);
		expect(indexTool).toBeDefined();
		expect(indexTool.description).toBeDefined();
		expect(indexTool.inputSchema).toBeDefined();
		expect(indexTool.inputSchema.properties.repository).toBeDefined();
		expect(indexTool.inputSchema.required).toContain("repository");

		// Verify list_recent_files tool schema
		const listTool = result.tools.find(
			(t: any) => t.name === "list_recent_files",
		);
		expect(listTool).toBeDefined();
		expect(listTool.description).toBeDefined();
		expect(listTool.inputSchema).toBeDefined();
	});

	test("multiple sequential requests maintain isolation", async () => {
		// First request
		const response1 = await sendMcpRequest(
			baseUrl,
			"tools/list",
			{},
			"free",
		);
		expect(response1.status).toBe(200);

		// Second request
		const response2 = await sendMcpRequest(
			baseUrl,
			"tools/list",
			{},
			"free",
		);
		expect(response2.status).toBe(200);

		// Both responses should be identical (no state leakage)
		// tools/list returns result.tools directly (not wrapped in content blocks)
		const tools1 = response1.data.result;
		const tools2 = response2.data.result;
		expect(tools1.tools.length).toBe(tools2.tools.length);
	});

	test("notifications/initialized returns HTTP 202 Accepted", async () => {
		// Use raw fetch since this is a notification (no JSON-RPC id)
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Authorization: "Bearer kota_free_test1234567890ab_0123456789abcdef0123456789abcdef",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "notifications/initialized",
				params: {},
			}),
		});

		expect(response.status).toBe(202);
	});

	test("ping request returns pong response", async () => {
		const response = await sendMcpRequest(baseUrl, "ping", {}, "free");

		expect(response.status).toBe(200);
		expect(response.data.result).toBeDefined();
	});
});
