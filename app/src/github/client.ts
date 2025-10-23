/**
 * GitHub Octokit Client Factory
 * Issue #259 - GitHub App installation token generation
 *
 * Provides authenticated Octokit REST clients for GitHub API operations using installation tokens.
 */

import { Octokit } from "@octokit/rest";
import { getInstallationToken } from "./app-auth";
import type { TokenGenerationOptions } from "./types";

/**
 * Create an authenticated Octokit REST client for a specific installation
 * @param installationId - GitHub App installation ID
 * @param options - Optional token generation parameters
 * @returns Authenticated Octokit client
 * @throws {GitHubAppError} If token generation fails
 *
 * @example
 * ```typescript
 * const octokit = await getOctokitForInstallation(12345);
 * const repo = await octokit.repos.get({ owner: 'foo', repo: 'bar' });
 * ```
 */
export async function getOctokitForInstallation(
	installationId: number,
	options?: Omit<TokenGenerationOptions, "installationId">,
): Promise<Octokit> {
	const token = await getInstallationToken(installationId, options);

	return new Octokit({
		auth: token,
		userAgent: "KotaDB/1.0",
	});
}

/**
 * Create an unauthenticated Octokit client for public API access
 * @returns Unauthenticated Octokit client with rate limit constraints
 *
 * @example
 * ```typescript
 * const octokit = getPublicOctokit();
 * const repo = await octokit.repos.get({ owner: 'foo', repo: 'bar' });
 * ```
 */
export function getPublicOctokit(): Octokit {
	return new Octokit({
		userAgent: "KotaDB/1.0",
	});
}
