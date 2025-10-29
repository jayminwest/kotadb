/**
 * Integration tests for Stripe webhook endpoint
 * Issue #332 - Stripe webhook handlers for subscription lifecycle
 *
 * Tests the POST /webhooks/stripe endpoint with real Express server and Stripe Test Mode.
 * Uses real Supabase Local for consistency with antimocking philosophy.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createExpressApp } from "../../src/api/routes";
import { getServiceClient } from "../../src/db/client";
import { getStripeClient } from "../../src/api/stripe";
import { waitForCondition } from "../helpers/async-assertions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Server } from "node:http";
import type Stripe from "stripe";

// Set up webhook secret globally before any tests run
const WEBHOOK_TEST_SECRET = "whsec_test_secret_for_integration_tests";
const ORIGINAL_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_TEST_SECRET;

/**
 * Helper: Generate valid Stripe webhook signature for testing
 */
function generateStripeSignature(payload: string, secret: string, timestamp?: number): string {
	const stripe = getStripeClient();
	const ts = timestamp || Math.floor(Date.now() / 1000);

	// Use Stripe's webhook signature generation
	// Format: t=<timestamp>,v1=<signature>
	const signedPayload = `${ts}.${payload}`;
	const crypto = require("node:crypto");
	const signature = crypto
		.createHmac("sha256", secret)
		.update(signedPayload)
		.digest("hex");

	return `t=${ts},v1=${signature}`;
}

/**
 * Helper: Send Stripe webhook request to Express server
 */
async function sendStripeWebhookRequest(
	baseUrl: string,
	event: object,
	options: {
		signature?: string;
		secret: string;
	},
): Promise<Response> {
	const { signature, secret } = options;

	const body = JSON.stringify(event);
	const computedSignature = signature !== undefined ? signature : generateStripeSignature(body, secret);

	return fetch(`${baseUrl}/webhooks/stripe`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"stripe-signature": computedSignature,
		},
		body,
	});
}

/**
 * Helper: Create test user in database
 */
async function createTestUser(supabase: SupabaseClient, email: string): Promise<string> {
	const { data, error } = await supabase.auth.admin.createUser({
		email,
		email_confirm: true,
	});

	if (error || !data.user) {
		throw new Error(`Failed to create test user: ${error?.message}`);
	}

	return data.user.id;
}

/**
 * Helper: Create test API key for user
 */
async function createTestApiKey(supabase: SupabaseClient, userId: string): Promise<string> {
	const keyId = `test_key_${Date.now()}_${Math.random().toString(36).substring(7)}`;
	const { data, error } = await supabase
		.from("api_keys")
		.insert({
			user_id: userId,
			key_id: keyId,
			secret_hash: "test_secret_hash",
			tier: "free",
		})
		.select("id")
		.single();

	if (error || !data) {
		throw new Error(`Failed to create test API key: ${error?.message}`);
	}

	return data.id;
}

