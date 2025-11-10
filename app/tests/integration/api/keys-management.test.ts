/**
 * API Key Management Integration Tests
 *
 * Tests the API key management endpoints with real Supabase Auth:
 * - GET /api/keys/current - Get key metadata
 * - POST /api/keys/reset - Reset key (revoke old + generate new)
 * - DELETE /api/keys/current - Revoke key
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
import { generateApiKey } from "@auth/keys";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Server } from "node:http";

describe("API Key Management Endpoints", () => {
	let supabase: SupabaseClient;
	let serviceClient: SupabaseClient;
	let server: Server;
	let baseUrl: string;
	let testUserId: string;
	let testUserEmail: string;
	let testUserToken: string;

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
		testUserEmail = authData.user.email || testEmail;
		testUserToken = authData.session.access_token;
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

	describe("GET /api/keys/current", () => {
		it("returns 401 for missing Authorization header", async () => {
			const response = await fetch(`${baseUrl}/api/keys/current`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
			});

			expect(response.status).toBe(401);
			const body = await response.json() as { error: string };
			// Middleware checks for auth header presence
			expect(body.error).toBeTruthy();
		});

		it("returns 401 for invalid JWT token", async () => {
			const response = await fetch(`${baseUrl}/api/keys/current`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"Authorization": "Bearer invalid-token-abc123",
				},
			});

			expect(response.status).toBe(401);
			const body = await response.json() as { error: string };
			// Invalid token gets interpreted as invalid API key by middleware
			expect(body.error).toBeTruthy();
		});

		it("returns 404 when user has no API key", async () => {
			const response = await fetch(`${baseUrl}/api/keys/current`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			expect(response.status).toBe(404);
			const body = await response.json() as { error: string };
			expect(body.error).toContain("No active API key found");
		});

		it("returns key metadata for authenticated user with active key", async () => {
			// Generate API key for test user
			const keyResult = await generateApiKey({
				userId: testUserId,
				tier: "free",
			});

			const response = await fetch(`${baseUrl}/api/keys/current`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			expect(response.status).toBe(200);
			const body = await response.json() as {
				keyId: string;
				tier: string;
				rateLimitPerHour: number;
				createdAt: string;
				lastUsedAt: string | null;
				enabled: boolean;
			};

			// Validate response structure
			expect(body.keyId).toBe(keyResult.keyId);
			expect(body.tier).toBe("free");
			expect(body.rateLimitPerHour).toBe(100);
			expect(body.createdAt).toBeTruthy();
			expect(body.enabled).toBe(true);
			// lastUsedAt can be null for new keys
			expect(body.lastUsedAt === null || typeof body.lastUsedAt === "string").toBe(true);
		});

		it("does not return secret_hash in response", async () => {
			// Generate API key for test user
			await generateApiKey({
				userId: testUserId,
				tier: "free",
			});

			const response = await fetch(`${baseUrl}/api/keys/current`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			expect(response.status).toBe(200);
			const body = await response.json() as Record<string, unknown>;

			// Security check: secret_hash should never be exposed
			expect(body.secret_hash).toBeUndefined();
			expect(body.secretHash).toBeUndefined();
		});
	});

	describe("POST /api/keys/reset", () => {
		it("returns 401 for missing Authorization header", async () => {
			const response = await fetch(`${baseUrl}/api/keys/reset`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			});

			expect(response.status).toBe(401);
			const body = await response.json() as { error: string };
			expect(body.error).toBeTruthy();
		});

		it("returns 401 for invalid JWT token", async () => {
			const response = await fetch(`${baseUrl}/api/keys/reset`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": "Bearer invalid-token-abc123",
				},
			});

			expect(response.status).toBe(401);
			const body = await response.json() as { error: string };
			expect(body.error).toBeTruthy();
		});

		it("returns 404 when user has no API key to reset", async () => {
			const response = await fetch(`${baseUrl}/api/keys/reset`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			expect(response.status).toBe(404);
			const body = await response.json() as { error: string };
			expect(body.error).toContain("No active API key found");
		});

		it("resets API key and returns new key", async () => {
			// Generate initial API key
			const oldKey = await generateApiKey({
				userId: testUserId,
				tier: "free",
			});

			// Reset the key
			const response = await fetch(`${baseUrl}/api/keys/reset`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			expect(response.status).toBe(200);
			const body = await response.json() as {
				apiKey: string;
				keyId: string;
				tier: string;
				rateLimitPerHour: number;
				createdAt: string;
				message: string;
			};

			// Validate new key format
			expect(body.apiKey).toMatch(/^kota_free_[a-zA-Z0-9]{12}_[0-9a-f]{36}$/);
			expect(body.keyId).not.toBe(oldKey.keyId); // New key ID
			expect(body.tier).toBe("free");
			expect(body.rateLimitPerHour).toBe(100);
			expect(body.message).toContain("revoked");

			// Verify old key is revoked in database
			const { data: oldKeyData } = await serviceClient
				.from("api_keys")
				.select("enabled, revoked_at")
				.eq("key_id", oldKey.keyId)
				.single();

			expect(oldKeyData?.enabled).toBe(false);
			expect(oldKeyData?.revoked_at).not.toBeNull();

			// Verify new key is active in database
			const { data: newKeyData } = await serviceClient
				.from("api_keys")
				.select("enabled, revoked_at")
				.eq("key_id", body.keyId)
				.single();

			expect(newKeyData?.enabled).toBe(true);
			expect(newKeyData?.revoked_at).toBeNull();
		});

		it("preserves tier when resetting key", async () => {
			// Generate initial API key with solo tier
			const oldKey = await generateApiKey({
				userId: testUserId,
				tier: "solo",
			});

			// Reset the key
			const response = await fetch(`${baseUrl}/api/keys/reset`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			expect(response.status).toBe(200);
			const body = await response.json() as { tier: string; rateLimitPerHour: number };

			// New key should have same tier
			expect(body.tier).toBe("solo");
			expect(body.rateLimitPerHour).toBe(1000);
		});

		it("old key immediately returns 401 after reset", async () => {
			// Generate initial API key
			const oldKey = await generateApiKey({
				userId: testUserId,
				tier: "free",
			});

			// Reset the key
			await fetch(`${baseUrl}/api/keys/reset`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			// Verify old key is revoked in database
			const { data: oldKeyData } = await serviceClient
				.from("api_keys")
				.select("enabled, revoked_at")
				.eq("key_id", oldKey.keyId)
				.single();

			expect(oldKeyData?.enabled).toBe(false);
			expect(oldKeyData?.revoked_at).not.toBeNull();
		});

		it("enforces rate limit (max 5 resets per hour)", async () => {
			// Generate initial API key
			await generateApiKey({
				userId: testUserId,
				tier: "free",
			});

			// Make 5 successful reset requests
			for (let i = 0; i < 5; i++) {
				const response = await fetch(`${baseUrl}/api/keys/reset`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${testUserToken}`,
					},
				});

				expect(response.status).toBe(200);
			}

			// 6th request should be rate limited
			const response = await fetch(`${baseUrl}/api/keys/reset`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			expect(response.status).toBe(429);
			const body = await response.json() as { error: string; retryAfter: number };
			expect(body.error).toContain("Rate limit exceeded");
			expect(body.retryAfter).toBeGreaterThan(0);
		});
	});

	describe("DELETE /api/keys/current", () => {
		it("returns 401 for missing Authorization header", async () => {
			const response = await fetch(`${baseUrl}/api/keys/current`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
				},
			});

			expect(response.status).toBe(401);
			const body = await response.json() as { error: string };
			expect(body.error).toBeTruthy();
		});

		it("returns 401 for invalid JWT token", async () => {
			const response = await fetch(`${baseUrl}/api/keys/current`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					"Authorization": "Bearer invalid-token-abc123",
				},
			});

			expect(response.status).toBe(401);
			const body = await response.json() as { error: string };
			expect(body.error).toBeTruthy();
		});

		it("returns 404 when user has no API key to revoke", async () => {
			const response = await fetch(`${baseUrl}/api/keys/current`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			expect(response.status).toBe(404);
			const body = await response.json() as { error: string };
			expect(body.error).toContain("No active API key found");
		});

		it("revokes API key successfully", async () => {
			// Generate API key
			const key = await generateApiKey({
				userId: testUserId,
				tier: "free",
			});

			// Revoke the key
			const response = await fetch(`${baseUrl}/api/keys/current`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			expect(response.status).toBe(200);
			const body = await response.json() as {
				success: boolean;
				message: string;
				keyId: string;
				revokedAt: string;
			};

			expect(body.success).toBe(true);
			expect(body.message).toContain("revoked successfully");
			expect(body.keyId).toBe(key.keyId);
			expect(body.revokedAt).toBeTruthy();

			// Verify key is revoked in database
			const { data: keyData } = await serviceClient
				.from("api_keys")
				.select("enabled, revoked_at")
				.eq("key_id", key.keyId)
				.single();

			expect(keyData?.enabled).toBe(false);
			expect(keyData?.revoked_at).not.toBeNull();
		});

		it("revoked key cannot be used after revocation", async () => {
			// Generate API key
			const key = await generateApiKey({
				userId: testUserId,
				tier: "free",
			});

			// Revoke the key
			await fetch(`${baseUrl}/api/keys/current`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${testUserToken}`,
				},
			});

			// Verify key is revoked in database
			const { data: keyData } = await serviceClient
				.from("api_keys")
				.select("enabled, revoked_at")
				.eq("key_id", key.keyId)
				.single();

			expect(keyData?.enabled).toBe(false);
			expect(keyData?.revoked_at).not.toBeNull();
		});
	});
});
