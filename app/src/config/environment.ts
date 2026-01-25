/**
 * Environment Configuration Module
 *
 * Detects local-first vs cloud-sync mode for KotaDB.
 * Provides environment configuration based on runtime mode.
 */

import { createLogger } from '@logging/logger';

const logger = createLogger({ module: 'environment' });

/**
 * Environment configuration for KotaDB.
 * Defines runtime mode and associated credentials.
 */
export interface EnvironmentConfig {
	/** Runtime mode: local-first or cloud-sync */
	mode: 'local' | 'cloud';
	/** Local SQLite database path (local mode only) */
	localDbPath?: string;
	/** Supabase project URL (cloud mode only) */
	supabaseUrl?: string;
	/** Supabase service role key (cloud mode only) */
	supabaseServiceKey?: string;
	/** Supabase anonymous key (cloud mode only) */
	supabaseAnonKey?: string;
}

/**
 * Cached environment configuration
 * Prevents repeated environment variable lookups
 */
let cachedConfig: EnvironmentConfig | null = null;

/**
 * Get environment configuration based on runtime mode.
 *
 * Checks KOTA_LOCAL_MODE environment variable to determine mode:
 * - If 'true': Returns local-first configuration with optional KOTADB_PATH
 * - Otherwise: Returns cloud-sync configuration with Supabase credentials
 *
 * @throws {Error} If cloud mode is detected but required Supabase credentials are missing
 * @returns {EnvironmentConfig} Environment configuration object
 *
 * @example
 * ```typescript
 * // Local mode
 * process.env.KOTA_LOCAL_MODE = 'true';
 * const config = getEnvironmentConfig();
 * // { mode: 'local', localDbPath: './kota.db' }
 *
 * // Cloud mode
 * process.env.SUPABASE_URL = 'https://example.supabase.co';
 * process.env.SUPABASE_SERVICE_KEY = 'service_key';
 * const config = getEnvironmentConfig();
 * // { mode: 'cloud', supabaseUrl: '...', supabaseServiceKey: '...' }
 * ```
 */
export function getEnvironmentConfig(): EnvironmentConfig {
	// Return cached config if available
	if (cachedConfig) {
		return cachedConfig;
	}

	const localMode = process.env.KOTA_LOCAL_MODE === 'true';

	if (localMode) {
		logger.info('Environment configured for local-first mode', {
			localDbPath: process.env.KOTADB_PATH || 'default',
		});

		cachedConfig = {
			mode: 'local',
			localDbPath: process.env.KOTADB_PATH || undefined,
		};

		return cachedConfig;
	}

	// Cloud mode - require Supabase credentials
	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
	const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		const errorMsg =
			'Cloud mode requires SUPABASE_URL and SUPABASE_SERVICE_KEY. ' +
			'Set KOTA_LOCAL_MODE=true for local operation.';

		logger.error('Missing required Supabase credentials for cloud mode', {
			hasSupabaseUrl: !!supabaseUrl,
			hasSupabaseServiceKey: !!supabaseServiceKey,
		});

		throw new Error(errorMsg);
	}

	logger.info('Environment configured for cloud-sync mode', {
		supabaseUrl,
		hasServiceKey: !!supabaseServiceKey,
		hasAnonKey: !!supabaseAnonKey,
	});

	cachedConfig = {
		mode: 'cloud',
		supabaseUrl,
		supabaseServiceKey,
		supabaseAnonKey,
	};

	return cachedConfig;
}

/**
 * Check if KotaDB is running in local-first mode.
 *
 * @returns {boolean} True if KOTA_LOCAL_MODE=true, false otherwise
 *
 * @example
 * ```typescript
 * if (isLocalMode()) {
 *   // Use SQLite storage
 *   const db = await openLocalDatabase();
 * } else {
 *   // Use Supabase cloud storage
 *   const client = createSupabaseClient();
 * }
 * ```
 */
export function isLocalMode(): boolean {
	const config = getEnvironmentConfig();

	// CRITICAL: Prevent local mode in production
	if (config.mode === 'local' && process.env.NODE_ENV === 'production') {
		throw new Error(
			'SECURITY ERROR: Local mode cannot be enabled in production. ' +
				'This would bypass all authentication and rate limiting.',
		);
	}

	return config.mode === 'local';
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
