/**
 * Impact Analysis and Spec Validation MCP Tools Integration Tests
 *
 * Tests the analyze_change_impact and validate_implementation_spec tools with real database connection.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createAuthHeader } from "../helpers/db";
import { extractToolResult } from "../helpers/mcp";
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

describe("MCP Impact Analysis Tools", () => {
	const headers = {
		"Content-Type": "application/json",
		Origin: "http://localhost:3000",
		"MCP-Protocol-Version": "2025-06-18",
		Accept: "application/json, text/event-stream",
		Authorization: createAuthHeader("free"),
	};

	test("analyze_change_impact returns impact analysis for proposed changes", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "analyze_change_impact",
					arguments: {
						change_type: "feature",
						description: "Add new authentication middleware",
						files_to_modify: ["app/src/auth/middleware.ts"],
						files_to_create: ["app/src/auth/providers/google.ts"],
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.jsonrpc).toBe("2.0");
		expect(data.result).toBeDefined();

		const toolResult = extractToolResult(data);
		expect(toolResult).toHaveProperty("affected_files");
		expect(toolResult).toHaveProperty("test_scope");
		expect(toolResult).toHaveProperty("architectural_warnings");
		expect(toolResult).toHaveProperty("conflicts");
		expect(toolResult).toHaveProperty("risk_level");
		expect(toolResult).toHaveProperty("deployment_impact");
		expect(toolResult).toHaveProperty("last_indexed_at");
		expect(toolResult).toHaveProperty("summary");

		expect(toolResult.affected_files).toBeArray();
		expect(toolResult.test_scope).toBeObject();
		expect(toolResult.architectural_warnings).toBeArray();
		expect(toolResult.conflicts).toBeArray();
		expect(["low", "medium", "high"]).toContain(toolResult.risk_level);
	});

	test("analyze_change_impact with breaking changes flag", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: {
					name: "analyze_change_impact",
					arguments: {
						change_type: "refactor",
						description: "Refactor database schema",
						files_to_modify: ["app/src/db/schema.ts"],
						breaking_changes: true,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		const toolResult = extractToolResult(data);

		expect(toolResult.architectural_warnings).toBeArray();
		expect(toolResult.summary).toContain("WARNING: Breaking changes included");
	});

	test("analyze_change_impact handles no repository gracefully", async () => {
		// This test uses a fresh user with no repositories indexed
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: {
					name: "analyze_change_impact",
					arguments: {
						change_type: "feature",
						description: "Test with no repository",
						files_to_create: ["test.ts"],
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		const toolResult = extractToolResult(data);

		expect(toolResult.summary).toContain(
			"No repository data available for impact analysis",
		);
	});

	test("validate_implementation_spec returns validation results", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 4,
				method: "tools/call",
				params: {
					name: "validate_implementation_spec",
					arguments: {
						feature_name: "Google OAuth Provider",
						files_to_create: [
							{
								path: "app/src/auth/providers/google.ts",
								purpose: "Implement Google OAuth provider",
							},
						],
						files_to_modify: [
							{
								path: "app/src/auth/middleware.ts",
								purpose: "Integrate OAuth provider",
							},
						],
						migrations: [
							{
								filename: "20251108120000_add_oauth_providers.sql",
								description: "Add oauth_providers table",
							},
						],
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.jsonrpc).toBe("2.0");
		expect(data.result).toBeDefined();

		const toolResult = extractToolResult(data);
		expect(toolResult).toHaveProperty("valid");
		expect(toolResult).toHaveProperty("errors");
		expect(toolResult).toHaveProperty("warnings");
		expect(toolResult).toHaveProperty("approval_conditions");
		expect(toolResult).toHaveProperty("risk_assessment");
		expect(toolResult).toHaveProperty("summary");

		expect(toolResult.errors).toBeArray();
		expect(toolResult.warnings).toBeArray();
		expect(toolResult.approval_conditions).toBeArray();
	});

	test("validate_implementation_spec detects invalid migration naming", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 5,
				method: "tools/call",
				params: {
					name: "validate_implementation_spec",
					arguments: {
						feature_name: "Test Invalid Migration",
						migrations: [
							{
								filename: "invalid_migration_name.sql",
								description: "Invalid migration",
							},
						],
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		const toolResult = extractToolResult(data);

		expect(toolResult.valid).toBe(false);
		expect(toolResult.errors.length).toBeGreaterThan(0);
		expect(toolResult.errors[0].type).toBe("naming_convention");
	});

	test("validate_implementation_spec warns about missing tests", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 6,
				method: "tools/call",
				params: {
					name: "validate_implementation_spec",
					arguments: {
						feature_name: "Test Missing Tests",
						files_to_create: [
							{
								path: "app/src/api/new-feature.ts",
								purpose: "Implement new feature",
							},
						],
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		const toolResult = extractToolResult(data);

		expect(toolResult.warnings.length).toBeGreaterThan(0);
		const testWarning = toolResult.warnings.find(
			(w: any) => w.type === "test_coverage",
		);
		expect(testWarning).toBeDefined();
	});

	test("analyze_change_impact validates required parameters", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 7,
				method: "tools/call",
				params: {
					name: "analyze_change_impact",
					arguments: {
						// Missing required parameters: change_type and description
						files_to_create: ["test.ts"],
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.message).toContain("Missing required parameter");
	});

	test("validate_implementation_spec validates required parameters", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 8,
				method: "tools/call",
				params: {
					name: "validate_implementation_spec",
					arguments: {
						// Missing required parameter: feature_name
						files_to_create: [
							{
								path: "test.ts",
								purpose: "Test file",
							},
						],
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.message).toContain("Missing required parameter");
	});
});
