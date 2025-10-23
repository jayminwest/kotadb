/**
 * GitHub App Authentication Tests
 *
 * Tests token generation, caching logic, and error handling for GitHub App installation tokens.
 * Integration tests that make real API calls are skipped if GITHUB_APP_ID is not configured.
 *
 * Required environment variables (for integration tests):
 * - GITHUB_APP_ID: GitHub App ID
 * - GITHUB_APP_PRIVATE_KEY: GitHub App private key in PEM format
 */

import { describe, expect, it, beforeEach } from "bun:test";
import {
	getInstallationToken,
	clearTokenCache,
	getCacheStats,
} from "@github/app-auth";
import { GitHubAppError } from "@github/types";

describe("GitHub App Authentication", () => {
	beforeEach(() => {
		// Clear cache before each test
		clearTokenCache();
	});

	describe("Configuration Validation", () => {
		it("throws GitHubAppError when GITHUB_APP_ID is missing", async () => {
			const originalAppId = process.env.GITHUB_APP_ID;
			const originalPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;

			process.env.GITHUB_APP_ID = undefined;
			process.env.GITHUB_APP_PRIVATE_KEY = "fake-key";

			try {
				await getInstallationToken(12345);
				expect.unreachable("Should have thrown GitHubAppError");
			} catch (error) {
				expect(error).toBeInstanceOf(GitHubAppError);
				expect((error as GitHubAppError).code).toBe("MISSING_APP_ID");
				expect((error as GitHubAppError).message).toContain("GITHUB_APP_ID");
			} finally {
				// Restore original values
				if (originalAppId) process.env.GITHUB_APP_ID = originalAppId;
				if (originalPrivateKey)
					process.env.GITHUB_APP_PRIVATE_KEY = originalPrivateKey;
			}
		});

		it("throws GitHubAppError when GITHUB_APP_PRIVATE_KEY is missing", async () => {
			const originalAppId = process.env.GITHUB_APP_ID;
			const originalPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;

			process.env.GITHUB_APP_ID = "123456";
			process.env.GITHUB_APP_PRIVATE_KEY = undefined;

			try {
				await getInstallationToken(12345);
				expect.unreachable("Should have thrown GitHubAppError");
			} catch (error) {
				expect(error).toBeInstanceOf(GitHubAppError);
				expect((error as GitHubAppError).code).toBe("MISSING_PRIVATE_KEY");
				expect((error as GitHubAppError).message).toContain(
					"GITHUB_APP_PRIVATE_KEY",
				);
			} finally {
				// Restore original values
				if (originalAppId) process.env.GITHUB_APP_ID = originalAppId;
				if (originalPrivateKey)
					process.env.GITHUB_APP_PRIVATE_KEY = originalPrivateKey;
			}
		});
	});

	describe("Token Cache Management", () => {
		it("clearTokenCache clears specific installation", () => {
			// Clear cache is synchronous and doesn't throw
			clearTokenCache(12345);
			const stats = getCacheStats();
			expect(stats.size).toBe(0);
		});

		it("clearTokenCache clears all installations when no ID provided", () => {
			clearTokenCache();
			const stats = getCacheStats();
			expect(stats.size).toBe(0);
			expect(stats.oldestEntryAgeMs).toBeNull();
		});

		it("getCacheStats returns correct structure", () => {
			const stats = getCacheStats();
			expect(stats).toHaveProperty("size");
			expect(stats).toHaveProperty("oldestEntryAgeMs");
			expect(typeof stats.size).toBe("number");
			expect(stats.oldestEntryAgeMs === null || typeof stats.oldestEntryAgeMs === "number").toBe(true);
		});

		it("cache stats show zero size when empty", () => {
			clearTokenCache();
			const stats = getCacheStats();
			expect(stats.size).toBe(0);
			expect(stats.oldestEntryAgeMs).toBeNull();
		});
	});

	describe("Error Handling", () => {
		it("GitHubAppError includes error code and message", () => {
			const error = new GitHubAppError(
				"Test error message",
				"TEST_ERROR_CODE",
			);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("GitHubAppError");
			expect(error.message).toBe("Test error message");
			expect(error.code).toBe("TEST_ERROR_CODE");
		});

		it("GitHubAppError includes cause when provided", () => {
			const cause = new Error("Original error");
			const error = new GitHubAppError(
				"Test error message",
				"TEST_ERROR_CODE",
				cause,
			);
			expect(error.cause).toBe(cause);
		});
	});
});

/**
 * Integration Tests
 *
 * These tests make real API calls to GitHub and require valid GitHub App credentials.
 * Tests are skipped if GITHUB_APP_ID is not configured.
 */
describe("GitHub App Authentication - Integration", () => {
	const hasCredentials = Boolean(process.env.GITHUB_APP_ID);

	beforeEach(() => {
		clearTokenCache();
	});

	it.skipIf(!hasCredentials)(
		"generates installation token with valid credentials",
		async () => {
			// This test requires a valid installation ID for your test app
			// TODO: Configure test GitHub App and installation ID in CI
			const testInstallationId = Number.parseInt(
				process.env.TEST_GITHUB_INSTALLATION_ID ?? "0",
				10,
			);

			if (!testInstallationId) {
				console.log(
					"[Test] Skipping: TEST_GITHUB_INSTALLATION_ID not configured",
				);
				return;
			}

			const token = await getInstallationToken(testInstallationId);

			expect(token).toBeDefined();
			expect(typeof token).toBe("string");
			expect(token.length).toBeGreaterThan(0);
			// GitHub App tokens typically start with 'ghs_' or 'v1.'
			expect(token.startsWith("ghs_") || token.startsWith("v1.")).toBe(true);
		},
		30000,
	); // 30s timeout for API call

	it.skipIf(!hasCredentials)(
		"caches token on subsequent calls",
		async () => {
			const testInstallationId = Number.parseInt(
				process.env.TEST_GITHUB_INSTALLATION_ID ?? "0",
				10,
			);

			if (!testInstallationId) {
				console.log(
					"[Test] Skipping: TEST_GITHUB_INSTALLATION_ID not configured",
				);
				return;
			}

			// First call generates token
			const token1 = await getInstallationToken(testInstallationId);
			const stats1 = getCacheStats();

			// Second call should return cached token (same value)
			const token2 = await getInstallationToken(testInstallationId);
			const stats2 = getCacheStats();

			expect(token1).toBe(token2);
			expect(stats1.size).toBeGreaterThan(0);
			expect(stats2.size).toBe(stats1.size);
		},
		30000,
	);

	it.skipIf(!hasCredentials)(
		"handles invalid installation ID gracefully",
		async () => {
			const invalidInstallationId = 99999999; // Non-existent installation

			try {
				await getInstallationToken(invalidInstallationId);
				expect.unreachable("Should have thrown GitHubAppError");
			} catch (error) {
				expect(error).toBeInstanceOf(GitHubAppError);
				expect((error as GitHubAppError).code).toBe("INSTALLATION_NOT_FOUND");
			}
		},
		30000,
	);
});
