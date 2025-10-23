/**
 * Integration tests for GitHub webhook endpoint
 * Issue #260 - GitHub webhook receiver with HMAC signature verification
 *
 * Tests the POST /webhooks/github endpoint with real Express server.
 * Uses real Supabase Local for consistency with antimocking philosophy.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHmac } from "node:crypto";
import { createExpressApp } from "../../src/api/routes";
import { getServiceClient } from "../../src/db/client";
import { waitForCondition } from "../helpers/async-assertions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Server } from "node:http";

// Set up webhook secret globally before any tests run
const WEBHOOK_TEST_SECRET = "test-webhook-secret-for-integration-tests";
const ORIGINAL_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_TEST_SECRET;

/**
 * Helper: Generate valid HMAC-SHA256 signature for testing
 */
function generateSignature(payload: string, secret: string): string {
	const hmac = createHmac("sha256", secret);
	hmac.update(payload);
	return `sha256=${hmac.digest("hex")}`;
}

/**
 * Helper: Send webhook request to Express server
 */
async function sendWebhookRequest(
	baseUrl: string,
	payload: object,
	options: {
		signature?: string;
		event?: string;
		delivery?: string;
		secret: string;
	},
): Promise<Response> {
	const {
		signature,
		event = "push",
		delivery = "test-delivery-123",
		secret,
	} = options;

	const body = JSON.stringify(payload);
	const computedSignature = signature !== undefined ? signature : generateSignature(body, secret);

	return fetch(`${baseUrl}/webhooks/github`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-GitHub-Event": event,
			"X-GitHub-Delivery": delivery,
			"X-Hub-Signature-256": computedSignature,
		},
		body,
	});
}

describe("POST /webhooks/github - Integration", () => {
	let supabase: SupabaseClient;
	let server: Server;
	let baseUrl: string;
	const testSecret = WEBHOOK_TEST_SECRET;

	beforeAll(async () => {
		// Initialize Supabase client (real connection for consistency)
		supabase = getServiceClient();

		// Create Express app (webhook secret already set globally)
		const app = createExpressApp(supabase);

		// Start HTTP server on random port
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => {
				const address = server.address();
				const port = typeof address === "object" ? address?.port : 0;
				baseUrl = `http://localhost:${port}`;
				resolve();
			});
		});
	});

	afterAll(async () => {
		// Stop server
		await new Promise<void>((resolve) => {
			server?.close(() => resolve());
		});
	});

	test("returns 200 for valid push event with correct signature", async () => {
		const payload = {
			ref: "refs/heads/main",
			after: "abc123def456",
			repository: {
				id: 123456,
				name: "test-repo",
				full_name: "owner/test-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({ received: true });
	});

	test("returns 401 for invalid signature", async () => {
		const payload = { ref: "refs/heads/main", after: "abc123" };

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: "wrong-secret",
		});

		expect(response.status).toBe(401);
		const data = (await response.json()) as { error: string };
		expect(data).toHaveProperty("error");
		expect(data.error).toContain("Invalid signature");
	});

	test("returns 401 for missing signature header", async () => {
		const payload = { ref: "refs/heads/main", after: "abc123" };

		const response = await sendWebhookRequest(baseUrl, payload, {
			signature: "", // Empty signature
			secret: testSecret,
		});

		expect(response.status).toBe(401);
		const data = await response.json();
		expect(data).toHaveProperty("error");
	});

	test("returns 400 for missing event type header", async () => {
		const payload = { ref: "refs/heads/main", after: "abc123" };

		const response = await sendWebhookRequest(baseUrl, payload, {
			event: "", // Empty event type
			secret: testSecret,
		});

		expect(response.status).toBe(400);
		const data = (await response.json()) as { error: string };
		expect(data).toHaveProperty("error");
		expect(data.error).toContain("event type");
	});

	test("returns 200 for unknown event type (gracefully ignored)", async () => {
		const payload = {
			action: "created",
			installation: {
				id: 12345,
			},
		};

		const response = await sendWebhookRequest(baseUrl, payload, {
			event: "installation",
			secret: testSecret,
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({ received: true });
	});

	test("returns 400 for malformed JSON payload", async () => {
		const invalidJson = "{invalid json";
		const signature = generateSignature(invalidJson, testSecret);

		const response = await fetch(`${baseUrl}/webhooks/github`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-GitHub-Event": "push",
				"X-GitHub-Delivery": "test-delivery-456",
				"X-Hub-Signature-256": signature,
			},
			body: invalidJson,
		});

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data).toHaveProperty("error");
		expect(typeof (data as any).error).toBe("string");
		expect((data as any).error).toMatch(/JSON/i);
	});

	test("returns 500 when webhook secret is not configured", async () => {
		// Temporarily remove webhook secret
		const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
		process.env.GITHUB_WEBHOOK_SECRET = undefined;

		const payload = { ref: "refs/heads/main", after: "abc123" };

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
		});

		expect(response.status).toBe(500);
		const data = (await response.json()) as { error: string };
		expect(data).toHaveProperty("error");
		expect(data.error).toContain("not configured");

		// Restore secret
		process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
	});

	test("handles push event with valid payload parsing", async () => {
		const payload = {
			ref: "refs/heads/feature/test",
			after: "def456ghi789",
			repository: {
				id: 987654,
				name: "another-repo",
				full_name: "org/another-repo",
				private: true,
				default_branch: "develop",
			},
			sender: {
				login: "developer",
				id: 111,
			},
		};

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
			delivery: "unique-delivery-id-789",
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({ received: true });
	});
});

