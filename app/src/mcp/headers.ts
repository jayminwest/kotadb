/**
 * MCP HTTP header validation utilities
 */

import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "mcp-headers" });

const MCP_PROTOCOL_VERSION = "2025-06-18";

// Default allowed origins (localhost variants)
const DEFAULT_ALLOWED_ORIGINS = [
	"http://localhost",
	"https://localhost",
	"http://127.0.0.1",
	"https://127.0.0.1",
];

/**
 * Get allowed origins from environment or use defaults
 */
function getAllowedOrigins(): string[] {
	const envOrigins = process.env.KOTA_ALLOWED_ORIGINS;
	if (envOrigins) {
		return envOrigins.split(",").map((o) => o.trim());
	}
	return DEFAULT_ALLOWED_ORIGINS;
}

/**
 * Validate Origin header against allowed list
 * Supports origins with ports (e.g., http://localhost:3000)
 */
export function validateOrigin(origin: string | null): boolean {
	try {
		if (!origin) {
			logger.warn("Origin validation failed: no origin provided");
			return false;
		}

		const allowedOrigins = getAllowedOrigins();

		// Check exact match first
		if (allowedOrigins.includes(origin)) return true;

		// Check if origin starts with any allowed origin (to support ports)
		for (const allowed of allowedOrigins) {
			if (origin.startsWith(allowed)) {
				// If allowed origin has no port, accept origin with any port
				const originUrl = new URL(origin);
				const allowedUrl = new URL(allowed);
				if (
					originUrl.protocol === allowedUrl.protocol &&
					originUrl.hostname === allowedUrl.hostname
				) {
					return true;
				}
			}
		}

		logger.warn("Origin validation failed: not in allowed list", { origin });
		return false;
	} catch (error) {
		logger.error("Origin validation error", error instanceof Error ? error : new Error(String(error)), { origin });
		Sentry.captureException(error, {
			tags: { origin: origin ?? "null" },
		});
		return false;
	}
}

/**
 * Validate MCP-Protocol-Version header
 */
export function validateProtocolVersion(version: string | null): boolean {
	return version === MCP_PROTOCOL_VERSION;
}

/**
 * Parse Accept header to determine response format
 * Returns object indicating support for JSON and/or SSE
 */
export function parseAccept(accept: string | null): {
	json: boolean;
	sse: boolean;
} {
	if (!accept) {
		return { json: false, sse: false };
	}

	const acceptLower = accept.toLowerCase();
	return {
		json:
			acceptLower.includes("application/json") || acceptLower.includes("*/*"),
		sse: acceptLower.includes("text/event-stream"),
	};
}
