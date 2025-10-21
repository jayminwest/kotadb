/**
 * Job tracking data access layer for index_jobs table.
 *
 * Provides core functions for creating, updating, and querying job status.
 * Bridges pg-boss queue operations (once #235 lands) with user-facing API.
 */

import { getServiceClient, setUserContext } from "@db/client";
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
	await setUserContext(client, userId);

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
	await setUserContext(client, userId);

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
		.select()
		.single();

	if (error) {
		throw new Error(`Failed to update job status: ${error.message}`);
	}

	if (!data) {
		throw new Error(`Job not found: ${jobId}`);
	}

	return data as IndexJob;
}

/**
 * Get current job status and details.
 *
 * NOTE: Currently uses service client which bypasses RLS.
 * RLS enforcement should be added in a future iteration (#236 follow-up).
 *
 * @param jobId - UUID of job to query
 * @param userId - User UUID (for future RLS enforcement)
 * @returns Job record with full details
 * @throws Error if job not found
 */
export async function getJobStatus(
	jobId: string,
	userId: string,
): Promise<IndexJob> {
	const client = getServiceClient();
	await setUserContext(client, userId);

	const { data, error } = await client
		.from("index_jobs")
		.select("*")
		.eq("id", jobId)
		.single();

	if (error || !data) {
		throw new Error(`Job not found: ${jobId}`);
	}

	return data as IndexJob;
}
