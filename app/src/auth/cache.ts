/**
 * In-memory cache for validated API keys with TTL.
 *
 * Caches successful API key validations for 5 seconds to avoid
 * repeated expensive bcrypt comparisons and database lookups.
 */

import type { Tier } from "@shared/types/auth";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "auth-cache" });

/**
 * Cached validation result with expiry timestamp.
 */
export interface CacheEntry {
	userId: string;
	tier: Tier;
	orgId?: string;
	keyId: string;
	rateLimitPerHour: number;
	expiresAt: number;
}

/**
 * Cache TTL in milliseconds (5 seconds)
 */
const CACHE_TTL_MS = 5000;

/**
 * Maximum cache size (prevents memory exhaustion)
 */
const MAX_CACHE_SIZE = 1000;

/**
 * In-memory cache storage
 */
const cache = new Map<string, CacheEntry>();

/**
 * Retrieve a cached validation result for a given key ID.
 * Returns null if not found or if entry has expired.
 *
 * @param keyId - The API key ID to look up
 * @returns Cached entry if valid, null otherwise
 */
export function getCachedValidation(keyId: string): CacheEntry | null {
	const entry = cache.get(keyId);

	if (!entry) {
		return null;
	}

	// Check if entry has expired
	if (Date.now() > entry.expiresAt) {
		cache.delete(keyId);
		return null;
	}

	return entry;
}

/**
 * Store a validated API key result in cache with TTL.
 *
 * @param keyId - The API key ID
 * @param entry - Validation result to cache
 */
export function setCachedValidation(
	keyId: string,
	entry: Omit<CacheEntry, "expiresAt">,
): void {
	// Enforce max cache size by evicting oldest entry
	if (cache.size >= MAX_CACHE_SIZE) {
		const firstKey = cache.keys().next().value;
		if (firstKey) {
			cache.delete(firstKey);
		}
	}

	cache.set(keyId, {
		...entry,
		expiresAt: Date.now() + CACHE_TTL_MS,
	});
}

/**
 * Clear all cached validation results.
 * Useful for testing and emergency cache invalidation.
 */
export function clearCache(): void {
	cache.clear();
}

/**
 * Get current cache size (for monitoring and testing)
 */
export function getCacheSize(): number {
	return cache.size;
}

/**
 * Periodic cleanup to remove expired entries.
 * Runs every 60 seconds to prevent memory bloat.
 */
function cleanupExpiredEntries(): void {
	const now = Date.now();
	let removed = 0;

	for (const [keyId, entry] of cache.entries()) {
		if (now > entry.expiresAt) {
			cache.delete(keyId);
			removed++;
		}
	}

	if (removed > 0) {
		logger.debug("Evicted expired cache entries", {
			removedCount: removed,
			cacheSize: cache.size,
		});
	}
}

// Start periodic cleanup
setInterval(cleanupExpiredEntries, 60000);
