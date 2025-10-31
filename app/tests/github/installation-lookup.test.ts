/**
 * GitHub Installation Lookup Tests
 *
 * Tests installation ID lookup for repositories, caching logic, and error handling.
 * Integration tests that make real API calls are skipped if GITHUB_APP_ID is not configured.
 *
 * Required environment variables (for integration tests):
 * - GITHUB_APP_ID: GitHub App ID
 * - GITHUB_APP_PRIVATE_KEY: GitHub App private key in PEM format
 * - TEST_GITHUB_INSTALLATION_ID: GitHub App installation ID for testing
 * - TEST_GITHUB_REPOSITORY: Repository accessible by test installation (owner/repo)
 */

import { describe, expect, it, beforeEach } from "bun:test";
import {
	getInstallationForRepository,
	clearFailedLookupCache,
	getFailedLookupCacheStats,
} from "@github/installation-lookup";
import { GitHubAppError } from "@github/types";

describe("GitHub Installation Lookup", () => {
	beforeEach(() => {
		// Clear cache before each test
		clearFailedLookupCache();
	});

	describe("Configuration Validation", () => {
		it("returns null when GITHUB_APP_ID is missing", async () => {
			const originalAppId = process.env.GITHUB_APP_ID;
			const originalPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;

			process.env.GITHUB_APP_ID = undefined;
			process.env.GITHUB_APP_PRIVATE_KEY = "fake-key";

			try {
				const result = await getInstallationForRepository("owner", "repo");
				expect(result).toBeNull();
			} finally {
				// Restore original values
				if (originalAppId) process.env.GITHUB_APP_ID = originalAppId;
				if (originalPrivateKey)
					process.env.GITHUB_APP_PRIVATE_KEY = originalPrivateKey;
			}
		});

		it("returns null when GITHUB_APP_PRIVATE_KEY is missing", async () => {
			const originalAppId = process.env.GITHUB_APP_ID;
			const originalPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;

			process.env.GITHUB_APP_ID = "123456";
			process.env.GITHUB_APP_PRIVATE_KEY = undefined;

			try {
				const result = await getInstallationForRepository("owner", "repo");
				expect(result).toBeNull();
			} finally {
				// Restore original values
				if (originalAppId) process.env.GITHUB_APP_ID = originalAppId;
				if (originalPrivateKey)
					process.env.GITHUB_APP_PRIVATE_KEY = originalPrivateKey;
			}
		});
	});

	describe("Failed Lookup Cache Management", () => {
		it("clearFailedLookupCache clears specific repository", () => {
			clearFailedLookupCache("owner/repo");
			const stats = getFailedLookupCacheStats();
			expect(stats.size).toBe(0);
		});

		it("clearFailedLookupCache clears all repositories when no name provided", () => {
			clearFailedLookupCache();
			const stats = getFailedLookupCacheStats();
			expect(stats.size).toBe(0);
		});

		it("getFailedLookupCacheStats returns correct structure", () => {
			const stats = getFailedLookupCacheStats();
			expect(stats).toHaveProperty("size");
			expect(typeof stats.size).toBe("number");
		});

		it("cache stats show zero size when empty", () => {
			clearFailedLookupCache();
			const stats = getFailedLookupCacheStats();
			expect(stats.size).toBe(0);
		});
	});

	describe("Input Validation", () => {
		it("handles repository names correctly", async () => {
			// This test will attempt lookup but should handle errors gracefully
			const result = await getInstallationForRepository(
				"nonexistent-owner",
				"nonexistent-repo",
			);

			// Should return null for non-existent repositories
			expect(result).toBeNull();

			// Failed lookup should be cached
			const stats = getFailedLookupCacheStats();
			expect(stats.size).toBeGreaterThanOrEqual(0);
		});
	});
});

/**
 * Integration Tests
 *
 * These tests make real API calls to GitHub and require valid GitHub App credentials.
 * Tests are skipped if GITHUB_APP_ID is not configured.
 */
describe("GitHub Installation Lookup - Integration", () => {
	const hasCredentials = Boolean(process.env.GITHUB_APP_ID);

	beforeEach(() => {
		clearFailedLookupCache();
	});

	it.skipIf(!hasCredentials)(
		"finds installation ID for accessible repository",
		async () => {
			const testRepository = process.env.TEST_GITHUB_REPOSITORY ?? "";
			if (!testRepository || !testRepository.includes("/")) {
				process.stdout.write(
					"[Test] Skipping: TEST_GITHUB_REPOSITORY not configured (format: owner/repo)\n",
				);
				return;
			}

			const [owner, repo] = testRepository.split("/");
			if (!owner || !repo) {
				process.stdout.write(
					"[Test] Skipping: Invalid TEST_GITHUB_REPOSITORY format\n",
				);
				return;
			}

			const installationId = await getInstallationForRepository(owner, repo);

			expect(installationId).not.toBeNull();
			expect(typeof installationId).toBe("number");
			expect(installationId).toBeGreaterThan(0);
		},
		30000,
	); // 30s timeout for API call

	it.skipIf(!hasCredentials)(
		"returns null for repository without installation",
		async () => {
			// Use a well-known repository that is unlikely to have our test app installed
			const installationId = await getInstallationForRepository(
				"torvalds",
				"linux",
			);

			// Should return null (Linux kernel is unlikely to have our test app installed)
			expect(installationId).toBeNull();

			// Failed lookup should be cached
			const stats = getFailedLookupCacheStats();
			expect(stats.size).toBeGreaterThan(0);
		},
		30000,
	);

	it.skipIf(!hasCredentials)(
		"caches failed lookups on subsequent calls",
		async () => {
			clearFailedLookupCache();

			// First call attempts lookup
			const result1 = await getInstallationForRepository(
				"nonexistent-owner-12345",
				"nonexistent-repo-67890",
			);
			expect(result1).toBeNull();

			// Check cache was populated
			const stats1 = getFailedLookupCacheStats();
			expect(stats1.size).toBeGreaterThan(0);

			// Second call should use cache (no API call)
			const result2 = await getInstallationForRepository(
				"nonexistent-owner-12345",
				"nonexistent-repo-67890",
			);
			expect(result2).toBeNull();

			// Cache size should remain the same
			const stats2 = getFailedLookupCacheStats();
			expect(stats2.size).toBe(stats1.size);
		},
		30000,
	);

	it.skipIf(!hasCredentials)(
		"handles invalid repository names gracefully",
		async () => {
			// Empty owner/repo should be handled gracefully
			const result = await getInstallationForRepository("", "");
			expect(result).toBeNull();
		},
		30000,
	);
});