describe("POST /webhooks/github - Job Queue Integration", () => {
	let supabase: SupabaseClient;
	let server: Server;
	let baseUrl: string;
	let testUserId: string;
	let testRepoId: string;
	const testSecret = WEBHOOK_TEST_SECRET;

	beforeAll(async () => {
		supabase = getServiceClient();

		// Create test user
		const { data: userData, error: userError } = await supabase.auth.admin.createUser({
			email: "webhook-job-queue-test@example.com",
			password: "test-password-456",
			email_confirm: true,
		});

		if (userError) throw userError;
		testUserId = userData.user.id;

		// Create test repository
		const { data: repoData, error: repoError } = await supabase
			.from("repositories")
			.insert({
				user_id: testUserId,
				full_name: "testuser/webhook-integration-repo",
				git_url: "https://github.com/testuser/webhook-integration-repo.git",
				default_branch: "main",
			})
			.select()
			.single();

		if (repoError) throw repoError;
		testRepoId = repoData.id;

		// Create Express app
		const app = createExpressApp(supabase);

		// Start HTTP server
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => {
				const address = server.address();
				const port = typeof address === "object" ? address?.port : 0;
				baseUrl = `http://localhost:${port}`;
				resolve();
			});
		});
	});

	afterAll(async () => {
		// Clean up
		await supabase.from("index_jobs").delete().eq("repository_id", testRepoId);
		await supabase.from("repositories").delete().eq("id", testRepoId);
		await supabase.auth.admin.deleteUser(testUserId);

		await new Promise<void>((resolve) => {
			server?.close(() => resolve());
		});

		// Restore original webhook secret after all tests complete
		if (ORIGINAL_WEBHOOK_SECRET !== undefined) {
			process.env.GITHUB_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET;
		} else {
			process.env.GITHUB_WEBHOOK_SECRET = undefined;
		}
	});

	test("creates index job for push to tracked repository", async () => {
		const commitSha = "integration-test-123";
		const payload = {
			ref: "refs/heads/main",
			after: commitSha,
			repository: {
				id: 123456,
				name: "webhook-integration-repo",
				full_name: "testuser/webhook-integration-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
		});

		expect(response.status).toBe(200);

		// Wait for async job creation to be visible in database
		// Webhook processing happens asynchronously via processPushEvent().catch()
		// In CI environments, slower I/O may delay database visibility of the job
		await waitForCondition(
			async () => {
				const { data: jobs } = await supabase
					.from("index_jobs")
					.select("*")
					.eq("repository_id", testRepoId)
					.eq("commit_sha", commitSha);
				return jobs !== null && jobs.length > 0;
			},
			{ timeout: 3000, interval: 50, message: "Index job not created" }
		);

		// Verify job was created with expected fields
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("repository_id", testRepoId)
			.eq("commit_sha", commitSha);

		expect(error).toBeNull();
		expect(jobs).toHaveLength(1);
		expect(jobs![0].status).toBe("pending");
		expect(jobs![0].ref).toBe("refs/heads/main");
	});

	test("returns 200 but creates no job for untracked repository", async () => {
		const commitSha = "untracked-test-456";
		const payload = {
			ref: "refs/heads/main",
			after: commitSha,
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

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
		});

		expect(response.status).toBe(200);

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 200));

		// Verify no job was created
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("commit_sha", commitSha);

		expect(error).toBeNull();
		expect(jobs).toHaveLength(0);
	});

	test("creates no job for push to non-default branch", async () => {
		const commitSha = "feature-branch-789";
		const payload = {
			ref: "refs/heads/feature/test",
			after: commitSha,
			repository: {
				id: 123456,
				name: "webhook-integration-repo",
				full_name: "testuser/webhook-integration-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
		});

		expect(response.status).toBe(200);

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 200));

		// Verify no job was created
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("commit_sha", commitSha);

		expect(error).toBeNull();
		expect(jobs).toHaveLength(0);
	});

	test("deduplicates jobs for duplicate push events", async () => {
		const commitSha = "duplicate-test-abc";

		// First push
		const payload = {
			ref: "refs/heads/main",
			after: commitSha,
			repository: {
				id: 123456,
				name: "webhook-integration-repo",
				full_name: "testuser/webhook-integration-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		const response1 = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
			delivery: "first-delivery",
		});
		expect(response1.status).toBe(200);

		// Wait for first job to be created
		await waitForCondition(
			async () => {
				const { data: jobs } = await supabase
					.from("index_jobs")
					.select("*")
					.eq("repository_id", testRepoId)
					.eq("commit_sha", commitSha);
				return jobs !== null && jobs.length > 0;
			},
			{ timeout: 3000, interval: 50 }
		);

		// Second push (duplicate)
		const response2 = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
			delivery: "second-delivery",
		});
		expect(response2.status).toBe(200);

		// Wait a bit to ensure second processing completes (should not create job)
		await new Promise(resolve => setTimeout(resolve, 100));

		// Verify only one job exists
		const { data: jobs, error } = await supabase
			.from("index_jobs")
			.select("*")
			.eq("repository_id", testRepoId)
			.eq("commit_sha", commitSha);

		expect(error).toBeNull();
		expect(jobs).toHaveLength(1);
	});

	test("updates repository last_push_at timestamp", async () => {
		const commitSha = "timestamp-test-def";

		// Get current timestamp
		const { data: repoBefore } = await supabase
			.from("repositories")
			.select("last_push_at")
			.eq("id", testRepoId)
			.single();

		const payload = {
			ref: "refs/heads/main",
			after: commitSha,
			repository: {
				id: 123456,
				name: "webhook-integration-repo",
				full_name: "testuser/webhook-integration-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
		});

		expect(response.status).toBe(200);

		// Wait for timestamp update to be visible
		await waitForCondition(
			async () => {
				const { data: repo } = await supabase
					.from("repositories")
					.select("last_push_at")
					.eq("id", testRepoId)
					.single();

				// Check if timestamp was updated (either set for first time or changed)
				if (!repoBefore?.last_push_at) {
					return repo?.last_push_at !== null;
				}
				return repo?.last_push_at !== repoBefore.last_push_at;
			},
			{ timeout: 3000, interval: 50, message: "Repository last_push_at not updated" }
		);

		// Get updated timestamp
		const { data: repoAfter } = await supabase
			.from("repositories")
			.select("last_push_at")
			.eq("id", testRepoId)
			.single();

		// Verify timestamp was updated
		if (repoBefore?.last_push_at) {
			expect(new Date(repoAfter!.last_push_at!).getTime())
				.toBeGreaterThan(new Date(repoBefore.last_push_at).getTime());
		} else {
			expect(repoAfter!.last_push_at).not.toBeNull();
		}
	});
});
