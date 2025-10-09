/**
 * Mock authentication helpers for testing
 */

import type { AuthContext } from "@shared/index";
import { createMockSupabaseClient } from "./supabase-mock";

/**
 * Generate a mock API key for testing.
 * Format: kota_<tier>_<keyId>_<secret>
 */
export function generateMockApiKey(tier: "free" | "solo" | "team" = "free"): string {
  const keyId = "test1234567890ab";
  const secret = "0123456789abcdef0123456789abcdef";
  return `kota_${tier}_${keyId}_${secret}`;
}

/**
 * Create mock Authorization header for tests
 */
export function createMockAuthHeader(tier: "free" | "solo" | "team" = "free"): string {
  return `Bearer ${generateMockApiKey(tier)}`;
}

/**
 * Create a mock authenticated context for testing
 */
export function createMockAuthContext(): AuthContext {
  return {
    userId: "test-user-id-uuid",
    organizationId: "test-org-id-uuid",
    tier: "free",
  };
}

/**
 * Mock the authenticateRequest middleware for testing.
 * Returns a function that bypasses authentication and returns mock context.
 */
export function mockAuthenticateRequest() {
  return async (request: Request): Promise<{ context: AuthContext | null; response: Response | null }> => {
    // Check if request has Authorization header
    const authHeader = request.headers.get("Authorization");

    // If no auth header, return 401 (to test auth failures)
    if (!authHeader) {
      return {
        context: null,
        response: new Response(
          JSON.stringify({ error: "Missing Authorization header", code: "AUTH_MISSING_KEY" }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          }
        ),
      };
    }

    // If invalid format, return 401
    if (!authHeader.startsWith("Bearer ")) {
      return {
        context: null,
        response: new Response(
          JSON.stringify({ error: "Invalid Authorization header format", code: "AUTH_INVALID_HEADER" }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          }
        ),
      };
    }

    const apiKey = authHeader.substring(7);

    // If invalid key format, return 401
    if (!apiKey.startsWith("kota_")) {
      return {
        context: null,
        response: new Response(
          JSON.stringify({ error: "Invalid API key format", code: "AUTH_INVALID_KEY" }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          }
        ),
      };
    }

    // Return mock authenticated context
    return {
      context: createMockAuthContext(),
      response: null,
    };
  };
}
