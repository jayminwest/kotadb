/**
 * Queue Client Integration Tests
 *
 * Tests queue initialization, health checks, and error handling
 * Uses real Supabase Local instance (antimocking philosophy)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { startQueue, stopQueue, checkQueueHealth } from "@queue/client";
import { execSync } from "node:child_process";

describe("Queue Client - Initialization", () => {
	// Clean up queue after each test
	afterEach(async () => {
		try {
			await stopQueue();
		} catch {
			// Ignore errors if queue was never started
		}
	});

	it("should connect to Supabase Postgres successfully", async () => {
		// Ensure SUPABASE_DB_URL is set (loaded from .env.test via preload script)
		expect(process.env.SUPABASE_DB_URL).toBeDefined();

		// Start queue
		await startQueue();

		// Verify queue is healthy
		const isHealthy = await checkQueueHealth();
		expect(isHealthy).toBe(true);
	});

	it("should fail with descriptive error when SUPABASE_DB_URL is missing", async () => {
		// Temporarily unset SUPABASE_DB_URL
		const originalDbUrl = process.env.SUPABASE_DB_URL;
		process.env.SUPABASE_DB_URL = undefined;

		try {
			await expect(startQueue()).rejects.toThrow(
				"SUPABASE_DB_URL environment variable is required",
			);
		} finally {
			// Restore SUPABASE_DB_URL
			process.env.SUPABASE_DB_URL = originalDbUrl;
		}
	});

	it("should create pgboss schema automatically on first start", async () => {
		// Start queue (creates pgboss schema)
		await startQueue();

		// Query pgboss schema using psql
		const dbUrl = process.env.SUPABASE_DB_URL;
		const result = execSync(
			`psql "${dbUrl}" -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'pgboss';" -t`,
		)
			.toString()
			.trim();

		expect(result).toBe("pgboss");
	});

	it("should create pg-boss tables in pgboss schema", async () => {
		// Start queue
		await startQueue();

		// Query pg-boss tables
		const dbUrl = process.env.SUPABASE_DB_URL;
		const result = execSync(
			`psql "${dbUrl}" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'pgboss' ORDER BY tablename;" -t`,
		)
			.toString()
			.trim();

		// Verify expected tables exist (pg-boss v11 creates these automatically)
		expect(result).toContain("job");
		expect(result).toContain("version");
		expect(result).toContain("queue");
		expect(result).toContain("schedule");
	});
});

describe("Queue Client - Health Checks", () => {
	afterEach(async () => {
		try {
			await stopQueue();
		} catch {
			// Ignore errors
		}
	});

	it("should return true when queue is running", async () => {
		await startQueue();

		const isHealthy = await checkQueueHealth();
		expect(isHealthy).toBe(true);
	});

	it("should return false when queue is stopped", async () => {
		// Don't start queue, check health immediately
		const isHealthy = await checkQueueHealth();
		expect(isHealthy).toBe(false);
	});

	it("should return false after queue is stopped", async () => {
		// Start then stop queue
		await startQueue();
		await stopQueue();

		// Health check should return false
		const isHealthy = await checkQueueHealth();
		expect(isHealthy).toBe(false);
	});
});
