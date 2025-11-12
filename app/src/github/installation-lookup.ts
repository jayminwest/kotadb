/**
 * GitHub Installation Lookup Module
 * Issue #363 - Populate installation_id for manual repository indexing
 *
 * Queries GitHub App installations to find installation ID for a given repository.
 * Used during manual repository creation via /index API to enable authenticated git clone.
 */

import { App } from "@octokit/app";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";
import type { GitHubAppConfig } from "./types";
import { GitHubAppError } from "./types";
import { getOctokitForInstallation } from "./client";

const logger = createLogger({ module: "github-installation-lookup" });

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

	// Log environment variable presence for production debugging
	logger.info("GitHub App config check", {
		github_app_id: appId ? "present" : "missing",
		github_app_private_key: privateKey ? "present" : "missing",
	});

	if (!appId) {
		const error = new GitHubAppError(
			"Missing GITHUB_APP_ID environment variable. Set this to your GitHub App ID from app settings.",
			"MISSING_APP_ID",
		);
		logger.error("Missing GITHUB_APP_ID environment variable", error);
		Sentry.captureException(error);
		throw error;
	}

	if (!privateKey) {
		const error = new GitHubAppError(
			"Missing GITHUB_APP_PRIVATE_KEY environment variable. Set this to your GitHub App's RSA private key in PEM format.",
			"MISSING_PRIVATE_KEY",
		);
		logger.error("Missing GITHUB_APP_PRIVATE_KEY environment variable", error);
		Sentry.captureException(error);
		throw error;
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
		const appError = new GitHubAppError(
			"Failed to initialize GitHub App client. Verify GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are valid.",
			"INVALID_CREDENTIALS",
			error,
		);
		logger.error("Failed to initialize GitHub App client", appError);
		Sentry.captureException(appError);
		throw appError;
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
		const cachedAt = failedLookupCache.get(fullName);
		const ageMinutes = cachedAt
			? Math.floor((Date.now() - cachedAt) / 60000)
			: 0;
		logger.info("Skipping cached failed lookup", {
			repository: fullName,
			cached_minutes_ago: ageMinutes,
			ttl_minutes: 60,
		});
		return null;
	}

	try {
		const app = createAppClient();

		logger.info("Querying GitHub App installations", {
			repository: fullName,
		});

		// List all installations for this GitHub App
		const { data: installations } = await app.octokit.request(
			"GET /app/installations",
		);

		logger.info("Found GitHub App installations", {
			repository: fullName,
			installation_count: installations.length,
		});

		// Check each installation for repository access
		for (const installation of installations) {
			try {
				// Generate installation token and create authenticated Octokit client
				const installationOctokit =
					await getOctokitForInstallation(installation.id);

				// Get repositories accessible by this installation
				const { data } = await installationOctokit.request(
					"GET /installation/repositories",
				);

				// Check if our repository is in the list
				const foundRepo = data.repositories.find(
					(r) => r.full_name.toLowerCase() === fullName.toLowerCase(),
				);

				if (foundRepo) {
					logger.info("Found GitHub App installation for repository", {
						repository: fullName,
						installation_id: installation.id,
					});
					return installation.id;
				}
			} catch (installationError: unknown) {
				// Handle token generation or API errors
				const apiError = installationError as {
					response?: { status: number };
					message?: string;
				};

				// Log specific error context for debugging
				if (installationError instanceof GitHubAppError) {
					logger.warn("Token generation failed for installation", {
						installation_id: installation.id,
						error_code: installationError.code,
					});
					Sentry.captureException(installationError);
				} else {
					logger.warn("Error checking installation", {
						installation_id: installation.id,
						status: apiError.response?.status,
						message: apiError.message,
					});
					if (installationError instanceof Error) {
						Sentry.captureException(installationError);
					}
				}
				continue;
			}
		}

		// No installation found for this repository
		logger.info("No GitHub App installation found for repository", {
			repository: fullName,
		});

		// Cache this failed lookup
		failedLookupCache.set(fullName, Date.now());

		return null;
	} catch (error: unknown) {
		// Type guard for error with response property
		const apiError = error as { response?: { status: number; data?: unknown } };

		// Log different error types
		if (apiError.response?.status === 401) {
			logger.error(
				"GitHub App authentication failed",
				error instanceof Error ? error : new Error(String(error)),
				{
					repository: fullName,
					status: 401,
				},
			);
			Sentry.captureException(error);
		} else if (apiError.response?.status === 403) {
			logger.warn("GitHub API rate limit exceeded", {
				repository: fullName,
				status: 403,
			});
			Sentry.captureException(error);
		} else if (apiError.response?.status === 404) {
			logger.warn("GitHub App or repository not found", {
				repository: fullName,
				status: 404,
			});
			Sentry.captureException(error);
		} else {
			logger.error(
				"GitHub API error during installation lookup",
				error instanceof Error ? error : new Error(String(error)),
				{
					repository: fullName,
					status: apiError.response?.status,
				},
			);
			Sentry.captureException(error);
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
		logger.info("Cleared failed lookup cache for repository", {
			repository: fullName,
		});
	} else {
		failedLookupCache.clear();
		logger.info("Cleared all failed lookup cache");
	}
}

/**
 * Get failed lookup cache statistics for monitoring
 * @returns Number of cached failed lookups
 */
export function getFailedLookupCacheStats(): { size: number } {
	return { size: failedLookupCache.size };
}
