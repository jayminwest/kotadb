/**
 * Auto-reindex trigger logic for session-based repository synchronization.
 *
 * NOTE: Queue system removed for local-only v2.0.0 (Issue #591)
 * This module is now a stub that returns "not available" responses.
 * Auto-reindex functionality requires async queue processing which is not
 * available in local-only mode.
 *
 * TODO: For cloud mode restoration, re-implement with pg-boss queue
 */

import type { AuthContext } from "@shared/types";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "api-auto-reindex" });

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
 * Trigger auto-reindex for authenticated user's project repositories.
 *
 * NOTE: Queue system removed for local-only v2.0.0 (Issue #591)
 * This function now returns a "not available" response.
 * Use MCP tools for synchronous indexing instead.
 *
 * @param context - Authentication context with user ID and key ID
 * @returns Auto-reindex result indicating feature is unavailable
 */
export async function triggerAutoReindex(
	context: AuthContext,
): Promise<AutoReindexResult> {
	const { userId } = context;

	logger.info("Auto-reindex requested but unavailable in local-only mode", {
		user_id: userId,
	});

	// Queue system removed - auto-reindex requires async job processing
	// Return a response indicating the feature is unavailable
	return {
		triggered: false,
		jobCount: 0,
		jobIds: [],
		reason: "Auto-reindex unavailable - queue system removed for local-only mode. Use MCP index_repository tool for synchronous indexing.",
	};
}
