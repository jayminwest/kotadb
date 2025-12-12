/**
 * Central Configuration Module
 *
 * Centralized application constants and configuration values:
 * - Rate limiting per subscription tier
 * - Cache settings
 * - Retry and security configuration
 * - Indexer behavior thresholds
 */

/**
 * Rate Limit Configuration
 * Request limits per subscription tier (requests per time window)
 * Format: { hourly: number, daily: number }
 */
export const RATE_LIMITS = {
	FREE: {
		HOURLY: 1000,
		DAILY: 5000,
	},
	SOLO: {
		HOURLY: 5000,
		DAILY: 25000,
	},
	TEAM: {
		HOURLY: 25000,
		DAILY: 100000,
	},
} as const;

/**
 * Cache Configuration
 * Settings for in-memory caching behavior
 */
export const CACHE_CONFIG = {
	/**
	 * Cache Time-To-Live (milliseconds)
	 * How long cached entries remain valid before expiration
	 */
	TTL_MS: 5000,

	/**
	 * Maximum Cache Size
	 * Maximum number of entries to store in cache before eviction
	 */
	MAX_SIZE: 1000,
} as const;

/**
 * Retry Configuration
 * Settings for retry logic and security operations
 */
export const RETRY_CONFIG = {
	/**
	 * Maximum Collision Retries
	 * Number of retry attempts for database collision errors
	 */
	MAX_COLLISION_RETRIES: 3,

	/**
	 * Bcrypt Rounds
	 * Number of salt rounds for password hashing (higher = more secure but slower)
	 */
	BCRYPT_ROUNDS: 10,
} as const;

/**
 * Threshold Configuration
 * Time-based thresholds for system behavior
 */
export const THRESHOLDS = {
	/**
	 * Default Reindex Threshold (minutes)
	 * Minimum time before allowing a repository to be reindexed
	 */
	DEFAULT_REINDEX_THRESHOLD_MINUTES: 60,

	/**
	 * Rate Limit Threshold (minutes)
	 * Time window for rate limit calculations
	 */
	RATE_LIMIT_THRESHOLD_MINUTES: 30,
} as const;

/**
 * Indexer Configuration
 * Settings for code indexing operations
 */
export const INDEXER_CONFIG = {
	/**
	 * File Query Batch Size
	 * Number of file records to fetch in a single database query
	 * Prevents PostgREST response size limits for large repositories
	 */
	FILE_QUERY_BATCH_SIZE: 1000,
} as const;
