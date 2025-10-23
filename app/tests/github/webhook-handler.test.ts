/**
 * Unit tests for GitHub webhook handler
 * Issue #260 - GitHub webhook receiver with HMAC signature verification
 *
 * Tests signature verification, payload parsing, and logging functions.
 * No Supabase required for these unit tests (testing pure functions).
 */

import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
	verifyWebhookSignature,
	parseWebhookPayload,
	logWebhookRequest,
} from "../../src/github/webhook-handler";
import type { GitHubPushEvent } from "../../src/github/types";

/**
 * Helper: Generate valid HMAC-SHA256 signature for testing
 */
function generateSignature(payload: string, secret: string): string {
	const hmac = createHmac("sha256", secret);
	hmac.update(payload);
	return `sha256=${hmac.digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
	const testSecret = "test-webhook-secret-123";
	const testPayload = JSON.stringify({ test: "payload" });

	test("returns true for valid signature", () => {
		const signature = generateSignature(testPayload, testSecret);
		expect(verifyWebhookSignature(testPayload, signature, testSecret)).toBe(true);
	});

	test("returns false for invalid signature", () => {
		const signature = generateSignature(testPayload, "wrong-secret");
		expect(verifyWebhookSignature(testPayload, signature, testSecret)).toBe(false);
	});

	test("returns false for missing signature", () => {
		expect(verifyWebhookSignature(testPayload, "", testSecret)).toBe(false);
	});

	test("returns false for malformed signature format", () => {
		const invalidSignature = "invalid-format-abc123";
		expect(verifyWebhookSignature(testPayload, invalidSignature, testSecret)).toBe(
			false,
		);
	});

	test("returns false for signature without sha256 prefix", () => {
		const hmac = createHmac("sha256", testSecret);
		hmac.update(testPayload);
		const digest = hmac.digest("hex"); // Missing "sha256=" prefix
		expect(verifyWebhookSignature(testPayload, digest, testSecret)).toBe(false);
	});

	test("verifies empty payload signature correctly", () => {
		const signature = generateSignature("", testSecret);
		// Empty payload with correct signature should return false (implementation validates payload presence)
		expect(verifyWebhookSignature("", signature, testSecret)).toBe(false);
	});

	test("handles Unicode payloads correctly", () => {
		const unicodePayload = JSON.stringify({ message: "Hello 世界 🌍" });
		const signature = generateSignature(unicodePayload, testSecret);
		expect(verifyWebhookSignature(unicodePayload, signature, testSecret)).toBe(
			true,
		);
	});

	test("returns false when secret is empty", () => {
		const signature = generateSignature(testPayload, testSecret);
		expect(verifyWebhookSignature(testPayload, signature, "")).toBe(false);
	});

	test("returns false when signature length mismatches", () => {
		const signature = "sha256=abc"; // Too short
		expect(verifyWebhookSignature(testPayload, signature, testSecret)).toBe(false);
	});
});

describe("parseWebhookPayload", () => {
	const validPushEvent: GitHubPushEvent = {
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

	test("parses valid push event", () => {
		const result = parseWebhookPayload(validPushEvent, "push");
		expect(result).toEqual(validPushEvent);
	});

	test("returns null for non-push event type", () => {
		const result = parseWebhookPayload(validPushEvent, "installation");
		expect(result).toBeNull();
	});

	test("returns null for malformed payload", () => {
		const malformed = { ref: "refs/heads/main" }; // Missing required fields
		const result = parseWebhookPayload(malformed, "push");
		expect(result).toBeNull();
	});

	test("returns null for missing ref field", () => {
		const { ref, ...incomplete } = validPushEvent;
		const result = parseWebhookPayload(incomplete, "push");
		expect(result).toBeNull();
	});

	test("returns null for missing repository field", () => {
		const { repository, ...incomplete } = validPushEvent;
		const result = parseWebhookPayload(incomplete, "push");
		expect(result).toBeNull();
	});

	test("returns null for invalid repository structure", () => {
		const invalidRepo = {
			...validPushEvent,
			repository: { id: 123 }, // Missing required fields
		};
		const result = parseWebhookPayload(invalidRepo, "push");
		expect(result).toBeNull();
	});

	test("returns null for invalid sender structure", () => {
		const invalidSender = {
			...validPushEvent,
			sender: { login: "test" }, // Missing id
		};
		const result = parseWebhookPayload(invalidSender, "push");
		expect(result).toBeNull();
	});

	test("returns null for non-object payload", () => {
		expect(parseWebhookPayload(null, "push")).toBeNull();
		expect(parseWebhookPayload("string", "push")).toBeNull();
		expect(parseWebhookPayload(123, "push")).toBeNull();
		expect(parseWebhookPayload([], "push")).toBeNull();
	});

	test("returns null for wrong field types", () => {
		const wrongTypes = {
			...validPushEvent,
			repository: {
				...validPushEvent.repository,
				id: "123456", // Should be number
			},
		};
		const result = parseWebhookPayload(wrongTypes, "push");
		expect(result).toBeNull();
	});
});

describe("logWebhookRequest", () => {
	const validPushEvent: GitHubPushEvent = {
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

	test("logs webhook request with valid payload", () => {
		// No assertions needed - just verify function doesn't throw
		expect(() => {
			logWebhookRequest("push", "delivery-123", validPushEvent);
		}).not.toThrow();
	});

	test("logs webhook request with null payload", () => {
		expect(() => {
			logWebhookRequest("installation", "delivery-456", null);
		}).not.toThrow();
	});

	test("logs webhook request without payload", () => {
		expect(() => {
			logWebhookRequest("ping", "delivery-789");
		}).not.toThrow();
	});
});
