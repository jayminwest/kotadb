/**
 * Rate limiting types for KotaDB API.
 *
 * Types for rate limit enforcement and response headers.
 * Backend-only types (moved from shared/ to resolve Docker build context issue).
 */

import type { Tier } from "@shared/types/auth";

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
 * Rate limit response headers.
 * Standard header names for rate limit metadata.
 */
export interface RateLimitHeaders {
	/** Total requests allowed per hour for the tier */
	"X-RateLimit-Limit": string;

	/** Requests remaining in current window */
	"X-RateLimit-Remaining": string;

	/** Unix timestamp when the limit resets */
	"X-RateLimit-Reset": string;

	/** Seconds until retry (only present in 429 responses) */
	"Retry-After"?: string;
}

/**
 * Rate limit configuration by tier.
 * Defines request quotas for each subscription level.
 */
export interface RateLimitConfig {
	/** Subscription tier */
	tier: Tier;

	/** Requests allowed per hour */
	requestsPerHour: number;
}

/**
 * Standard hourly rate limit configurations by tier.
 * Updated in #423 to support realistic development workflows.
 */
export const RATE_LIMITS: Record<Tier, number> = {
	free: 1000,
	solo: 5000,
	team: 25000,
};

/**
 * Daily rate limit configurations by tier.
 * Provides cost protection while enabling burst usage patterns.
 * Both hourly and daily limits are enforced; whichever is reached first blocks requests.
 */
export const DAILY_RATE_LIMITS: Record<Tier, number> = {
	free: 5000,
	solo: 25000,
	team: 100000,
};
