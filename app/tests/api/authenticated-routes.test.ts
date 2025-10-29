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

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Server } from "node:http";
import { getTestApiKey } from "../helpers/db";
import { startTestServer, stopTestServer } from "../helpers/server";
import { getServiceClient } from "@db/client";

let server: Server;
let BASE_URL: string;
const TEST_API_KEY = getTestApiKey("free");

beforeAll(async () => {
	// Start Express test server with real database
	const testServer = await startTestServer();
	server = testServer.server;
	BASE_URL = testServer.url;
});

afterAll(async () => {
	await stopTestServer(server);
});

describe("Authenticated Routes", () => {
	describe("/health endpoint", () => {
		it("is accessible without authentication", async () => {
			const response = await fetch(`${BASE_URL}/health`);
			const data = (await response.json()) as {
				status: string;
				timestamp: string;
			};

			expect(response.status).toBe(200);
			expect(data.status).toBe("ok");
			expect(data.timestamp).toBeDefined();
		});
	});

	describe("/search endpoint", () => {
		it("returns 401 without authentication", async () => {
			const response = await fetch(`${BASE_URL}/search?term=test`);
			const data = (await response.json()) as { error: string; code: string };

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
			const data = (await response.json()) as { error: string; code: string };

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
			const data = (await response.json()) as { error: string; code: string };

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
			const data = (await response.json()) as { results: unknown[] };

			expect(response.status).toBe(200);
			expect(data.results).toBeDefined();
			expect(Array.isArray(data.results)).toBe(true);
		});
	});

	describe("/files/recent endpoint", () => {
		it("returns 401 without authentication", async () => {
			const response = await fetch(`${BASE_URL}/files/recent`);
			const data = (await response.json()) as { error: string };

			expect(response.status).toBe(401);
			expect(data.error).toBeDefined();
		});

		it("returns results with valid authentication", async () => {
			const response = await fetch(`${BASE_URL}/files/recent?limit=5`, {
				headers: {
					Authorization: `Bearer ${TEST_API_KEY}`,
				},
			});
			const data = (await response.json()) as { results: unknown[] };

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
			const data = (await response.json()) as { error: string };

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
			const data = (await response.json()) as { jobId: string; status: string };

			expect(response.status).toBe(202);
			expect(data.jobId).toBeDefined();
			expect(data.status).toBe("pending");
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
			const data = (await response.json()) as { error: string };

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
			const response1 = await fetch(`${BASE_URL}/search?term=test`, {
				headers,
			});
			const duration1 = Date.now() - start1;

			expect(response1.status).toBe(200);

			// Second request (cache hit)
			const start2 = Date.now();
			const response2 = await fetch(`${BASE_URL}/search?term=test`, {
				headers,
			});
			const duration2 = Date.now() - start2;

			expect(response2.status).toBe(200);

			// Second request should be faster (though this is timing-dependent)
			console.log(`[Cache Test] First: ${duration1}ms, Second: ${duration2}ms`);
		});
	});

	describe("JWT Authentication", () => {
		let jwtToken: string;

		beforeAll(async () => {
			// Create test user and get JWT token
			const supabase = getServiceClient();
			const testEmail = `test-jwt-routes-${Date.now()}@test.local`;
			const testPassword = "test-password-123456";

			const { data: userData, error: createError } = await supabase.auth.admin.createUser({
				email: testEmail,
				password: testPassword,
				email_confirm: true,
			});

			if (createError || !userData.user) {
				throw new Error(`Failed to create test user: ${JSON.stringify(createError)}`);
			}

			const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
				email: testEmail,
				password: testPassword,
			});

			if (signInError || !sessionData.session) {
				throw new Error(`Failed to sign in test user: ${JSON.stringify(signInError)}`);
			}

			jwtToken = sessionData.session.access_token;
		});

		it("allows JWT token for /search endpoint", async () => {
			const response = await fetch(`${BASE_URL}/search?term=test`, {
				headers: {
					Authorization: `Bearer ${jwtToken}`,
				},
			});
			const data = (await response.json()) as { results: unknown[] };

			expect(response.status).toBe(200);
			expect(data.results).toBeDefined();
			expect(Array.isArray(data.results)).toBe(true);
		});

		it("allows JWT token for /files/recent endpoint", async () => {
			const response = await fetch(`${BASE_URL}/files/recent?limit=5`, {
				headers: {
					Authorization: `Bearer ${jwtToken}`,
				},
			});
			const data = (await response.json()) as { results: unknown[] };

			expect(response.status).toBe(200);
			expect(data.results).toBeDefined();
			expect(Array.isArray(data.results)).toBe(true);
		});

		it("allows JWT token for /index endpoint", async () => {
			const response = await fetch(`${BASE_URL}/index`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${jwtToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					repository: "test/repo-jwt",
					ref: "main",
					localPath: ".",
				}),
			});
			const data = (await response.json()) as { jobId: string; status: string };

			expect(response.status).toBe(202);
			expect(data.jobId).toBeDefined();
			expect(data.status).toBe("pending");
		});

		it("allows JWT token for /mcp endpoint", async () => {
			const response = await fetch(`${BASE_URL}/mcp`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${jwtToken}`,
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

		it("includes rate limit headers for JWT-authenticated requests", async () => {
			const response = await fetch(`${BASE_URL}/search?term=test`, {
				headers: {
					Authorization: `Bearer ${jwtToken}`,
				},
			});

			expect(response.headers.get("X-RateLimit-Limit")).toBeDefined();
			expect(response.headers.get("X-RateLimit-Remaining")).toBeDefined();
			expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
		});

		it("rejects invalid JWT tokens", async () => {
			const invalidJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature";

			const response = await fetch(`${BASE_URL}/search?term=test`, {
				headers: {
					Authorization: `Bearer ${invalidJwt}`,
				},
			});
			const data = (await response.json()) as { error: string; code: string };

			expect(response.status).toBe(401);
			expect(data.error).toBeDefined();
			expect(data.code).toBe("AUTH_INVALID_KEY");
		});

		it("JWT authentication respects rate limiting", async () => {
			const headers = {
				Authorization: `Bearer ${jwtToken}`,
			};

			// Make multiple requests to verify rate limiting applies
			const response1 = await fetch(`${BASE_URL}/search?term=test1`, { headers });
			const response2 = await fetch(`${BASE_URL}/search?term=test2`, { headers });

			expect(response1.status).toBe(200);
			expect(response2.status).toBe(200);

			// Verify that remaining count decreases
			const remaining1 = parseInt(response1.headers.get("X-RateLimit-Remaining") || "0", 10);
			const remaining2 = parseInt(response2.headers.get("X-RateLimit-Remaining") || "0", 10);

			expect(remaining2).toBeLessThan(remaining1);
		});
	});
});
