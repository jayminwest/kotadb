/**
 * Validation Endpoint Integration Tests
 *
 * Tests the /validate-output endpoint with real database connection.
 * Environment variables are loaded from .env.test in CI or default to local Supabase ports.
 *
 * These tests verify that:
 * - Authentication is required for the validation endpoint
 * - Valid schemas correctly validate outputs
 * - Invalid outputs return structured error messages
 * - Rate limiting is enforced
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
import type { Server } from "node:http";
import { getTestApiKey } from "../helpers/db";
import { startTestServer, stopTestServer } from "../helpers/server";
import type { ValidationResponse } from "@shared/types/validation";

let server: Server;
let BASE_URL: string;
// Use solo tier to avoid rate limit exhaustion when running full test suite
const TEST_API_KEY = getTestApiKey("solo");

beforeAll(async () => {
  // Start Express test server with real database
  const testServer = await startTestServer();
  server = testServer.server;
  BASE_URL = testServer.url;
});

afterAll(async () => {
  await stopTestServer(server);
});

describe("/validate-output endpoint", () => {
  describe("Authentication", () => {
    it("returns 401 without authentication", async () => {
      const response = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema: { type: "string" },
          output: "test"
        }),
      });
      const data = await response.json() as { error: string; code: string };

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
      expect(data.code).toBe("AUTH_MISSING_KEY");
    });

    it("returns 401 with invalid API key", async () => {
      const response = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: "Bearer kota_free_invalid123_0123456789abcdef0123456789abcdef",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema: { type: "string" },
          output: "test"
        }),
      });
      const data = await response.json() as { error: string; code: string };

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
      expect(data.code).toBe("AUTH_INVALID_KEY");
    });

    it("processes validation request with valid authentication", async () => {
      const response = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema: { type: "string" },
          output: "test"
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Request validation", () => {
    it("returns 400 when schema is missing", async () => {
      const response = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          output: "test"
        }),
      });
      const data = await response.json() as { error: string };

      expect(response.status).toBe(400);
      expect(data.error).toContain("schema");
    });

    it("returns 400 when output is missing", async () => {
      const response = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema: { type: "string" }
        }),
      });
      const data = await response.json() as { error: string };

      expect(response.status).toBe(400);
      expect(data.error).toContain("output");
    });
  });

  describe("String validation", () => {
    it("validates simple strings", async () => {
      const response = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema: { type: "string" },
          output: "hello world"
        }),
      });
      const data = await response.json() as ValidationResponse;

      expect(response.status).toBe(200);
      expect(data.valid).toBe(true);
      expect(data.errors).toBeUndefined();
    });

    it("validates file path patterns", async () => {
      const schema = {
        type: "string",
        pattern: "^docs/specs/.*\\.md$"
      };

      // Valid path
      const validResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: "docs/specs/feature-123.md"
        }),
      });
      const validData = await validResponse.json() as ValidationResponse;

      expect(validResponse.status).toBe(200);
      expect(validData.valid).toBe(true);

      // Invalid path
      const invalidResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: "src/file.ts"
        }),
      });
      const invalidData = await invalidResponse.json() as ValidationResponse;

      expect(invalidResponse.status).toBe(200);
      expect(invalidData.valid).toBe(false);
      expect(invalidData.errors).toBeDefined();
      expect(invalidData.errors?.[0]?.path).toBe("root");
    });

    it("validates Conventional Commits format", async () => {
      const schema = {
        type: "string",
        pattern: "^(feat|fix|chore|docs|test|refactor|perf|ci|build|style)(\\([^)]+\\))?: [0-9]+ - .{1,50}"
      };

      // Valid commit message
      const validResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: "feat: 123 - add validation endpoint"
        }),
      });
      const validData = await validResponse.json() as ValidationResponse;

      expect(validResponse.status).toBe(200);
      expect(validData.valid).toBe(true);

      // Invalid commit message
      const invalidResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: "invalid commit message"
        }),
      });
      const invalidData = await invalidResponse.json() as ValidationResponse;

      expect(invalidResponse.status).toBe(200);
      expect(invalidData.valid).toBe(false);
      expect(invalidData.errors).toBeDefined();
    });

    it("validates string length constraints", async () => {
      const schema = {
        type: "string",
        minLength: 5,
        maxLength: 10
      };

      // Valid length
      const validResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: "hello"
        }),
      });
      const validData = await validResponse.json() as ValidationResponse;

      expect(validResponse.status).toBe(200);
      expect(validData.valid).toBe(true);

      // Too short
      const tooShortResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: "hi"
        }),
      });
      const tooShortData = await tooShortResponse.json() as ValidationResponse;

      expect(tooShortResponse.status).toBe(200);
      expect(tooShortData.valid).toBe(false);
      expect(tooShortData.errors?.[0]?.message).toContain("5");

      // Too long
      const tooLongResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: "this is too long"
        }),
      });
      const tooLongData = await tooLongResponse.json() as ValidationResponse;

      expect(tooLongResponse.status).toBe(200);
      expect(tooLongData.valid).toBe(false);
      expect(tooLongData.errors?.[0]?.message).toContain("10");
    });
  });

  describe("Object validation", () => {
    it("validates GitHub issue format", async () => {
      const schema = {
        type: "object",
        properties: {
          number: { type: "number" },
          title: { type: "string" },
          summary: { type: "string" },
          constraints: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["number", "title", "summary"]
      };

      // Valid issue
      const validResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: JSON.stringify({
            number: 123,
            title: "feat: add validation",
            summary: "Add validation endpoint",
            constraints: ["Must use Zod"]
          })
        }),
      });
      const validData = await validResponse.json() as ValidationResponse;

      expect(validResponse.status).toBe(200);
      expect(validData.valid).toBe(true);

      // Missing required field
      const invalidResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: JSON.stringify({
            number: 123,
            title: "feat: add validation"
          })
        }),
      });
      const invalidData = await invalidResponse.json() as ValidationResponse;

      expect(invalidResponse.status).toBe(200);
      expect(invalidData.valid).toBe(false);
      expect(invalidData.errors).toBeDefined();
      expect(invalidData.errors?.[0]?.path).toBe("summary");
    });

    it("rejects non-JSON for object schemas", async () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" }
        }
      };

      const response = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: "not json"
        }),
      });
      const data = await response.json() as ValidationResponse;

      expect(response.status).toBe(200);
      expect(data.valid).toBe(false);
      expect(data.errors?.[0]?.message).toContain("JSON");
    });
  });

  describe("Array validation", () => {
    it("validates arrays with typed items", async () => {
      const schema = {
        type: "array",
        items: { type: "string" }
      };

      // Valid array
      const validResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: JSON.stringify(["hello", "world"])
        }),
      });
      const validData = await validResponse.json() as ValidationResponse;

      expect(validResponse.status).toBe(200);
      expect(validData.valid).toBe(true);

      // Invalid array (wrong item types)
      const invalidResponse = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: JSON.stringify([1, 2, 3])
        }),
      });
      const invalidData = await invalidResponse.json() as ValidationResponse;

      expect(invalidResponse.status).toBe(200);
      expect(invalidData.valid).toBe(false);
      expect(invalidData.errors).toBeDefined();
    });
  });

  describe("Rate limiting", () => {
    it("includes rate limit headers in response", async () => {
      const response = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema: { type: "string" },
          output: "test"
        }),
      });

      expect(response.headers.get("X-RateLimit-Limit")).toBeDefined();
      expect(response.headers.get("X-RateLimit-Remaining")).toBeDefined();
      expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
    });
  });

  describe("Command schema examples", () => {
    it("validates /workflows:plan schema", async () => {
      const schema = {
        type: "string",
        pattern: "^docs/specs/.*\\.md$"
      };

      const response = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: "docs/specs/plan-abc123.md"
        }),
      });
      const data = await response.json() as ValidationResponse;

      expect(response.status).toBe(200);
      expect(data.valid).toBe(true);
    });

    it("validates /git:commit schema", async () => {
      const schema = {
        type: "string",
        pattern: "^(feat|fix|chore|docs|test|refactor|perf|ci|build|style)(\\([^)]+\\))?: [0-9]+ - .{1,50}"
      };

      const response = await fetch(`${BASE_URL}/validate-output`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema,
          output: "feat: 103 - add validation endpoint"
        }),
      });
      const data = await response.json() as ValidationResponse;

      expect(response.status).toBe(200);
      expect(data.valid).toBe(true);
    });
  });
});
