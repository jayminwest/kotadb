/**
 * Integration tests for job tracking functions
 * Tests createIndexJob, updateJobStatus, and getJobStatus with real Supabase
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

describe("job-tracker integration tests", () => {
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

	test("createIndexJob creates pending job record", async () => {
		const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });
		const commitSha = "abc123def456";

		const job = await createIndexJob(
			repoId,
			"main",
			commitSha,
			TEST_USER_IDS.free,
		);

		testJobIds.push(job.id);

		expect(job.id).toBeDefined();
		expect(job.repository_id).toBe(repoId);
		expect(job.ref).toBe("main");
		expect(job.status).toBe("pending");
		expect(job.commit_sha).toBe(commitSha);
		expect(job.started_at).toBeNull();
		expect(job.completed_at).toBeNull();
	});

	test("updateJobStatus transitions pending to processing", async () => {
		const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });
		const job = await createIndexJob(
			repoId,
			"main",
			undefined,
			TEST_USER_IDS.free,
		);
		testJobIds.push(job.id);

		const updated = await updateJobStatus(
			job.id,
			"processing",
			undefined,
			TEST_USER_IDS.free,
		);

		expect(updated.status).toBe("processing");
		expect(updated.started_at).toBeDefined();
		expect(updated.completed_at).toBeNull();
	});

	test("updateJobStatus transitions processing to completed with stats", async () => {
		const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });
		const job = await createIndexJob(
			repoId,
			"main",
			undefined,
			TEST_USER_IDS.free,
		);
		testJobIds.push(job.id);

		// First transition to processing
		await updateJobStatus(job.id, "processing", undefined, TEST_USER_IDS.free);

		// Then transition to completed with stats
		const stats = {
			files_indexed: 50,
			symbols_extracted: 200,
			references_found: 300,
		};
		const completed = await updateJobStatus(
			job.id,
			"completed",
			{ stats },
			TEST_USER_IDS.free,
		);

		expect(completed.status).toBe("completed");
		expect(completed.completed_at).toBeDefined();
		expect(completed.stats).toEqual(stats);
		expect(completed.error_message).toBeNull();
	});

	test("updateJobStatus transitions processing to failed with error", async () => {
		const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });
		const job = await createIndexJob(
			repoId,
			"main",
			undefined,
			TEST_USER_IDS.free,
		);
		testJobIds.push(job.id);

		// First transition to processing
		await updateJobStatus(job.id, "processing", undefined, TEST_USER_IDS.free);

		// Then transition to failed with error
		const errorMessage = "Repository clone failed: network timeout";
		const failed = await updateJobStatus(
			job.id,
			"failed",
			{ error: errorMessage },
			TEST_USER_IDS.free,
		);

		expect(failed.status).toBe("failed");
		expect(failed.completed_at).toBeDefined();
		expect(failed.error_message).toBe(errorMessage);
	});

	test("getJobStatus retrieves job details", async () => {
		const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });
		const commitSha = "xyz789abc123";
		const created = await createIndexJob(
			repoId,
			"develop",
			commitSha,
			TEST_USER_IDS.free,
		);
		testJobIds.push(created.id);

		const fetched = await getJobStatus(created.id, TEST_USER_IDS.free);

		expect(fetched.id).toBe(created.id);
		expect(fetched.repository_id).toBe(repoId);
		expect(fetched.ref).toBe("develop");
		expect(fetched.commit_sha).toBe(commitSha);
		expect(fetched.status).toBe("pending");
	});

	test("getJobStatus throws error for non-existent job", async () => {
		const nonExistentId = crypto.randomUUID();

		await expect(
			getJobStatus(nonExistentId, TEST_USER_IDS.free),
		).rejects.toThrow(`Job not found: ${nonExistentId}`);
	});

	test("createIndexJob without commit_sha creates record", async () => {
		const repoId = await createTestRepository({ userId: TEST_USER_IDS.free });

		const job = await createIndexJob(
			repoId,
			"feature/test",
			undefined,
			TEST_USER_IDS.free,
		);

		testJobIds.push(job.id);

		expect(job.id).toBeDefined();
		expect(job.status).toBe("pending");
		expect(job.commit_sha).toBeNull();
	});
});
