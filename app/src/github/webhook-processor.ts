/**
 * GitHub Webhook Processor
 *
 * NOTE: Queue system and Supabase removed for local-only v2.0.0 (Issue #591)
 * This module now logs webhook events but does not trigger indexing jobs.
 * In local-only mode, indexing happens synchronously via MCP tools.
 *
 * The webhook endpoint still validates signatures and logs events for
 * observability, but no async job processing or database operations occur.
 */

import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";
import type { GitHubPushEvent } from "./types";

const logger = createLogger({ module: "github-webhook-processor" });

/**
 * Process a GitHub push event.
 *
 * NOTE: Queue system and Supabase removed for local-only v2.0.0 (Issue #591)
 * This function now logs the event but does not perform any database operations.
 * Use MCP tools for synchronous indexing instead.
 *
 * @param payload - Verified push event payload from webhook handler
 */
export async function processPushEvent(payload: GitHubPushEvent): Promise<void> {
	try {
		const { ref, after: commitSha, repository, installation } = payload;
		const fullName = repository.full_name;
		const installationId = installation?.id;

		// Strip refs/heads/ prefix from ref to get branch name
		const branchName = ref.replace(/^refs\/heads\//, "");

		// Log the event for observability
		// In local-only mode, we don't have access to Supabase, so we just log
		logger.info("GitHub push event received (local-only mode - no action taken)", {
			repository: fullName,
			branch: branchName,
			commit: commitSha.substring(0, 7),
			installation_id: installationId,
			note: "Webhooks are not supported in local-only mode. Use MCP index_repository tool for synchronous indexing.",
		});

		// No database operations - Supabase is not available in local mode
	} catch (error) {
		// Catch all errors to prevent webhook failures
		logger.error("Unexpected error processing push event", error instanceof Error ? error : undefined, {
			operation: "processPushEvent",
		});
		Sentry.captureException(error);
	}
}
