/**
 * Real database test helpers for integration testing
 * Uses local PostgreSQL test database instead of mocks
 */

import { type SupabaseClient, createClient } from "@supabase/supabase-js";

/**
 * Test database connection details
 * Points to Supabase Local Kong gateway on port 54322 (local default)
 * or dynamically generated port in CI (from .env.test)
 *
 * Architecture:
 * - Port 54322 = Kong gateway (routes /rest/v1/ to PostgREST) - Use this for Supabase JS client
 * - Port 54321 = PostgREST direct (no /rest/v1/ prefix) - Use this for raw HTTP access
 *
 * The Supabase JS client expects Kong gateway format with /rest/v1/ prefix.
 *
 * Environment variables (set by CI workflow from .env.test):
 * - SUPABASE_URL: Supabase API URL (defaults to http://localhost:54322 for local dev)
 * - SUPABASE_SERVICE_KEY: Service role key (defaults to local Supabase demo key)
 */
const TEST_DB_URL = process.env.SUPABASE_URL || "http://localhost:54322";
const TEST_DB_KEY =
	process.env.SUPABASE_SERVICE_KEY ||
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/**
 * Get a Supabase client connected to the test database
 * This returns a real client, not a mock
 */
export function getSupabaseTestClient(): SupabaseClient {
	return createClient(TEST_DB_URL, TEST_DB_KEY);
}

/**
 * Test API keys for each tier
 * These match the keys seeded in supabase/seed.sql
 */
export const TEST_API_KEYS = {
	free: "kota_free_test1234567890ab_0123456789abcdef0123456789abcdef",
	solo: "kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef",
	team: "kota_team_team1234567890ab_0123456789abcdef0123456789abcdef",
	disabled: "kota_free_disabled12345678_0123456789abcdef0123456789abcdef",
};

/**
 * Test user IDs matching the seeded data
 */
export const TEST_USER_IDS = {
	free: "00000000-0000-0000-0000-000000000001",
	solo: "00000000-0000-0000-0000-000000000002",
	team: "00000000-0000-0000-0000-000000000003",
	// Aliases for multi-user RLS testing
	alice: "00000000-0000-0000-0000-000000000001", // Same as free user
	bob: "00000000-0000-0000-0000-000000000002", // Same as solo user
};

/**
 * Test organization IDs
 */
export const TEST_ORG_IDS = {
	testOrg: "10000000-0000-0000-0000-000000000001",
};

/**
 * Test repository IDs
 */
export const TEST_REPO_IDS = {
	userRepo: "20000000-0000-0000-0000-000000000001",
	soloRepo: "20000000-0000-0000-0000-000000000002",
	teamRepo: "20000000-0000-0000-0000-000000000003",
};

/**
 * Get a test API key for the specified tier
 */
export function getTestApiKey(
	tier: "free" | "solo" | "team" | "disabled" = "free",
): string {
	return TEST_API_KEYS[tier];
}

/**
 * Create Authorization header with test API key
 */
export function createAuthHeader(
	tier: "free" | "solo" | "team" | "disabled" = "free",
): string {
	return `Bearer ${getTestApiKey(tier)}`;
}

/**
 * Reset test database to clean state
 * Truncates all tables and re-seeds with test data
 *
 * Note: This requires the reset-test-db.sh script to be run
 * or direct database connection to execute TRUNCATE commands
 */
export async function resetTestDatabase(): Promise<void> {
	// For now, this would require calling the reset script
	// In a production test suite, this could use a direct database connection
	// or Supabase admin API to truncate tables
	throw new Error(
		"resetTestDatabase not yet implemented - use ./scripts/reset-test-db.sh",
	);
}

/**
 * Create a test organization in the database
 * Returns the created organization's ID
 */
export async function createTestOrganization(overrides?: {
	name?: string;
	slug?: string;
	ownerId?: string;
}): Promise<string> {
	const client = getSupabaseTestClient();
	const orgId = crypto.randomUUID();
	const name = overrides?.name || `Test Org ${orgId.slice(0, 8)}`;
	const slug = overrides?.slug || `test-org-${orgId.slice(0, 8)}`;
	const ownerId = overrides?.ownerId || TEST_USER_IDS.free;

	const { error } = await client.from("organizations").insert({
		id: orgId,
		name,
		slug,
		owner_id: ownerId,
	});

	if (error) {
		// Supabase error objects may lack message property - fallback to JSON serialization
		throw new Error(
			`Failed to create test organization: ${error.message || JSON.stringify(error)}`,
		);
	}

	return orgId;
}

/**
 * Create a test repository in the database
 * Returns the created repository's ID
 */
