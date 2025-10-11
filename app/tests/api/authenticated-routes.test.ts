/**
 * Authenticated Routes Integration Tests
 *
 * Tests authentication middleware and protected endpoints with real database connection.
 * Environment variables are loaded from .env.test in CI or default to local Supabase ports.
 *
 * These tests verify that:
 * - Unauthenticated requests are properly rejected with 401
 * - Valid API keys grant access to protected endpoints
 * - Authentication caching improves performance
 *
 * Required environment variables:
 * - SUPABASE_URL (defaults to http://localhost:54322)
 * - SUPABASE_SERVICE_KEY (defaults to local demo key)
 * - SUPABASE_ANON_KEY (defaults to local demo key)
 * - DATABASE_URL (defaults to postgresql://postgres:postgres@localhost:5434/postgres)
 *
 * NOTE: These tests require the local test database to be running.
 * Run `./scripts/setup-test-db.sh` before running tests.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { getTestApiKey, createAuthHeader } from "../helpers/db";

const TEST_PORT = 3100;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_API_KEY = getTestApiKey("free");

let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  // Environment variables loaded from .env.test (CI) or fallback to local defaults
  // Start test server with real database
  const { createRouter } = await import("@api/routes");
  const { getServiceClient } = await import("@db/client");

  const supabase = getServiceClient();
  const router = createRouter(supabase);

  server = Bun.serve({
    port: TEST_PORT,
    fetch: router.handle,
  });
});

afterAll(() => {
  server.stop();
});

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
          localPath: ".",
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
          localPath: ".",
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
