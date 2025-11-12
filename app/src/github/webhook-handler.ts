/**
 * GitHub Webhook Handler
 * Issue #260 - GitHub webhook receiver with HMAC signature verification
 *
 * Provides secure webhook request handling with HMAC-SHA256 signature verification,
 * payload parsing, and structured logging for GitHub App webhook events.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";
import type { GitHubPushEvent } from "./types";

const logger = createLogger({ module: "github-webhook-handler" });

/**
 * Verifies GitHub webhook signature using HMAC-SHA256.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param payload - Raw request body as string
 * @param signature - X-Hub-Signature-256 header value (format: "sha256=...")
 * @param secret - Webhook secret from environment configuration
 * @returns true if signature is valid, false otherwise
 *
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyWebhookSignature(
	payload: string,
	signature: string,
	secret: string,
): boolean {
	// Validate inputs
	if (!signature || !secret || !payload) {
		return false;
	}

	// Check signature format (must start with "sha256=")
	if (!signature.startsWith("sha256=")) {
		return false;
	}

	// Compute HMAC-SHA256 of payload
	const hmac = createHmac("sha256", secret);
	hmac.update(payload);
	const digest = `sha256=${hmac.digest("hex")}`;

	// Use timing-safe comparison to prevent timing attacks
	try {
		const signatureBuffer = Buffer.from(signature);
		const digestBuffer = Buffer.from(digest);

		// Buffers must be same length for timingSafeEqual
		if (signatureBuffer.length !== digestBuffer.length) {
			return false;
		}

		return timingSafeEqual(signatureBuffer, digestBuffer);
	} catch (error) {
		// Buffer conversion or comparison failed
		logger.error("Webhook signature verification failed", error instanceof Error ? error : undefined, {
			operation: "verifyWebhookSignature",
		});
		Sentry.captureException(error);
		return false;
	}
}

/**
 * Parses webhook payload and extracts event-specific data.
 * Currently supports push events, returns null for other event types.
 *
 * @param body - Parsed JSON body from webhook request
 * @param event - Event type from X-GitHub-Event header
 * @returns Parsed push event data or null if unsupported/invalid
 */
export function parseWebhookPayload(
	body: unknown,
	event: string,
): GitHubPushEvent | null {
	// Only handle push events for now
	if (event !== "push") {
		return null;
	}

	// Type guard for push event structure
	if (
		!body ||
		typeof body !== "object" ||
		!("ref" in body) ||
		!("after" in body) ||
		!("repository" in body) ||
		!("sender" in body)
	) {
		return null;
	}

	const payload = body as Record<string, unknown>;

	// Validate repository structure
	const repository = payload.repository;
	if (
		!repository ||
		typeof repository !== "object" ||
		!("id" in repository) ||
		!("name" in repository) ||
		!("full_name" in repository) ||
		!("private" in repository) ||
		!("default_branch" in repository)
	) {
		return null;
	}

	// Validate sender structure
	const sender = payload.sender;
	if (
		!sender ||
		typeof sender !== "object" ||
		!("login" in sender) ||
		!("id" in sender)
	) {
		return null;
	}

	// Extract and validate required fields
	const { ref, after } = payload;
	const repo = repository as Record<string, unknown>;
	const user = sender as Record<string, unknown>;

	if (
		typeof ref !== "string" ||
		typeof after !== "string" ||
		typeof repo.id !== "number" ||
		typeof repo.name !== "string" ||
		typeof repo.full_name !== "string" ||
		typeof repo.private !== "boolean" ||
		typeof repo.default_branch !== "string" ||
		typeof user.login !== "string" ||
		typeof user.id !== "number"
	) {
		return null;
	}

	return {
		ref,
		after,
		repository: {
			id: repo.id,
			name: repo.name,
			full_name: repo.full_name,
			private: repo.private,
			default_branch: repo.default_branch,
		},
		sender: {
			login: user.login,
			id: user.id,
		},
	};
}

/**
 * Logs webhook request with structured metadata.
 * Redacts sensitive data and includes timestamp, event type, delivery ID, and repository.
 *
 * @param event - Event type from X-GitHub-Event header
 * @param delivery - Delivery ID from X-GitHub-Delivery header
 * @param payload - Parsed webhook payload (optional)
 */
export function logWebhookRequest(
	event: string,
	delivery: string,
	payload?: GitHubPushEvent | null,
): void {
	logger.info("GitHub webhook received", {
		event,
		delivery,
		repository: payload?.repository?.full_name ?? "unknown",
		ref: payload?.ref ?? "unknown",
		commit: payload?.after ?? "unknown",
		sender: payload?.sender?.login ?? "unknown",
	});
}
