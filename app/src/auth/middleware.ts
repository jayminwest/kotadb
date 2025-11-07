/**
 * Authentication middleware for KotaDB API.
 *
 * Validates API keys from Authorization headers and creates
 * authenticated request context.
 */

import type { AuthContext } from "@shared/types/auth";
import { enforceRateLimit } from "@auth/rate-limit";
import { updateLastUsed, validateApiKey, validateJwtToken } from "@auth/validator";

// Conditional logging for test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';
const isDebug = process.env.DEBUG === '1';
const shouldLog = !isTestEnv || isDebug;

/**
 * Result of authentication request.
 * Either returns context (success) or response (failure).
 */
export interface AuthResult {
	context?: AuthContext;
	response?: Response;
}

/**
 * Authenticate incoming request via Authorization header.
 *
 * Process:
 * 1. Extract Authorization header
 * 2. Validate Bearer token format
 * 3. Validate API key against database
 * 4. Create AuthContext
 * 5. Update last_used_at asynchronously
 * 6. Return context or error response
 *
 * @param request - Incoming HTTP request
 * @returns Auth context if valid, or 401/403 error response
 */
export async function authenticateRequest(
	request: Request,
): Promise<AuthResult> {
	// Extract Authorization header
	const authHeader = request.headers.get("Authorization");

	if (!authHeader) {
		return {
			response: new Response(
				JSON.stringify({
					error: "Missing API key",
					code: "AUTH_MISSING_KEY",
				}),
				{
					status: 401,
					headers: { "Content-Type": "application/json" },
				},
			),
		};
	}

	// Validate Bearer format
	if (!authHeader.startsWith("Bearer ")) {
		return {
			response: new Response(
				JSON.stringify({
					error: "Invalid authorization header format",
					code: "AUTH_INVALID_HEADER",
				}),
				{
					status: 401,
					headers: { "Content-Type": "application/json" },
				},
			),
		};
	}

	// Extract token
	const token = authHeader.slice(7); // Remove "Bearer " prefix

	// Route to appropriate validator based on token format
	let validation: Awaited<ReturnType<typeof validateApiKey>> | null;
	let authMethod: string;

	if (token.startsWith("kota_")) {
		// API key authentication
		authMethod = "api_key";
		validation = await validateApiKey(token);
	} else {
		// JWT token authentication
		authMethod = "jwt";
		validation = await validateJwtToken(token);
	}

	if (!validation) {
		// Log failed authentication attempt
		if (shouldLog) {
			process.stderr.write(`[Auth] Invalid ${authMethod} attempt\n`);
		}

		return {
			response: new Response(
				JSON.stringify({
					error: "Invalid API key",
					code: "AUTH_INVALID_KEY",
				}),
				{
					status: 401,
					headers: { "Content-Type": "application/json" },
				},
			),
		};
	}

	// Build authentication context
	const context: AuthContext = {
		userId: validation.userId,
		tier: validation.tier,
		keyId: validation.keyId,
		rateLimitPerHour: validation.rateLimitPerHour,
	};

	if (validation.orgId) {
		context.orgId = validation.orgId;
	}

	// Log successful authentication
	if (shouldLog) {
		process.stdout.write(
			`[Auth] ${authMethod === "jwt" ? "JWT" : "API key"} auth success - userId: ${context.userId}, keyId: ${context.keyId}, tier: ${context.tier}\n`,
		);
	}

	// Enforce rate limit
	const rateLimit = await enforceRateLimit(
		context.keyId,
		context.rateLimitPerHour,
	);

	if (!rateLimit.allowed) {
		if (shouldLog) {
			process.stderr.write(
				`[Auth] Rate limit exceeded - keyId: ${context.keyId}, limit: ${context.rateLimitPerHour}`,
			);
		}

		return {
			response: new Response(
				JSON.stringify({
					error: "Rate limit exceeded",
					retryAfter: rateLimit.retryAfter,
				}),
				{
					status: 429,
					headers: {
						"Content-Type": "application/json",
						"X-RateLimit-Limit": String(context.rateLimitPerHour),
						"X-RateLimit-Remaining": "0",
						"X-RateLimit-Reset": String(rateLimit.resetAt),
						"Retry-After": String(rateLimit.retryAfter || 0),
					},
				},
			),
		};
	}

	// Attach rate limit result to context for response headers
	context.rateLimit = rateLimit;

	// Update last_used_at asynchronously (non-blocking) - only for API keys
	if (authMethod === "api_key") {
		queueMicrotask(() => {
			updateLastUsed(validation.keyId).catch((err: unknown) => {
				process.stderr.write(`[Auth] Failed to update last_used_at: ${JSON.stringify(err)}\n`);
			});
		});
	}

	return { context };
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
 * Require service role key for admin operations.
 * Validates Authorization header against SUPABASE_SERVICE_KEY.
 * Use this middleware for admin-only endpoints.
 *
 * @param authHeader - Authorization header value
 * @returns True if valid service role key, false otherwise
 */
export function requireAdmin(authHeader: string | null): boolean {
	const expectedKey = process.env.SUPABASE_SERVICE_KEY;

	if (!authHeader || !expectedKey) {
		return false;
	}

	const token = authHeader.replace(/^Bearer /, "");
	return token === expectedKey;
}
