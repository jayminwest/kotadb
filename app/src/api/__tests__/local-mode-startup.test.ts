/**
 * Integration tests for local mode server startup
 *
 * Following antimocking philosophy: tests real server initialization
 * without Supabase credentials, verifying graceful degradation.
 *
 * Test Coverage:
 * - Server starts successfully in local mode (KOTA_LOCAL_MODE=true)
 * - Queue is NOT initialized when Supabase credentials missing
 * - Health endpoint returns 200 with mode field
 * - Health endpoint handles missing queue gracefully
 *
 * @module @api/__tests__/local-mode-startup
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import request from "supertest";
import { createExpressApp } from "@api/routes";
import type { Express } from "express";

describe("Local Mode Server Startup", () => {
	let app: Express;
	const originalEnv = {
		KOTA_LOCAL_MODE: process.env.KOTA_LOCAL_MODE,
		SUPABASE_URL: process.env.SUPABASE_URL,
		SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
	};

	beforeAll(() => {
		// Set local mode and clear Supabase credentials
		process.env.KOTA_LOCAL_MODE = "true";
		delete process.env.SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_KEY;

		// Clear environment cache to ensure fresh config
		const { clearEnvironmentCache } = require("@config/environment");
		clearEnvironmentCache();

		// Create Express app without Supabase client
		app = createExpressApp(undefined);
	});

	afterAll(() => {
		// Restore original environment variables
		if (originalEnv.KOTA_LOCAL_MODE !== undefined) {
			process.env.KOTA_LOCAL_MODE = originalEnv.KOTA_LOCAL_MODE;
		} else {
			delete process.env.KOTA_LOCAL_MODE;
		}

		if (originalEnv.SUPABASE_URL !== undefined) {
			process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
		}

		if (originalEnv.SUPABASE_SERVICE_KEY !== undefined) {
			process.env.SUPABASE_SERVICE_KEY = originalEnv.SUPABASE_SERVICE_KEY;
		}

		// Clear cache again to reset state
		const { clearEnvironmentCache } = require("@config/environment");
		clearEnvironmentCache();
	});

	test("should start server successfully in local mode", () => {
		expect(app).toBeDefined();
		expect(typeof app.listen).toBe("function");
	});

	test("health endpoint returns 200 in local mode", async () => {
		const response = await request(app).get("/health");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			status: "ok",
			version: expect.any(String),
			timestamp: expect.any(String),
			mode: "local",
		});
	});

	test("health endpoint has mode field set to 'local'", async () => {
		const response = await request(app).get("/health");

		expect(response.body.mode).toBe("local");
	});

	test("health endpoint handles missing queue gracefully", async () => {
		const response = await request(app).get("/health");

		expect(response.status).toBe(200);
		// Queue should be null when not available
		expect(response.body.queue).toBeNull();
	});

	test("health endpoint does not throw when queue unavailable", async () => {
		// This test verifies no unhandled exceptions
		const response = await request(app).get("/health");

		expect(response.status).toBe(200);
		expect(response.body).toHaveProperty("status");
		expect(response.body.status).toBe("ok");
	});
});