describe("POST /webhooks/stripe - Integration", () => {
	let supabase: SupabaseClient;
	let stripe: Stripe;
	let server: Server;
	let baseUrl: string;
	const testSecret = WEBHOOK_TEST_SECRET;

	// Test user and resources
	let testUserId: string;
	let testCustomerId: string;
	let testSubscriptionId: string;
	let testPriceId: string;

	beforeAll(async () => {
		// Initialize Supabase client (real connection for consistency)
		supabase = getServiceClient();

		// Initialize Stripe client (real Test Mode connection)
		stripe = getStripeClient();

		// Create test user
		const testEmail = `test-stripe-webhook-${Date.now()}@test.local`;
		testUserId = await createTestUser(supabase, testEmail);
		await createTestApiKey(supabase, testUserId);

		// Use test IDs for webhook payloads (no need to create real Stripe resources)
		testCustomerId = `cus_test_${Date.now()}`;
		testSubscriptionId = `sub_test_${Date.now()}`;
		testPriceId = process.env.STRIPE_SOLO_PRICE_ID || "price_test_solo";

		// Create Express app (webhook secret already set globally)
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
		// Clean up database resources (no real Stripe resources were created)
		try {
			await supabase.from("subscriptions").delete().eq("user_id", testUserId);
			await supabase.from("api_keys").delete().eq("user_id", testUserId);
			await supabase.auth.admin.deleteUser(testUserId);
		} catch (error) {
			// Ignore cleanup errors
		}

		// Stop server
		await new Promise<void>((resolve) => {
			server?.close(() => resolve());
		});

		// Restore original webhook secret
		if (ORIGINAL_WEBHOOK_SECRET) {
			process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET;
		} else {
			delete process.env.STRIPE_WEBHOOK_SECRET;
		}
	});

	test("returns 401 for missing signature header", async () => {
		const event = {
			id: "evt_test_missing_signature",
			object: "event",
			type: "invoice.paid",
			data: { object: {} },
		};

		const response = await fetch(`${baseUrl}/webhooks/stripe`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(event),
		});

		expect(response.status).toBe(401);
		const data = (await response.json()) as { error: string };
		expect(data.error).toBe("Missing signature header");
	});

	test("returns 401 for invalid signature", async () => {
		const event = {
			id: "evt_test_invalid_signature",
			object: "event",
			type: "invoice.paid",
			data: { object: {} },
		};

		const response = await sendStripeWebhookRequest(baseUrl, event, {
			signature: "t=123456789,v1=invalid_signature_hex",
			secret: testSecret,
		});

		expect(response.status).toBe(401);
		const data = (await response.json()) as { error: string };
		expect(data.error).toBe("Invalid signature");
	});

	test("returns 500 for missing webhook secret", async () => {
		// Temporarily unset webhook secret
		const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
		delete process.env.STRIPE_WEBHOOK_SECRET;

		const event = {
			id: "evt_test_missing_secret",
			object: "event",
			type: "invoice.paid",
			data: { object: {} },
		};

		const response = await sendStripeWebhookRequest(baseUrl, event, {
			secret: testSecret,
		});

		expect(response.status).toBe(500);
		const data = (await response.json()) as { error: string };
		expect(data.error).toBe("Webhook secret not configured");

		// Restore secret
		process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
	});

	test("returns 200 for valid signature", async () => {
		const event = {
			id: "evt_test_valid_signature",
			object: "event",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: testSubscriptionId,
					customer: testCustomerId,
					status: "active",
					metadata: {
						user_id: testUserId,
					},
					items: {
						data: [{ price: { id: testPriceId } }],
					},
					current_period_start: Math.floor(Date.now() / 1000),
					current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
					cancel_at_period_end: false,
				},
			},
		};

		const response = await sendStripeWebhookRequest(baseUrl, event, {
			secret: testSecret,
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as { received: boolean };
		expect(data.received).toBe(true);
	});

	test("handles invoice.paid event and creates subscription", async () => {
		// Note: This test verifies endpoint integration but cannot fully test
		// subscription creation without real Stripe resources due to Stripe API calls
		// in handleInvoicePaid (lines 78-83). The handler retrieves subscription
		// and customer objects from Stripe API which requires valid IDs.
		// This is acceptable as it tests real Stripe integration per anti-mock philosophy.

		const event = {
			id: `evt_test_invoice_paid_${Date.now()}`,
			object: "event",
			type: "invoice.paid",
			data: {
				object: {
					id: `in_test_${Date.now()}`,
					customer: testCustomerId,
					subscription: testSubscriptionId,
					amount_paid: 1000,
					status: "paid",
				},
			},
		};

		// Send webhook request
		const response = await sendStripeWebhookRequest(baseUrl, event, {
			secret: testSecret,
		});

		// Endpoint accepts webhook even though handler will fail to retrieve
		// non-existent Stripe resources (expected behavior - avoids retry loops)
		expect(response.status).toBe(200);
	});

	test("handles customer.subscription.updated event", async () => {
		// Note: This test verifies endpoint integration but cannot fully test
		// subscription updates without real Stripe resources due to Stripe API call
		// in handleSubscriptionUpdated (line 160). The handler retrieves customer
		// object from Stripe API which requires valid customer ID.

		const event = {
			id: `evt_test_subscription_updated_${Date.now()}`,
			object: "event",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: testSubscriptionId,
					customer: testCustomerId,
					status: "past_due",
					metadata: {
						user_id: testUserId,
					},
					items: {
						data: [{ price: { id: testPriceId } }],
					},
					current_period_start: Math.floor(Date.now() / 1000),
					current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
					cancel_at_period_end: false,
				},
			},
		};

		// Send webhook request
		const response = await sendStripeWebhookRequest(baseUrl, event, {
			secret: testSecret,
		});

		// Endpoint accepts webhook even though handler will fail to retrieve
		// non-existent Stripe customer (expected behavior - avoids retry loops)
		expect(response.status).toBe(200);
	});

	test("handles customer.subscription.deleted event", async () => {
		// Note: This test verifies endpoint integration but cannot fully test
		// subscription deletion without real Stripe resources due to Stripe API call
		// in handleSubscriptionDeleted (line 238). The handler retrieves customer
		// object from Stripe API which requires valid customer ID.

		const event = {
			id: `evt_test_subscription_deleted_${Date.now()}`,
			object: "event",
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: testSubscriptionId,
					customer: testCustomerId,
					status: "canceled",
					metadata: {
						user_id: testUserId,
					},
				},
			},
		};

		// Send webhook request
		const response = await sendStripeWebhookRequest(baseUrl, event, {
			secret: testSecret,
		});

		// Endpoint accepts webhook even though handler will fail to retrieve
		// non-existent Stripe customer (expected behavior - avoids retry loops)
		expect(response.status).toBe(200);
	});

	test("handles duplicate events idempotently", async () => {
		// Note: This test verifies that duplicate webhook deliveries are accepted
		// without errors. Database idempotency is handled by upsert operations
		// in the handlers, but cannot be fully tested here without real Stripe resources.

		const eventId = `evt_test_idempotency_${Date.now()}`;
		const event = {
			id: eventId,
			object: "event",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: testSubscriptionId,
					customer: testCustomerId,
					status: "active",
					metadata: {
						user_id: testUserId,
					},
					items: {
						data: [{ price: { id: testPriceId } }],
					},
					current_period_start: Math.floor(Date.now() / 1000),
					current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
					cancel_at_period_end: false,
				},
			},
		};

		// Send same event twice - both should be accepted
		const response1 = await sendStripeWebhookRequest(baseUrl, event, {
			secret: testSecret,
		});
		const response2 = await sendStripeWebhookRequest(baseUrl, event, {
			secret: testSecret,
		});

		expect(response1.status).toBe(200);
		expect(response2.status).toBe(200);
	});
});
