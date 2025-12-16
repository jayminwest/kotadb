/**
 * MCP Sync Tools Validation Test
 *
 * Tests that kota_sync_export and kota_sync_import tools are properly registered
 * and can be called via the MCP server.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createAuthHeader } from "../helpers/db";
import { extractToolResult } from "../helpers/mcp";
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

describe("MCP Sync Tools Validation", () => {
	const headers = {
		"Content-Type": "application/json",
		Origin: "http://localhost:3000",
		"MCP-Protocol-Version": "2025-06-18",
		Accept: "application/json, text/event-stream",
		Authorization: createAuthHeader("free"),
	};

	test("tools/list includes kota_sync_export", async () => {
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

		const toolNames = data.result.tools.map((t: { name: string }) => t.name);
		expect(toolNames).toContain("kota_sync_export");
		
		// Verify tool definition
		const exportTool = data.result.tools.find((t: { name: string }) => t.name === "kota_sync_export");
		expect(exportTool).toBeDefined();
		expect(exportTool.description).toContain("Export local SQLite database to JSONL");
		expect(exportTool.inputSchema).toBeDefined();
		expect(exportTool.inputSchema.properties).toHaveProperty("force");
		expect(exportTool.inputSchema.properties).toHaveProperty("export_dir");
	});

	test("tools/list includes kota_sync_import", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();
		expect(data.result.tools).toBeArray();

		const toolNames = data.result.tools.map((t: { name: string }) => t.name);
		expect(toolNames).toContain("kota_sync_import");
		
		// Verify tool definition
		const importTool = data.result.tools.find((t: { name: string }) => t.name === "kota_sync_import");
		expect(importTool).toBeDefined();
		expect(importTool.description).toContain("Import JSONL files into local SQLite database");
		expect(importTool.inputSchema).toBeDefined();
		expect(importTool.inputSchema.properties).toHaveProperty("import_dir");
	});

	test("kota_sync_export tool is callable", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: {
					name: "kota_sync_export",
					arguments: {
						force: false,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		
		// Tool should return a result (success or error), not "unknown tool"
		// We expect it may fail due to missing SQLite DB, but that's fine - 
		// we're just validating the tool is wired up
		if (data.error) {
			// If there's an error, it should NOT be "unknown tool"
			expect(data.error.message).not.toContain("Unknown tool");
			// It's likely a legitimate error about missing database or export directory
			process.stdout.write(JSON.stringify({
				level: 'info',
				message: 'kota_sync_export returned expected error (tool is wired)',
				error: data.error.message
			}) + '\n');
		} else {
			// If it succeeds, verify the response structure
			expect(data.result).toBeDefined();
			const toolResult = extractToolResult(data);
			process.stdout.write(JSON.stringify({
				level: 'info',
				message: 'kota_sync_export succeeded',
				result: toolResult
			}) + '\n');
		}
	});

	test("kota_sync_import tool is callable", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 4,
				method: "tools/call",
				params: {
					name: "kota_sync_import",
					arguments: {},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		
		// Tool should return a result (success or error), not "unknown tool"
		// We expect it may fail due to missing import files, but that's fine - 
		// we're just validating the tool is wired up
		if (data.error) {
			// If there's an error, it should NOT be "unknown tool"
			expect(data.error.message).not.toContain("Unknown tool");
			// It's likely a legitimate error about missing import directory or files
			process.stdout.write(JSON.stringify({
				level: 'info',
				message: 'kota_sync_import returned expected error (tool is wired)',
				error: data.error.message
			}) + '\n');
		} else {
			// If it succeeds, verify the response structure
			expect(data.result).toBeDefined();
			const toolResult = extractToolResult(data);
			process.stdout.write(JSON.stringify({
				level: 'info',
				message: 'kota_sync_import succeeded',
				result: toolResult
			}) + '\n');
		}
	});
});
