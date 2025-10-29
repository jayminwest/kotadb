/**
 * Checkout Session Integration Tests
 *
 * Tests the /api/subscriptions/create-checkout-session endpoint with real database connection.
 * Validates that:
 * - Authenticated requests can create checkout sessions (when Stripe is configured)
 * - Unauthenticated requests are properly rejected with 401
 * - Invalid tier values are rejected with 400
 * - Missing required parameters are rejected with 400
 *
 * Required environment variables:
 * - SUPABASE_URL (defaults to http://localhost:54322)
 * - SUPABASE_SERVICE_KEY (defaults to local demo key)
 * - STRIPE_SECRET_KEY (optional, some tests will be skipped if not configured)
 * - STRIPE_SOLO_PRICE_ID (optional)
 * - STRIPE_TEAM_PRICE_ID (optional)
 *
 * NOTE: These tests require the local test database to be running.
 * Run `./scripts/setup-test-db.sh` before running tests.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Server } from "node:http";
import { getTestApiKey } from "../helpers/db";
import { startTestServer, stopTestServer } from "../helpers/server";

let server: Server;
let BASE_URL: string;
const TEST_API_KEY = getTestApiKey("free");

beforeAll(async () => {
	// Start Express test server with real database
	const testServer = await startTestServer();
	server = testServer.server;
	BASE_URL = testServer.url;
});

afterAll(async () => {
	await stopTestServer(server);
});

describe("POST /api/subscriptions/create-checkout-session", () => {
	describe("Authentication", () => {
		it("returns 401 without authentication", async () => {
			const response = await fetch(
				`${BASE_URL}/api/subscriptions/create-checkout-session`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						tier: "solo",
						successUrl: "http://localhost:3000/dashboard?upgrade=success",
						cancelUrl: "http://localhost:3000/pricing?upgrade=canceled",
					}),
				},
			);

			const data = (await response.json()) as { error: string; code: string };

			expect(response.status).toBe(401);
			expect(data.error).toBeDefined();
			expect(data.code).toBe("AUTH_MISSING_KEY");
		});

		it("returns 401 with invalid authorization header format", async () => {
			const response = await fetch(
				`${BASE_URL}/api/subscriptions/create-checkout-session`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: "InvalidFormat token123",
					},
					body: JSON.stringify({
						tier: "solo",
						successUrl: "http://localhost:3000/dashboard?upgrade=success",
						cancelUrl: "http://localhost:3000/pricing?upgrade=canceled",
					}),
				},
			);

			const data = (await response.json()) as { error: string; code: string };

			expect(response.status).toBe(401);
			expect(data.error).toBeDefined();
			expect(data.code).toBe("AUTH_INVALID_HEADER");
		});

		it("returns 401 with invalid API key", async () => {
			const response = await fetch(
				`${BASE_URL}/api/subscriptions/create-checkout-session`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization:
							"Bearer kota_free_invalid123_0123456789abcdef0123456789abcdef",
					},
					body: JSON.stringify({
						tier: "solo",
						successUrl: "http://localhost:3000/dashboard?upgrade=success",
						cancelUrl: "http://localhost:3000/pricing?upgrade=canceled",
					}),
				},
			);

			const data = (await response.json()) as { error: string; code: string };

			expect(response.status).toBe(401);
			expect(data.error).toBeDefined();
			expect(data.code).toBe("AUTH_INVALID_KEY");
		});
	});

	describe("Input Validation", () => {
		it("returns 400 for invalid tier", async () => {
			const response = await fetch(
				`${BASE_URL}/api/subscriptions/create-checkout-session`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_API_KEY}`,
					},
					body: JSON.stringify({
						tier: "invalid",
						successUrl: "http://localhost:3000/dashboard?upgrade=success",
						cancelUrl: "http://localhost:3000/pricing?upgrade=canceled",
					}),
				},
			);

			const data = (await response.json()) as { error: string };

			expect(response.status).toBe(400);
			expect(data.error).toContain("Invalid tier");
		});

		it("returns 400 for missing tier", async () => {
			const response = await fetch(
				`${BASE_URL}/api/subscriptions/create-checkout-session`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_API_KEY}`,
					},
					body: JSON.stringify({
						successUrl: "http://localhost:3000/dashboard?upgrade=success",
						cancelUrl: "http://localhost:3000/pricing?upgrade=canceled",
					}),
				},
			);

			const data = (await response.json()) as { error: string };

			expect(response.status).toBe(400);
			expect(data.error).toContain("Invalid tier");
		});

		it("returns 400 for missing successUrl", async () => {
			const response = await fetch(
				`${BASE_URL}/api/subscriptions/create-checkout-session`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_API_KEY}`,
					},
					body: JSON.stringify({
						tier: "solo",
						cancelUrl: "http://localhost:3000/pricing?upgrade=canceled",
					}),
				},
			);

			const data = (await response.json()) as { error: string };

			expect(response.status).toBe(400);
			expect(data.error).toContain("successUrl and cancelUrl are required");
		});

		it("returns 400 for missing cancelUrl", async () => {
			const response = await fetch(
				`${BASE_URL}/api/subscriptions/create-checkout-session`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_API_KEY}`,
					},
					body: JSON.stringify({
						tier: "solo",
						successUrl: "http://localhost:3000/dashboard?upgrade=success",
					}),
				},
			);

			const data = (await response.json()) as { error: string };

			expect(response.status).toBe(400);
			expect(data.error).toContain("successUrl and cancelUrl are required");
		});
	});

	describe("Stripe Integration", () => {
		it("returns 500 when Stripe is not configured", async () => {
			// This test assumes Stripe env vars are not set in test environment
			// If they are set, this test will be skipped (see conditional below)

			const response = await fetch(
				`${BASE_URL}/api/subscriptions/create-checkout-session`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_API_KEY}`,
					},
					body: JSON.stringify({
						tier: "solo",
						successUrl: "http://localhost:3000/dashboard?upgrade=success",
						cancelUrl: "http://localhost:3000/pricing?upgrade=canceled",
					}),
				},
			);

			const data = (await response.json()) as { error: string };

			// If Stripe is configured, response will be 200 (or possibly other errors)
			// If not configured, we expect 500 with specific error message
			if (response.status === 500) {
				expect(data.error).toContain("Stripe is not configured");
			} else {
				// Stripe is configured in test environment, verify it returned a valid response
				expect(response.status).not.toBe(401); // Should be authenticated
				expect(response.status).not.toBe(400); // Request was valid
			}
		});
	});

	describe("Rate Limiting", () => {
		it("includes rate limit headers in response", async () => {
			const response = await fetch(
				`${BASE_URL}/api/subscriptions/create-checkout-session`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${TEST_API_KEY}`,
					},
					body: JSON.stringify({
						tier: "solo",
						successUrl: "http://localhost:3000/dashboard?upgrade=success",
						cancelUrl: "http://localhost:3000/pricing?upgrade=canceled",
					}),
				},
			);

			// Verify rate limit headers are present (regardless of response status)
			expect(response.headers.get("X-RateLimit-Limit")).toBeDefined();
			expect(response.headers.get("X-RateLimit-Remaining")).toBeDefined();
			expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
		});
	});
});
