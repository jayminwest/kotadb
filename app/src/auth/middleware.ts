/**
 * Authentication middleware for KotaDB API (Local Mode).
 *
 * In local-only mode, authentication is bypassed entirely.
 * All requests receive a local user context with full access.
 */

import type { AuthContext } from "@shared/types/auth";
import { createLogger } from "@logging/logger";

const logger = createLogger();

/**
 * Local mode authentication context (no real user).
 * Uses a placeholder user ID for local-only operations.
 */
const LOCAL_AUTH_CONTEXT: AuthContext = {
	userId: "local-user",
	tier: "team", // Full access in local mode (highest available tier)
	keyId: "local-key",
	rateLimitPerHour: Number.MAX_SAFE_INTEGER, // No rate limits locally
};

/**
 * Result of authentication request.
 * Either returns context (success) or response (failure).
 */
export interface AuthResult {
	context?: AuthContext;
	response?: Response;
}

/**
 * Authenticate incoming request (no-op in local mode).
 *
 * In local-only mode, all requests are authenticated with a local user context.
 * No API key or JWT validation is performed.
 *
 * @param _request - Incoming HTTP request (ignored in local mode)
 * @returns Auth context for local user
 */
export async function authenticateRequest(
	_request: Request,
): Promise<AuthResult> {
	logger.debug("Local mode: Bypassing authentication");
	return { context: LOCAL_AUTH_CONTEXT };
}

/**
 * Create authenticated error response with custom message.
 * Used for authorization failures (403) after successful authentication.
 *
 * @param message - Error message
 * @param code - Error code
 * @returns 403 Response
 */
export function createForbiddenResponse(
	message: string,
	code: string,
): Response {
	return new Response(
		JSON.stringify({
			error: message,
			code,
		}),
		{
			status: 403,
			headers: { "Content-Type": "application/json" },
		},
	);
}

/**
 * Require service role key for admin operations (no-op in local mode).
 * In local mode, admin access is always granted.
 *
 * @param _authHeader - Authorization header value (ignored in local mode)
 * @returns Always true in local mode
 */
export function requireAdmin(_authHeader: string | null): boolean {
	// In local mode, admin access is always granted
	return true;
}
