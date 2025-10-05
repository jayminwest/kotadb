/**
 * JSON-RPC 2.0 types and utilities for MCP protocol
 * https://www.jsonrpc.org/specification
 */

export interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: string | number;
	method: string;
	params?: unknown;
}

export interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: string | number | null;
	result?: unknown;
	error?: JsonRpcError;
}

export interface JsonRpcError {
	code: number;
	message: string;
	data?: unknown;
}

export interface JsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: unknown;
}

// Standard JSON-RPC error codes
export const ErrorCodes = {
	ParseError: -32700,
	InvalidRequest: -32600,
	MethodNotFound: -32601,
	InvalidParams: -32602,
	InternalError: -32603,
} as const;

/**
 * Type guard: checks if value is a valid JSON-RPC request
 */
export function isRequest(value: unknown): value is JsonRpcRequest {
	if (typeof value !== "object" || value === null) return false;
	const obj = value as Record<string, unknown>;
	return (
		obj.jsonrpc === "2.0" &&
		(typeof obj.id === "string" || typeof obj.id === "number") &&
		typeof obj.method === "string"
	);
}

/**
 * Type guard: checks if value is a valid JSON-RPC notification
 */
export function isNotification(value: unknown): value is JsonRpcNotification {
	if (typeof value !== "object" || value === null) return false;
	const obj = value as Record<string, unknown>;
	return (
		obj.jsonrpc === "2.0" &&
		obj.id === undefined &&
		typeof obj.method === "string"
	);
}

/**
 * Type guard: checks if version is valid JSON-RPC 2.0
 */
export function isValidVersion(value: unknown): boolean {
	return value === "2.0";
}

/**
 * Build a successful JSON-RPC response
 */
export function success(id: string | number, result: unknown): JsonRpcResponse {
	return {
		jsonrpc: "2.0",
		id,
		result,
	};
}

/**
 * Build a JSON-RPC error response
 */
export function error(
	id: string | number | null,
	code: number,
	message: string,
	data?: unknown,
): JsonRpcResponse {
	return {
		jsonrpc: "2.0",
		id,
		error: {
			code,
			message,
			data,
		},
	};
}

/**
 * Build a Parse Error response (invalid JSON)
 */
export function parseError(message = "Parse error"): JsonRpcResponse {
	return error(null, ErrorCodes.ParseError, message);
}

/**
 * Build an Invalid Request response (invalid JSON-RPC)
 */
export function invalidRequest(
	id: string | number | null,
	message = "Invalid Request",
): JsonRpcResponse {
	return error(id, ErrorCodes.InvalidRequest, message);
}

/**
 * Build a Method Not Found response
 */
export function methodNotFound(
	id: string | number,
	method: string,
): JsonRpcResponse {
	return error(id, ErrorCodes.MethodNotFound, `Method not found: ${method}`);
}

/**
 * Build an Invalid Params response
 */
export function invalidParams(
	id: string | number,
	message = "Invalid params",
): JsonRpcResponse {
	return error(id, ErrorCodes.InvalidParams, message);
}

/**
 * Build an Internal Error response
 */
export function internalError(
	id: string | number,
	message = "Internal error",
	data?: unknown,
): JsonRpcResponse {
	return error(id, ErrorCodes.InternalError, message, data);
}
