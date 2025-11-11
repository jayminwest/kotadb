/**
 * Unit tests for correlation context utilities
 */

import { describe, it, expect } from "bun:test";
import {
	generateRequestId,
	generateJobId,
	createRequestContext,
	createJobContext,
	extendContext,
} from "@logging/context";

describe("Correlation context utilities", () => {
	describe("generateRequestId", () => {
		it("should generate unique request IDs", () => {
			const id1 = generateRequestId();
			const id2 = generateRequestId();

			expect(id1).not.toBe(id2);
			expect(typeof id1).toBe("string");
			expect(id1.length).toBeGreaterThan(0);
		});

		it("should generate valid UUID format", () => {
			const id = generateRequestId();
			const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
			expect(uuidPattern.test(id)).toBe(true);
		});
	});

	describe("generateJobId", () => {
		it("should generate unique job IDs", () => {
			const id1 = generateJobId();
			const id2 = generateJobId();

			expect(id1).not.toBe(id2);
			expect(typeof id1).toBe("string");
			expect(id1.length).toBeGreaterThan(0);
		});

		it("should generate valid UUID format", () => {
			const id = generateJobId();
			const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
			expect(uuidPattern.test(id)).toBe(true);
		});
	});

	describe("createRequestContext", () => {
		it("should create context with request_id only", () => {
			const context = createRequestContext("req-123");

			expect(context.request_id).toBe("req-123");
			expect(context.user_id).toBeUndefined();
			expect(context.key_id).toBeUndefined();
		});

		it("should create context with request_id and user_id", () => {
			const context = createRequestContext("req-123", "user-456");

			expect(context.request_id).toBe("req-123");
			expect(context.user_id).toBe("user-456");
			expect(context.key_id).toBeUndefined();
		});

		it("should create context with all fields", () => {
			const context = createRequestContext("req-123", "user-456", "key-789");

			expect(context.request_id).toBe("req-123");
			expect(context.user_id).toBe("user-456");
			expect(context.key_id).toBe("key-789");
		});
	});

	describe("createJobContext", () => {
		it("should create context with job_id only", () => {
			const context = createJobContext("job-123");

			expect(context.job_id).toBe("job-123");
			expect(context.user_id).toBeUndefined();
		});

		it("should create context with job_id and user_id", () => {
			const context = createJobContext("job-123", "user-456");

			expect(context.job_id).toBe("job-123");
			expect(context.user_id).toBe("user-456");
		});
	});

	describe("extendContext", () => {
		it("should merge additional fields into base context", () => {
			const base = { request_id: "req-123" };
			const additional = { user_id: "user-456" };

			const result = extendContext(base, additional);

			expect(result.request_id).toBe("req-123");
			expect(result.user_id).toBe("user-456");
		});

		it("should override base fields with additional fields", () => {
			const base = { request_id: "req-123", user_id: "old-user" };
			const additional = { user_id: "new-user" };

			const result = extendContext(base, additional);

			expect(result.request_id).toBe("req-123");
			expect(result.user_id).toBe("new-user");
		});

		it("should not modify original base context", () => {
			const base = { request_id: "req-123" };
			const additional = { user_id: "user-456" };

			extendContext(base, additional);

			expect((base as Record<string, unknown>).user_id).toBeUndefined();
		});

		it("should handle empty additional context", () => {
			const base = { request_id: "req-123" };
			const additional = {};

			const result = extendContext(base, additional);

			expect(result.request_id).toBe("req-123");
			expect(Object.keys(result)).toHaveLength(1);
		});
	});
});
