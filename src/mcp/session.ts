/**
 * MCP session management utilities
 * Initial implementation uses stateless validation
 */

const SESSION_HEADER = "mcp-session-id";

/**
 * Extract session ID from request headers
 */
export function extractSessionId(headers: Headers): string | null {
	return headers.get(SESSION_HEADER);
}

/**
 * Validate session ID format (stateless check)
 * Returns true if session ID is present and well-formed
 */
export function validateSessionId(id: string | null): boolean {
	if (!id) return true; // Session ID is optional
	if (id.length === 0) return false; // Empty string not allowed
	if (id.length > 256) return false; // Reasonable length limit
	return true;
}
