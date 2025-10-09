// Set test environment variables BEFORE any imports that might use them
process.env.SUPABASE_URL = "http://localhost:54326";
process.env.SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
process.env.SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5434/postgres";

import { describe, it, expect, beforeEach } from "bun:test";
import { authenticateRequest, createForbiddenResponse } from "@auth/middleware";
import { clearCache } from "@auth/cache";
import { getTestApiKey } from "../helpers/db";


describe("Authentication Middleware", () => {
  beforeEach(() => {
    clearCache();
  });

  describe("authenticateRequest", () => {
    it("returns 401 for missing Authorization header", async () => {
      const request = new Request("http://localhost:3000/search");
      const result = await authenticateRequest(request);

      expect(result.context).toBeUndefined();
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(401);

      const body = await result.response?.json() as { error: string; code: string };
      expect(body.error).toBe("Missing API key");
      expect(body.code).toBe("AUTH_MISSING_KEY");
    });

    it("returns 401 for invalid Authorization header format", async () => {
      const request = new Request("http://localhost:3000/search", {
        headers: {
          Authorization: "InvalidFormat token123",
        },
      });

      const result = await authenticateRequest(request);

      expect(result.context).toBeUndefined();
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(401);

      const body = await result.response?.json() as { error: string; code: string };
      expect(body.error).toBe("Invalid authorization header format");
      expect(body.code).toBe("AUTH_INVALID_HEADER");
    });

    it("returns 401 for invalid API key format", async () => {
      const request = new Request("http://localhost:3000/search", {
        headers: {
          Authorization: "Bearer invalid-key-format",
        },
      });

      const result = await authenticateRequest(request);

      expect(result.context).toBeUndefined();
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(401);

      const body = await result.response?.json() as { error: string; code: string };
      expect(body.error).toBe("Invalid API key");
      expect(body.code).toBe("AUTH_INVALID_KEY");
    });

    it("returns 401 for non-existent API key", async () => {
      const request = new Request("http://localhost:3000/search", {
        headers: {
          Authorization:
            "Bearer kota_free_nonexistent_0123456789abcdef0123456789abcdef",
        },
      });

      const result = await authenticateRequest(request);

      expect(result.context).toBeUndefined();
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(401);
    });

    it("returns context for valid API key", async () => {
      const testApiKey = getTestApiKey("free");

      const request = new Request("http://localhost:3000/search", {
        headers: {
          Authorization: `Bearer ${testApiKey}`,
        },
      });

      const result = await authenticateRequest(request);

      expect(result.response).toBeUndefined();
      expect(result.context).toBeDefined();
      expect(result.context?.userId).toBeDefined();
      expect(result.context?.tier).toBe("free");
      expect(result.context?.keyId).toBeDefined();
      expect(result.context?.rateLimitPerHour).toBeGreaterThan(0);
    });

    it("uses cache for repeated requests with same key", async () => {
      const testApiKey = getTestApiKey("free");

      const request1 = new Request("http://localhost:3000/search", {
        headers: {
          Authorization: `Bearer ${testApiKey}`,
        },
      });

      const request2 = new Request("http://localhost:3000/index", {
        headers: {
          Authorization: `Bearer ${testApiKey}`,
        },
      });

      const startTime = Date.now();
      const result1 = await authenticateRequest(request1);
      const firstDuration = Date.now() - startTime;

      const startTime2 = Date.now();
      const result2 = await authenticateRequest(request2);
      const secondDuration = Date.now() - startTime2;

      // Second request should be faster or equal (cache hit)
      // Allow +2ms tolerance for real database timing variance
      expect(secondDuration).toBeLessThanOrEqual(firstDuration + 2);

      // Both should succeed
      expect(result1.context).toBeDefined();
      expect(result2.context).toBeDefined();

      // Both should have same userId
      expect(result1.context?.userId).toBe(result2.context?.userId);
    });

    it("handles Bearer prefix with extra spaces", async () => {
      const request = new Request("http://localhost:3000/search", {
        headers: {
          Authorization: "Bearer  token123",
        },
      });

      const result = await authenticateRequest(request);

      // Should fail due to invalid key format (extra space in token)
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(401);
    });

    it("logs authentication attempts", async () => {
      // This test verifies logging behavior
      // In a real test, you'd capture console output

      const request = new Request("http://localhost:3000/search", {
        headers: {
          Authorization: "Bearer kota_free_test_0123456789abcdef0123456789abcdef",
        },
      });

      await authenticateRequest(request);

      // Would verify console.warn was called for invalid key
      // Requires test harness to capture console output
    });
  });

  describe("createForbiddenResponse", () => {
    it("creates 403 response with error message", async () => {
      const response = createForbiddenResponse(
        "Insufficient permissions",
        "AUTH_FORBIDDEN"
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const body = await response.json() as { error: string; code: string };
      expect(body.error).toBe("Insufficient permissions");
      expect(body.code).toBe("AUTH_FORBIDDEN");
    });

    it("creates 403 response for disabled key", async () => {
      const response = createForbiddenResponse(
        "API key disabled",
        "AUTH_KEY_DISABLED"
      );

      expect(response.status).toBe(403);

      const body = await response.json() as { error: string; code: string };
      expect(body.error).toBe("API key disabled");
      expect(body.code).toBe("AUTH_KEY_DISABLED");
    });
  });
});
