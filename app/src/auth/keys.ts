/**
 * API key generation logic.
 *
 * Handles cryptographic generation and database persistence of API keys.
 * Generated keys use the format: kota_<tier>_<keyId>_<secret>
 * Secrets are bcrypt-hashed before storage (never stored in plaintext).
 */

import { randomBytes } from "node:crypto";
import type { Tier } from "@shared/types/auth";
import { getServiceClient } from "@db/client";
import bcrypt from "bcryptjs";

/**
 * Rate limit defaults for each tier (requests per hour).
 */
export const TIER_RATE_LIMITS = {
	free: 100,
	solo: 1000,
	team: 10000,
} as const;

/**
 * Input parameters for API key generation.
 */
export interface GenerateApiKeyInput {
	/** User UUID from auth.users table */
	userId: string;
	/** Subscription tier (determines rate limit) */
	tier: Tier;
	/** Optional organization ID for team tier */
	orgId?: string;
}

/**
 * Output from successful API key generation.
 * Contains the full key (with plaintext secret) - this is the ONLY time the secret is visible.
 */
export interface GenerateApiKeyOutput {
	/** Full API key string (kota_<tier>_<keyId>_<secret>) */
	apiKey: string;
	/** Public key ID portion (stored in database, used for lookups) */
	keyId: string;
	/** Subscription tier */
	tier: Tier;
	/** Rate limit for this key (requests per hour) */
	rateLimitPerHour: number;
	/** Timestamp of key creation */
	createdAt: Date;
}

/**
 * Generate a cryptographically secure key ID.
 *
 * Uses crypto.randomBytes for CSPRNG (Cryptographically Secure Pseudo-Random Number Generator).
 * Format: 12-character alphanumeric string (no underscores to avoid parsing conflicts).
 *
 * Entropy: ~71 bits (12 characters from base62 alphabet)
 * Collision probability: negligible with proper CSPRNG
 *
 * @returns 12-character key ID (e.g., "ab1cd2ef3gh4")
 */
export function generateKeyId(): string {
	// Generate random bytes and convert to base62 (alphanumeric only, no underscores)
	// This avoids conflicts with the underscore delimiter in key format
	const alphabet =
		"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
	const bytes = randomBytes(12);
	let result = "";

	for (let i = 0; i < 12; i++) {
		const byte = bytes[i];
		if (byte !== undefined) {
			result += alphabet[byte % alphabet.length];
		}
	}

	return result;
}

/**
 * Generate a cryptographically secure secret.
 *
 * Uses crypto.randomBytes for CSPRNG.
 * Format: 36-character hexadecimal string.
 *
 * Entropy: ~144 bits (18 bytes * 8 bits/byte)
 * This provides strong protection against brute-force attacks.
 *
 * @returns 36-character hex secret (e.g., "0123456789abcdef0123456789abcdef0123")
 */
export function generateSecret(): string {
	// Generate 18 random bytes, convert to hex (36 chars)
	return randomBytes(18).toString("hex");
}

/**
 * Maximum number of retry attempts for key_id collision handling.
 * With 12-char base64url keyId (~72 bits entropy), collisions are astronomically rare.
 */
const MAX_COLLISION_RETRIES = 3;

/**
 * Generate a new API key with database persistence.
 *
 * Process:
 * 1. Generate cryptographically secure key_id and secret
 * 2. Hash secret with bcrypt (10 rounds) for secure storage
 * 3. Construct full key string: kota_<tier>_<keyId>_<secret>
 * 4. Insert record into api_keys table (with collision retry logic)
 * 5. Return full key (ONLY time user sees plaintext secret)
 *
 * Security notes:
 * - Secret is NEVER stored in plaintext (only bcrypt hash)
 * - Uses crypto.randomBytes (CSPRNG) for unpredictable keys
 * - Bcrypt work factor: 10 rounds (~100-200ms hashing time)
 * - Key format matches validator expectations (src/auth/validator.ts)
 *
 * Collision handling:
 * - Retries up to 3 times if key_id already exists (unique constraint violation)
 * - With 72-bit entropy, collision probability is negligible
 * - Logs collision events for monitoring
 *
 * @param input - Generation parameters (userId, tier, optional orgId)
 * @returns Generated key with metadata
 * @throws Error if database insertion fails, retries exhausted, or invalid parameters
 *
 * @example
 * ```typescript
 * const result = await generateApiKey({
 *   userId: "00000000-0000-0000-0000-000000000001",
 *   tier: "free"
 * });
 * console.log("Your API key (save this!):", result.apiKey);
 * // kota_free_ab1cd2ef3gh4_0123456789abcdef0123456789abcdef012345
 * ```
 */
export async function generateApiKey(
	input: GenerateApiKeyInput,
): Promise<GenerateApiKeyOutput> {
	const { userId, tier, orgId } = input;

	// Validate tier
	const validTiers: Tier[] = ["free", "solo", "team"];
	if (!validTiers.includes(tier)) {
		throw new Error(
			`Invalid tier: ${tier}. Must be one of: ${validTiers.join(", ")}`,
		);
	}

	// Validate userId
	if (!userId || typeof userId !== "string") {
		throw new Error("userId is required and must be a string");
	}

	// Get rate limit for tier
	const rateLimitPerHour = TIER_RATE_LIMITS[tier];

	// Retry loop for collision handling
	let lastError: Error | null = null;
	for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
		try {
			// Generate cryptographic components
			const keyId = generateKeyId();
			const secret = generateSecret();

			// Hash secret with bcrypt (10 rounds)
			// This matches the validator's expectations
			const secretHash = await bcrypt.hash(secret, 10);

			// Construct full key string (format: kota_<tier>_<keyId>_<secret>)
			const apiKey = `kota_${tier}_${keyId}_${secret}`;

			// Insert into database
			const supabase = getServiceClient();
			const { data, error } = await supabase
				.from("api_keys")
				.insert({
					user_id: userId,
					key_id: keyId,
					secret_hash: secretHash,
					tier,
					rate_limit_per_hour: rateLimitPerHour,
					enabled: true,
					metadata: orgId ? { org_id: orgId } : {},
				})
				.select("created_at")
				.single();

			if (error) {
				// Check if this is a unique constraint violation on key_id
				// Supabase error code for unique violation: "23505"
				if (error.code === "23505" && error.message.includes("key_id")) {
					console.warn(
						`[Auth] key_id collision detected (attempt ${attempt + 1}/${MAX_COLLISION_RETRIES}): ${keyId}`,
					);
					lastError = new Error(`key_id collision: ${error.message}`);
					continue; // Retry with new key_id
				}

				// Other database errors (not collision-related)
				throw new Error(`Failed to create API key: ${error.message}`);
			}

			// Success!
			return {
				apiKey,
				keyId,
				tier,
				rateLimitPerHour,
				createdAt: new Date(data.created_at),
			};
		} catch (err) {
			// Re-throw non-collision errors immediately
			if (err instanceof Error && !err.message.includes("key_id collision")) {
				throw err;
			}
			lastError = err instanceof Error ? err : new Error(String(err));
		}
	}

	// All retries exhausted
	throw new Error(
		`Failed to generate unique API key after ${MAX_COLLISION_RETRIES} attempts. Last error: ${lastError?.message}`,
	);
}
