/**
 * GitHub Installation Lookup Module
 * Issue #363 - Populate installation_id for manual repository indexing
 *
 * Queries GitHub App installations to find installation ID for a given repository.
 * Used during manual repository creation via /index API to enable authenticated git clone.
 */

import { App } from "@octokit/app";
import type { GitHubAppConfig } from "./types";
import { GitHubAppError } from "./types";

// In-memory cache for failed lookups to avoid repeated API calls
// Map<"owner/repo", timestamp>
const failedLookupCache = new Map<string, number>();

// Cache failed lookups for 1 hour
const FAILED_LOOKUP_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Get GitHub App configuration from environment variables
 * @throws {GitHubAppError} If required environment variables are missing
 */
function getGitHubAppConfig(): GitHubAppConfig {
	const appId = process.env.GITHUB_APP_ID;
	const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

	if (!appId) {
		throw new GitHubAppError(
			"Missing GITHUB_APP_ID environment variable. Set this to your GitHub App ID from app settings.",
			"MISSING_APP_ID",
		);
	}

	if (!privateKey) {
		throw new GitHubAppError(
			"Missing GITHUB_APP_PRIVATE_KEY environment variable. Set this to your GitHub App's RSA private key in PEM format.",
			"MISSING_PRIVATE_KEY",
		);
	}

	return { appId, privateKey };
}

/**
 * Create an Octokit App instance for GitHub App authentication
 * @throws {GitHubAppError} If credentials are invalid
 */
function createAppClient(): App {
	const config = getGitHubAppConfig();

	try {
		return new App({
			appId: config.appId,
			privateKey: config.privateKey,
		});
	} catch (error) {
		throw new GitHubAppError(
			"Failed to initialize GitHub App client. Verify GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are valid.",
			"INVALID_CREDENTIALS",
			error,
		);
	}
}

/**
 * Check if a failed lookup is cached and still valid
 * @param fullName - Repository full name (owner/repo)
 * @returns true if lookup failed recently and should be skipped
 */
function isFailureCached(fullName: string): boolean {
	const cachedAt = failedLookupCache.get(fullName);
	if (!cachedAt) {
		return false;
	}

	const age = Date.now() - cachedAt;
	if (age > FAILED_LOOKUP_CACHE_TTL_MS) {
		// Cache expired, remove it
		failedLookupCache.delete(fullName);
		return false;
	}

	return true;
}

/**
 * Query GitHub App installations to find installation ID for a repository
 * @param owner - Repository owner (username or organization)
 * @param repo - Repository name
 * @returns Installation ID if found, null if not found or on error
 *
 * This function:
 * 1. Lists all GitHub App installations
 * 2. For each installation, checks repository access
 * 3. Returns installation_id if repository is accessible
 * 4. Returns null and logs warning for API errors (rate limits, timeouts)
 * 5. Caches failed lookups to avoid repeated API calls
 */
export async function getInstallationForRepository(
	owner: string,
	repo: string,
): Promise<number | null> {
	const fullName = `${owner}/${repo}`;

	// Check failed lookup cache
	if (isFailureCached(fullName)) {
		process.stdout.write(
			`[Installation Lookup] Skipping cached failed lookup for ${fullName}\n`,
		);
		return null;
	}

	try {
		const app = createAppClient();

		process.stdout.write(
			`[Installation Lookup] Querying installations for ${fullName}\n`,
		);

		// List all installations for this GitHub App
		const { data: installations } = await app.octokit.request(
			"GET /app/installations",
		);

		process.stdout.write(
			`[Installation Lookup] Found ${installations.length} installation(s)\n`,
		);

		// Check each installation for repository access
		for (const installation of installations) {
			try {
				// Get repositories accessible by this installation
				const { data: reposResponse } = await app.octokit.request(
					"GET /user/installations/{installation_id}/repositories",
					{
						installation_id: installation.id,
					},
				);

				// Check if our repository is in the list
				const foundRepo = reposResponse.repositories.find(
					(r) => r.full_name.toLowerCase() === fullName.toLowerCase(),
				);

				if (foundRepo) {
					process.stdout.write(
						`[Installation Lookup] Found installation ${installation.id} for ${fullName}\n`,
					);
					return installation.id;
				}
			} catch (installationError: unknown) {
				// Log and continue to next installation
				const apiError = installationError as {
					response?: { status: number };
				};
				process.stderr.write(
					`[Installation Lookup] Error checking installation ${installation.id}: ${apiError.response?.status ?? "unknown"}\n`,
				);
				continue;
			}
		}

		// No installation found for this repository
		process.stdout.write(
			`[Installation Lookup] No installation found for ${fullName}\n`,
		);

		// Cache this failed lookup
		failedLookupCache.set(fullName, Date.now());

		return null;
	} catch (error: unknown) {
		// Type guard for error with response property
		const apiError = error as { response?: { status: number; data?: unknown } };

		// Log different error types
		if (apiError.response?.status === 401) {
			process.stderr.write(
				`[Installation Lookup] GitHub App authentication failed for ${fullName}. Verify GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.\n`,
			);
		} else if (apiError.response?.status === 403) {
			process.stderr.write(
				`[Installation Lookup] GitHub API rate limit exceeded for ${fullName}. Will retry later.\n`,
			);
		} else if (apiError.response?.status === 404) {
			process.stderr.write(
				`[Installation Lookup] GitHub App or repository ${fullName} not found.\n`,
			);
		} else {
			process.stderr.write(
				`[Installation Lookup] API error for ${fullName}: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}

		// Cache this failed lookup
		failedLookupCache.set(fullName, Date.now());

		// Return null for graceful fallback (unauthenticated clone attempt)
		return null;
	}
}

/**
 * Clear failed lookup cache for a specific repository or all repositories
 * @param fullName - Optional repository full name (owner/repo) to clear (clears all if omitted)
 */
export function clearFailedLookupCache(fullName?: string): void {
	if (fullName) {
		failedLookupCache.delete(fullName);
		process.stdout.write(
			`[Installation Lookup] Cleared failed lookup cache for ${fullName}\n`,
		);
	} else {
		failedLookupCache.clear();
		process.stdout.write(
			"[Installation Lookup] Cleared all failed lookup cache\n",
		);
	}
}

/**
 * Get failed lookup cache statistics for monitoring
 * @returns Number of cached failed lookups
 */
export function getFailedLookupCacheStats(): { size: number } {
	return { size: failedLookupCache.size };
}
