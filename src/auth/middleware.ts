/**
 * Authentication middleware for KotaDB API.
 *
 * Validates API keys from Authorization headers and creates
 * authenticated request context.
 */

import type { AuthContext } from "@auth/context";
import { validateApiKey, updateLastUsed } from "@auth/validator";

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
  request: Request
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
        }
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
        }
      ),
    };
  }

  // Extract token
  const token = authHeader.slice(7); // Remove "Bearer " prefix

  // Validate API key
  const validation = await validateApiKey(token);

  if (!validation) {
    // Log failed authentication attempt (keyId if parseable)
    console.warn("[Auth] Invalid API key attempt");

    return {
      response: new Response(
        JSON.stringify({
          error: "Invalid API key",
          code: "AUTH_INVALID_KEY",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
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
  console.log(
    `[Auth] Success - userId: ${context.userId}, keyId: ${context.keyId}, tier: ${context.tier}`
  );

  // Update last_used_at asynchronously (non-blocking)
  queueMicrotask(() => {
    updateLastUsed(validation.keyId).catch((err: unknown) => {
      console.error("[Auth] Failed to update last_used_at:", err);
    });
  });

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
export function createForbiddenResponse(message: string, code: string): Response {
  return new Response(
    JSON.stringify({
      error: message,
      code,
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }
  );
}
