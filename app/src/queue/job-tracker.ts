/**
 * Job tracking data access layer for index_jobs table.
 *
 * Provides core functions for creating, updating, and querying job status.
 * Bridges pg-boss queue operations (once #235 lands) with user-facing API.
 */

import { getServiceClient, setUserContext } from "@db/client";
import type { IndexJob } from "@shared/types/entities";
import type { JobMetadata, JobStatus } from "./types";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "queue-job-tracker" });

/**
 * Create a new index job record in pending state.
 *
 * @param repositoryId - UUID of repository to index
 * @param ref - Git ref to index (branch, tag, or commit)
 * @param commitSha - Git commit SHA for job context (optional)
 * @param userId - User UUID for RLS context
 * @returns Created job record with UUID
 * @throws Error if repository not found or database insert fails
 */
export async function createIndexJob(
	repositoryId: string,
	ref: string,
	commitSha: string | undefined,
	userId: string,
): Promise<IndexJob> {
	try {
		const client = getServiceClient();
		// Set user context for RLS policy evaluation
		// Service role can bypass RLS, but setting context ensures policies match correctly
		await setUserContext(client, userId);

		logger.info("Creating index job", {
			repository_id: repositoryId,
			ref,
			commit_sha: commitSha,
			user_id: userId,
		});

		const { data, error } = await client
			.from("index_jobs")
			.insert({
				repository_id: repositoryId,
				ref,
				status: "pending",
				commit_sha: commitSha,
			})
			.select()
			.single();

		if (error) {
			Sentry.captureException(error, {
				contexts: {
					job: {
						repository_id: repositoryId,
						ref,
						commit_sha: commitSha,
						user_id: userId,
					},
				},
			});
			logger.error("Failed to create index job", {
				error: error.message,
				repository_id: repositoryId,
				ref,
				user_id: userId,
			});
			throw new Error(`Failed to create index job: ${error.message}`);
		}

		logger.info("Index job created successfully", {
			job_id: data.id,
			repository_id: repositoryId,
			ref,
		});

		return data as IndexJob;
	} catch (error) {
		if (error instanceof Error && !error.message.includes("Failed to create index job")) {
			Sentry.captureException(error, {
				contexts: {
					job: {
						repository_id: repositoryId,
						ref,
						commit_sha: commitSha,
						user_id: userId,
					},
				},
			});
			logger.error("Unexpected error creating index job", {
				error: error.message,
				repository_id: repositoryId,
				user_id: userId,
			});
		}
		throw error;
	}
}

/**
 * Update job status with timestamps and metadata.
 *
 * Captures timestamps based on status transitions:
 * - pending → processing: sets started_at
 * - processing → completed/failed: sets completed_at
 *
 * @param jobId - UUID of job to update
 * @param status - New status value
 * @param metadata - Optional error message or stats
 * @param userId - User UUID for RLS context
 * @returns Updated job record
 * @throws Error if job not found or update fails
 */
export async function updateJobStatus(
	jobId: string,
	status: JobStatus,
	metadata: JobMetadata | undefined,
	userId: string,
): Promise<IndexJob> {
	try {
		const client = getServiceClient();
		// Set user context for RLS policy evaluation
		// Service role can bypass RLS, but setting context ensures policies match correctly
		await setUserContext(client, userId);

		logger.info("Updating job status", {
			job_id: jobId,
			new_status: status,
			has_error: !!metadata?.error,
			has_stats: !!metadata?.stats,
			user_id: userId,
		});

		// Build update payload with conditional timestamp logic
		const updates: Record<string, unknown> = { status };

		// Increment retry count when reprocessing a failed job
		const { data: currentJob, error: fetchError } = await client
			.from("index_jobs")
			.select("status, retry_count")
			.eq("id", jobId)
			.single();

		if (fetchError) {
			Sentry.captureException(fetchError, {
				contexts: {
					job: {
						job_id: jobId,
						user_id: userId,
						operation: "fetch_current_status",
					},
				},
			});
			logger.error("Failed to fetch current job status", {
				error: fetchError.message,
				job_id: jobId,
				user_id: userId,
			});
		}

		if (currentJob?.status === "failed" && status === "processing") {
			const retryCount = (currentJob.retry_count || 0) + 1;
			updates.retry_count = retryCount;
			logger.info("Incrementing retry count", {
				job_id: jobId,
				retry_count: retryCount,
			});
		}

		// Capture started_at when transitioning to processing
		if (status === "processing") {
			updates.started_at = new Date().toISOString();
		}

		// Capture completed_at when job finishes (completed or failed)
		if (status === "completed" || status === "failed") {
			updates.completed_at = new Date().toISOString();
		}

		// Store error message if provided
		if (metadata?.error) {
			updates.error_message = metadata.error;
		}

		// Store stats if provided
		if (metadata?.stats) {
			updates.stats = metadata.stats;
		}

		const { data, error } = await client
			.from("index_jobs")
			.update(updates)
			.eq("id", jobId)
			.select();

		if (error) {
			Sentry.captureException(error, {
				contexts: {
					job: {
						job_id: jobId,
						new_status: status,
						user_id: userId,
						metadata,
					},
				},
			});
			logger.error("Failed to update job status", {
				error: error.message,
				job_id: jobId,
				new_status: status,
				user_id: userId,
			});
			throw new Error(`Failed to update job status: ${error.message}`);
		}

		if (!data || data.length === 0) {
			const notFoundError = new Error(`Job not found or access denied: ${jobId}`);
			Sentry.captureException(notFoundError, {
				contexts: {
					job: {
						job_id: jobId,
						user_id: userId,
					},
				},
			});
			logger.error("Job not found or access denied", {
				job_id: jobId,
				user_id: userId,
			});
			throw notFoundError;
		}

		if (data.length > 1) {
			logger.warn("Multiple jobs found for ID, using first result", {
				job_id: jobId,
				count: data.length,
			});
		}

		logger.info("Job status updated successfully", {
			job_id: jobId,
			new_status: status,
			previous_status: currentJob?.status,
		});

		return data[0] as IndexJob;
	} catch (error) {
		if (error instanceof Error && !error.message.includes("Failed to update job status") && !error.message.includes("Job not found or access denied")) {
			Sentry.captureException(error, {
				contexts: {
					job: {
						job_id: jobId,
						status,
						user_id: userId,
						metadata,
					},
				},
			});
			logger.error("Unexpected error updating job status", {
				error: error.message,
				job_id: jobId,
				status,
				user_id: userId,
			});
		}
		throw error;
	}
}

