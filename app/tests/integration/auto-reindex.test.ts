/**
 * Integration tests for auto-reindex functionality
 * Tests session-based repository synchronization with rate limiting
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
	getSupabaseTestClient,
	TEST_USER_IDS,
	TEST_REPO_IDS,
} from "../helpers/db";
import { triggerAutoReindex } from "@api/auto-reindex";
import type { AuthContext } from "@shared/types";
import { startQueue, stopQueue, getQueue } from "@queue/client";
import { startIndexWorker } from "@queue/workers/index-repo";
import { RATE_LIMITS } from "@config/constants";

describe("Auto-Reindex Integration Tests", () => {
	const supabase = getSupabaseTestClient();
	let testApiKeyId: string;

	beforeAll(async () => {
		// Start queue and workers for job enqueueing
		await startQueue();
		await startIndexWorker(getQueue());

		// Get the actual API key ID from the database for the free tier test user
		const { data: apiKey, error } = await supabase
			.from("api_keys")
			.select("id")
			.eq("user_id", TEST_USER_IDS.free)
			.eq("key_id", "test1234567890ab")
			.single();

		if (error || !apiKey) {
			throw new Error(`Failed to fetch test API key: ${error?.message}`);
		}

		testApiKeyId = apiKey.id;
	});

	beforeEach(async () => {
		// Clean up test data before each test to ensure isolation
		await supabase
			.from("project_repositories")
			.delete()
			.eq("project_id", "30000000-0000-0000-0000-000000000001");

		await supabase
			.from("projects")
			.delete()
			.eq("id", "30000000-0000-0000-0000-000000000001");

		// Reset the API key metadata to clear last_auto_reindex_at
		await supabase
			.from("api_keys")
			.update({ metadata: {} })
			.eq("id", testApiKeyId);
	});

	afterAll(async () => {
		// Final cleanup
		await supabase
			.from("project_repositories")
			.delete()
			.eq("project_id", "30000000-0000-0000-0000-000000000001");

		await supabase
			.from("projects")
			.delete()
			.eq("id", "30000000-0000-0000-0000-000000000001");

		// Stop queue to clean up resources
		await stopQueue();
	});

	test("should return no projects when user has no projects configured", async () => {
		const context: AuthContext = {
			userId: TEST_USER_IDS.free,
			tier: "free",
			keyId: testApiKeyId,
			rateLimitPerHour: RATE_LIMITS.FREE.HOURLY,
		};

		const result = await triggerAutoReindex(context);

		expect(result.triggered).toBe(false);
		expect(result.jobCount).toBe(0);
		expect(result.reason).toBe("No projects configured");
	});

	test("should return no repositories when project has no repositories", async () => {
		// Create a project without repositories
		const { data: project, error: insertError } = await supabase
			.from("projects")
			.insert({
				id: "30000000-0000-0000-0000-000000000001",
				user_id: TEST_USER_IDS.free,
				name: "Empty Test Project",
				description: "Project for auto-reindex testing",
			})
			.select("id")
			.single();

		if (insertError) {
			throw new Error(`Failed to create test project: ${insertError.message}`);
		}

		expect(project).toBeDefined();

		const context: AuthContext = {
			userId: TEST_USER_IDS.free,
			tier: "free",
			keyId: testApiKeyId,
			rateLimitPerHour: RATE_LIMITS.FREE.HOURLY,
		};

		const result = await triggerAutoReindex(context);

		expect(result.triggered).toBe(false);
		expect(result.jobCount).toBe(0);
		expect(result.reason).toBe("No repositories in projects");
	});

	test("should trigger reindex for stale repositories", async () => {
		// Create a project with a repository
		const { data: project, error: insertError } = await supabase
			.from("projects")
			.insert({
				id: "30000000-0000-0000-0000-000000000001",
				user_id: TEST_USER_IDS.free,
				name: "Test Project with Repo",
				description: "Project for auto-reindex testing",
			})
			.select("id")
			.single();

		if (insertError) {
			throw new Error(`Failed to create test project: ${insertError.message}`);
		}

		expect(project).toBeDefined();

		// Link repository to project
		await supabase.from("project_repositories").insert({
			project_id: project!.id,
			repository_id: TEST_REPO_IDS.userRepo,
		});

		// Make repository stale by updating its updated_at to 2 hours ago
		await supabase
			.from("repositories")
			.update({
				updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
			})
			.eq("id", TEST_REPO_IDS.userRepo);

		const context: AuthContext = {
			userId: TEST_USER_IDS.free,
			tier: "free",
			keyId: testApiKeyId,
			rateLimitPerHour: RATE_LIMITS.FREE.HOURLY,
		};

		const result = await triggerAutoReindex(context);

		expect(result.triggered).toBe(true);
		expect(result.jobCount).toBeGreaterThan(0);
		expect(result.jobIds.length).toBeGreaterThan(0);
	});

	test("should respect rate limiting for auto-reindex", async () => {
		// Create a project with a repository
		const { data: project, error: insertError } = await supabase
			.from("projects")
			.insert({
				id: "30000000-0000-0000-0000-000000000001",
				user_id: TEST_USER_IDS.free,
				name: "Rate Limit Test Project",
				description: "Project for rate limit testing",
			})
			.select("id")
			.single();

		if (insertError) {
			throw new Error(`Failed to create test project: ${insertError.message}`);
		}

		expect(project).toBeDefined();

		// Link repository to project
		await supabase.from("project_repositories").insert({
			project_id: project!.id,
			repository_id: TEST_REPO_IDS.userRepo,
		});

		// Make repository stale
		await supabase
			.from("repositories")
			.update({
				updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
			})
			.eq("id", TEST_REPO_IDS.userRepo);

		const context: AuthContext = {
			userId: TEST_USER_IDS.free,
			tier: "free",
			keyId: testApiKeyId,
			rateLimitPerHour: RATE_LIMITS.FREE.HOURLY,
		};

		// First trigger should succeed
		const firstResult = await triggerAutoReindex(context);
		expect(firstResult.triggered).toBe(true);

		// Second trigger within rate limit window should be rate limited
		const secondResult = await triggerAutoReindex(context);
		expect(secondResult.rateLimited).toBe(true);
		expect(secondResult.triggered).toBe(false);
	});
});
