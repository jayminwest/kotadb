/**
 * MCP-specific test helpers for working with SDK responses.
 *
 * The MCP SDK wraps tool results in content blocks. This module provides
 * utilities to extract and parse tool results from SDK response format.
 */

import { createAuthHeader } from "./db";
import { expect } from "bun:test";

/**
 * Extract tool result from MCP SDK content block response
 *
 * The SDK returns tool results wrapped in a content block:
 * {
 *   result: {
 *     content: [
 *       { type: "text", text: "{...tool result JSON...}" }
 *     ]
 *   }
 * }
 *
 * This helper extracts and parses the JSON from the first content block.
 *
 * @param data - The JSON-RPC response object from MCP endpoint
 * @returns Parsed tool result object
 * @throws Error if content block is missing or JSON is invalid
 */
export function extractToolResult(data: any): any {
	if (!data.result) {
		throw new Error("Response missing result field");
	}

	if (!data.result.content || !Array.isArray(data.result.content)) {
		throw new Error("Response result missing content array");
	}

	if (data.result.content.length === 0) {
		throw new Error("Response content array is empty");
	}

	const firstContent = data.result.content[0];
	if (!firstContent.text) {
		throw new Error("First content block missing text field");
	}

	try {
		return JSON.parse(firstContent.text);
	} catch (err) {
		throw new Error(`Failed to parse content block text as JSON: ${err}`);
	}
}

/**
 * Send an MCP JSON-RPC request
 *
 * @param baseUrl - Base URL of the server (e.g., http://localhost:3000)
 * @param method - JSON-RPC method name (e.g., tools/list, tools/call)
 * @param params - Method parameters
 * @param tier - API tier for authentication (free, solo, team)
 * @returns Response object with status and JSON data
 */
export async function sendMcpRequest(
	baseUrl: string,
	method: string,
	params: any = {},
	tier: "free" | "solo" | "team" | "disabled" = "free",
): Promise<{ status: number; data: any }> {
	const response = await fetch(`${baseUrl}/mcp`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			Authorization: createAuthHeader(tier),
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method,
			params,
		}),
	});

	const data = await response.json();
	return { status: response.status, data };
}

/**
 * Create MCP request headers with authentication
 *
 * @param tier - API tier for authentication (free, solo, team)
 * @returns Headers object for MCP requests
 */
export function createMcpHeaders(
	tier: "free" | "solo" | "team" | "disabled" = "free",
): Record<string, string> {
	return {
		"Content-Type": "application/json",
		Accept: "application/json, text/event-stream",
		Authorization: createAuthHeader(tier),
	};
}

/**
 * Assert that a response contains a valid tool result with expected fields
 *
 * @param response - MCP response object
 * @param expectedFields - Object with expected field names and types
 */
export function assertToolResult(
	response: any,
	expectedFields: Record<string, string>,
): void {
	expect(response.result).toBeDefined();
	const result = extractToolResult(response);

	for (const [field, type] of Object.entries(expectedFields)) {
		expect(result).toHaveProperty(field);
		expect(typeof result[field]).toBe(type);
	}
}

/**
 * Assert that a response contains a JSON-RPC error with expected code and message pattern
 *
 * @param response - MCP response object
 * @param expectedCode - Expected JSON-RPC error code
 * @param messagePattern - Regex pattern or string to match in error message
 */
export function assertJsonRpcError(
	response: any,
	expectedCode: number,
	messagePattern?: string | RegExp,
): void {
	expect(response.error).toBeDefined();
	expect(response.error.code).toBe(expectedCode);

	if (messagePattern) {
		if (typeof messagePattern === "string") {
			expect(response.error.message).toContain(messagePattern);
		} else {
			expect(response.error.message).toMatch(messagePattern);
		}
	}
}
