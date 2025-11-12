/**
 * Supabase client configuration and RLS context management.
 *
 * Provides service role and anon clients for different access patterns:
 * - Service role: Full access for authentication and admin operations
 * - Anon: RLS-enforced access for user-scoped queries
 */

import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "db-client" });

/**
 * Get Supabase service role client (full access, bypasses RLS).
 * Used for authentication queries and admin operations.
 */
export function getServiceClient(): SupabaseClient {
	try {
		const supabaseUrl = process.env.SUPABASE_URL;
		const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

		if (!supabaseUrl || !supabaseServiceKey) {
			const error = new Error(
				"Missing Supabase credentials: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set",
			);
			Sentry.captureException(error, {
				contexts: {
					environment: {
						has_url: !!supabaseUrl,
						has_service_key: !!supabaseServiceKey,
					},
				},
			});
			logger.error("Missing Supabase credentials", {
				has_url: !!supabaseUrl,
				has_service_key: !!supabaseServiceKey,
			});
			throw error;
		}

		logger.debug("Creating service role client", {
			supabase_url: supabaseUrl,
		});

		return createClient(supabaseUrl, supabaseServiceKey, {
			auth: {
				persistSession: false,
				autoRefreshToken: false,
			},
		});
	} catch (error) {
		if (error instanceof Error && !error.message.includes("Missing Supabase credentials")) {
			Sentry.captureException(error);
			logger.error("Unexpected error creating service client", {
				error: error.message,
			});
		}
		throw error;
	}
}

/**
 * Get Supabase anon client (RLS-enforced).
 * Used for user-scoped queries with RLS policies active.
 */
export function getAnonClient(): SupabaseClient {
	try {
		const supabaseUrl = process.env.SUPABASE_URL;
		const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

		if (!supabaseUrl || !supabaseAnonKey) {
			const error = new Error(
				"Missing Supabase credentials: SUPABASE_URL and SUPABASE_ANON_KEY must be set",
			);
			Sentry.captureException(error, {
				contexts: {
					environment: {
						has_url: !!supabaseUrl,
						has_anon_key: !!supabaseAnonKey,
					},
				},
			});
			logger.error("Missing Supabase credentials", {
				has_url: !!supabaseUrl,
				has_anon_key: !!supabaseAnonKey,
			});
			throw error;
		}

		logger.debug("Creating anon client", {
			supabase_url: supabaseUrl,
		});

		return createClient(supabaseUrl, supabaseAnonKey, {
			auth: {
				persistSession: false,
				autoRefreshToken: false,
			},
		});
	} catch (error) {
		if (error instanceof Error && !error.message.includes("Missing Supabase credentials")) {
			Sentry.captureException(error);
			logger.error("Unexpected error creating anon client", {
				error: error.message,
			});
		}
		throw error;
	}
}

/**
 * Set RLS context for user-scoped queries.
 * Sets the app.user_id session variable for RLS policy enforcement.
 *
 * IMPORTANT: This uses SET LOCAL (transaction-scoped) to prevent
 * context bleed between requests.
 *
 * @param client - Supabase client (typically anon client)
 * @param userId - User UUID to set as context
 * @returns Same client for chaining
 */
export async function setUserContext(
	client: SupabaseClient,
	userId: string,
): Promise<SupabaseClient> {
	try {
		logger.debug("Setting user context", {
			user_id: userId,
		});

		// Use SET LOCAL for transaction-scoped variable (safer than SET)
		const { error } = await client.rpc("set_user_context", { user_id: userId });

		if (error) {
			Sentry.captureException(error, {
				contexts: {
					rls: {
						user_id: userId,
						operation: "set_user_context",
					},
				},
			});
			logger.error("Failed to set user context", {
				error: error.message,
				user_id: userId,
			});
			throw error;
		}

		return client;
	} catch (error) {
		if (error instanceof Error) {
			Sentry.captureException(error, {
				contexts: {
					rls: {
						user_id: userId,
						operation: "set_user_context",
					},
				},
			});
			logger.error("Unexpected error setting user context", {
				error: error.message,
				user_id: userId,
			});
		}
		throw error;
	}
}

/**
 * Clear RLS context (reset app.user_id).
 * Called after queries complete to prevent context bleed.
 *
 * @param client - Supabase client
 * @returns Same client for chaining
 */
export async function clearUserContext(
	client: SupabaseClient,
): Promise<SupabaseClient> {
	try {
		logger.debug("Clearing user context");

		const { error } = await client.rpc("clear_user_context");

		if (error) {
			Sentry.captureException(error, {
				contexts: {
					rls: {
						operation: "clear_user_context",
					},
				},
			});
			logger.error("Failed to clear user context", {
				error: error.message,
			});
			throw error;
		}

		return client;
	} catch (error) {
		if (error instanceof Error) {
			Sentry.captureException(error, {
				contexts: {
					rls: {
						operation: "clear_user_context",
					},
				},
			});
			logger.error("Unexpected error clearing user context", {
				error: error.message,
			});
		}
		throw error;
	}
}
