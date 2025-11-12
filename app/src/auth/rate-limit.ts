/**
 * Rate limiting enforcement for KotaDB API.
 *
 * Uses atomic database functions to track request counts:
 * - `increment_rate_limit()` for hourly windows
 * - `increment_rate_limit_daily()` for daily windows
 *
 * Both limits are enforced; whichever is reached first blocks requests.
 */

import { getServiceClient } from "@db/client";
import type { Tier } from "@shared/types/auth";
import {
	DAILY_RATE_LIMITS,
	RATE_LIMITS,
	type RateLimitResult,
} from "@app-types/rate-limit";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "auth-rate-limit" });

/**
 * Enforce hourly rate limit for API key.
 *
 * Calls the `increment_rate_limit()` database function to atomically
 * increment the request counter and check if the hourly limit is exceeded.
 *
 * @param keyId - API key identifier
 * @param rateLimitPerHour - Hourly rate limit for this key's tier
 * @returns Rate limit result with current status
 */
async function enforceHourlyRateLimit(
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
			logger.error("Hourly rate limit database error", {
				keyId,
				rateLimitPerHour,
				error,
			});
			Sentry.captureException(new Error("Hourly rate limit database error"), {
				extra: {
					keyId,
					rateLimitPerHour,
					error,
				},
			});
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
			logger.error("No data returned from increment_rate_limit", {
				keyId,
				rateLimitPerHour,
			});
			Sentry.captureException(
				new Error("No data returned from increment_rate_limit"),
				{
					extra: {
						keyId,
						rateLimitPerHour,
					},
				},
			);
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
		logger.error("Unexpected hourly rate limit error", {
			keyId,
			rateLimitPerHour,
			error,
		});
		Sentry.captureException(error as Error, {
			extra: {
				keyId,
				rateLimitPerHour,
			},
		});
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

/**
 * Enforce daily rate limit for API key.
 *
 * Calls the `increment_rate_limit_daily()` database function to atomically
 * increment the request counter and check if the daily limit is exceeded.
 *
 * @param keyId - API key identifier
 * @param dailyLimit - Daily rate limit for this key's tier
 * @returns Rate limit result with current status
 */
async function enforceDailyRateLimit(
	keyId: string,
	dailyLimit: number,
): Promise<RateLimitResult> {
	const supabase = getServiceClient();

	try {
		// Call atomic daily rate limit increment function
		const { data, error } = await supabase.rpc("increment_rate_limit_daily", {
			p_key_id: keyId,
			p_daily_limit: dailyLimit,
		});

		if (error) {
			logger.error("Daily rate limit database error", {
				keyId,
				dailyLimit,
				error,
			});
			Sentry.captureException(new Error("Daily rate limit database error"), {
				extra: {
					keyId,
					dailyLimit,
					error,
				},
			});
			// Fail closed: deny request on database errors
			return {
				allowed: false,
				remaining: 0,
				retryAfter: 86400, // 1 day fallback
				resetAt: Math.floor(Date.now() / 1000) + 86400,
				limit: dailyLimit,
			};
		}

		if (!data) {
			logger.error("No data returned from increment_rate_limit_daily", {
				keyId,
				dailyLimit,
			});
			Sentry.captureException(
				new Error("No data returned from increment_rate_limit_daily"),
				{
					extra: {
						keyId,
						dailyLimit,
					},
				},
			);
			// Fail closed: deny request if no data
			return {
				allowed: false,
				remaining: 0,
				retryAfter: 86400,
				resetAt: Math.floor(Date.now() / 1000) + 86400,
				limit: dailyLimit,
			};
		}

		// Parse response from database function
		const requestCount = data.request_count as number;
		const remaining = data.remaining as number;
		const resetAtStr = data.reset_at as string;

		// Convert PostgreSQL timestamp to Unix timestamp
		const resetAt = Math.floor(new Date(resetAtStr).getTime() / 1000);

		// Check if limit exceeded
		const allowed = requestCount <= dailyLimit;

		// Calculate retry-after (seconds until reset)
		const retryAfter = allowed
			? undefined
			: resetAt - Math.floor(Date.now() / 1000);

		return {
			allowed,
			remaining: Math.max(0, remaining),
			retryAfter,
			resetAt,
			limit: dailyLimit,
		};
	} catch (error) {
		logger.error("Unexpected daily rate limit error", {
			keyId,
			dailyLimit,
			error,
		});
		Sentry.captureException(error as Error, {
			extra: {
				keyId,
				dailyLimit,
			},
		});
		// Fail closed: deny request on unexpected errors
		return {
			allowed: false,
			remaining: 0,
			retryAfter: 86400,
			resetAt: Math.floor(Date.now() / 1000) + 86400,
			limit: dailyLimit,
		};
	}
}

/**
 * Enforce rate limits for API key (both hourly and daily).
 *
 * Checks both hourly and daily rate limits. If either limit is exceeded,
 * the request is denied. Returns the most restrictive limit information
 * for response headers.
 *
 * @param keyId - API key identifier
 * @param tier - Subscription tier (determines both hourly and daily limits)
 * @returns Rate limit result with current status
 */
export async function enforceRateLimit(
	keyId: string,
	tier: Tier,
): Promise<RateLimitResult> {
	const hourlyLimit = RATE_LIMITS[tier];
	const dailyLimit = DAILY_RATE_LIMITS[tier];

	// Check hourly limit
	const hourlyResult = await enforceHourlyRateLimit(keyId, hourlyLimit);
	if (!hourlyResult.allowed) {
		// Blocked by hourly limit
		return hourlyResult;
	}

	// Check daily limit
	const dailyResult = await enforceDailyRateLimit(keyId, dailyLimit);
	if (!dailyResult.allowed) {
		// Blocked by daily limit
		return dailyResult;
	}

	// Both limits passed - return most restrictive remaining count
	// Use hourly reset time since it comes sooner (for retry guidance)
	return {
		allowed: true,
		remaining: Math.min(hourlyResult.remaining, dailyResult.remaining),
		resetAt: hourlyResult.resetAt,
		limit: hourlyLimit, // Keep hourly limit in header for compatibility
	};
}

/**
 * Enforce custom hourly rate limit (for special endpoints).
 *
 * Simplified rate limiting for special cases like API key reset
 * where we only need hourly limiting without tier-based logic.
 *
 * @param keyId - Identifier for the rate limit counter (e.g., "api-key-reset:user123")
 * @param hourlyLimit - Custom hourly limit
 * @returns Rate limit result with current status
 */
export async function enforceCustomRateLimit(
	keyId: string,
	hourlyLimit: number,
): Promise<RateLimitResult> {
	return enforceHourlyRateLimit(keyId, hourlyLimit);
}
