/**
 * Database client configuration for local-only mode.
 *
 * Provides SQLite database access for all operations.
 * Cloud mode (Supabase) has been removed for local-only v2.0.0.
 */

import { getGlobalDatabase, type KotaDatabase } from "@db/sqlite/sqlite-client";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "db-client" });

/**
 * Database client type - SQLite only in local mode
 */
export type DatabaseClient = KotaDatabase;

/**
 * Get the SQLite database client.
 * 
 * This is the primary entry point for database access in local-only mode.
 */
export function getClient(): KotaDatabase {
	logger.debug("Using local SQLite database");
	return getGlobalDatabase();
}

/**
 * Get Supabase service role client.
 * 
 * @deprecated This function is not available in local-only mode.
 * @throws {Error} Always throws - use getClient() instead
 */
export function getServiceClient(): never {
	throw new Error('getServiceClient() is not available in local-only mode - use getClient() instead');
}

/**
 * Get Supabase anon client.
 * 
 * @deprecated This function is not available in local-only mode.
 * @throws {Error} Always throws - use getClient() instead
 */
export function getAnonClient(): never {
	throw new Error('getAnonClient() is not available in local-only mode - use getClient() instead');
}

/**
 * Set RLS context for user-scoped queries.
 * 
 * @deprecated This function is not available in local-only mode.
 * SQLite does not support RLS - all queries have full access.
 * @throws {Error} Always throws - not supported in local mode
 */
export async function setUserContext(
	_client: unknown,
	_userId: string,
): Promise<never> {
	throw new Error('setUserContext() is not available in local-only mode - SQLite does not support RLS');
}

/**
 * Clear RLS context.
 * 
 * @deprecated This function is not available in local-only mode.
 * @throws {Error} Always throws - not supported in local mode
 */
export async function clearUserContext(
	_client: unknown,
): Promise<never> {
	throw new Error('clearUserContext() is not available in local-only mode - SQLite does not support RLS');
}