export async function createTestRepository(overrides?: {
	fullName?: string;
	userId?: string;
	orgId?: string;
}): Promise<string> {
	const client = getSupabaseTestClient();
	const repoId = crypto.randomUUID();
	const fullName =
		overrides?.fullName || `test-user/test-repo-${repoId.slice(0, 8)}`;
	const userId = overrides?.userId;
	const orgId = overrides?.orgId;

	// Must have either userId or orgId, not both
	if ((!userId && !orgId) || (userId && orgId)) {
		throw new Error("Must provide either userId or orgId, not both");
	}

	const { error } = await client.from("repositories").insert({
		id: repoId,
		full_name: fullName,
		user_id: userId || null,
		org_id: orgId || null,
	});

	if (error) {
		// Supabase error objects may lack message property - fallback to JSON serialization
		throw new Error(
			`Failed to create test repository: ${error.message || JSON.stringify(error)}`,
		);
	}

	return repoId;
}

/**
 * Reset rate limit counters for test isolation
 *
 * Deletes rate limit counter records from the database. Can target a specific API key
 * or reset all counters if no keyId is provided.
 *
 * @param keyId - Optional API key ID to reset. If omitted, resets all counters.
 * @returns Count of deleted counter records (0 if none existed)
 *
 * @example
 * // Clean up after individual test
 * afterEach(async () => {
 *   await resetRateLimitCounters(testKeyId);
 * });
 *
 * @example
 * // Global cleanup in test suite
 * afterAll(async () => {
 *   await resetRateLimitCounters(); // Reset all counters
 * });
 *
 * Note: Compatible with CI environment (respects dynamic ports from .env.test)
 */
export async function resetRateLimitCounters(
	keyId?: string,
): Promise<number> {
	const client = getSupabaseTestClient();

	let query = client.from("rate_limit_counters").delete({ count: "exact" });

	if (keyId) {
		query = query.eq("key_id", keyId);
	}

	const { error, count } = await query;

	if (error) {
		throw new Error(
			`Failed to reset rate limit counters: ${error.message || JSON.stringify(error)}`,
		);
	}

	return count || 0;
}

/**
 * Get current rate limit status for an API key
 *
 * Retrieves the rate limit counter state for debugging and test assertions.
 * Returns null if no counter exists (key has not been rate limited yet).
 *
 * @param keyId - API key ID to inspect
 * @returns Counter state with request_count, window_start, and created_at, or null
 *
 * @example
 * // Inspect counter state during test
 * const status = await getRateLimitStatus(testKeyId);
 * if (status) {
 *   console.log(`Key has made ${status.request_count} requests`);
 *   console.log(`Window started at ${status.window_start}`);
 * }
 *
 * @example
 * // Assert counter state in test
 * const status = await getRateLimitStatus(testKeyId);
 * expect(status).not.toBeNull();
 * expect(status?.request_count).toBe(50);
 *
 * Note: Compatible with CI environment (respects dynamic ports from .env.test)
 */
export async function getRateLimitStatus(keyId: string): Promise<{
	request_count: number;
	window_start: string;
	created_at: string;
} | null> {
	const client = getSupabaseTestClient();

	const { data, error } = await client
		.from("rate_limit_counters")
		.select("request_count, window_start, created_at")
		.eq("key_id", keyId)
		.maybeSingle();

	if (error) {
		throw new Error(
			`Failed to get rate limit status: ${error.message || JSON.stringify(error)}`,
		);
	}

	return data;
}

/**
 * Create a test index job with specific user context for RLS testing.
 *
 * Simplifies multi-user RLS testing by creating jobs directly in the database
 * with proper user context set. Useful for testing that users can only query
 * their own jobs.
 *
 * @param options - Job creation options
 * @param options.userId - User ID to create the job for (required for RLS)
 * @param options.repositoryId - Repository ID for the job (auto-creates if not provided)
 * @param options.ref - Git ref to index (defaults to "main")
 * @param options.status - Job status (defaults to "pending")
 * @returns Created job ID
 *
 * @example
 * // Create job for User A
 * const jobId = await createTestJob({ userId: TEST_USER_IDS.alice });
 *
 * @example
 * // Create completed job for User B
 * const jobId = await createTestJob({
 *   userId: TEST_USER_IDS.bob,
 *   status: "completed"
 * });
 *
 * Note: Compatible with CI environment (respects dynamic ports from .env.test)
 */
export async function createTestJob(options: {
	userId: string;
	repositoryId?: string;
	ref?: string;
	status?: "pending" | "running" | "completed" | "failed" | "skipped";
}): Promise<string> {
	const client = getSupabaseTestClient();
	const { userId, ref = "main", status = "pending" } = options;

	// Create repository if not provided
	let repositoryId = options.repositoryId;
	if (!repositoryId) {
		repositoryId = await createTestRepository({ userId });
	}

	// Set user context for RLS
	await client.rpc("set_user_context", { user_id: userId });

	// Create job
	const jobId = crypto.randomUUID();
	const { error } = await client.from("index_jobs").insert({
		id: jobId,
		repository_id: repositoryId,
		ref,
		status,
	});

	if (error) {
		throw new Error(
			`Failed to create test job: ${error.message || JSON.stringify(error)}`,
		);
	}

	// Clear user context
	await client.rpc("clear_user_context");

	return jobId;
}
