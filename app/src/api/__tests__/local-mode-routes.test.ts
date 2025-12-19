/**
 * Integration tests for routes in local mode (without Supabase)
 *
 * Following antimocking philosophy: tests real route handlers
 * with actual HTTP requests, verifying proper error messages.
 *
 * Test Coverage:
 * - Database-dependent routes return 503 with context-specific errors
 * - Error messages guide users toward cloud mode configuration
 * - Queue-dependent routes indicate queue support requirement
 * - Public endpoints (health, OpenAPI) remain accessible
 *
 * @module @api/__tests__/local-mode-routes
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import request from "supertest";
import { createExpressApp } from "@api/routes";
import type { Express } from "express";

describe("Local Mode Routes", () => {
	let app: Express;
	const originalEnv = {
		KOTA_LOCAL_MODE: process.env.KOTA_LOCAL_MODE,
		SUPABASE_URL: process.env.SUPABASE_URL,
		SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
	};

	// Mock API key for authenticated requests (will fail auth but test error handling)
	const mockApiKey = "kota_test_mock_key_12345";

	beforeAll(() => {
		// Set local mode and clear Supabase credentials
		process.env.KOTA_LOCAL_MODE = "true";
		delete process.env.SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_KEY;

		// Clear environment cache
		const { clearEnvironmentCache } = require("@config/environment");
		clearEnvironmentCache();

		// Create Express app without Supabase
		app = createExpressApp(undefined);
	});

	afterAll(() => {
		// Restore environment
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

		const { clearEnvironmentCache } = require("@config/environment");
		clearEnvironmentCache();
	});

	describe("Queue-dependent routes", () => {
		test("POST /index returns 503 with queue-specific error", async () => {
			const response = await request(app)
				.post("/index")
				.set("Authorization", `Bearer ${mockApiKey}`)
				.send({ repository: "owner/repo" });

			expect(response.status).toBe(503);
			expect(response.body.error).toContain("queue support");
			expect(response.body.error).toContain("cloud mode");
		});
	});

	describe("Search routes", () => {
		test("GET /search returns 503 with search-specific error", async () => {
			const response = await request(app)
				.get("/search?term=test")
				.set("Authorization", `Bearer ${mockApiKey}`);

			expect(response.status).toBe(503);
			expect(response.body.error).toContain("Search requires cloud mode");
			expect(response.body.error).toContain("configuration");
		});

		test("GET /files/recent returns 503 with configuration guidance", async () => {
			const response = await request(app)
				.get("/files/recent")
				.set("Authorization", `Bearer ${mockApiKey}`);

			expect(response.status).toBe(503);
			expect(response.body.error).toContain("cloud mode");
			expect(response.body.error).toContain("configuration");
		});
	});

	describe("Project management routes", () => {
		test("POST /api/projects returns 503 with project-specific error", async () => {
			const response = await request(app)
				.post("/api/projects")
				.set("Authorization", `Bearer ${mockApiKey}`)
				.send({ name: "Test Project" });

			expect(response.status).toBe(503);
			expect(response.body.error).toContain("Project management");
			expect(response.body.error).toContain("cloud mode");
			expect(response.body.error).toContain("Supabase credentials");
		});

		test("GET /api/projects returns 503 with configuration guidance", async () => {
			const response = await request(app)
				.get("/api/projects")
				.set("Authorization", `Bearer ${mockApiKey}`);

			expect(response.status).toBe(503);
			expect(response.body.error).toContain("cloud mode");
		});
	});

	describe("MCP endpoint", () => {
		test("POST /mcp returns 503 with MCP-specific error", async () => {
			const response = await request(app)
				.post("/mcp")
				.set("Authorization", `Bearer ${mockApiKey}`)
				.send({});

			expect(response.status).toBe(503);
			expect(response.body.error).toContain("MCP server");
			expect(response.body.error).toContain("cloud mode");
		});
	});

	describe("Billing routes", () => {
		test("POST /api/keys/generate returns 503 with credential guidance", async () => {
			const response = await request(app)
				.post("/api/keys/generate")
				.set("Authorization", "Bearer mock-jwt-token");

			expect(response.status).toBe(503);
			expect(response.body.error).toContain("API key generation");
			expect(response.body.error).toContain("cloud mode");
			expect(response.body.error).toContain("Supabase credentials");
		});
	});

	describe("Public endpoints (should remain accessible)", () => {
		test("GET /health returns 200 in local mode", async () => {
			const response = await request(app).get("/health");

			expect(response.status).toBe(200);
			expect(response.body.status).toBe("ok");
			expect(response.body.mode).toBe("local");
		});

		test("GET /openapi.json returns 200 with OpenAPI spec", async () => {
			const response = await request(app).get("/openapi.json");

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("openapi");
			expect(response.body.openapi).toMatch(/^3\./); // OpenAPI 3.x
		});
	});

	describe("Error message quality", () => {
		test("errors do not use generic 'Database not available' message", async () => {
			// Test POST /index
			const indexResponse = await request(app)
				.post("/index")
				.set("Authorization", `Bearer ${mockApiKey}`)
				.send({ repository: "owner/repo" });

			expect(indexResponse.status).toBe(503);
			expect(indexResponse.body.error).not.toBe("Database not available in local mode");
			expect(indexResponse.body.error.length).toBeGreaterThan(30);

			// Test GET /search
			const searchResponse = await request(app)
				.get("/search?term=test")
				.set("Authorization", `Bearer ${mockApiKey}`);

			expect(searchResponse.status).toBe(503);
			expect(searchResponse.body.error).not.toBe("Database not available in local mode");
			expect(searchResponse.body.error.length).toBeGreaterThan(30);

			// Test POST /api/projects
			const projectsResponse = await request(app)
				.post("/api/projects")
				.set("Authorization", `Bearer ${mockApiKey}`)
				.send({ name: "Test" });

			expect(projectsResponse.status).toBe(503);
			expect(projectsResponse.body.error).not.toBe("Database not available in local mode");
			expect(projectsResponse.body.error.length).toBeGreaterThan(30);
		});

		test("errors mention configuration or setup steps", async () => {
			const response = await request(app)
				.get("/search?term=test")
				.set("Authorization", `Bearer ${mockApiKey}`);

			expect(response.status).toBe(503);
			const errorLower = response.body.error.toLowerCase();
			// Should mention how to fix the issue
			expect(
				errorLower.includes("configuration") ||
					errorLower.includes("configure") ||
					errorLower.includes("credentials"),
			).toBe(true);
		});
	});
});
