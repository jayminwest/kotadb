/**
 * Queue Configuration Unit Tests
 *
 * Validates queue configuration constants match requirements
 */

import { describe, it, expect } from "bun:test";
import {
	QUEUE_NAMES,
	RETRY_LIMIT,
	RETRY_DELAY,
	RETRY_BACKOFF,
	EXPIRE_IN_HOURS,
	ARCHIVE_COMPLETED_AFTER,
	WORKER_TEAM_SIZE,
} from "@queue/config";

describe("Queue Configuration", () => {
	it("should have correct retry configuration", () => {
		// 3 attempts total (per spec)
		expect(RETRY_LIMIT).toBe(3);

		// First retry after 60 seconds (per spec)
		expect(RETRY_DELAY).toBe(60);

		// Exponential backoff enabled (60s → 120s → 180s)
		expect(RETRY_BACKOFF).toBe(true);
	});

	it("should have correct expiration and archival configuration", () => {
		// Jobs expire after 24 hours (per spec)
		expect(EXPIRE_IN_HOURS).toBe(24);

		// Completed jobs archived after 1 hour = 3600 seconds (per spec)
		expect(ARCHIVE_COMPLETED_AFTER).toBe(3600);
	});

	it("should have correct worker concurrency configuration", () => {
		// 3 concurrent workers (per spec)
		expect(WORKER_TEAM_SIZE).toBe(3);
	});

	it("should define queue names correctly", () => {
		// index-repo queue (per spec)
		expect(QUEUE_NAMES.INDEX_REPO).toBe("index-repo");

		// Ensure QUEUE_NAMES is an object with expected structure
		expect(typeof QUEUE_NAMES).toBe("object");
		expect(Object.keys(QUEUE_NAMES).length).toBeGreaterThan(0);
	});
});
