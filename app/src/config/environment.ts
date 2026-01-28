/**
 * Environment Configuration Module
 *
 * KotaDB v2.0.0 - Local-Only Mode
 * This version operates exclusively in local mode using SQLite storage.
 * Cloud/Supabase functionality has been removed for this release.
 */

import { createLogger } from '@logging/logger';

const logger = createLogger({ module: 'environment' });

/**
 * Environment configuration for KotaDB.
 * Local-only mode configuration.
 */
export interface EnvironmentConfig {
	/** Runtime mode: always 'local' in v2.0.0 */
	mode: 'local';
	/** Local SQLite database path */
	localDbPath?: string;
}

/**
 * Cached environment configuration
 * Prevents repeated environment variable lookups
 */
let cachedConfig: EnvironmentConfig | null = null;

/**
 * Get environment configuration for local-only mode.
 *
 * Returns local configuration with optional KOTADB_PATH override.
 * Default database location: ~/.kotadb/kota.db
 *
 * @returns {EnvironmentConfig} Environment configuration object
 *
 * @example
 * ```typescript
 * const config = getEnvironmentConfig();
 * // { mode: 'local', localDbPath: '~/.kotadb/kota.db' }
 *
 * // With custom path
 * process.env.KOTADB_PATH = '/custom/path/kota.db';
 * const config = getEnvironmentConfig();
 * // { mode: 'local', localDbPath: '/custom/path/kota.db' }
 * ```
 */
export function getEnvironmentConfig(): EnvironmentConfig {
	// Return cached config if available
	if (cachedConfig) {
		return cachedConfig;
	}

	logger.info('Environment configured for local-only mode (v2.0.0)', {
		localDbPath: process.env.KOTADB_PATH || 'default (~/.kotadb/kota.db)',
	});

	cachedConfig = {
		mode: 'local',
		localDbPath: process.env.KOTADB_PATH || undefined,
	};

	return cachedConfig;
}

/**
 * Check if KotaDB is running in local mode.
 *
 * In v2.0.0, this always returns true as KotaDB operates
 * exclusively in local-only mode.
 *
 * @returns {boolean} Always returns true in v2.0.0
 *
 * @example
 * ```typescript
 * if (isLocalMode()) {
 *   // Use SQLite storage (always true in v2.0.0)
 *   const db = await openLocalDatabase();
 * }
 * ```
 */
export function isLocalMode(): boolean {
	return true;
}

/**
 * Clear cached environment configuration.
 * Useful for testing or runtime environment changes.
 *
 * @internal
 */
export function clearEnvironmentCache(): void {
	cachedConfig = null;
	logger.debug('Environment configuration cache cleared');
}