/**
 * Get current job status and details.
 *
 * Enforces user isolation by filtering jobs based on repository ownership.
 * Returns 404 for jobs that don't exist OR belong to other users (prevents existence leakage).
 *
 * Security: Uses service client with explicit user_id filtering to mimic RLS policy behavior.
 * The logic replicates the index_jobs RLS SELECT policy:
 * 1. Fetch the job
 * 2. Check if the repository belongs to the user or user's organization
 * 3. Return 404 if unauthorized (prevents information leakage)
 *
 * @param jobId - UUID of job to query
 * @param userId - User UUID for filtering
 * @returns Job record with full details
 * @throws Error if job not found or user lacks access (404, not 403)
 */
export async function getJobStatus(
	jobId: string,
	userId: string,
): Promise<IndexJob> {
	try {
		const client = getServiceClient();

		logger.info("Fetching job status", {
			job_id: jobId,
			user_id: userId,
		});

		// First, fetch the job
		const { data: job, error: jobError } = await client
			.from("index_jobs")
			.select("*")
			.eq("id", jobId)
			.single();

		if (jobError || !job) {
			Sentry.captureException(jobError || new Error("Job not found"), {
				contexts: {
					job: {
						job_id: jobId,
						user_id: userId,
					},
				},
			});
			logger.error("Job not found", {
				job_id: jobId,
				user_id: userId,
				error: jobError?.message,
			});
			throw new Error(`Job not found: ${jobId}`);
		}

		// Check if user has access to the repository
		const { data: repo, error: repoError } = await client
			.from("repositories")
			.select("id, user_id, org_id")
			.eq("id", job.repository_id)
			.single();

		if (repoError || !repo) {
			Sentry.captureException(repoError || new Error("Repository not found"), {
				contexts: {
					job: {
						job_id: jobId,
						repository_id: job.repository_id,
						user_id: userId,
					},
				},
			});
			logger.error("Repository not found for job", {
				job_id: jobId,
				repository_id: job.repository_id,
				user_id: userId,
				error: repoError?.message,
			});
			throw new Error(`Job not found: ${jobId}`);
		}

		// Check if user owns the repository directly
		if (repo.user_id === userId) {
			logger.info("Job access granted (user owner)", {
				job_id: jobId,
				repository_id: repo.id,
				user_id: userId,
			});
			return job as IndexJob;
		}

		// Check if repository belongs to an organization that the user is a member of
		if (repo.org_id) {
			const { data: membership } = await client
				.from("user_organizations")
				.select("user_id")
				.eq("org_id", repo.org_id)
				.eq("user_id", userId)
				.maybeSingle();

			if (membership) {
				logger.info("Job access granted (org member)", {
					job_id: jobId,
					repository_id: repo.id,
					org_id: repo.org_id,
					user_id: userId,
				});
				return job as IndexJob;
			}
		}

		// User has no access - return 404 (not 403) to avoid leaking job existence
		logger.warn("Job access denied", {
			job_id: jobId,
			repository_id: repo.id,
			user_id: userId,
		});
		throw new Error(`Job not found: ${jobId}`);
	} catch (error) {
		if (error instanceof Error && !error.message.includes("Job not found")) {
			Sentry.captureException(error, {
				contexts: {
					job: {
						job_id: jobId,
						user_id: userId,
					},
				},
			});
			logger.error("Unexpected error fetching job status", {
				error: error.message,
				job_id: jobId,
				user_id: userId,
			});
		}
		throw error;
	}
}
