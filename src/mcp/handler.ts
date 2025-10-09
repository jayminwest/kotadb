/**
 * Main MCP request handler and JSON-RPC dispatcher
 */

import type { Database } from "bun:sqlite";
import type { AuthContext } from "@shared/index";
import {
	type JsonRpcRequest,
	type JsonRpcResponse,
	invalidRequest,
	internalError,
	invalidParams,
	isNotification,
	isRequest,
	methodNotFound,
	parseError,
	success,
} from "./jsonrpc";
import { parseAccept, validateOrigin, validateProtocolVersion } from "./headers";
import { extractSessionId, validateSessionId } from "./session";
import { handleInitialize, type InitializeRequest } from "./lifecycle";
import { getToolDefinitions, handleToolCall } from "./tools";

/**
 * Main entry point for MCP requests.
 * All MCP requests are authenticated via middleware before reaching this handler.
 *
 * @param db - SQLite database instance
 * @param request - HTTP request
 * @param context - Authenticated user context
 */
export async function handleMcpRequest(
	db: Database,
	request: Request,
	context: AuthContext,
): Promise<Response> {
	// Validate required headers
	const origin = request.headers.get("origin");
	if (!validateOrigin(origin)) {
		return jsonResponse(
			{ error: "Invalid or missing Origin header" },
			403,
		);
	}

	const protocolVersion = request.headers.get("mcp-protocol-version");
	if (!validateProtocolVersion(protocolVersion)) {
		return jsonResponse(
			{
				error:
					"Invalid or missing MCP-Protocol-Version header (expected: 2025-06-18)",
			},
			400,
		);
	}

	const accept = parseAccept(request.headers.get("accept"));
	if (!accept.json) {
		return jsonResponse(
			{ error: "Accept header must include application/json" },
			406,
		);
	}

	// Validate session ID if present
	const sessionId = extractSessionId(request.headers);
	if (!validateSessionId(sessionId)) {
		return jsonResponse({ error: "Invalid Mcp-Session-Id header" }, 400);
	}

	// Parse JSON-RPC message
	let body: unknown;
	try {
		body = await request.json();
	} catch (error) {
		return jsonRpcResponse(
			parseError(`Invalid JSON: ${(error as Error).message}`),
		);
	}

	// Handle notifications (no response needed)
	if (isNotification(body)) {
		return handleNotification(body);
	}

	// Handle requests
	if (!isRequest(body)) {
		return jsonRpcResponse(invalidRequest(null, "Invalid JSON-RPC request"));
	}

	return jsonRpcResponse(await dispatchMethod(db, body, context));
}

/**
 * Handle JSON-RPC notification (no response)
 */
function handleNotification(notification: { method: string }): Response {
	// For now, just accept the notification
	// In the future, handle specific notifications like "initialized"
	console.log(`Received notification: ${notification.method}`);
	return new Response(null, { status: 202 });
}

/**
 * Dispatch JSON-RPC request to appropriate handler
 */
async function dispatchMethod(
	db: Database,
	request: JsonRpcRequest,
	context: AuthContext,
): Promise<JsonRpcResponse> {
	const { id, method, params } = request;

	try {
		switch (method) {
			case "initialize":
				return success(id, handleInitialize(params as InitializeRequest));

			case "tools/list":
				return success(id, { tools: getToolDefinitions() });

			case "tools/call": {
				// Validate tools/call params structure
				if (
					typeof params !== "object" ||
					params === null ||
					!("name" in params) ||
					typeof params.name !== "string"
				) {
					return invalidParams(
						id,
						"tools/call requires 'name' parameter with tool name",
					);
				}

				const toolParams =
					"arguments" in params ? params.arguments : undefined;
				const result = handleToolCall(db, params.name, toolParams, id, context.userId);
				return success(id, result);
			}

			default:
				return methodNotFound(id, method);
		}
	} catch (error) {
		// Handle errors thrown by tool executors
		if (
			typeof error === "object" &&
			error !== null &&
			"error" in error &&
			typeof error.error === "object" &&
			error.error !== null &&
			"code" in error.error
		) {
			// Re-throw JSON-RPC errors
			return error as JsonRpcResponse;
		}

		// Convert other errors to internal errors
		return internalError(
			id,
			`Internal error: ${(error as Error).message}`,
		);
	}
}

/**
 * Helper: create JSON response
 */
function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload, null, 2), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/**
 * Helper: create JSON-RPC response
 */
function jsonRpcResponse(response: JsonRpcResponse): Response {
	return jsonResponse(response, 200);
}
