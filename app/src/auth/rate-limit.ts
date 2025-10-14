/**
 * Rate limiting enforcement for KotaDB API.
 *
 * Uses atomic database function `increment_rate_limit()` to track
 * request counts per API key per hourly window.
 */

import { getServiceClient } from "@db/client";

/**
 * Rate limit enforcement result.
 * Contains current status and metadata for response headers.
 */
export interface RateLimitResult {
	/** Whether the request is allowed (within limit) */
	allowed: boolean;

	/** Requests remaining in current window */
	remaining: number;

	/** Seconds until window resets (only set when limit exceeded) */
	retryAfter?: number;

	/** Unix timestamp when window resets */
	resetAt: number;

	/** Total limit for this key's tier */
	limit: number;
}

/**
 * Enforce rate limit for API key.
 *
 * Calls the `increment_rate_limit()` database function to atomically
 * increment the request counter and check if the limit is exceeded.
 *
 * @param keyId - API key identifier
 * @param rateLimitPerHour - Hourly rate limit for this key's tier
 * @returns Rate limit result with current status
 */
export async function enforceRateLimit(
	keyId: string,
	rateLimitPerHour: number,
): Promise<RateLimitResult> {
	const supabase = getServiceClient();

	try {
		// Call atomic rate limit increment function
		const { data, error } = await supabase.rpc("increment_rate_limit", {
			p_key_id: keyId,
			p_rate_limit: rateLimitPerHour,
		});

		if (error) {
			console.error("[RateLimit] Database error:", error);
			// Fail closed: deny request on database errors
			return {
				allowed: false,
				remaining: 0,
				retryAfter: 3600, // 1 hour fallback
				resetAt: Math.floor(Date.now() / 1000) + 3600,
				limit: rateLimitPerHour,
			};
		}

		if (!data) {
			console.error("[RateLimit] No data returned from increment_rate_limit");
			// Fail closed: deny request if no data
			return {
				allowed: false,
				remaining: 0,
				retryAfter: 3600,
				resetAt: Math.floor(Date.now() / 1000) + 3600,
				limit: rateLimitPerHour,
			};
		}

		// Parse response from database function
		const requestCount = data.request_count as number;
		const remaining = data.remaining as number;
		const resetAtStr = data.reset_at as string;

		// Convert PostgreSQL timestamp to Unix timestamp
		const resetAt = Math.floor(new Date(resetAtStr).getTime() / 1000);

		// Check if limit exceeded
		const allowed = requestCount <= rateLimitPerHour;

		// Calculate retry-after (seconds until reset)
		const retryAfter = allowed
			? undefined
			: resetAt - Math.floor(Date.now() / 1000);

		return {
			allowed,
			remaining: Math.max(0, remaining),
			retryAfter,
			resetAt,
			limit: rateLimitPerHour,
		};
	} catch (error) {
		console.error("[RateLimit] Unexpected error:", error);
		// Fail closed: deny request on unexpected errors
		return {
			allowed: false,
			remaining: 0,
			retryAfter: 3600,
			resetAt: Math.floor(Date.now() / 1000) + 3600,
			limit: rateLimitPerHour,
		};
	}
}
