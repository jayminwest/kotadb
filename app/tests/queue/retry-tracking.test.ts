/**
 * Retry Count Tracking Integration Tests
 *
 * Tests retry_count tracking in job-tracker with real database connection.
 * Verifies retry count increments when jobs transition from failed to processing.
 */

import { describe, expect, test, afterEach } from "bun:test";
import {
	createTestRepository,
	getSupabaseTestClient,
	TEST_USER_IDS,
} from "../helpers/db";
import {
	createIndexJob,
	updateJobStatus,
	getJobStatus,
} from "../../src/queue/job-tracker";

describe("Retry Count Tracking", () => {
	const client = getSupabaseTestClient();
	const testJobIds: string[] = [];

	// Cleanup after each test
	afterEach(async () => {
		// Delete test jobs
		for (const jobId of testJobIds) {
			await client.from("index_jobs").delete().eq("id", jobId);
		}
		testJobIds.length = 0;
	});

	test("retry_count increments on job retry", async () => {
		const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });
		const job = await createIndexJob(
			repoId,
			"main",
			undefined,
			TEST_USER_IDS.free,
		);
		testJobIds.push(job.id);

		// Transition to processing
		await updateJobStatus(job.id, "processing", undefined, TEST_USER_IDS.free);

		// Transition to failed
		await updateJobStatus(
			job.id,
			"failed",
			{ error: "Test error" },
			TEST_USER_IDS.free,
		);

		// Retry job (transitions back to processing)
		const retried = await updateJobStatus(
			job.id,
			"processing",
			undefined,
			TEST_USER_IDS.free,
		);

		expect(retried.retry_count).toBe(1);
	});

	test("retry_count increments multiple times", async () => {
		const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });
		const job = await createIndexJob(
			repoId,
			"main",
			undefined,
			TEST_USER_IDS.free,
		);
		testJobIds.push(job.id);

		// First attempt
		await updateJobStatus(job.id, "processing", undefined, TEST_USER_IDS.free);
		await updateJobStatus(
			job.id,
			"failed",
			{ error: "First failure" },
			TEST_USER_IDS.free,
		);

		// First retry
		let retried = await updateJobStatus(
			job.id,
			"processing",
			undefined,
			TEST_USER_IDS.free,
		);
		expect(retried.retry_count).toBe(1);

		// Second failure
		await updateJobStatus(
			job.id,
			"failed",
			{ error: "Second failure" },
			TEST_USER_IDS.free,
		);

		// Second retry
		retried = await updateJobStatus(
			job.id,
			"processing",
			undefined,
			TEST_USER_IDS.free,
		);
		expect(retried.retry_count).toBe(2);
	});

	test("retry_count does not increment on normal processing", async () => {
		const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });
		const job = await createIndexJob(
			repoId,
			"main",
			undefined,
			TEST_USER_IDS.free,
		);
		testJobIds.push(job.id);

		// Transition to processing (not a retry)
		const processing = await updateJobStatus(
			job.id,
			"processing",
			undefined,
			TEST_USER_IDS.free,
		);

		expect(processing.retry_count).toBe(0);
	});

	test("getJobStatus returns retry_count", async () => {
		const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });
		const job = await createIndexJob(
			repoId,
			"main",
			undefined,
			TEST_USER_IDS.free,
		);
		testJobIds.push(job.id);

		// Manually set retry_count for test
		await client
			.from("index_jobs")
			.update({ retry_count: 2 })
			.eq("id", job.id);

		const fetched = await getJobStatus(job.id, TEST_USER_IDS.free);
		expect(fetched.retry_count).toBe(2);
	});
});
