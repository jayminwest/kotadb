/**
 * MCP session management utilities
 * Initial implementation uses stateless validation
 */

import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "mcp-session" });

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
	try {
		if (!id) return true; // Session ID is optional
		if (id.length === 0) {
			logger.warn("Session ID validation failed: empty string");
			return false; // Empty string not allowed
		}
		if (id.length > 256) {
			logger.warn("Session ID validation failed: exceeds length limit", { length: id.length });
			return false; // Reasonable length limit
		}
		return true;
	} catch (error) {
		logger.error("Session ID validation error", error instanceof Error ? error : new Error(String(error)));
		Sentry.captureException(error);
		return false;
	}
}
