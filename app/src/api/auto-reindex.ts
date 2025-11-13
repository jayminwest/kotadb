/**
 * Auto-reindex trigger logic for session-based repository synchronization.
 *
 * Automatically triggers reindexing for stale repositories when authenticated
 * clients connect, with rate limiting to prevent spam.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthContext } from "@shared/types";
import { getServiceClient } from "@db/client";
import { createIndexJob } from "@queue/job-tracker";
import { getQueue, getDefaultSendOptions } from "@queue/client";
import { QUEUE_NAMES } from "@queue/config";
import type { IndexRepoJobPayload } from "@queue/types";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "api-auto-reindex" });

/**
 * Default reindex threshold in minutes.
 * Repositories older than this will be reindexed.
 */
const DEFAULT_REINDEX_THRESHOLD_MINUTES = 60;

/**
 * Rate limit threshold in minutes.
 * Auto-reindex will not trigger again within this window.
 */
const RATE_LIMIT_THRESHOLD_MINUTES = 30;

/**
 * Auto-reindex result containing triggered job information.
 */
export interface AutoReindexResult {
	triggered: boolean;
	jobCount: number;
	jobIds: string[];
	rateLimited?: boolean;
	reason?: string;
}

/**
 * Check if auto-reindex should trigger for this request.
 *
 * Rate limiting logic:
 * 1. Check api_keys.metadata.last_auto_reindex_at
 * 2. If within RATE_LIMIT_THRESHOLD_MINUTES, skip trigger
 * 3. Otherwise, proceed with reindex check
 *
 * @param keyId - API key UUID
 * @returns True if should trigger, false if rate limited
 */
async function shouldTriggerAutoReindex(keyId: string): Promise<boolean> {
	const client = getServiceClient();

	try {
		const { data: apiKey, error } = await client
			.from("api_keys")
			.select("metadata, last_used_at")
			.eq("id", keyId)
			.single();

		if (error || !apiKey) {
			logger.warn("Failed to fetch API key for rate limit check", {
				key_id: keyId,
				error: error?.message,
			});
			// Fail open: allow trigger if we can't check rate limit
			return true;
		}

		// Check if last auto-reindex timestamp exists in metadata
		const lastAutoReindex = apiKey.metadata?.last_auto_reindex_at;

		if (!lastAutoReindex) {
			// Never triggered before, allow trigger
			logger.info("First auto-reindex for key", { key_id: keyId });
			return true;
		}

		// Parse timestamp and check if within threshold
		const lastTrigger = new Date(lastAutoReindex);
		const now = new Date();
		const minutesSinceLastTrigger = (now.getTime() - lastTrigger.getTime()) / (1000 * 60);

		if (minutesSinceLastTrigger < RATE_LIMIT_THRESHOLD_MINUTES) {
			logger.info("Auto-reindex rate limited", {
				key_id: keyId,
				minutes_since_last: minutesSinceLastTrigger,
				threshold_minutes: RATE_LIMIT_THRESHOLD_MINUTES,
			});
			return false;
		}

		logger.info("Auto-reindex rate limit passed", {
			key_id: keyId,
			minutes_since_last: minutesSinceLastTrigger,
		});
		return true;
	} catch (error) {
		Sentry.captureException(error, {
			extra: { key_id: keyId, operation: "shouldTriggerAutoReindex" },
		});
		logger.error("Error checking auto-reindex rate limit", error instanceof Error ? error : { error: String(error) }, {
			key_id: keyId,
		});
		// Fail open: allow trigger if error occurs
		return true;
	}
}

/**
 * Update last auto-reindex timestamp in api_keys.metadata.
 *
 * @param keyId - API key UUID
 */
async function updateAutoReindexTimestamp(keyId: string): Promise<void> {
	const client = getServiceClient();

	try {
		const now = new Date().toISOString();

		const { error } = await client
			.from("api_keys")
			.update({
				metadata: {
					last_auto_reindex_at: now,
				},
			})
			.eq("id", keyId);

		if (error) {
			Sentry.captureException(error, {
				extra: { key_id: keyId, operation: "updateAutoReindexTimestamp" },
			});
			logger.error("Failed to update auto-reindex timestamp", {
				error: error.message,
				key_id: keyId,
			});
		} else {
			logger.info("Updated auto-reindex timestamp", {
				key_id: keyId,
				timestamp: now,
			});
		}
	} catch (error) {
		Sentry.captureException(error, {
			extra: { key_id: keyId, operation: "updateAutoReindexTimestamp" },
		});
		logger.error("Error updating auto-reindex timestamp", error instanceof Error ? error : { error: String(error) }, {
			key_id: keyId,
		});
	}
}

/**
 * Trigger auto-reindex for authenticated user's project repositories.
 *
 * Process:
 * 1. Check rate limit (last auto-reindex timestamp)
 * 2. Query all projects for user
 * 3. For each project, get associated repositories
 * 4. Check if repository is stale (older than threshold)
 * 5. Enqueue indexing jobs for stale repositories
 * 6. Update last auto-reindex timestamp
 *
 * @param context - Authentication context with user ID and key ID
 * @returns Auto-reindex result with job count and IDs
 */
