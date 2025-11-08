/**
 * API Key Validation Integration Tests
 *
 * Tests the GET /api/keys/validate endpoint with real Supabase Auth.
 * Validates both API key and JWT token authentication.
 *
 * Required environment variables:
 * - SUPABASE_URL (defaults to http://localhost:54322)
 * - SUPABASE_SERVICE_KEY (defaults to local demo key)
 * - SUPABASE_ANON_KEY (defaults to local demo key)
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { startTestServer, stopTestServer } from "../../helpers/server";
import { getSupabaseTestClient } from "../../helpers/db";
import { getServiceClient } from "@db/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Server } from "node:http";

describe("GET /api/keys/validate", () => {
	let supabase: SupabaseClient;
	let serviceClient: SupabaseClient;
	let server: Server;
	let baseUrl: string;
	let testUserId: string;
	let testUserToken: string;
	let testApiKey: string;

	beforeEach(async () => {
		// Start test server
		const testServer = await startTestServer();
		server = testServer.server;
		baseUrl = testServer.url;

		// Get test Supabase client (for auth operations)
		supabase = getSupabaseTestClient();

		// Get service client (for database queries that bypass RLS)
		serviceClient = getServiceClient();

		// Create a test user via Supabase Auth
		const testEmail = `test-${Date.now()}@example.com`;
		const testPassword = "test-password-123";

		const { data: authData, error: signUpError } = await supabase.auth.signUp({
			email: testEmail,
			password: testPassword,
		});

		if (signUpError || !authData.user || !authData.session) {
			throw new Error(`Failed to create test user: ${signUpError?.message || "No user returned"}`);
		}

		testUserId = authData.user.id;
		testUserToken = authData.session.access_token;

		// Generate API key for this user
		const keyResponse = await fetch(`${baseUrl}/api/keys/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${testUserToken}`,
			},
		});

		if (!keyResponse.ok) {
			throw new Error(`Failed to generate test API key: ${keyResponse.statusText}`);
		}

		const keyData = await keyResponse.json() as { apiKey: string };
		testApiKey = keyData.apiKey;
	});

	afterEach(async () => {
		// Clean up test user data (use service client to bypass RLS)
		if (testUserId) {
			// Delete API keys
			await serviceClient.from("api_keys").delete().eq("user_id", testUserId);

			// Delete user_organizations
			await serviceClient.from("user_organizations").delete().eq("user_id", testUserId);

			// Delete organizations owned by user
			await serviceClient.from("organizations").delete().eq("owner_id", testUserId);

			// Delete user from auth.users (requires service role)
			await supabase.auth.admin.deleteUser(testUserId);
		}

		// Stop test server
		if (server) {
			await stopTestServer(server);
		}
	});

	it("returns 401 for missing Authorization header", async () => {
		const response = await fetch(`${baseUrl}/api/keys/validate`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		expect(response.status).toBe(401);
		const body = await response.json() as { error: string };
		expect(body.error).toContain("Missing API key");
	});

	it("returns 401 for invalid API key format", async () => {
		const response = await fetch(`${baseUrl}/api/keys/validate`, {
			method: "GET",
			headers: {
				"Authorization": "Bearer invalid_key_format",
			},
		});

		expect(response.status).toBe(401);
		const body = await response.json() as { error: string };
		expect(body.error).toContain("Invalid API key");
	});

	it("returns 401 for invalid API key", async () => {
		const response = await fetch(`${baseUrl}/api/keys/validate`, {
			method: "GET",
			headers: {
				"Authorization": "Bearer kota_free_invalid123_00000000-0000-0000-0000-000000000000",
			},
		});

		expect(response.status).toBe(401);
		const body = await response.json() as { error: string };
		expect(body.error).toContain("Invalid API key");
	});

	it("validates API key and returns metadata", async () => {
		const response = await fetch(`${baseUrl}/api/keys/validate`, {
			method: "GET",
			headers: {
				"Authorization": `Bearer ${testApiKey}`,
			},
		});

		expect(response.status).toBe(200);
		const body = await response.json() as {
			valid: boolean;
			tier: string;
			userId: string;
			rateLimitInfo: {
				limit: number;
				remaining: number;
				reset: number;
			};
		};

		// Validate response structure
		expect(body.valid).toBe(true);
		expect(body.tier).toBe("free");
		expect(body.userId).toBe(testUserId);
		expect(body.rateLimitInfo).toBeDefined();
		expect(body.rateLimitInfo.limit).toBe(100);
		expect(body.rateLimitInfo.remaining).toBeGreaterThanOrEqual(0);
		expect(body.rateLimitInfo.remaining).toBeLessThanOrEqual(100);
		expect(body.rateLimitInfo.reset).toBeGreaterThan(0);
	});

	it("validates JWT token and returns metadata", async () => {
		const response = await fetch(`${baseUrl}/api/keys/validate`, {
			method: "GET",
			headers: {
				"Authorization": `Bearer ${testUserToken}`,
			},
		});

		expect(response.status).toBe(200);
		const body = await response.json() as {
			valid: boolean;
			tier: string;
			userId: string;
			rateLimitInfo: {
				limit: number;
				remaining: number;
				reset: number;
			};
		};

		// Validate response structure
		expect(body.valid).toBe(true);
		expect(body.tier).toBe("free");
		expect(body.userId).toBe(testUserId);
		expect(body.rateLimitInfo).toBeDefined();
		expect(body.rateLimitInfo.limit).toBe(100);
	});

	it("consumes rate limit quota on validation", async () => {
		// Make first validation request
		const response1 = await fetch(`${baseUrl}/api/keys/validate`, {
			method: "GET",
			headers: {
				"Authorization": `Bearer ${testApiKey}`,
			},
		});

		expect(response1.status).toBe(200);
		const body1 = await response1.json() as {
			rateLimitInfo: { remaining: number };
		};
		const firstRemaining = body1.rateLimitInfo.remaining;

		// Make second validation request
		const response2 = await fetch(`${baseUrl}/api/keys/validate`, {
			method: "GET",
			headers: {
				"Authorization": `Bearer ${testApiKey}`,
			},
		});

		expect(response2.status).toBe(200);
		const body2 = await response2.json() as {
			rateLimitInfo: { remaining: number };
		};
		const secondRemaining = body2.rateLimitInfo.remaining;

		// Verify rate limit was consumed
		expect(secondRemaining).toBeLessThan(firstRemaining);
	});

	it("returns 401 for revoked API key", async () => {
		// Revoke the API key
		await serviceClient
			.from("api_keys")
			.update({ enabled: false })
			.eq("user_id", testUserId);

		// Try to validate revoked key
		const response = await fetch(`${baseUrl}/api/keys/validate`, {
			method: "GET",
			headers: {
				"Authorization": `Bearer ${testApiKey}`,
			},
		});

		expect(response.status).toBe(401);
		const body = await response.json() as { error: string };
		expect(body.error).toContain("Invalid API key");
	});
});
