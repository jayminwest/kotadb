/**
 * GitHub Octokit Client Factory
 * Issue #259 - GitHub App installation token generation
 *
 * Provides authenticated Octokit REST clients for GitHub API operations using installation tokens.
 */

import { Octokit } from "@octokit/rest";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";
import { getInstallationToken } from "./app-auth";
import type { TokenGenerationOptions } from "./types";

const logger = createLogger({ module: "github-client" });

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
	try {
		logger.info("Creating authenticated Octokit client", {
			installation_id: installationId,
		});

		const token = await getInstallationToken(installationId, options);

		return new Octokit({
			auth: token,
			userAgent: "KotaDB/1.0",
		});
	} catch (error) {
		logger.error(
			"Failed to create authenticated Octokit client",
			error instanceof Error ? error : new Error(String(error)),
			{
				installation_id: installationId,
			},
		);
		Sentry.captureException(error);
		throw error;
	}
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
	logger.info("Creating public Octokit client");

	return new Octokit({
		userAgent: "KotaDB/1.0",
	});
}
