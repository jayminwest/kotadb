/**
 * Unit tests for GitHub webhook processor
 * Issue #261 - Integrate GitHub webhooks with job queue for auto-indexing
 *
 * Tests the webhook processor logic against real Supabase Local database.
 * Validates repository lookup, branch filtering, deduplication, and job queueing.
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { getServiceClient } from "../../src/db/client";
import { processPushEvent } from "../../src/github/webhook-processor";
import type { GitHubPushEvent } from "../../src/github/types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Webhook Processor - Unit Tests", () => {
	let supabase: SupabaseClient;
	let testUserId: string;
	let testOrgId: string;
	let testRepoId: string;
	let orgRepoId: string;

	beforeAll(async () => {
		supabase = getServiceClient();

		// Create test user
		const { data: userData, error: userError } = await supabase.auth.admin.createUser({
			email: "webhook-processor-test@example.com",
			password: "test-password-123",
			email_confirm: true,
		});

		if (userError) throw userError;
		testUserId = userData.user.id;

		// Create test organization
		const { data: orgData, error: orgError } = await supabase
			.from("organizations")
			.insert({
				name: "Test Org",
				slug: "test-org-webhook-processor",
				owner_id: testUserId,
			})
			.select()
			.single();

		if (orgError) throw orgError;
		testOrgId = orgData.id;

		// Add user to organization
		await supabase.from("user_organizations").insert({
			user_id: testUserId,
			org_id: testOrgId,
			role: "owner",
		});

		// Create user-owned test repository
		const { data: repoData, error: repoError } = await supabase
			.from("repositories")
			.insert({
				user_id: testUserId,
				full_name: "testuser/webhook-test-repo",
				git_url: "https://github.com/testuser/webhook-test-repo.git",
				default_branch: "main",
			})
			.select()
			.single();

		if (repoError) throw repoError;
		testRepoId = repoData.id;

		// Create org-owned test repository
		const { data: orgRepoData, error: orgRepoError } = await supabase
			.from("repositories")
			.insert({
				org_id: testOrgId,
				full_name: "testorg/webhook-test-repo",
				git_url: "https://github.com/testorg/webhook-test-repo.git",
				default_branch: "develop",
			})
			.select()
			.single();

		if (orgRepoError) throw orgRepoError;
		orgRepoId = orgRepoData.id;
	});

	afterAll(async () => {
		// Clean up test data
		await supabase.from("repositories").delete().eq("id", testRepoId);
		await supabase.from("repositories").delete().eq("id", orgRepoId);
		await supabase.from("user_organizations").delete().eq("user_id", testUserId);
		await supabase.from("organizations").delete().eq("id", testOrgId);
		await supabase.auth.admin.deleteUser(testUserId);
	});

	beforeEach(async () => {
		// Clean up index_jobs before each test
		await supabase.from("index_jobs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
	});

	test("queues job for push to tracked repository default branch", async () => {
		const payload: GitHubPushEvent = {
			ref: "refs/heads/main",
			after: "abc123def456",
			repository: {
				id: 123456,
				name: "webhook-test-repo",
				full_name: "testuser/webhook-test-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		await processPushEvent(payload);

		// Verify job was created
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("repository_id", testRepoId)
			.eq("commit_sha", "abc123def456");

		expect(error).toBeNull();
		expect(jobs).toHaveLength(1);
		expect(jobs![0].status).toBe("pending");
		expect(jobs![0].ref).toBe("refs/heads/main");
	});

	test("ignores push to untracked repository", async () => {
		const payload: GitHubPushEvent = {
			ref: "refs/heads/main",
			after: "untracked123",
			repository: {
				id: 999999,
				name: "untracked-repo",
				full_name: "testuser/untracked-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		await processPushEvent(payload);

		// Verify no job was created
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("commit_sha", "untracked123");

		expect(error).toBeNull();
		expect(jobs).toHaveLength(0);
	});

	test("ignores push to non-default branch", async () => {
		const payload: GitHubPushEvent = {
			ref: "refs/heads/feature/test",
			after: "feature123",
			repository: {
				id: 123456,
				name: "webhook-test-repo",
				full_name: "testuser/webhook-test-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		await processPushEvent(payload);

		// Verify no job was created
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("commit_sha", "feature123");

		expect(error).toBeNull();
		expect(jobs).toHaveLength(0);
	});

	test("deduplicates pending jobs with same commit SHA", async () => {
		const commitSha = "duplicate123";

		// Create first job manually
		await supabase.from("index_jobs").insert({
			repository_id: testRepoId,
			ref: "refs/heads/main",
			commit_sha: commitSha,
			status: "pending",
		});

		const payload: GitHubPushEvent = {
			ref: "refs/heads/main",
			after: commitSha,
			repository: {
				id: 123456,
				name: "webhook-test-repo",
				full_name: "testuser/webhook-test-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		await processPushEvent(payload);

		// Verify only one job exists (deduplication worked)
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("commit_sha", commitSha);

		expect(error).toBeNull();
		expect(jobs).toHaveLength(1);
	});

	test("allows new job for same commit if previous job completed", async () => {
		const commitSha = "completed123";

		// Create completed job manually
		await supabase.from("index_jobs").insert({
			repository_id: testRepoId,
			ref: "refs/heads/main",
			commit_sha: commitSha,
			status: "completed",
		});

		const payload: GitHubPushEvent = {
			ref: "refs/heads/main",
			after: commitSha,
			repository: {
				id: 123456,
				name: "webhook-test-repo",
				full_name: "testuser/webhook-test-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		await processPushEvent(payload);

		// Verify two jobs exist (one completed, one pending)
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("commit_sha", commitSha);

		expect(error).toBeNull();
		expect(jobs).toHaveLength(2);
		expect(jobs!.some(j => j.status === "completed")).toBe(true);
		expect(jobs!.some(j => j.status === "pending")).toBe(true);
	});

	test("updates repository last_push_at timestamp", async () => {
		// Get current timestamp
		const { data: repoBefore } = await supabase
			.from("repositories")
			.select("last_push_at")
			.eq("id", testRepoId)
			.single();

		const payload: GitHubPushEvent = {
			ref: "refs/heads/main",
			after: "timestamp123",
			repository: {
				id: 123456,
				name: "webhook-test-repo",
				full_name: "testuser/webhook-test-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		await processPushEvent(payload);

		// Wait a bit to ensure timestamp updates
		await new Promise(resolve => setTimeout(resolve, 100));

		// Get updated timestamp
		const { data: repoAfter } = await supabase
			.from("repositories")
			.select("last_push_at")
			.eq("id", testRepoId)
			.single();

		// Verify timestamp was updated (either it was null before, or it changed)
		if (repoBefore?.last_push_at) {
			expect(new Date(repoAfter!.last_push_at!).getTime())
				.toBeGreaterThan(new Date(repoBefore.last_push_at).getTime());
		} else {
			expect(repoAfter!.last_push_at).not.toBeNull();
		}
	});

	test("resolves user context for user-owned repository", async () => {
		const payload: GitHubPushEvent = {
			ref: "refs/heads/main",
			after: "usercontext123",
			repository: {
				id: 123456,
				name: "webhook-test-repo",
				full_name: "testuser/webhook-test-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		await processPushEvent(payload);

		// Verify job was created (implicitly tests user context resolution)
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("commit_sha", "usercontext123");

		expect(error).toBeNull();
		expect(jobs).toHaveLength(1);
	});

	test("resolves user context for org-owned repository", async () => {
		const payload: GitHubPushEvent = {
			ref: "refs/heads/develop",
			after: "orgcontext123",
			repository: {
				id: 789456,
				name: "webhook-test-repo",
				full_name: "testorg/webhook-test-repo",
				private: false,
				default_branch: "develop",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		await processPushEvent(payload);

		// Verify job was created (implicitly tests user context resolution)
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("commit_sha", "orgcontext123");

		expect(error).toBeNull();
		expect(jobs).toHaveLength(1);
	});

	test("gracefully handles database errors without throwing", async () => {
		const payload: GitHubPushEvent = {
			ref: "refs/heads/main",
			after: "errorhandling123",
			repository: {
				id: 123456,
				name: "webhook-test-repo",
				full_name: "testuser/webhook-test-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		// This should not throw even if there are internal errors
		await expect(processPushEvent(payload)).resolves.toBeUndefined();
	});
});
