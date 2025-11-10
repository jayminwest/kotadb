/**
 * API key validation logic.
 *
 * Handles parsing, database lookup, and bcrypt verification of API keys.
 */

import { getCachedValidation, setCachedValidation } from "@auth/cache";
import type { Tier } from "@shared/types/auth";
import { getServiceClient } from "@db/client";
import bcrypt from "bcryptjs";

/**
 * Result of successful API key validation.
 */
export interface ValidateApiKeyResult {
	userId: string;
	tier: Tier;
	orgId?: string;
	keyId: string;
	rateLimitPerHour: number;
}

/**
 * Parsed API key components.
 */
interface ParsedApiKey {
	tier: Tier;
	keyId: string;
	secret: string;
}

/**
 * Valid tier values.
 */
const VALID_TIERS: Tier[] = ["free", "solo", "team"];

/**
 * Parse API key format: kota_<tier>_<keyId>_<secret>
 *
 * @param key - Raw API key string
 * @returns Parsed components or null if invalid format
 */
export function parseApiKey(key: string): ParsedApiKey | null {
	const parts = key.split("_");

	// Validate format: kota_<tier>_<keyId>_<secret>
	if (parts.length !== 4 || parts[0] !== "kota") {
		return null;
	}

	const [, tier, keyId, secret] = parts;

	// Validate tier
	if (!VALID_TIERS.includes(tier as Tier)) {
		return null;
	}

	// Validate keyId length (at least 8 characters)
	if (!keyId || keyId.length < 8) {
		return null;
	}

	// Validate secret length (at least 32 characters)
	if (!secret || secret.length < 32) {
		return null;
	}

	return {
		tier: tier as Tier,
		keyId,
		secret,
	};
}

/**
 * Validate API key against database.
 *
 * Process:
 * 1. Parse key format
 * 2. Check cache for recent validation
 * 3. Query database for key record
 * 4. Verify secret with bcrypt
 * 5. Check enabled flag
 * 6. Cache successful validation
 *
 * @param key - Raw API key string
 * @returns Validation result or null if invalid
 */
export async function validateApiKey(
	key: string,
): Promise<ValidateApiKeyResult | null> {
	// Parse key format
	const parsed = parseApiKey(key);
	if (!parsed) {
		// Still hash to maintain constant time (timing attack mitigation)
		await bcrypt.compare("dummy-secret", "$2a$10$dummyhash");
		return null;
	}

	const { tier, keyId, secret } = parsed;

	// Check cache first
	const cached = getCachedValidation(keyId);
	if (cached) {
		return {
			userId: cached.userId,
			tier: cached.tier,
			orgId: cached.orgId,
			keyId: cached.keyId,
			rateLimitPerHour: cached.rateLimitPerHour,
		};
	}

	// Query database for key
	const supabase = getServiceClient();
	const { data, error } = await supabase
		.from("api_keys")
		.select("id, user_id, secret_hash, tier, rate_limit_per_hour, enabled, revoked_at")
		.eq("key_id", keyId)
		.single();

	if (error || !data) {
		// Key not found - still hash for timing attack mitigation
		await bcrypt.compare(secret, "$2a$10$dummyhash");
		return null;
	}

	// Verify secret with bcrypt
	const isValidSecret = await bcrypt.compare(secret, data.secret_hash);
	if (!isValidSecret) {
		return null;
	}

	// Check if key is enabled and not revoked
	if (!data.enabled || data.revoked_at !== null) {
		return null;
	}

	// Build validation result
	const result: ValidateApiKeyResult = {
		userId: data.user_id,
		tier: data.tier as Tier,
		keyId,
		rateLimitPerHour: data.rate_limit_per_hour,
	};

	// Note: org_id column doesn't exist yet in schema
	// TODO: Add org_id column when migrating to org-level API keys

	// Cache successful validation
	setCachedValidation(keyId, result);

	return result;
}

/**
 * Validate JWT token from Supabase Auth.
 *
 * Process:
 * 1. Verify JWT with Supabase Auth service
 * 2. Query subscriptions table for user's tier
 * 3. Generate synthetic keyId for rate limiting
 * 4. Return ValidateApiKeyResult structure
 *
 * @param token - JWT token from Supabase session
 * @returns Validation result or null if invalid
 */
export async function validateJwtToken(
	token: string,
): Promise<ValidateApiKeyResult | null> {
	try {
		const supabase = getServiceClient();

		// Verify JWT with Supabase Auth
		const { data: userData, error: authError } = await supabase.auth.getUser(
			token,
		);

		if (authError || !userData?.user) {
			// Invalid or expired JWT - use timing attack mitigation
			await bcrypt.compare("dummy-secret", "$2a$10$dummyhash");
			return null;
		}

		const userId = userData.user.id;

		// Generate synthetic keyId for rate limiting consistency
		const syntheticKeyId = `jwt_${userId}`;

		// Check cache first using synthetic keyId
		const cached = getCachedValidation(syntheticKeyId);
		if (cached) {
			return {
				userId: cached.userId,
				tier: cached.tier,
				orgId: cached.orgId,
				keyId: cached.keyId,
				rateLimitPerHour: cached.rateLimitPerHour,
			};
		}

		// Query subscriptions table for user's tier
		const { data: subData, error: subError } = await supabase
			.from("subscriptions")
			.select("tier, status")
			.eq("user_id", userId)
			.maybeSingle();

		// Default to 'free' tier if no subscription found or query fails
		let tier: Tier = "free";
		if (subData && !subError && (subData.status === "active" || subData.status === "trialing")) {
			tier = subData.tier as Tier;
		}

		// Determine rate limit based on tier
		const rateLimitMap: Record<Tier, number> = {
			free: 100,
			solo: 1000,
			team: 10000,
		};
		const rateLimitPerHour = rateLimitMap[tier];

		// Build validation result
		const result: ValidateApiKeyResult = {
			userId,
			tier,
			keyId: syntheticKeyId,
			rateLimitPerHour,
		};

		// Cache successful validation
		setCachedValidation(syntheticKeyId, result);

		return result;
	} catch (error) {
		process.stderr.write(
			`[Auth] JWT validation error: ${JSON.stringify(error)}\n`,
		);
		return null;
	}
}

/**
 * Update last_used_at timestamp for API key.
 * Called asynchronously after successful authentication.
 *
 * @param keyId - API key ID to update
 */
export async function updateLastUsed(keyId: string): Promise<void> {
	try {
		const supabase = getServiceClient();
		await supabase
			.from("api_keys")
			.update({ last_used_at: new Date().toISOString() })
			.eq("key_id", keyId);
	} catch (error) {
		// Non-critical operation - log error but don't throw
		process.stderr.write(
			`[Auth] Failed to update last_used_at for key ${keyId}: ${JSON.stringify(error)}\n`,
		);
	}
}
