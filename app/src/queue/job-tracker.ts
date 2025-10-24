/**
 * Job tracking data access layer for index_jobs table.
 *
 * Provides core functions for creating, updating, and querying job status.
 * Bridges pg-boss queue operations (once #235 lands) with user-facing API.
 */

import { getServiceClient } from "@db/client";
import type { IndexJob } from "@shared/types/entities";
import type { JobMetadata, JobStatus } from "./types";

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
	const client = getServiceClient();
	// Service role client bypasses RLS - no need to set user context
	// Job tracking is internal infrastructure that requires reliable access

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
		throw new Error(`Failed to create index job: ${error.message}`);
	}

	return data as IndexJob;
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
	const client = getServiceClient();
	// Service role client bypasses RLS - no need to set user context
	// Job tracking is internal infrastructure that requires reliable access

	// Build update payload with conditional timestamp logic
	const updates: Record<string, unknown> = { status };

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
		throw new Error(`Failed to update job status: ${error.message}`);
	}

	if (!data || data.length === 0) {
		throw new Error(`Job not found or access denied: ${jobId}`);
	}

	if (data.length > 1) {
		console.warn(
			`Multiple jobs found for ID ${jobId}, using first result. This should not happen.`,
		);
	}

	return data[0] as IndexJob;
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
	const client = getServiceClient();

	// First, fetch the job
	const { data: job, error: jobError } = await client
		.from("index_jobs")
		.select("*")
		.eq("id", jobId)
		.single();

	if (jobError || !job) {
		throw new Error(`Job not found: ${jobId}`);
	}

	// Check if user has access to the repository
	const { data: repo, error: repoError } = await client
		.from("repositories")
		.select("id, user_id, org_id")
		.eq("id", job.repository_id)
		.single();

	if (repoError || !repo) {
		throw new Error(`Job not found: ${jobId}`);
	}

	// Check if user owns the repository directly
	if (repo.user_id === userId) {
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
			return job as IndexJob;
		}
	}

	// User has no access - return 404 (not 403) to avoid leaking job existence
	throw new Error(`Job not found: ${jobId}`);
}
