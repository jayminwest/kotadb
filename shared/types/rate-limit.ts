/**
 * Rate limiting types for KotaDB API.
 *
 * Types for rate limit enforcement and response headers.
 * Used by both backend (enforcement logic) and frontend (displaying limits to users).
 */

import type { Tier } from "./auth";

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
 * Standard rate limit configurations by tier.
 */
export const RATE_LIMITS: Record<Tier, number> = {
	free: 100,
	solo: 1000,
	team: 10000,
};
