/**
 * GitHub API integration for PR and branch conflict detection
 *
 * Features:
 * - Graceful degradation when GITHUB_TOKEN is not available
 * - In-memory caching with 5-minute TTL for rate limit optimization
 * - Query open PRs for file overlap detection
 * - Check branch existence and modification timestamps
 */

import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";
import type { ConflictInfo } from "@shared/types";

const logger = createLogger({ module: "mcp-github-integration" });

interface PullRequest {
	number: number;
	title: string;
	head: {
		ref: string;
	};
	files?: Array<{
		filename: string;
		status: string;
	}>;
}

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

/**
 * GitHub API client with graceful degradation
 */
export class GitHubClient {
	private token: string | null;
	private baseUrl = "https://api.github.com";
	private cache = new Map<string, CacheEntry<unknown>>();
	private cacheTTL = 5 * 60 * 1000; // 5 minutes

	constructor(token?: string) {
		this.token = token ?? process.env.GITHUB_TOKEN ?? null;
	}

	/**
	 * Check if GitHub token is available
	 */
	isAvailable(): boolean {
		return this.token !== null;
	}

	/**
	 * Get cached data or fetch from API
	 */
	private async getCached<T>(
		key: string,
		fetcher: () => Promise<T>,
	): Promise<T> {
		const cached = this.cache.get(key) as CacheEntry<T> | undefined;
		if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
			return cached.data;
		}

		const data = await fetcher();
		this.cache.set(key, { data, timestamp: Date.now() });
		return data;
	}

	/**
	 * Query open PRs for a repository
	 *
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 * @returns List of open PRs
	 */
	async queryOpenPRs(owner: string, repo: string): Promise<PullRequest[]> {
		if (!this.isAvailable()) {
			logger.info("No GitHub token available, skipping PR query", { owner, repo });
			return [];
		}

		const cacheKey = `prs:${owner}/${repo}`;
		return await this.getCached(cacheKey, async () => {
			const url = `${this.baseUrl}/repos/${owner}/${repo}/pulls?state=open`;

			try {
				const response = await fetch(url, {
					headers: {
						Authorization: `Bearer ${this.token}`,
						Accept: "application/vnd.github+json",
						"X-GitHub-Api-Version": "2022-11-28",
					},
				});

				if (!response.ok) {
					const error = new Error(`Failed to query PRs: ${response.status} ${response.statusText}`);
					logger.error("GitHub API error when querying PRs", error, {
						owner,
						repo,
						status: response.status,
					});
					Sentry.captureException(error, {
						tags: { owner, repo, status: response.status },
					});
					return [];
				}

				return (await response.json()) as PullRequest[];
			} catch (error) {
				logger.error("Failed to query PRs", error instanceof Error ? error : new Error(String(error)), {
					owner,
					repo,
				});
				Sentry.captureException(error, {
					tags: { owner, repo },
				});
				return [];
			}
		});
	}

	/**
	 * Get files changed in a specific PR
	 *
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 * @param prNumber - PR number
	 * @returns List of changed files
	 */
	async getPRFiles(
		owner: string,
		repo: string,
		prNumber: number,
	): Promise<string[]> {
		if (!this.isAvailable()) {
			return [];
		}

		const cacheKey = `pr-files:${owner}/${repo}:${prNumber}`;
		return await this.getCached(cacheKey, async () => {
			const url = `${this.baseUrl}/repos/${owner}/${repo}/pulls/${prNumber}/files`;

			try {
				const response = await fetch(url, {
					headers: {
						Authorization: `Bearer ${this.token}`,
						Accept: "application/vnd.github+json",
						"X-GitHub-Api-Version": "2022-11-28",
					},
				});

				if (!response.ok) {
					const error = new Error(`Failed to query PR files: ${response.status} ${response.statusText}`);
					logger.error("GitHub API error when querying PR files", error, {
						owner,
						repo,
						pr_number: prNumber,
						status: response.status,
					});
					Sentry.captureException(error, {
						tags: { owner, repo, pr_number: prNumber, status: response.status },
					});
					return [];
				}

				const files = (await response.json()) as Array<{
					filename: string;
					status: string;
				}>;
				return files.map((f) => f.filename);
			} catch (error) {
				logger.error("Failed to query PR files", error instanceof Error ? error : new Error(String(error)), {
					owner,
					repo,
					pr_number: prNumber,
				});
				Sentry.captureException(error, {
					tags: { owner, repo, pr_number: prNumber },
				});
				return [];
			}
		});
	}

	/**
	 * Detect file conflicts with open PRs
	 *
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 * @param filePaths - Files to check for conflicts
	 * @returns List of detected conflicts
	 */
	async detectFileConflicts(
		owner: string,
		repo: string,
		filePaths: string[],
	): Promise<ConflictInfo[]> {
		if (!this.isAvailable()) {
			logger.info("No GitHub token available, skipping conflict detection", { owner, repo });
			return [];
		}

		try {
			const openPRs = await this.queryOpenPRs(owner, repo);
			const conflicts: ConflictInfo[] = [];

			for (const pr of openPRs) {
				const prFiles = await this.getPRFiles(owner, repo, pr.number);
				const overlappingFiles = filePaths.filter((path) =>
					prFiles.includes(path),
				);

				if (overlappingFiles.length > 0) {
					conflicts.push({
						type: "pr",
						description: `PR #${pr.number} (${pr.title}) modifies overlapping files: ${overlappingFiles.join(", ")}`,
						severity: "warning",
						metadata: {
							pr_number: pr.number,
							pr_title: pr.title,
							overlapping_files: overlappingFiles,
						},
					});
				}
			}

			logger.debug("File conflict detection completed", {
				owner,
				repo,
				conflicts_found: conflicts.length,
			});

			return conflicts;
		} catch (error) {
			logger.error("Error detecting conflicts", error instanceof Error ? error : new Error(String(error)), {
				owner,
				repo,
			});
			Sentry.captureException(error, {
				tags: { owner, repo },
			});
			return [];
		}
	}

	/**
	 * Check if a branch exists
	 *
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 * @param branch - Branch name
	 * @returns Whether the branch exists
	 */
	async checkBranchExists(
		owner: string,
		repo: string,
		branch: string,
	): Promise<boolean> {
		if (!this.isAvailable()) {
			return false;
		}

		const cacheKey = `branch:${owner}/${repo}:${branch}`;
		return await this.getCached(cacheKey, async () => {
			const url = `${this.baseUrl}/repos/${owner}/${repo}/branches/${branch}`;

			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${this.token}`,
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
			});

			return response.ok;
		});
	}
}

/**
 * Get a singleton GitHub client instance
 */
let githubClient: GitHubClient | null = null;

export function getGitHubClient(): GitHubClient {
	if (!githubClient) {
		githubClient = new GitHubClient();
	}
	return githubClient;
}
