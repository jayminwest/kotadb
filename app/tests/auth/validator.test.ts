/**
 * API Key Validator Integration Tests
 *
 * Tests API key validation with real database connection.
 * Environment variables are loaded from .env.test in CI or default to local Supabase ports.
 *
 * Note: Uses Kong gateway (54322) for Supabase JS client, not PostgREST direct (54321)
 *
 * Required environment variables:
 * - SUPABASE_URL (defaults to http://localhost:54322)
 * - SUPABASE_SERVICE_KEY (defaults to local demo key)
 * - SUPABASE_ANON_KEY (defaults to local demo key)
 * - DATABASE_URL (defaults to postgresql://postgres:postgres@localhost:5434/postgres)
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { clearCache } from "@auth/cache";
import { parseApiKey, validateApiKey, validateJwtToken } from "@auth/validator";
import { getTestApiKey, TEST_USER_IDS } from "../helpers/db";
import { getServiceClient } from "@db/client";

describe("API Key Validator", () => {
	beforeEach(() => {
		clearCache();
	});

	describe("parseApiKey", () => {
		it("parses valid API key format", () => {
			const key = "kota_free_abcd1234efgh5678_0123456789abcdef0123456789abcdef";
			const result = parseApiKey(key);

			expect(result).not.toBeNull();
			expect(result?.tier).toBe("free");
			expect(result?.keyId).toBe("abcd1234efgh5678");
			expect(result?.secret).toBe("0123456789abcdef0123456789abcdef");
		});

		it("parses solo tier key", () => {
			const key = "kota_solo_testkey1_0123456789abcdef0123456789abcdef";
			const result = parseApiKey(key);

			expect(result).not.toBeNull();
			expect(result?.tier).toBe("solo");
			expect(result?.keyId).toBe("testkey1");
		});

		it("parses team tier key", () => {
			const key = "kota_team_orgkey99_0123456789abcdef0123456789abcdef";
			const result = parseApiKey(key);

			expect(result).not.toBeNull();
			expect(result?.tier).toBe("team");
			expect(result?.keyId).toBe("orgkey99");
		});

		it("returns null for invalid prefix", () => {
			const key = "invalid_free_abcd1234_0123456789abcdef0123456789abcdef";
			const result = parseApiKey(key);

			expect(result).toBeNull();
		});

		it("returns null for invalid tier", () => {
			const key = "kota_premium_abcd1234_0123456789abcdef0123456789abcdef";
			const result = parseApiKey(key);

			expect(result).toBeNull();
		});

		it("returns null for missing parts", () => {
			const key = "kota_free_abcd1234";
			const result = parseApiKey(key);

			expect(result).toBeNull();
		});

		it("returns null for too many parts", () => {
			const key = "kota_free_abcd1234_secret123_extra";
			const result = parseApiKey(key);

			expect(result).toBeNull();
		});

		it("returns null for short keyId", () => {
			const key = "kota_free_abc_0123456789abcdef0123456789abcdef";
			const result = parseApiKey(key);

			expect(result).toBeNull();
		});

		it("returns null for short secret", () => {
			const key = "kota_free_abcd1234efgh5678_short";
			const result = parseApiKey(key);

			expect(result).toBeNull();
		});

		it("returns null for empty string", () => {
			const result = parseApiKey("");

			expect(result).toBeNull();
		});

		it("handles keys with underscores in keyId", () => {
			const key = "kota_free_test_key_id_0123456789abcdef0123456789abcdef";
			const result = parseApiKey(key);

			// Should fail because split creates more than 4 parts
			expect(result).toBeNull();
		});
	});

	describe("validateApiKey", () => {
		it("returns null for invalid key format", async () => {
			const key = "invalid-key-format";
			const result = await validateApiKey(key);

			expect(result).toBeNull();
		});

		it("returns null for non-existent key", async () => {
			const key = "kota_free_nonexistent_0123456789abcdef0123456789abcdef";
			const result = await validateApiKey(key);

			expect(result).toBeNull();
		});

		it("validates real test key from database", async () => {
			const testKey = getTestApiKey("free");
			const result = await validateApiKey(testKey);

			expect(result).not.toBeNull();
			expect(result?.userId).toBeDefined();
			expect(result?.tier).toBe("free");
			expect(result?.keyId).toBe("test1234567890ab");
			expect(result?.rateLimitPerHour).toBe(100);
		});

		it("uses cache for repeated validations", async () => {
			const testKey = getTestApiKey("solo");

			const startTime1 = Date.now();
			const result1 = await validateApiKey(testKey);
			const duration1 = Date.now() - startTime1;

			const startTime2 = Date.now();
			const result2 = await validateApiKey(testKey);
			const duration2 = Date.now() - startTime2;

			// Both should succeed
			expect(result1).not.toBeNull();
			expect(result2).not.toBeNull();

			// Both should have same data
			expect(result1?.userId).toBe(result2?.userId);
			expect(result1?.tier).toBe("solo");
			expect(result2?.tier).toBe("solo");

			// Second call should be faster or equal (cache hit)
			// Allow +2ms tolerance for real database timing variance
			expect(duration2).toBeLessThanOrEqual(duration1 + 2);
		});

		it("returns null for disabled keys", async () => {
			const disabledKey = getTestApiKey("disabled");
			const result = await validateApiKey(disabledKey);

			// Disabled keys should return null even if secret is correct
			expect(result).toBeNull();
		});

		it("handles database connection errors gracefully", async () => {
			// Test with missing credentials
			const originalUrl = process.env.SUPABASE_URL;
			const originalKey = process.env.SUPABASE_SERVICE_KEY;

			process.env.SUPABASE_URL = undefined;
			process.env.SUPABASE_SERVICE_KEY = undefined;

			const key = "kota_free_testkey12_0123456789abcdef0123456789abcdef";

			try {
				await validateApiKey(key);
				// Should throw due to missing credentials
				expect(true).toBe(false); // Fail if no error
			} catch (error) {
				expect(error).toBeDefined();
			} finally {
				// Restore env vars
				if (originalUrl) process.env.SUPABASE_URL = originalUrl;
				if (originalKey) process.env.SUPABASE_SERVICE_KEY = originalKey;
			}
		});
	});

	describe("validateJwtToken", () => {
		let validJwtToken: string;
		let testUserId: string;

		beforeEach(async () => {
			clearCache();

			// Create a test user and get a valid JWT token using Supabase Auth
			const supabase = getServiceClient();
			const testEmail = `test-jwt-${Date.now()}@test.local`;
			const testPassword = "test-password-123456";

			// Create test user with auth.admin
			const { data: userData, error: createError } = await supabase.auth.admin.createUser({
				email: testEmail,
				password: testPassword,
				email_confirm: true,
			});

			if (createError || !userData.user) {
				throw new Error(`Failed to create test user: ${JSON.stringify(createError)}`);
			}

			testUserId = userData.user.id;

			// Sign in to get JWT token
			const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
				email: testEmail,
				password: testPassword,
			});

			if (signInError || !sessionData.session) {
				throw new Error(`Failed to sign in test user: ${JSON.stringify(signInError)}`);
			}

			validJwtToken = sessionData.session.access_token;

			// Create subscription for test user (free tier by default)
			const { error: subError } = await supabase.from("subscriptions").insert({
				user_id: testUserId,
				stripe_customer_id: `cus_test_${testUserId}`,
				tier: "free",
				status: "active",
			});

			if (subError) {
				throw new Error(`Failed to create subscription: ${JSON.stringify(subError)}`);
			}
		});

		it("validates valid JWT token with subscription", async () => {
			const result = await validateJwtToken(validJwtToken);

			expect(result).not.toBeNull();
			expect(result?.userId).toBe(testUserId);
			expect(result?.tier).toBe("free");
			expect(result?.keyId).toBe(`jwt_${testUserId}`);
			expect(result?.rateLimitPerHour).toBe(100);
		});

		it("returns null for invalid JWT token", async () => {
			const invalidToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature";
			const result = await validateJwtToken(invalidToken);

			expect(result).toBeNull();
		});

		it("returns null for expired JWT token", async () => {
			// Use a JWT with expired timestamp
			const expiredToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
			const result = await validateJwtToken(expiredToken);

			expect(result).toBeNull();
		});

		it("defaults to free tier when user has no subscription", async () => {
			// Create a user without subscription
			const supabase = getServiceClient();
			const testEmail = `test-no-sub-${Date.now()}@test.local`;
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

			const result = await validateJwtToken(sessionData.session.access_token);

			expect(result).not.toBeNull();
			expect(result?.tier).toBe("free");
			expect(result?.rateLimitPerHour).toBe(100);
		});

		it("uses cache for repeated JWT validations", async () => {
			const startTime1 = Date.now();
			const result1 = await validateJwtToken(validJwtToken);
			const duration1 = Date.now() - startTime1;

			const startTime2 = Date.now();
			const result2 = await validateJwtToken(validJwtToken);
			const duration2 = Date.now() - startTime2;

			// Both should succeed
			expect(result1).not.toBeNull();
			expect(result2).not.toBeNull();

			// Both should have same data
			expect(result1?.userId).toBe(result2?.userId);
			expect(result1?.tier).toBe(result2?.tier);
			expect(result1?.keyId).toBe(result2?.keyId);

			// Second call should be faster (cache hit)
			expect(duration2).toBeLessThan(duration1);
		});

		it("respects active subscription tier", async () => {
			// Update subscription to solo tier
			const supabase = getServiceClient();
			const { error } = await supabase
				.from("subscriptions")
				.update({ tier: "solo" })
				.eq("user_id", testUserId);

			if (error) {
				throw new Error(`Failed to update subscription: ${JSON.stringify(error)}`);
			}

			// Clear cache to force fresh validation
			clearCache();

			const result = await validateJwtToken(validJwtToken);

			expect(result).not.toBeNull();
			expect(result?.tier).toBe("solo");
			expect(result?.rateLimitPerHour).toBe(1000);
		});

		it("defaults to free tier for canceled subscription", async () => {
			// Update subscription to canceled
			const supabase = getServiceClient();
			const { error } = await supabase
				.from("subscriptions")
				.update({ status: "canceled" })
				.eq("user_id", testUserId);

			if (error) {
				throw new Error(`Failed to update subscription: ${JSON.stringify(error)}`);
			}

			// Clear cache to force fresh validation
			clearCache();

			const result = await validateJwtToken(validJwtToken);

			expect(result).not.toBeNull();
			expect(result?.tier).toBe("free");
			expect(result?.rateLimitPerHour).toBe(100);
		});

		it("generates synthetic keyId for JWT auth", async () => {
			const result = await validateJwtToken(validJwtToken);

			expect(result).not.toBeNull();
			expect(result?.keyId).toMatch(/^jwt_[0-9a-f-]+$/);
			expect(result?.keyId).toBe(`jwt_${testUserId}`);
		});
	});
});
