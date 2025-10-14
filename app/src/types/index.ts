import type { SupabaseClient } from "@supabase/supabase-js";

export interface IndexRequest {
	repository: string;
	ref?: string;
	localPath?: string;
}

export interface IndexedFile {
	id?: string; // UUID in Postgres
	projectRoot: string; // Repository ID for compatibility
	path: string;
	content: string;
	dependencies: string[];
	indexedAt: Date;
}

export interface ApiContext {
	supabase: SupabaseClient;
}

/**
 * Authentication types for API key validation and user context.
 * @see src/auth/context.ts for detailed documentation
 */
export type { AuthContext, AuthenticatedRequest, Tier } from "@auth/context";

/**
 * Validation types for command output validation.
 * @see src/validation/types.ts for detailed documentation
 */
export type {
  ValidationRequest,
  ValidationResponse,
  ValidationError
} from "@validation/types";
