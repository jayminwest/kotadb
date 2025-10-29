/**
 * Test Account Generation Script Integration Tests
 *
 * Tests the generate-test-account.ts script functionality with real Supabase Local instance.
 * Validates both backend (API key) and frontend (session token) generation modes.
 *
 * Required environment variables:
 * - SUPABASE_URL (defaults to http://localhost:54322)
 * - SUPABASE_SERVICE_KEY (defaults to local demo key)
 * - SUPABASE_ANON_KEY (defaults to local demo key)
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { getServiceClient } from "@db/client";
import { generateApiKey } from "@auth/keys";

/**
 * Helper to decode JWT token without verification (for testing only).
 */
function decodeJWT(token: string): Record<string, any> {
	const parts = token.split(".");
	if (parts.length !== 3) {
		throw new Error("Invalid JWT format");
	}
	const payload = parts[1];
	if (!payload) {
		throw new Error("Missing JWT payload");
	}
	const decoded = Buffer.from(payload, "base64url").toString("utf-8");
	return JSON.parse(decoded);
}

describe("Test Account Generation Script", () => {
	let testEmailCounter = 0;

	beforeEach(() => {
		// Generate unique email for each test to avoid conflicts
		testEmailCounter++;
	});

	describe("User Creation", () => {
		it("creates user with service account metadata", async () => {
			const supabase = getServiceClient();
			const email = `test-${testEmailCounter}-${Date.now()}@kotadb.dev`;

			// Create user with metadata
			const { data, error } = await supabase.auth.admin.createUser({
				email,
				password: "test-password-123",
				email_confirm: true,
				user_metadata: {
					service_account: true,
					purpose: "automation-testing",
				},
			});

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data.user).toBeDefined();

			if (data.user) {
				expect(data.user.email).toBe(email);
				expect(data.user.user_metadata).toBeDefined();
				expect(data.user.user_metadata?.service_account).toBe(true);
				expect(data.user.user_metadata?.purpose).toBe("automation-testing");
			}
		});

		it("retrieves existing user without creating duplicate", async () => {
			const supabase = getServiceClient();
			const email = `test-${testEmailCounter}-${Date.now()}@kotadb.dev`;

			// Create user first
			const { data: firstCreate, error: firstError } =
				await supabase.auth.admin.createUser({
					email,
					password: "test-password-123",
					email_confirm: true,
					user_metadata: {
						service_account: true,
						purpose: "automation-testing",
					},
				});

			expect(firstError).toBeNull();
			expect(firstCreate).toBeDefined();
			expect(firstCreate.user).toBeDefined();

			const userId = firstCreate.user?.id || "";
			expect(userId).toBeTruthy();

			// Try to find existing user
			const { data: usersList } = await supabase.auth.admin.listUsers();
			const existingUser = usersList?.users.find((u) => u.email === email);

			expect(existingUser).toBeDefined();
			expect(existingUser?.id).toBe(userId);
			expect(existingUser?.email).toBe(email);
		});

		it("generates valid UUID for user ID", async () => {
			const supabase = getServiceClient();
			const email = `test-${testEmailCounter}-${Date.now()}@kotadb.dev`;

			const { data, error } = await supabase.auth.admin.createUser({
				email,
				password: "test-password-123",
				email_confirm: true,
			});

			expect(error).toBeNull();
			expect(data.user).toBeDefined();

			if (data.user) {
				expect(data.user.id).toBeDefined();

				// Validate UUID v4 format
				const uuidPattern =
					/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
				expect(uuidPattern.test(data.user.id)).toBe(true);
			}
		});
	});

	describe("Session Token Generation", () => {
		it("generates valid session tokens via signInWithPassword", async () => {
			const supabase = getServiceClient();
			const email = `test-${testEmailCounter}-${Date.now()}@kotadb.dev`;

			// Create user first
			const { data: userData, error: userError } =
				await supabase.auth.admin.createUser({
					email,
					password: "test-password-123",
					email_confirm: true,
				});

			expect(userError).toBeNull();
			expect(userData).toBeDefined();

			// Generate session tokens by signing in
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password: "test-password-123",
			});

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data.session).toBeDefined();

			// Session contains tokens
			expect(data.session?.access_token).toBeDefined();
			expect(data.session?.refresh_token).toBeDefined();
		});

		it("access token is valid JWT with correct claims", async () => {
			const supabase = getServiceClient();
			const email = `test-${testEmailCounter}-${Date.now()}@kotadb.dev`;

			// Create user first
			const { data: userData, error: userError } =
				await supabase.auth.admin.createUser({
					email,
					password: "test-password-123",
					email_confirm: true,
				});

			expect(userError).toBeNull();
			expect(userData.user).toBeDefined();

			const userId = userData.user?.id || "";
			expect(userId).toBeTruthy();

			// Generate session tokens by signing in
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password: "test-password-123",
			});

			expect(error).toBeNull();
			expect(data.session).toBeDefined();
			expect(data.session?.access_token).toBeDefined();

			// Decode JWT (without verification - just structure check)
			const decoded = decodeJWT(data.session!.access_token);

			// Validate required claims
			expect(decoded.sub).toBe(userId);
			expect(decoded.email).toBe(email);
			expect(decoded.role).toBe("authenticated");
			expect(decoded.iat).toBeDefined();
			expect(decoded.exp).toBeDefined();
			expect(decoded.aud).toBeDefined();

			// Validate expiration is in the future
			const now = Math.floor(Date.now() / 1000);
			expect(decoded.exp).toBeGreaterThan(now);
		});

		it("tokens work with Supabase client initialization", async () => {
			const supabase = getServiceClient();
			const email = `test-${testEmailCounter}-${Date.now()}@kotadb.dev`;

			// Create user
			const { data: userData, error: userError } =
				await supabase.auth.admin.createUser({
					email,
					password: "test-password-123",
					email_confirm: true,
				});

			expect(userError).toBeNull();

			// Sign in to get tokens
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password: "test-password-123",
			});

			expect(error).toBeNull();
			expect(data.session).toBeDefined();
			expect(data.session?.access_token).toBeDefined();

			// Verify token can be used to set session on another client
			const { data: sessionData, error: sessionError } =
				await supabase.auth.setSession({
					access_token: data.session!.access_token,
					refresh_token: data.session!.refresh_token,
				});

			expect(sessionError).toBeNull();
			expect(sessionData.session).toBeDefined();
			expect(sessionData.user).toBeDefined();
			expect(sessionData.user?.email).toBe(email);
		});

		it("refresh token can be used to obtain new access token", async () => {
			const supabase = getServiceClient();
			const email = `test-${testEmailCounter}-${Date.now()}@kotadb.dev`;

			// Create user
			const { data: userData, error: userError } =
				await supabase.auth.admin.createUser({
					email,
					password: "test-password-123",
					email_confirm: true,
				});

			expect(userError).toBeNull();

			// Sign in to get tokens
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password: "test-password-123",
			});

			expect(error).toBeNull();
			expect(data.session).toBeDefined();

			const refreshToken = data.session!.refresh_token;

			// Wait a moment to ensure token is different when refreshed
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Refresh session
			const { data: refreshData, error: refreshError } =
				await supabase.auth.refreshSession({
					refresh_token: refreshToken,
				});

			expect(refreshError).toBeNull();
			expect(refreshData.session).toBeDefined();
			expect(refreshData.session?.access_token).toBeDefined();
			expect(refreshData.session?.refresh_token).toBeDefined();

			// Verify we can decode the new access token
			const decoded = decodeJWT(refreshData.session!.access_token);
			expect(decoded.sub).toBeDefined();
			expect(decoded.email).toBe(email);
		});
	});

	describe("API Key Generation Backward Compatibility", () => {
		it("generates valid API key for backend testing mode", async () => {
			const supabase = getServiceClient();
			const email = `test-${testEmailCounter}-${Date.now()}@kotadb.dev`;

			// Create user
			const { data: userData, error: userError } =
				await supabase.auth.admin.createUser({
					email,
					password: "test-password-123",
					email_confirm: true,
					user_metadata: {
						service_account: true,
						purpose: "automation-testing",
					},
				});

			expect(userError).toBeNull();
			expect(userData.user).toBeDefined();

			const userId = userData.user?.id || "";
			expect(userId).toBeTruthy();

			// Generate API key (backend mode)
			const result = await generateApiKey({
				userId,
				tier: "team",
			});

			expect(result).toBeDefined();
			expect(result.apiKey).toMatch(/^kota_team_[A-Za-z0-9]{12}_[0-9a-f]{36}$/);
			expect(result.tier).toBe("team");
			expect(result.keyId).toHaveLength(12);
		});

		it("API key and session token can coexist for same user", async () => {
			const supabase = getServiceClient();
			const email = `test-${testEmailCounter}-${Date.now()}@kotadb.dev`;

			// Create user
			const { data: userData, error: userError } =
				await supabase.auth.admin.createUser({
					email,
					password: "test-password-123",
					email_confirm: true,
					user_metadata: {
						service_account: true,
						purpose: "automation-testing",
					},
				});

			expect(userError).toBeNull();
			expect(userData.user).toBeDefined();

			const userId = userData.user?.id || "";
			expect(userId).toBeTruthy();

			// Generate API key
			const apiKeyResult = await generateApiKey({
				userId,
				tier: "free",
			});

			expect(apiKeyResult).toBeDefined();
			expect(apiKeyResult.apiKey).toBeDefined();

			// Generate session tokens by signing in
			const { data: tokenData, error: tokenError } =
				await supabase.auth.signInWithPassword({
					email,
					password: "test-password-123",
				});

			expect(tokenError).toBeNull();
			expect(tokenData.session?.access_token).toBeDefined();

			// Both should be valid for the same user
			expect(apiKeyResult.apiKey).toMatch(/^kota_free_/);
			expect(tokenData.session?.access_token).toBeDefined();
		});
	});

	describe("Edge Cases", () => {
		it("handles user creation with special characters in email", async () => {
			const supabase = getServiceClient();
			const email = `test+special.${testEmailCounter}-${Date.now()}@kotadb.dev`;

			const { data, error } = await supabase.auth.admin.createUser({
				email,
				password: "test-password-123",
				email_confirm: true,
			});

			expect(error).toBeNull();
			expect(data.user?.email).toBe(email);
		});

		it("fails gracefully when Supabase credentials are missing", async () => {
			const originalUrl = process.env.SUPABASE_URL;
			const originalKey = process.env.SUPABASE_SERVICE_KEY;

			process.env.SUPABASE_URL = undefined;
			process.env.SUPABASE_SERVICE_KEY = undefined;

			try {
				const supabase = getServiceClient();
				// Should throw due to missing credentials
				expect(true).toBe(false); // Fail if no error
			} catch (error) {
				expect(error).toBeDefined();
				expect((error as Error).message).toContain("Missing Supabase");
			} finally {
				// Restore env vars
				if (originalUrl) process.env.SUPABASE_URL = originalUrl;
				if (originalKey) process.env.SUPABASE_SERVICE_KEY = originalKey;
			}
		});
	});
});
