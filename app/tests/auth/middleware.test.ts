/**
 * Authentication Middleware Tests (Local Mode)
 *
 * Tests the simplified authentication middleware for local-only mode.
 * All requests are automatically authenticated with a local user context.
 */

import { describe, expect, it } from "bun:test";
import { authenticateRequest, createForbiddenResponse, requireAdmin } from "@auth/middleware";

describe("Authentication Middleware (Local Mode)", () => {
	describe("authenticateRequest", () => {
		it("returns local context for any request", async () => {
			const request = new Request("http://localhost:3000/search");
			const result = await authenticateRequest(request);

			expect(result.response).toBeUndefined();
			expect(result.context).toBeDefined();
			expect(result.context?.userId).toBe("local-user");
			expect(result.context?.tier).toBe("team");
			expect(result.context?.keyId).toBe("local-key");
			expect(result.context?.rateLimitPerHour).toBe(Number.MAX_SAFE_INTEGER);
		});

		it("returns local context regardless of Authorization header", async () => {
			const request = new Request("http://localhost:3000/search", {
				headers: {
					Authorization: "Bearer some-random-token",
				},
			});

			const result = await authenticateRequest(request);

			expect(result.response).toBeUndefined();
			expect(result.context).toBeDefined();
			expect(result.context?.userId).toBe("local-user");
			expect(result.context?.tier).toBe("team");
		});

		it("returns local context for missing Authorization header", async () => {
			const request = new Request("http://localhost:3000/api/search");
			const result = await authenticateRequest(request);

			expect(result.response).toBeUndefined();
			expect(result.context).toBeDefined();
			expect(result.context?.userId).toBe("local-user");
		});
	});

	describe("createForbiddenResponse", () => {
		it("creates 403 response with error message", async () => {
			const response = createForbiddenResponse(
				"Insufficient permissions",
				"AUTH_FORBIDDEN",
			);

			expect(response.status).toBe(403);
			expect(response.headers.get("Content-Type")).toBe("application/json");

			const body = (await response.json()) as { error: string; code: string };
			expect(body.error).toBe("Insufficient permissions");
			expect(body.code).toBe("AUTH_FORBIDDEN");
		});
	});

	describe("requireAdmin", () => {
		it("always returns true in local mode", () => {
			expect(requireAdmin(null)).toBe(true);
			expect(requireAdmin("")).toBe(true);
			expect(requireAdmin("Bearer some-token")).toBe(true);
		});
	});
});
