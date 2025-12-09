/**
 * MCP Tool: get_index_job_status Tests
 *
 * Tests the get_index_job_status MCP tool which allows agents to query
 * the status of indexing jobs after calling index_repository.
 *
 * Test categories:
 * - Parameter validation (missing runId, invalid types, UUID format)
 * - Successful status queries (various job statuses)
 * - RLS enforcement (users can only see their own jobs)
 *
 * Uses real Supabase database (antimocking compliance).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { resetRateLimitCounters } from "../helpers/db";
import { assertJsonRpcError, extractToolResult, sendMcpRequest } from "../helpers/mcp";
import { startTestServer, stopTestServer } from "../helpers/server";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	const testServer = await startTestServer();
	server = testServer.server;
	baseUrl = testServer.url;
	await resetRateLimitCounters();
});

afterAll(async () => {
	await stopTestServer(server);
});

describe("get_index_job_status Parameter Validation", () => {
	test("missing runId parameter returns -32603", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Authorization: "Bearer kota_free_test1234567890ab_0123456789abcdef0123456789abcdef",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "get_index_job_status",
					arguments: {
						// Missing required 'runId' field
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		assertJsonRpcError(data, -32603, "runId");
	});

	test("runId parameter with invalid type returns -32603", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Authorization: "Bearer kota_free_test1234567890ab_0123456789abcdef0123456789abcdef",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "get_index_job_status",
					arguments: {
						runId: 12345, // Invalid type: should be string
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		assertJsonRpcError(data, -32603);
	});

	test("runId parameter with invalid UUID format returns -32603", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Authorization: "Bearer kota_free_test1234567890ab_0123456789abcdef0123456789abcdef",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "get_index_job_status",
					arguments: {
						runId: "not-a-valid-uuid", // Invalid UUID format
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		assertJsonRpcError(data, -32603, "UUID");
	});

	test("non-existent job returns -32603 with 'not found' message", async () => {
		const nonExistentId = "00000000-0000-0000-0000-000000000000";
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
				Authorization: "Bearer kota_free_test1234567890ab_0123456789abcdef0123456789abcdef",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "get_index_job_status",
					arguments: {
						runId: nonExistentId,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		assertJsonRpcError(data, -32603, "not found");
	});
});

describe("get_index_job_status Integration", () => {
	test("can query status after starting indexing job", async () => {
		// First, start an indexing job
		const indexResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test/status-check-repo",
				},
			},
			"free",
		);

		expect(indexResponse.status).toBe(200);
		expect(indexResponse.data.result).toBeDefined();

		const indexResult = extractToolResult(indexResponse.data);
		expect(indexResult.runId).toBeDefined();
		expect(indexResult.status).toBe("pending");

		// Now query the job status
		const statusResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "get_index_job_status",
				arguments: {
					runId: indexResult.runId,
				},
			},
			"free",
		);

		expect(statusResponse.status).toBe(200);
		expect(statusResponse.data.result).toBeDefined();

		const statusResult = extractToolResult(statusResponse.data);
		expect(statusResult.runId).toBe(indexResult.runId);
		expect(["pending", "running", "completed", "failed", "skipped"]).toContain(statusResult.status);
		expect(statusResult.repository_id).toBeDefined();
		expect(statusResult.created_at).toBeDefined();
	});

	test("response includes all expected fields", async () => {
		// Start an indexing job
		const indexResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test/fields-check-repo",
					ref: "main",
				},
			},
			"free",
		);

		const indexResult = extractToolResult(indexResponse.data);

		// Query status
		const statusResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "get_index_job_status",
				arguments: {
					runId: indexResult.runId,
				},
			},
			"free",
		);

		expect(statusResponse.status).toBe(200);
		const statusResult = extractToolResult(statusResponse.data);

		// Verify required fields
		expect(statusResult).toHaveProperty("runId");
		expect(statusResult).toHaveProperty("status");
		expect(statusResult).toHaveProperty("repository_id");
		expect(statusResult).toHaveProperty("created_at");

		// Verify optional fields exist (may be null)
		expect("ref" in statusResult).toBe(true);
		expect("started_at" in statusResult).toBe(true);
		expect("completed_at" in statusResult).toBe(true);
		expect("error_message" in statusResult).toBe(true);
		expect("stats" in statusResult).toBe(true);
		expect("retry_count" in statusResult).toBe(true);
	});
});

describe("get_index_job_status RLS Enforcement", () => {
	test("user cannot query another user's job", async () => {
		// Create a job with free tier user
		const indexResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "index_repository",
				arguments: {
					repository: "test/rls-test-repo",
				},
			},
			"free",
		);

		const indexResult = extractToolResult(indexResponse.data);

		// Try to query the job with solo tier user (different user)
		const statusResponse = await sendMcpRequest(
			baseUrl,
			"tools/call",
			{
				name: "get_index_job_status",
				arguments: {
					runId: indexResult.runId,
				},
			},
			"solo",
		);

		// Should fail with "Job not found or access denied" due to RLS
		expect(statusResponse.status).toBe(200);
		const data = statusResponse.data;
		assertJsonRpcError(data, -32603, "Job not found or access denied");
	});
});
