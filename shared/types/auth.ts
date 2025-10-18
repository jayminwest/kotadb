/**
 * Authentication context types for KotaDB API authentication.
 *
 * These types define the structure of authenticated user context
 * that flows through the request lifecycle after successful API key validation.
 */

import type { RateLimitResult } from "./rate-limit";

/**
 * User tier levels that determine rate limits and feature access.
 */
export type Tier = "free" | "solo" | "team";

/**
 * Authentication context attached to authenticated requests.
 * Contains user identity and authorization metadata.
 */
export interface AuthContext {
	/** User UUID from the users table */
	userId: string;

	/** User's subscription tier */
	tier: Tier;

	/** Organization ID if user belongs to an organization (team tier) */
	orgId?: string;

	/** API key ID used for this request (for logging and rate limiting) */
	keyId: string;

	/** Rate limit threshold for this key (requests per hour) */
	rateLimitPerHour: number;

	/** Rate limit status for current request (added after enforcement check) */
	rateLimit?: RateLimitResult;
}

/**
 * API key entity from api_keys table.
 * Represents an authentication credential for API access.
 */
export interface ApiKey {
	/** API key UUID (primary key) */
	id: string;

	/** Bcrypt hash of the API key */
	key_hash: string;

	/** User's subscription tier */
	tier: Tier;

	/** User UUID who owns this key (foreign key to users table) */
	user_id: string;

	/** Organization UUID (for team tier keys) */
	organization_id?: string;

	/** Creation timestamp */
	created_at: string;

	/** Last used timestamp */
	last_used_at?: string;

	/** Optional key name for user reference */
	name?: string;

	/** Whether key is active (soft delete flag) */
	is_active: boolean;
}
