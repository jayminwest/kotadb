/**
 * Integration tests for GitHub webhook endpoint
 * Issue #260 - GitHub webhook receiver with HMAC signature verification
 *
 * Tests the POST /webhooks/github endpoint with real Express server.
 * Uses real Supabase Local for consistency with antimocking philosophy.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHmac } from "node:crypto";
import { createExpressApp } from "../../src/api/routes";
import { getServiceClient } from "../../src/db/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Server } from "node:http";

/**
 * Helper: Generate valid HMAC-SHA256 signature for testing
 */
function generateSignature(payload: string, secret: string): string {
	const hmac = createHmac("sha256", secret);
	hmac.update(payload);
	return `sha256=${hmac.digest("hex")}`;
}

/**
 * Helper: Send webhook request to Express server
 */
async function sendWebhookRequest(
	baseUrl: string,
	payload: object,
	options: {
		signature?: string;
		event?: string;
		delivery?: string;
		secret: string;
	},
): Promise<Response> {
	const {
		signature,
		event = "push",
		delivery = "test-delivery-123",
		secret,
	} = options;

	const body = JSON.stringify(payload);
	const computedSignature = signature !== undefined ? signature : generateSignature(body, secret);

	return fetch(`${baseUrl}/webhooks/github`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-GitHub-Event": event,
			"X-GitHub-Delivery": delivery,
			"X-Hub-Signature-256": computedSignature,
		},
		body,
	});
}

describe("POST /webhooks/github - Integration", () => {
	let supabase: SupabaseClient;
	let server: Server;
	let baseUrl: string;
	const testSecret = "test-webhook-secret-for-integration-tests";

	beforeAll(async () => {
		// Initialize Supabase client (real connection for consistency)
		supabase = getServiceClient();

		// Set test webhook secret
		process.env.GITHUB_WEBHOOK_SECRET = testSecret;

		// Create Express app
		const app = createExpressApp(supabase);

		// Start HTTP server on random port
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => {
				const address = server.address();
				const port = typeof address === "object" ? address?.port : 0;
				baseUrl = `http://localhost:${port}`;
				resolve();
			});
		});
	});

	afterAll(async () => {
		// Stop server
		await new Promise<void>((resolve) => {
			server?.close(() => resolve());
		});

		// Clean up environment
		process.env.GITHUB_WEBHOOK_SECRET = undefined;
	});

	test("returns 200 for valid push event with correct signature", async () => {
		const payload = {
			ref: "refs/heads/main",
			after: "abc123def456",
			repository: {
				id: 123456,
				name: "test-repo",
				full_name: "owner/test-repo",
				private: false,
				default_branch: "main",
			},
			sender: {
				login: "testuser",
				id: 789,
			},
		};

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({ received: true });
	});

	test("returns 401 for invalid signature", async () => {
		const payload = { ref: "refs/heads/main", after: "abc123" };

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: "wrong-secret",
		});

		expect(response.status).toBe(401);
		const data = (await response.json()) as { error: string };
		expect(data).toHaveProperty("error");
		expect(data.error).toContain("Invalid signature");
	});

	test("returns 401 for missing signature header", async () => {
		const payload = { ref: "refs/heads/main", after: "abc123" };

		const response = await sendWebhookRequest(baseUrl, payload, {
			signature: "", // Empty signature
		});

		expect(response.status).toBe(401);
		const data = await response.json();
		expect(data).toHaveProperty("error");
	});

	test("returns 400 for missing event type header", async () => {
		const payload = { ref: "refs/heads/main", after: "abc123" };

		const response = await sendWebhookRequest(baseUrl, payload, {
			event: "", // Empty event type
			secret: testSecret,
		});

		expect(response.status).toBe(400);
		const data = (await response.json()) as { error: string };
		expect(data).toHaveProperty("error");
		expect(data.error).toContain("event type");
	});

	test("returns 200 for unknown event type (gracefully ignored)", async () => {
		const payload = {
			action: "created",
			installation: {
				id: 12345,
			},
		};

		const response = await sendWebhookRequest(baseUrl, payload, {
			event: "installation",
			secret: testSecret,
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({ received: true });
	});

	test("returns 400 for malformed JSON payload", async () => {
		const invalidJson = "{invalid json";
		const signature = generateSignature(invalidJson, testSecret);

		const response = await fetch(`${baseUrl}/webhooks/github`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-GitHub-Event": "push",
				"X-GitHub-Delivery": "test-delivery-456",
				"X-Hub-Signature-256": signature,
			},
			body: invalidJson,
		});

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data).toHaveProperty("error");
		expect(typeof (data as any).error).toBe("string");
		expect((data as any).error).toMatch(/JSON/i);
	});

	test("returns 500 when webhook secret is not configured", async () => {
		// Temporarily remove webhook secret
		const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
		process.env.GITHUB_WEBHOOK_SECRET = undefined;

		const payload = { ref: "refs/heads/main", after: "abc123" };

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
		});

		expect(response.status).toBe(500);
		const data = (await response.json()) as { error: string };
		expect(data).toHaveProperty("error");
		expect(data.error).toContain("not configured");

		// Restore secret
		process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
	});

	test("handles push event with valid payload parsing", async () => {
		const payload = {
			ref: "refs/heads/feature/test",
			after: "def456ghi789",
			repository: {
				id: 987654,
				name: "another-repo",
				full_name: "org/another-repo",
				private: true,
				default_branch: "develop",
			},
			sender: {
				login: "developer",
				id: 111,
			},
		};

		const response = await sendWebhookRequest(baseUrl, payload, {
			secret: testSecret,
			delivery: "unique-delivery-id-789",
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({ received: true });
	});
});
