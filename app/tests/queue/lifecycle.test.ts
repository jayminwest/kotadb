/**
 * Queue Lifecycle Integration Tests
 *
 * Tests graceful shutdown and job persistence
 * Uses real Supabase Local instance (antimocking philosophy)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { startQueue, stopQueue, getQueue } from "@queue/client";
import { QUEUE_NAMES } from "@queue/config";
import type { IndexRepoJobPayload } from "@queue/types";

describe("Queue Lifecycle - Graceful Shutdown", () => {
	afterEach(async () => {
		try {
			await stopQueue();
		} catch {
			// Ignore errors
		}
	});

	it("should persist jobs across queue restart cycles", async () => {
		// Start queue
		await startQueue();
		const queue = getQueue();

		// Create the queue before sending jobs (required by pg-boss v11)
		await queue.createQueue(QUEUE_NAMES.INDEX_REPO);

		// Enqueue a job
		const payload: IndexRepoJobPayload = {
			indexJobId: "test-job-123",
			repositoryId: "test-repo-456",
			commitSha: "abc123",
		};

		const jobId = await queue.send(QUEUE_NAMES.INDEX_REPO, payload);
		expect(jobId).toBeDefined();
		expect(jobId).not.toBeNull();

		// Verify job ID is not null before proceeding
		if (!jobId) {
			throw new Error("Job ID is null after enqueue");
		}

		// Stop queue gracefully
		await stopQueue();

		// Restart queue
		await startQueue();
		const restartedQueue = getQueue();

		// Verify job still exists in database
		// pg-boss v11 getJobById requires queue name and job id
		const job = await restartedQueue.getJobById(
			QUEUE_NAMES.INDEX_REPO,
			jobId,
		);
		expect(job).toBeDefined();
		expect(job?.data).toMatchObject(payload);
	});

	it("should allow queue restart after stopQueue", async () => {
		// Start queue
		await startQueue();

		// Stop queue
		await stopQueue();

		// Restart queue
		await startQueue();

		// Verify queue is healthy after restart by checking instance
		const queue = getQueue();
		expect(queue).toBeDefined();
	});

	it("should throw error if stopQueue called before startQueue", async () => {
		// Don't start queue, try to stop it
		await expect(stopQueue()).rejects.toThrow(
			"Queue not started. Call startQueue() first.",
		);
	});

	it("should gracefully handle stop before start", async () => {
		// Attempt to stop queue before starting it
		await expect(stopQueue()).rejects.toThrow(
			"Queue not started. Call startQueue() first.",
		);

		// Now start it properly
		await startQueue();
		expect(getQueue()).toBeDefined();

		// And stop it successfully
		await stopQueue();
	});
});
