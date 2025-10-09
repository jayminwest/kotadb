/**
 * Real database test helpers for integration testing
 * Uses local PostgreSQL test database instead of mocks
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Test database connection details
 * Points to Supabase Local (PostgREST via Kong gateway)
 */
const TEST_DB_URL = "http://localhost:54321";
const TEST_DB_KEY =
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
	disabled:
		"kota_free_disabled12345678_0123456789abcdef0123456789abcdef",
};

/**
 * Test user IDs matching the seeded data
 */
export const TEST_USER_IDS = {
	free: "00000000-0000-0000-0000-000000000001",
	solo: "00000000-0000-0000-0000-000000000002",
	team: "00000000-0000-0000-0000-000000000003",
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
 * Create a test user in the database
 * Returns the created user's ID
 */
export async function createTestUser(overrides?: {
	email?: string;
	id?: string;
}): Promise<string> {
	const client = getSupabaseTestClient();
	const userId = overrides?.id || crypto.randomUUID();
	const email = overrides?.email || `test-${userId}@example.com`;

	const { error } = await client.from("auth.users").insert({
		id: userId,
		email,
	});

	if (error) {
		throw new Error(`Failed to create test user: ${error.message}`);
	}

	return userId;
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
		throw new Error(`Failed to create test organization: ${error.message}`);
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
	const fullName = overrides?.fullName || `test-user/test-repo-${repoId.slice(0, 8)}`;
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
		throw new Error(`Failed to create test repository: ${error.message}`);
	}

	return repoId;
}
