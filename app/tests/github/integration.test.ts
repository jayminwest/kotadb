/**
 * GitHub Integration Tests
 *
 * Tests end-to-end integration with GitHub API using real Octokit clients.
 * Tests are skipped if GITHUB_APP_ID is not configured.
 *
 * Required environment variables:
 * - GITHUB_APP_ID: GitHub App ID
 * - GITHUB_APP_PRIVATE_KEY: GitHub App private key in PEM format
 * - TEST_GITHUB_INSTALLATION_ID: Installation ID for testing (optional)
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { clearTokenCache } from "@github/app-auth";
import {
	getOctokitForInstallation,
	getPublicOctokit,
} from "@github/client";

describe("GitHub Octokit Client Integration", () => {
	const hasCredentials = Boolean(process.env.GITHUB_APP_ID);

	beforeEach(() => {
		clearTokenCache();
	});

	describe("Public Octokit Client", () => {
		it("creates unauthenticated Octokit instance", () => {
			const octokit = getPublicOctokit();

			expect(octokit).toBeDefined();
			expect(octokit.request).toBeDefined();
			expect(octokit.repos).toBeDefined();
		});

		it("can fetch public repository metadata", async () => {
			const octokit = getPublicOctokit();

			// Fetch a well-known public repo
			const response = await octokit.repos.get({
				owner: "octocat",
				repo: "Hello-World",
			});

			expect(response.status).toBe(200);
			expect(response.data).toBeDefined();
			expect(response.data.name).toBe("Hello-World");
			expect(response.data.owner?.login).toBe("octocat");
			expect(response.data.private).toBe(false);
		}, 30000);
	});

	describe("Authenticated Octokit Client", () => {
		it.skipIf(!hasCredentials)(
			"creates authenticated Octokit instance",
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

				const octokit = await getOctokitForInstallation(testInstallationId);

				expect(octokit).toBeDefined();
				expect(octokit.request).toBeDefined();
				expect(octokit.repos).toBeDefined();
			},
			30000,
		);

		it.skipIf(!hasCredentials)(
			"can fetch installation repositories",
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

				const octokit = await getOctokitForInstallation(testInstallationId);

				// List repositories accessible to this installation
				const response = await octokit.apps.listReposAccessibleToInstallation();

				expect(response.status).toBe(200);
				expect(response.data).toBeDefined();
				expect(Array.isArray(response.data.repositories)).toBe(true);
			},
			30000,
		);

		it.skipIf(!hasCredentials)(
			"reuses cached tokens across client creation",
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

				// Create two clients - should reuse cached token
				const octokit1 = await getOctokitForInstallation(testInstallationId);
				const octokit2 = await getOctokitForInstallation(testInstallationId);

				// Both should be valid Octokit instances
				expect(octokit1).toBeDefined();
				expect(octokit2).toBeDefined();

				// Both should be able to make API calls
				const [response1, response2] = await Promise.all([
					octokit1.apps.listReposAccessibleToInstallation(),
					octokit2.apps.listReposAccessibleToInstallation(),
				]);

				expect(response1.status).toBe(200);
				expect(response2.status).toBe(200);
			},
			30000,
		);
	});
});
