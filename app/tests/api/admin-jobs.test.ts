/**
 * Admin Jobs Endpoints Integration Tests
 *
 * Tests GET /admin/jobs/failed and POST /admin/jobs/:jobId/retry endpoints
 * with real pg-boss queue integration. Verifies admin authentication.
 */

import { afterAll, beforeAll, describe, expect, it, afterEach } from "bun:test";
import type { Server } from "node:http";
import {
	createTestRepository,
	getSupabaseTestClient,
	TEST_USER_IDS,
} from "../helpers/db";
import { startTestServer, stopTestServer } from "../helpers/server";
import { createIndexJob, updateJobStatus } from "../../src/queue/job-tracker";
import { getQueue } from "../../src/queue/client";
import { QUEUE_NAMES } from "../../src/queue/config";

let server: Server;
let BASE_URL: string;

beforeAll(async () => {
	const testServer = await startTestServer();
	server = testServer.server;
	BASE_URL = testServer.url;
});

afterAll(async () => {
	await stopTestServer(server);
});

describe("Admin Jobs Endpoints", () => {
	const client = getSupabaseTestClient();
	const testJobIds: string[] = [];

	afterEach(async () => {
		// Cleanup test jobs
		for (const jobId of testJobIds) {
			await client.from("index_jobs").delete().eq("id", jobId);
		}
		testJobIds.length = 0;
	});

	describe("GET /admin/jobs/failed", () => {
		it("requires service role key", async () => {
			const response = await fetch(`${BASE_URL}/admin/jobs/failed`);
			expect(response.status).toBe(401);

			const data = (await response.json()) as { error: string };
			expect(data.error).toBe("Unauthorized");
		});

		it("returns unauthorized with invalid key", async () => {
			const response = await fetch(`${BASE_URL}/admin/jobs/failed`, {
				headers: { Authorization: "Bearer invalid-key" },
			});
			expect(response.status).toBe(401);
		});

		it("returns failed jobs with valid service role key", async () => {
			const serviceRoleKey = process.env.SUPABASE_SERVICE_KEY;
			if (!serviceRoleKey) {
				throw new Error("SUPABASE_SERVICE_KEY not configured");
			}

			const response = await fetch(`${BASE_URL}/admin/jobs/failed`, {
				headers: { Authorization: `Bearer ${serviceRoleKey}` },
			});

			expect(response.status).toBe(200);

			const data = (await response.json()) as {
				jobs: Array<{
					id: string;
					repository_id?: string;
					commit_sha?: string;
					ref?: string;
					error: string;
					failed_at: string;
					retry_count: number;
				}>;
				limit: number;
				offset: number;
				total: number;
			};

			expect(data.jobs).toBeInstanceOf(Array);
			expect(data.limit).toBe(50);
			expect(data.offset).toBe(0);
			expect(data.total).toBeGreaterThanOrEqual(0);
		});

		it("respects limit and offset parameters", async () => {
			const serviceRoleKey = process.env.SUPABASE_SERVICE_KEY;
			if (!serviceRoleKey) {
				throw new Error("SUPABASE_SERVICE_KEY not configured");
			}

			const response = await fetch(
				`${BASE_URL}/admin/jobs/failed?limit=10&offset=5`,
				{
					headers: { Authorization: `Bearer ${serviceRoleKey}` },
				},
			);

			expect(response.status).toBe(200);

			const data = (await response.json()) as {
				jobs: Array<unknown>;
				limit: number;
				offset: number;
				total: number;
			};

			expect(data.limit).toBe(10);
			expect(data.offset).toBe(5);
		});
	});

	describe("POST /admin/jobs/:jobId/retry", () => {
		it("requires service role key", async () => {
			const response = await fetch(`${BASE_URL}/admin/jobs/test-id/retry`, {
				method: "POST",
			});
			expect(response.status).toBe(401);
		});

		it("allows retry of job ID without error", async () => {
			const serviceRoleKey = process.env.SUPABASE_SERVICE_KEY;
			if (!serviceRoleKey) {
				throw new Error("SUPABASE_SERVICE_KEY not configured");
			}

			const response = await fetch(
				`${BASE_URL}/admin/jobs/00000000-0000-0000-0000-000000000000/retry`,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${serviceRoleKey}` },
				},
			);

			// pg-boss retry is idempotent and doesn't error on non-existent jobs
			expect(response.status).toBe(200);
			const data = (await response.json()) as {
				message: string;
				job_id: string;
			};
			expect(data.message).toBe("Job requeued for retry");
			expect(data.job_id).toBe("00000000-0000-0000-0000-000000000000");
		});
	});
});
