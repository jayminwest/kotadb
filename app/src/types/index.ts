import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Application-specific types for internal use.
 * For shared types (API contracts, entities, auth, etc.), import from @shared/types
 */

/**
 * API context passed to handlers.
 * Contains Supabase client for database access.
 */
export interface ApiContext {
	supabase: SupabaseClient;
}
