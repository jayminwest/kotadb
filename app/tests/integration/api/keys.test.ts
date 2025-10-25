/**
 * API Key Generation Integration Tests
 *
 * Tests the POST /api/keys/generate endpoint with real Supabase Auth.
 * Validates JWT authentication, organization creation, and idempotency.
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

describe("POST /api/keys/generate", () => {
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

	it("returns 401 for missing Authorization header", async () => {
		const response = await fetch(`${baseUrl}/api/keys/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
		});

		expect(response.status).toBe(401);
		const body = await response.json() as { error: string };
		expect(body.error).toContain("Missing or invalid Authorization header");
	});

	it("returns 401 for invalid Authorization header format", async () => {
		const response = await fetch(`${baseUrl}/api/keys/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": "InvalidFormat token123",
			},
		});

		expect(response.status).toBe(401);
		const body = await response.json() as { error: string };
		expect(body.error).toContain("Missing or invalid Authorization header");
	});

	it("returns 401 for invalid JWT token", async () => {
		const response = await fetch(`${baseUrl}/api/keys/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": "Bearer invalid-token-abc123",
			},
		});

		expect(response.status).toBe(401);
		const body = await response.json() as { error: string };
		expect(body.error).toContain("Invalid or expired token");
	});

	it("generates new API key for authenticated user", async () => {
		const response = await fetch(`${baseUrl}/api/keys/generate`, {
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
		};

		// Validate response structure
		expect(body.apiKey).toMatch(/^kota_free_[a-zA-Z0-9]{12}_[0-9a-f]{36}$/);
		expect(body.keyId).toBeTruthy();
		expect(body.tier).toBe("free");
		expect(body.rateLimitPerHour).toBe(100);
		expect(body.createdAt).toBeTruthy();

		// Verify API key was stored in database (use service client to bypass RLS)
		const { data: apiKey } = await serviceClient
			.from("api_keys")
			.select("key_id, tier, enabled, user_id")
			.eq("user_id", testUserId)
			.single();

		expect(apiKey).not.toBeNull();
		expect(apiKey?.key_id).toBe(body.keyId);
		expect(apiKey?.tier).toBe("free");
		expect(apiKey?.enabled).toBe(true);
		expect(apiKey?.user_id).toBe(testUserId);
	});

	it("creates default organization for new user", async () => {
		const response = await fetch(`${baseUrl}/api/keys/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${testUserToken}`,
			},
		});

		expect(response.status).toBe(200);

		// Verify organization was created (use service client to bypass RLS)
		const { data: org } = await serviceClient
			.from("organizations")
			.select("id, name, slug, owner_id")
			.eq("owner_id", testUserId)
			.single();

		expect(org).not.toBeNull();
		expect(org?.name).toContain("-org");
		expect(org?.slug).toContain("-org");
		expect(org?.owner_id).toBe(testUserId);

		// Verify user_organizations link (use service client to bypass RLS)
		const { data: userOrg } = await serviceClient
			.from("user_organizations")
			.select("user_id, org_id, role")
			.eq("user_id", testUserId)
			.single();

		expect(userOrg).not.toBeNull();
		expect(userOrg?.user_id).toBe(testUserId);
		expect(userOrg?.org_id).toBe(org?.id);
		expect(userOrg?.role).toBe("owner");
	});

	it("returns existing key for duplicate request (idempotency)", async () => {
		// First request - generates new key
		const response1 = await fetch(`${baseUrl}/api/keys/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${testUserToken}`,
			},
		});

		expect(response1.status).toBe(200);
		const body1 = await response1.json() as { keyId: string };
		const firstKeyId = body1.keyId;

		// Second request - should return existing key info (without secret)
		const response2 = await fetch(`${baseUrl}/api/keys/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${testUserToken}`,
			},
		});

		expect(response2.status).toBe(200);
		const body2 = await response2.json() as { keyId: string; message?: string };

		// Should return same key ID
		expect(body2.keyId).toBe(firstKeyId);
		expect(body2.message).toContain("already exists");

		// Verify only one API key exists in database (use service client to bypass RLS)
		const { count } = await serviceClient
			.from("api_keys")
			.select("*", { count: "exact", head: true })
			.eq("user_id", testUserId);

		expect(count).toBe(1);
	});

	it("uses existing organization if available", async () => {
		// Pre-create organization for user (use service client to bypass RLS)
		const orgSlug = `pre-existing-org-${Date.now()}`;
		const { data: preOrg, error: orgError } = await serviceClient
			.from("organizations")
			.insert({
				name: orgSlug,
				slug: orgSlug,
				owner_id: testUserId,
			})
			.select("id")
			.single();

		if (orgError || !preOrg) {
			throw new Error(`Failed to create pre-existing org: ${orgError?.message}`);
		}

		// Link user to organization (use service client to bypass RLS)
		await serviceClient.from("user_organizations").insert({
			user_id: testUserId,
			org_id: preOrg.id,
			role: "owner",
		});

		// Generate API key - should use existing org
		const response = await fetch(`${baseUrl}/api/keys/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${testUserToken}`,
			},
		});

		expect(response.status).toBe(200);

		// Verify no new organization was created (should still have exactly 1) (use service client to bypass RLS)
		const { count } = await serviceClient
			.from("organizations")
			.select("*", { count: "exact", head: true })
			.eq("owner_id", testUserId);

		expect(count).toBe(1);

		// Verify API key metadata references the existing org (use service client to bypass RLS)
		const { data: apiKey } = await serviceClient
			.from("api_keys")
			.select("metadata")
			.eq("user_id", testUserId)
			.single();

		expect(apiKey?.metadata).toBeDefined();
		expect((apiKey?.metadata as any)?.org_id).toBe(preOrg.id);
	});
});
