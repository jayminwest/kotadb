/**
 * Health Endpoint Queue Metrics Integration Tests
 *
 * Tests GET /health endpoint with real pg-boss queue integration.
 * Verifies queue metrics are correctly reported.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Server } from "node:http";
import { startTestServer, stopTestServer } from "../helpers/server";

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

describe("Health Endpoint Queue Metrics", () => {
	it("returns queue metrics when queue is running", async () => {
		const response = await fetch(`${BASE_URL}/health`);
		const data = (await response.json()) as {
			status: string;
			timestamp: string;
			queue: {
				depth: number;
				workers: number;
				failed_24h: number;
				oldest_pending_age_seconds: number;
			} | null;
		};

		expect(response.status).toBe(200);
		expect(data.status).toBe("ok");
		expect(data.timestamp).toBeDefined();

		// Queue metrics should be present
		expect(data.queue).toBeDefined();
		if (data.queue) {
			expect(data.queue.depth).toBeGreaterThanOrEqual(0);
			expect(data.queue.workers).toBe(3);
			expect(data.queue.failed_24h).toBeGreaterThanOrEqual(0);
			expect(data.queue.oldest_pending_age_seconds).toBeGreaterThanOrEqual(0);
		}
	});

	it("returns basic health status if queue metrics unavailable", async () => {
		const response = await fetch(`${BASE_URL}/health`);
		const data = (await response.json()) as {
			status: string;
			timestamp: string;
			queue: {
				depth: number;
				workers: number;
				failed_24h: number;
				oldest_pending_age_seconds: number;
			} | null;
		};

		expect(response.status).toBe(200);
		expect(data.status).toBe("ok");
		expect(data.timestamp).toBeDefined();
		// Queue can be null if not available, but should be defined
		expect(data).toHaveProperty("queue");
	});
});
