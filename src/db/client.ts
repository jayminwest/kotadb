/**
 * Supabase client configuration and RLS context management.
 *
 * Provides service role and anon clients for different access patterns:
 * - Service role: Full access for authentication and admin operations
 * - Anon: RLS-enforced access for user-scoped queries
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Get Supabase service role client (full access, bypasses RLS).
 * Used for authentication queries and admin operations.
 */
export function getServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Missing Supabase credentials: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set"
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Get Supabase anon client (RLS-enforced).
 * Used for user-scoped queries with RLS policies active.
 */
export function getAnonClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase credentials: SUPABASE_URL and SUPABASE_ANON_KEY must be set"
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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
  userId: string
): Promise<SupabaseClient> {
  // Use SET LOCAL for transaction-scoped variable (safer than SET)
  await client.rpc("set_user_context", { user_id: userId });

  return client;
}

/**
 * Clear RLS context (reset app.user_id).
 * Called after queries complete to prevent context bleed.
 *
 * @param client - Supabase client
 * @returns Same client for chaining
 */
export async function clearUserContext(
  client: SupabaseClient
): Promise<SupabaseClient> {
  await client.rpc("clear_user_context");
  return client;
}
