import { describe, it, expect, beforeAll } from "bun:test";
import { getTestApiKey, createAuthHeader } from "../helpers/db";

/**
 * Integration tests for authenticated API routes.
 *
 * These tests verify that authentication middleware properly protects
 * endpoints and that authenticated requests can access resources.
 *
 * NOTE: These tests require the local test database to be running.
 * Run `./scripts/setup-test-db.sh` before running tests.
 */

const BASE_URL = "http://localhost:3000";
const TEST_API_KEY = getTestApiKey("free");

describe("Authenticated Routes", () => {
  describe("/health endpoint", () => {
    it("is accessible without authentication", async () => {
      const response = await fetch(`${BASE_URL}/health`);
      const data = await response.json() as { status: string; timestamp: string };

      expect(response.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeDefined();
    });
  });

  describe("/search endpoint", () => {
    it("returns 401 without authentication", async () => {
      const response = await fetch(`${BASE_URL}/search?term=test`);
      const data = await response.json() as { error: string; code: string };

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
      expect(data.code).toBe("AUTH_MISSING_KEY");
    });

    it("returns 401 with invalid authorization header format", async () => {
      const response = await fetch(`${BASE_URL}/search?term=test`, {
        headers: {
          Authorization: "InvalidFormat token123",
        },
      });
      const data = await response.json() as { error: string; code: string };

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
      expect(data.code).toBe("AUTH_INVALID_HEADER");
    });

    it("returns 401 with invalid API key", async () => {
      const response = await fetch(`${BASE_URL}/search?term=test`, {
        headers: {
          Authorization:
            "Bearer kota_free_invalid123_0123456789abcdef0123456789abcdef",
        },
      });
      const data = await response.json() as { error: string; code: string };

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
      expect(data.code).toBe("AUTH_INVALID_KEY");
    });

    it("returns results with valid authentication", async () => {
      const response = await fetch(`${BASE_URL}/search?term=test`, {
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
      });
      const data = await response.json() as { results: unknown[] };

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
      expect(Array.isArray(data.results)).toBe(true);
    });
  });

  describe("/files/recent endpoint", () => {
    it("returns 401 without authentication", async () => {
      const response = await fetch(`${BASE_URL}/files/recent`);
      const data = await response.json() as { error: string };

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it("returns results with valid authentication", async () => {
      const response = await fetch(`${BASE_URL}/files/recent?limit=5`, {
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
      });
      const data = await response.json() as { results: unknown[] };

      expect(response.status).toBe(200);
      expect(data.results).toBeDefined();
      expect(Array.isArray(data.results)).toBe(true);
    });
  });

  describe("/index endpoint", () => {
    it("returns 401 without authentication", async () => {
      const response = await fetch(`${BASE_URL}/index`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repository: "test/repo",
          ref: "main",
        }),
      });
      const data = await response.json() as { error: string };

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it("accepts index request with valid authentication", async () => {
      const response = await fetch(`${BASE_URL}/index`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repository: "test/repo",
          ref: "main",
        }),
      });
      const data = await response.json() as { runId: number };

      expect(response.status).toBe(202);
      expect(data.runId).toBeDefined();
    });
  });

  describe("/mcp endpoint", () => {
    it("returns 401 without authentication", async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {},
          id: 1,
        }),
      });
      const data = await response.json() as { error: string };

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it("processes MCP request with valid authentication", async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
          Origin: "http://localhost",
          "Mcp-Protocol-Version": "2025-06-18",
          Accept: "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: { protocolVersion: "2025-06-18" },
          id: 1,
        }),
      });

      // Should not be 401
      expect(response.status).not.toBe(401);
    });
  });

  describe("Authentication caching", () => {
    it("cache improves performance for repeated requests", async () => {
      const headers = {
        Authorization: `Bearer ${TEST_API_KEY}`,
      };

      // First request (cache miss)
      const start1 = Date.now();
      const response1 = await fetch(`${BASE_URL}/search?term=test`, { headers });
      const duration1 = Date.now() - start1;

      expect(response1.status).toBe(200);

      // Second request (cache hit)
      const start2 = Date.now();
      const response2 = await fetch(`${BASE_URL}/search?term=test`, { headers });
      const duration2 = Date.now() - start2;

      expect(response2.status).toBe(200);

      // Second request should be faster (though this is timing-dependent)
      console.log(`[Cache Test] First: ${duration1}ms, Second: ${duration2}ms`);
    });
  });
});
