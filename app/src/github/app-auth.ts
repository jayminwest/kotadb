/**
 * GitHub App Authentication Module
 * Issue #259 - GitHub App installation token generation
 *
 * Generates and caches GitHub App installation access tokens with automatic refresh.
 * Tokens are cached in memory with 55-minute TTL (5-minute buffer before 1-hour expiry).
 */

import { App } from "@octokit/app";
import type {
	CachedToken,
	GitHubAppConfig,
	InstallationToken,
	TokenGenerationOptions,
} from "./types";
import { GitHubAppError } from "./types";

// In-memory token cache: Map<installationId, CachedToken>
const tokenCache = new Map<number, CachedToken>();

// Token refresh threshold: 5 minutes before expiry (in milliseconds)
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

// Cache size limit to prevent memory leaks
const MAX_CACHE_SIZE = 1000;

// Cache eviction age: 24 hours of inactivity
const CACHE_EVICTION_AGE_MS = 24 * 60 * 60 * 1000;

// Last access timestamps for cache eviction
const lastAccessTime = new Map<number, number>();

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
 * Evict old cache entries to prevent memory leaks
 * Removes entries that haven't been accessed in 24 hours
 */
function evictStaleTokens(): void {
	const now = Date.now();
	const staleInstallationIds: number[] = [];

	for (const [installationId, lastAccess] of lastAccessTime.entries()) {
		if (now - lastAccess > CACHE_EVICTION_AGE_MS) {
			staleInstallationIds.push(installationId);
		}
	}

	for (const installationId of staleInstallationIds) {
		tokenCache.delete(installationId);
		lastAccessTime.delete(installationId);
		console.log(
			`[GitHub App] Evicted stale token for installation ${installationId}`,
		);
	}
}

/**
 * Enforce cache size limit by removing oldest entries
 */
function enforceCacheSizeLimit(): void {
	if (tokenCache.size <= MAX_CACHE_SIZE) {
		return;
	}

	// Sort by last access time and remove oldest entries
	const sorted = Array.from(lastAccessTime.entries()).sort(
		(a, b) => a[1] - b[1],
	);
	const toRemove = sorted.slice(0, tokenCache.size - MAX_CACHE_SIZE);

	for (const [installationId] of toRemove) {
		tokenCache.delete(installationId);
		lastAccessTime.delete(installationId);
		console.log(
			`[GitHub App] Evicted token for installation ${installationId} (cache size limit)`,
		);
	}
}

/**
 * Generate a new installation access token from GitHub API
 * @param installationId - GitHub App installation ID
 * @param options - Optional token generation parameters
 * @returns Installation access token
 * @throws {GitHubAppError} If token generation fails
 */
async function generateInstallationToken(
	installationId: number,
	options?: Omit<TokenGenerationOptions, "installationId">,
): Promise<InstallationToken> {
	const app = createAppClient();

	try {
		console.log(
			`[GitHub App] Generating token for installation ${installationId}`,
		);

		// Create installation access token using Octokit App SDK
		const response = await app.octokit.request(
			"POST /app/installations/{installation_id}/access_tokens",
			{
				installation_id: installationId,
				repository_ids: options?.repositoryIds,
			},
		);

		const token: InstallationToken = {
			token: response.data.token,
			expires_at: response.data.expires_at,
			permissions: response.data.permissions,
			repository_selection: response.data.repository_selection as
				| "all"
				| "selected",
		};

		console.log(
			`[GitHub App] Token generated for installation ${installationId}, expires at ${token.expires_at}`,
		);

		return token;
	} catch (error: unknown) {
		// Type guard for error with response property
		const apiError = error as { response?: { status: number; data?: unknown } };

		if (apiError.response?.status === 404) {
			throw new GitHubAppError(
				`Installation ${installationId} not found. Verify the installation ID is correct.`,
				"INSTALLATION_NOT_FOUND",
				error,
			);
		}

		if (apiError.response?.status === 401) {
			throw new GitHubAppError(
				"GitHub App authentication failed. Verify GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are correct.",
				"AUTHENTICATION_FAILED",
				error,
			);
		}

		throw new GitHubAppError(
			`Failed to generate installation token: ${error instanceof Error ? error.message : String(error)}`,
			"TOKEN_GENERATION_FAILED",
			error,
		);
	}
}

/**
 * Get installation access token with caching and automatic refresh
 * @param installationId - GitHub App installation ID
 * @param options - Optional token generation parameters
 * @returns Cached or newly generated access token
 * @throws {GitHubAppError} If token generation fails
 */
export async function getInstallationToken(
	installationId: number,
	options?: Omit<TokenGenerationOptions, "installationId">,
): Promise<string> {
	// Update last access time
	lastAccessTime.set(installationId, Date.now());

	// Run cache maintenance periodically (every 100th call)
	if (Math.random() < 0.01) {
		evictStaleTokens();
		enforceCacheSizeLimit();
	}

	// Check if we have a cached token
	const cached = tokenCache.get(installationId);
	const now = Date.now();

	if (cached) {
		// Return cached token if it's still valid (more than 5 minutes remaining)
		if (cached.expiresAt - now > REFRESH_THRESHOLD_MS) {
			console.log(
				`[GitHub App] Using cached token for installation ${installationId}`,
			);
			return cached.token;
		}

		console.log(
			`[GitHub App] Token for installation ${installationId} is expiring soon, refreshing`,
		);
	}

	// Generate new token
	const tokenResponse = await generateInstallationToken(
		installationId,
		options,
	);

	// Cache the token
	const expiresAt = new Date(tokenResponse.expires_at).getTime();
	tokenCache.set(installationId, {
		token: tokenResponse.token,
		expiresAt,
	});

	return tokenResponse.token;
}

/**
 * Clear cached token for a specific installation or all installations
 * @param installationId - Optional installation ID to clear (clears all if omitted)
 */
export function clearTokenCache(installationId?: number): void {
	if (installationId !== undefined) {
		tokenCache.delete(installationId);
		lastAccessTime.delete(installationId);
		console.log(
			`[GitHub App] Cleared token cache for installation ${installationId}`,
		);
	} else {
		tokenCache.clear();
		lastAccessTime.clear();
		console.log("[GitHub App] Cleared all token cache");
	}
}

/**
 * Get cache statistics for monitoring
 * @returns Cache size and oldest entry age
 */
export function getCacheStats(): {
	size: number;
	oldestEntryAgeMs: number | null;
} {
	const now = Date.now();
	let oldestAge: number | null = null;

	for (const lastAccess of lastAccessTime.values()) {
		const age = now - lastAccess;
		if (oldestAge === null || age > oldestAge) {
			oldestAge = age;
		}
	}

	return {
		size: tokenCache.size,
		oldestEntryAgeMs: oldestAge,
	};
}
