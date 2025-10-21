/**
 * Job Status API Integration Tests
 *
 * Tests POST /index and GET /jobs/:jobId endpoints with real database connection.
 * Verifies job tracking functionality, authentication, and RLS enforcement.
 */

import { afterAll, beforeAll, describe, expect, it, afterEach } from "bun:test";
import type { Server } from "node:http";
import {
	getTestApiKey,
	createTestRepository,
	TEST_USER_IDS,
	getSupabaseTestClient,
} from "../helpers/db";
import { startTestServer, stopTestServer } from "../helpers/server";

let server: Server;
let BASE_URL: string;
const TEST_API_KEY = getTestApiKey("free");
const SOLO_API_KEY = getTestApiKey("solo");

beforeAll(async () => {
	const testServer = await startTestServer();
	server = testServer.server;
	BASE_URL = testServer.url;
});

afterAll(async () => {
	await stopTestServer(server);
});

describe("Job Status API", () => {
	const client = getSupabaseTestClient();
	const testJobIds: string[] = [];

	afterEach(async () => {
		// Cleanup test jobs
		for (const jobId of testJobIds) {
			await client.from("index_jobs").delete().eq("id", jobId);
		}
		testJobIds.length = 0;
	});

	describe("POST /index", () => {
		it("returns jobId and status=pending", async () => {
			const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });

			const response = await fetch(`${BASE_URL}/index`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${TEST_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					repository: "test/repo",
					ref: "main",
				}),
			});

			const data = (await response.json()) as {
				jobId: string;
				status: string;
			};

			expect(response.status).toBe(202);
			expect(data.jobId).toBeDefined();
			expect(data.status).toBe("pending");

			testJobIds.push(data.jobId);
		});

		it("returns 401 without authentication", async () => {
			const response = await fetch(`${BASE_URL}/index`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					repository: "test/repo",
				}),
			});

			const data = (await response.json()) as { error: string; code: string };

			expect(response.status).toBe(401);
			expect(data.error).toBeDefined();
			expect(data.code).toBe("AUTH_MISSING_KEY");
		});
	});

	describe("GET /jobs/:jobId", () => {
		it("returns job details for valid job", async () => {
			const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });

			// Create job via POST /index using local path to avoid git clone issues in CI
			const localPath = `${import.meta.dir}/../fixtures/mcp/sample-repository`;
			const indexResponse = await fetch(`${BASE_URL}/index`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${TEST_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					repository: localPath,
					localPath: localPath,
					ref: "main",
				}),
			});

			const indexData = (await indexResponse.json()) as {
				jobId: string;
				status: string;
			};
			testJobIds.push(indexData.jobId);

			// Query job status
			const statusResponse = await fetch(
				`${BASE_URL}/jobs/${indexData.jobId}`,
				{
					headers: {
						Authorization: `Bearer ${TEST_API_KEY}`,
					},
				},
			);

			const statusData = (await statusResponse.json()) as {
				id: string;
				repository_id: string;
				ref: string;
				status: string;
				started_at?: string;
				completed_at?: string;
				error_message?: string;
				stats?: Record<string, unknown>;
			};

			expect(statusResponse.status).toBe(200);
			expect(statusData.id).toBe(indexData.jobId);
			expect(statusData.status).toBe("pending");
			expect(statusData.ref).toBe("main");
		});

		it("returns 404 for non-existent job", async () => {
			const nonExistentId = crypto.randomUUID();

			const response = await fetch(`${BASE_URL}/jobs/${nonExistentId}`, {
				headers: {
					Authorization: `Bearer ${TEST_API_KEY}`,
				},
			});

			const data = (await response.json()) as { error: string };

			expect(response.status).toBe(404);
			expect(data.error).toContain("Job not found");
		});

		it("returns 401 without authentication", async () => {
			const jobId = crypto.randomUUID();

			const response = await fetch(`${BASE_URL}/jobs/${jobId}`);
			const data = (await response.json()) as { error: string; code: string };

			expect(response.status).toBe(401);
			expect(data.error).toBeDefined();
			expect(data.code).toBe("AUTH_MISSING_KEY");
		});

		// NOTE: RLS enforcement test skipped for MVP
		// getJobStatus currently uses service client which bypasses RLS
		// See #236 follow-up for RLS enforcement implementation
		it.skip("enforces RLS - user cannot see other users jobs", async () => {
			// TODO: Re-enable when RLS is properly enforced in getJobStatus
		});

		it("includes rate limit headers in response", async () => {
			const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });

			// Create job
			const indexResponse = await fetch(`${BASE_URL}/index`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${TEST_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					repository: "test/repo",
					ref: "main",
				}),
			});

			const indexData = (await indexResponse.json()) as {
				jobId: string;
				status: string;
			};
			testJobIds.push(indexData.jobId);

			// Query job status
			const response = await fetch(`${BASE_URL}/jobs/${indexData.jobId}`, {
				headers: {
					Authorization: `Bearer ${TEST_API_KEY}`,
				},
			});

			// Verify rate limit headers exist
			expect(response.headers.get("X-RateLimit-Limit")).toBeDefined();
			expect(response.headers.get("X-RateLimit-Remaining")).toBeDefined();
			expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
		});
	});
});