export async function triggerAutoReindex(
	context: AuthContext,
): Promise<AutoReindexResult> {
	const { userId, keyId } = context;

	logger.info("Auto-reindex triggered", {
		user_id: userId,
		key_id: keyId,
	});

	// Check rate limit
	const shouldTrigger = await shouldTriggerAutoReindex(keyId);

	if (!shouldTrigger) {
		return {
			triggered: false,
			jobCount: 0,
			jobIds: [],
			rateLimited: true,
			reason: `Rate limited: auto-reindex triggered within last ${RATE_LIMIT_THRESHOLD_MINUTES} minutes`,
		};
	}

	const client = getServiceClient();
	const queue = getQueue();

	try {
		// Get reindex threshold from env or use default
		const thresholdMinutes = process.env.KOTADB_AUTO_REINDEX_THRESHOLD_MINUTES
			? parseInt(process.env.KOTADB_AUTO_REINDEX_THRESHOLD_MINUTES, 10)
			: DEFAULT_REINDEX_THRESHOLD_MINUTES;

		const thresholdDate = new Date(Date.now() - thresholdMinutes * 60 * 1000);

		logger.info("Checking for stale repositories", {
			user_id: userId,
			threshold_minutes: thresholdMinutes,
			threshold_date: thresholdDate.toISOString(),
		});

		// Query all projects for user
		const { data: projects, error: projectsError } = await client
			.from("projects")
			.select("id, name")
			.eq("user_id", userId);

		if (projectsError) {
			Sentry.captureException(projectsError, {
				extra: { user_id: userId, operation: "fetchProjects" },
			});
			logger.error("Failed to fetch user projects", {
				error: projectsError.message,
				user_id: userId,
			});
			return {
				triggered: false,
				jobCount: 0,
				jobIds: [],
				reason: "Failed to fetch projects",
			};
		}

		if (!projects || projects.length === 0) {
			logger.info("No projects found for user", { user_id: userId });
			return {
				triggered: false,
				jobCount: 0,
				jobIds: [],
				reason: "No projects configured",
			};
		}

		logger.info("Found projects for user", {
			user_id: userId,
			project_count: projects.length,
		});

		// Collect all repository IDs from all projects
		const projectIds = projects.map((p) => p.id);

		const { data: projectRepos, error: reposError } = await client
			.from("project_repositories")
			.select("repository_id")
			.in("project_id", projectIds);

		if (reposError) {
			Sentry.captureException(reposError, {
				extra: { user_id: userId, project_ids: projectIds },
			});
			logger.error("Failed to fetch project repositories", {
				error: reposError.message,
				user_id: userId,
			});
			return {
				triggered: false,
				jobCount: 0,
				jobIds: [],
				reason: "Failed to fetch repositories",
			};
		}

		if (!projectRepos || projectRepos.length === 0) {
			logger.info("No repositories in projects", { user_id: userId });
			return {
				triggered: false,
				jobCount: 0,
				jobIds: [],
				reason: "No repositories in projects",
			};
		}

		const repositoryIds = Array.from(new Set(projectRepos.map((pr) => pr.repository_id)));

		logger.info("Found repositories in projects", {
			user_id: userId,
			repository_count: repositoryIds.length,
		});

		// Check which repositories are stale
		const { data: repositories, error: staleError } = await client
			.from("repositories")
			.select("id, git_url, default_branch, updated_at")
			.in("id", repositoryIds)
			.lt("updated_at", thresholdDate.toISOString());

		if (staleError) {
			Sentry.captureException(staleError, {
				extra: { user_id: userId, repository_ids: repositoryIds },
			});
			logger.error("Failed to check stale repositories", {
				error: staleError.message,
				user_id: userId,
			});
			return {
				triggered: false,
				jobCount: 0,
				jobIds: [],
				reason: "Failed to check repository staleness",
			};
		}

		if (!repositories || repositories.length === 0) {
			logger.info("No stale repositories found", {
				user_id: userId,
				checked_count: repositoryIds.length,
			});
			// Update timestamp even if no repos were stale
			await updateAutoReindexTimestamp(keyId);
			return {
				triggered: false,
				jobCount: 0,
				jobIds: [],
				reason: "All repositories are up to date",
			};
		}

		logger.info("Found stale repositories", {
			user_id: userId,
			stale_count: repositories.length,
		});

		// Enqueue indexing jobs for stale repositories
		const jobIds: string[] = [];

		for (const repo of repositories) {
			try {
				// Create index job record
				const job = await createIndexJob(
					repo.id,
					repo.default_branch ?? "HEAD",
					undefined, // commit_sha
					userId,
				);

				// Enqueue pg-boss job
				const payload: IndexRepoJobPayload = {
					indexJobId: job.id,
					repositoryId: repo.id,
					commitSha: undefined,
				};

				await queue.send(
					QUEUE_NAMES.INDEX_REPO,
					payload,
					getDefaultSendOptions(),
				);

				jobIds.push(job.id);

				logger.info("Enqueued auto-reindex job", {
					job_id: job.id,
					repository_id: repo.id,
					git_url: repo.git_url,
					user_id: userId,
				});
			} catch (error) {
				Sentry.captureException(error, {
					extra: {
						user_id: userId,
						repository_id: repo.id,
						git_url: repo.git_url,
					},
				});
				logger.error("Failed to enqueue auto-reindex job", error instanceof Error ? error : { error: String(error) }, {
					repository_id: repo.id,
					git_url: repo.git_url,
					user_id: userId,
				});
				// Continue with other repositories even if one fails
			}
		}

		// Update last auto-reindex timestamp
		await updateAutoReindexTimestamp(keyId);

		logger.info("Auto-reindex completed", {
			user_id: userId,
			jobs_enqueued: jobIds.length,
		});

		return {
			triggered: true,
			jobCount: jobIds.length,
			jobIds,
		};
	} catch (error) {
		Sentry.captureException(error, {
			extra: { user_id: userId, key_id: keyId, operation: "triggerAutoReindex" },
		});
		logger.error("Error in auto-reindex workflow", error instanceof Error ? error : { error: String(error) }, {
			user_id: userId,
			key_id: keyId,
		});
		return {
			triggered: false,
			jobCount: 0,
			jobIds: [],
			reason: "Internal error during auto-reindex",
		};
	}
}
