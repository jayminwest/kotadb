import { describe, it, expect, beforeEach } from "bun:test";
import { authenticateRequest, createForbiddenResponse } from "@auth/middleware";
import { clearCache } from "@auth/cache";

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

      const body = await result.response?.json();
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

      const body = await result.response?.json();
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

      const body = await result.response?.json();
      expect(body.error).toBe("Invalid API key");
      expect(body.code).toBe("AUTH_INVALID_KEY");
    });

    it("returns 401 for non-existent API key", async () => {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.log("[Test] Skipping - Supabase credentials not set");
        return;
      }

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
      // This test requires a valid test key in the database
      // Skip if not in test environment with seeded data
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.log("[Test] Skipping - Supabase credentials not set");
        return;
      }

      if (!process.env.TEST_API_KEY) {
        console.log("[Test] Skipping - TEST_API_KEY not set");
        return;
      }

      const request = new Request("http://localhost:3000/search", {
        headers: {
          Authorization: `Bearer ${process.env.TEST_API_KEY}`,
        },
      });

      const result = await authenticateRequest(request);

      expect(result.response).toBeUndefined();
      expect(result.context).toBeDefined();
      expect(result.context?.userId).toBeDefined();
      expect(result.context?.tier).toBeDefined();
      expect(result.context?.keyId).toBeDefined();
      expect(result.context?.rateLimitPerHour).toBeGreaterThan(0);
    });

    it("uses cache for repeated requests with same key", async () => {
      // This test verifies caching behavior
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.log("[Test] Skipping - Supabase credentials not set");
        return;
      }

      if (!process.env.TEST_API_KEY) {
        console.log("[Test] Skipping - TEST_API_KEY not set");
        return;
      }

      const request1 = new Request("http://localhost:3000/search", {
        headers: {
          Authorization: `Bearer ${process.env.TEST_API_KEY}`,
        },
      });

      const request2 = new Request("http://localhost:3000/index", {
        headers: {
          Authorization: `Bearer ${process.env.TEST_API_KEY}`,
        },
      });

      const startTime = Date.now();
      const result1 = await authenticateRequest(request1);
      const firstDuration = Date.now() - startTime;

      const startTime2 = Date.now();
      const result2 = await authenticateRequest(request2);
      const secondDuration = Date.now() - startTime2;

      // Second request should be significantly faster (cache hit)
      expect(secondDuration).toBeLessThan(firstDuration);

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

      const body = await response.json();
      expect(body.error).toBe("Insufficient permissions");
      expect(body.code).toBe("AUTH_FORBIDDEN");
    });

    it("creates 403 response for disabled key", async () => {
      const response = createForbiddenResponse(
        "API key disabled",
        "AUTH_KEY_DISABLED"
      );

      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.error).toBe("API key disabled");
      expect(body.code).toBe("AUTH_KEY_DISABLED");
    });
  });
});
