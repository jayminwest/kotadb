/**
 * GitHub Webhook Processor
 * Issue #261 - Integrate GitHub webhooks with job queue for auto-indexing
 *
 * Bridges webhook events to job queue by:
 * 1. Looking up tracked repositories in database
 * 2. Filtering events to default branch only
 * 3. Deduplicating pending jobs by commit SHA
 * 4. Queueing indexing jobs via job-tracker
 * 5. Updating repository metadata with push timestamps
 */

import { getServiceClient } from "@db/client";
import { createIndexJob } from "@queue/job-tracker";
import type { GitHubPushEvent } from "./types";

/**
 * Process a GitHub push event and queue indexing job if needed.
 *
 * Flow:
 * 1. Validate repository is tracked in database
 * 2. Filter to default branch only (skip feature branches)
 * 3. Check for duplicate pending jobs (deduplication)
 * 4. Resolve user context for RLS enforcement
 * 5. Create index job via job-tracker
 * 6. Update repository last_push_at timestamp
 *
 * All errors are caught and logged to prevent webhook failures from returning errors.
 * GitHub expects 200 OK for all valid webhooks, even if we choose not to process them.
 *
 * @param payload - Verified push event payload from webhook handler
 */
export async function processPushEvent(payload: GitHubPushEvent): Promise<void> {
	try {
		const { ref, after: commitSha, repository } = payload;
		const fullName = repository.full_name;
		const defaultBranch = repository.default_branch;

		// Strip refs/heads/ prefix from ref to get branch name
		const branchName = ref.replace(/^refs\/heads\//, "");

		console.log(`[Webhook Processor] Processing push to ${fullName}@${branchName} (${commitSha.substring(0, 7)})`);

		// Look up repository in database
		const client = getServiceClient();
		const { data: repo, error: repoError } = await client
			.from("repositories")
			.select("id, user_id, org_id, default_branch, full_name")
			.eq("full_name", fullName)
			.maybeSingle();

		if (repoError) {
			console.error(`[Webhook Processor] Database error looking up repository ${fullName}:`, repoError);
			return;
		}

		if (!repo) {
			console.log(`[Webhook Processor] Ignoring push to untracked repository: ${fullName}`);
			return;
		}

		// Filter to default branch only
		// Use repository's stored default_branch if available, otherwise fall back to payload
		const effectiveDefaultBranch = repo.default_branch || defaultBranch;
		if (branchName !== effectiveDefaultBranch) {
			console.log(`[Webhook Processor] Ignoring push to non-default branch: ${fullName}@${branchName} (default: ${effectiveDefaultBranch})`);
			return;
		}

		// Check for existing pending job with same commit SHA (deduplication)
		const { data: existingJob, error: jobError } = await client
			.from("index_jobs")
			.select("id, commit_sha, status")
			.eq("repository_id", repo.id)
			.eq("commit_sha", commitSha)
			.eq("status", "pending")
			.maybeSingle();

		if (jobError) {
			console.error("[Webhook Processor] Database error checking for duplicate job:", jobError);
			return;
		}

		if (existingJob) {
			console.log(`[Webhook Processor] Duplicate job detected for ${fullName}@${commitSha.substring(0, 7)}: job ${existingJob.id} already pending`);
			return;
		}

		// Resolve user context for RLS enforcement
		const userId = await resolveUserIdForRepository(repo);
		if (!userId) {
			console.warn(`[Webhook Processor] Cannot queue job for ${fullName}: no user context found (orphaned repository)`);
			return;
		}

		// Create index job via job-tracker
		const job = await createIndexJob(repo.id, ref, commitSha, userId);
		console.log(`[Webhook Processor] Queued job ${job.id} for ${fullName}@${branchName} (${commitSha.substring(0, 7)})`);

		// Update repository last_push_at timestamp
		const { error: updateError } = await client
			.from("repositories")
			.update({ last_push_at: new Date().toISOString() })
			.eq("id", repo.id);

		if (updateError) {
			console.error(`[Webhook Processor] Failed to update last_push_at for ${fullName}:`, updateError);
			// Don't return - job was successfully queued, this is just metadata
		}

		console.log(`[Webhook Processor] Successfully processed push event for ${fullName}`);
	} catch (error) {
		// Catch all errors to prevent webhook failures
		// GitHub expects 200 OK for all valid signatures, even if we fail to process
		console.error("[Webhook Processor] Unexpected error processing push event:", error);
	}
}

/**
 * Resolve user ID for repository to establish RLS context.
 *
 * For user-owned repos: use repository.user_id directly
 * For org-owned repos: query user_organizations for first member
 *
 * @param repo - Repository record with user_id and org_id
 * @returns User UUID for RLS context, or null if no user found
 */
async function resolveUserIdForRepository(
	repo: { user_id: string | null; org_id: string | null; full_name: string }
): Promise<string | null> {
	// User-owned repository: use user_id directly
	if (repo.user_id) {
		return repo.user_id;
	}

	// Org-owned repository: query for first member
	if (repo.org_id) {
		const client = getServiceClient();
		const { data: membership, error } = await client
			.from("user_organizations")
			.select("user_id")
			.eq("org_id", repo.org_id)
			.limit(1)
			.maybeSingle();

		if (error) {
			console.error(`[Webhook Processor] Error querying user_organizations for org ${repo.org_id}:`, error);
			return null;
		}

		if (membership) {
			return membership.user_id;
		}
	}

	// No user context found (orphaned repository)
	console.warn(`[Webhook Processor] Repository ${repo.full_name} has no user or org association`);
	return null;
}
