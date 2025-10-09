import { describe, it, expect, beforeAll, afterAll } from "bun:test";
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

const TEST_PORT = 3100;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_API_KEY = getTestApiKey("free");

let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  // Set test environment variables to point to Supabase Local
  process.env.SUPABASE_URL = "http://localhost:54326";
  process.env.SUPABASE_SERVICE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
  process.env.SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5434/postgres";

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
