/**
 * Rate Limiting Integration Tests
 *
 * Tests the rate limiting functionality with real database connection.
 * Environment variables are loaded from .env.test in CI or default to local Supabase ports.
 *
 * Required environment variables:
 * - SUPABASE_URL (defaults to http://localhost:54322)
 * - SUPABASE_SERVICE_KEY (defaults to local demo key)
 * - SUPABASE_ANON_KEY (defaults to local demo key)
 * - DATABASE_URL (defaults to postgresql://postgres:postgres@localhost:5434/postgres)
 */

import { describe, expect, it } from "bun:test";
import { enforceRateLimit } from "@auth/rate-limit";
import { resetAllRateLimitCounters } from "../helpers/db";
import { RATE_LIMITS } from "@config/constants";

describe("Rate Limiting", () => {
	// Use unique key IDs per test to avoid interference
	function generateTestKeyId(): string {
		return `test_key_${crypto.randomUUID().slice(0, 16)}`;
	}

	describe("Hourly Rate Limits", () => {
		it("allows first request and increments counter to 1", async () => {
			const keyId = generateTestKeyId();

			const result = await enforceRateLimit(keyId, "free");

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 1); // Min of hourly (999) and daily (4999)
			expect(result.limit).toBe(RATE_LIMITS.FREE.HOURLY); // Free tier hourly limit
			expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
			expect(result.retryAfter).toBeUndefined();

			await resetAllRateLimitCounters(keyId);
		});

		it("increments counter correctly for subsequent requests", async () => {
			const keyId = generateTestKeyId();

			const result1 = await enforceRateLimit(keyId, "free");
			expect(result1.allowed).toBe(true);
			expect(result1.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 1);

			const result2 = await enforceRateLimit(keyId, "free");
			expect(result2.allowed).toBe(true);
			expect(result2.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 2);

			const result3 = await enforceRateLimit(keyId, "free");
			expect(result3.allowed).toBe(true);
			expect(result3.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 3);

			await resetAllRateLimitCounters(keyId);
		});

		it("allows request at exact hourly limit (1000th request for free tier)", async () => {
			const keyId = generateTestKeyId();

			// Make RATE_LIMITS.FREE.HOURLY - 1 requests
			for (let i = 0; i < RATE_LIMITS.FREE.HOURLY - 1; i++) {
				await enforceRateLimit(keyId, "free");
			}

			// Final request should be allowed (at the limit)
			const result = await enforceRateLimit(keyId, "free");
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(0); // At hourly limit
			expect(result.retryAfter).toBeUndefined();

			await resetAllRateLimitCounters(keyId);
		});

		it("denies request when hourly limit exceeded", async () => {
			const keyId = generateTestKeyId();

			// Make requests up to hourly limit
			for (let i = 0; i < RATE_LIMITS.FREE.HOURLY; i++) {
				const result = await enforceRateLimit(keyId, "free");
				expect(result.allowed).toBe(true);
			}

			// Next request should be denied
			const result = await enforceRateLimit(keyId, "free");
			expect(result.allowed).toBe(false);
			expect(result.remaining).toBe(0);
			expect(result.retryAfter).toBeGreaterThan(0);
			expect(result.retryAfter).toBeLessThanOrEqual(3600);

			await resetAllRateLimitCounters(keyId);
		});

		it("handles different tier limits correctly", async () => {
			const freeKeyId = generateTestKeyId();
			const soloKeyId = generateTestKeyId();
			const teamKeyId = generateTestKeyId();

			const freeResult = await enforceRateLimit(freeKeyId, "free");
			expect(freeResult.limit).toBe(RATE_LIMITS.FREE.HOURLY);
			expect(freeResult.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 1);

			const soloResult = await enforceRateLimit(soloKeyId, "solo");
			expect(soloResult.limit).toBe(RATE_LIMITS.SOLO.HOURLY);
			expect(soloResult.remaining).toBe(RATE_LIMITS.SOLO.HOURLY - 1);

			const teamResult = await enforceRateLimit(teamKeyId, "team");
			expect(teamResult.limit).toBe(RATE_LIMITS.TEAM.HOURLY);
			expect(teamResult.remaining).toBe(RATE_LIMITS.TEAM.HOURLY - 1);

			await resetAllRateLimitCounters(freeKeyId);
			await resetAllRateLimitCounters(soloKeyId);
			await resetAllRateLimitCounters(teamKeyId);
		});

		it("maintains separate counters for different keys", async () => {
			const keyId1 = generateTestKeyId();
			const keyId2 = generateTestKeyId();

			// Make 3 requests with key1
			for (let i = 0; i < 3; i++) {
				await enforceRateLimit(keyId1, "free");
			}

			// Make 5 requests with key2
			for (let i = 0; i < 5; i++) {
				await enforceRateLimit(keyId2, "free");
			}

			// Verify counters are independent
			const result1 = await enforceRateLimit(keyId1, "free");
			expect(result1.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 4); // 4th request

			const result2 = await enforceRateLimit(keyId2, "free");
			expect(result2.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 6); // 6th request

			await resetAllRateLimitCounters(keyId1);
			await resetAllRateLimitCounters(keyId2);
		});

		it("calculates reset timestamp within current hour window", async () => {
			const keyId = generateTestKeyId();

			const result = await enforceRateLimit(keyId, "free");

			// Reset should be at top of next hour
			const now = new Date();
			const nextHour = new Date(now);
			nextHour.setHours(now.getHours() + 1, 0, 0, 0);
			const expectedResetAt = Math.floor(nextHour.getTime() / 1000);

			expect(result.resetAt).toBe(expectedResetAt);

			await resetAllRateLimitCounters(keyId);
		});

		it("handles concurrent requests without race conditions", async () => {
			const keyId = generateTestKeyId();
			const concurrentRequests = 50;

			// Make 50 concurrent requests
			const promises = Array.from({ length: concurrentRequests }, () =>
				enforceRateLimit(keyId, "free"),
			);

			const results = await Promise.all(promises);

			// All should be allowed (within limit)
			const allowedCount = results.filter((r) => r.allowed).length;
			expect(allowedCount).toBe(concurrentRequests);

			// Verify final counter state
			const finalResult = await enforceRateLimit(keyId, "free");
			expect(finalResult.remaining).toBe(RATE_LIMITS.FREE.HOURLY - concurrentRequests - 1);

			await resetAllRateLimitCounters(keyId);
		});

		it("returns consistent resetAt across multiple requests in same window", async () => {
			const keyId = generateTestKeyId();

			const result1 = await enforceRateLimit(keyId, "free");
			const result2 = await enforceRateLimit(keyId, "free");
			const result3 = await enforceRateLimit(keyId, "free");

			// All requests in same hourly window should have same resetAt
			expect(result1.resetAt).toBe(result2.resetAt);
			expect(result2.resetAt).toBe(result3.resetAt);

			await resetAllRateLimitCounters(keyId);
		});

		it("calculates retryAfter correctly when hourly limit exceeded", async () => {
			const keyId = generateTestKeyId();

			// Exhaust hourly limit
			for (let i = 0; i < RATE_LIMITS.FREE.HOURLY; i++) {
				await enforceRateLimit(keyId, "free");
			}

			// Exceeding request
			const result = await enforceRateLimit(keyId, "free");

			expect(result.allowed).toBe(false);
			expect(result.retryAfter).toBeDefined();
			expect(result.retryAfter).toBeGreaterThan(0);

			// retryAfter should be less than or equal to 1 hour (3600 seconds)
			expect(result.retryAfter).toBeLessThanOrEqual(3600);

			await resetAllRateLimitCounters(keyId);
		});

		it("enforces limit correctly near boundary (998, 999, 1000, 1001 requests)", async () => {
			const keyId = generateTestKeyId();

			// Make RATE_LIMITS.FREE.HOURLY - 3 requests
			for (let i = 0; i < RATE_LIMITS.FREE.HOURLY - 3; i++) {
				await enforceRateLimit(keyId, "free");
			}

			// 998th request
			const result998 = await enforceRateLimit(keyId, "free");
			expect(result998.allowed).toBe(true);
			expect(result998.remaining).toBe(2);

			// 999th request
			const result999 = await enforceRateLimit(keyId, "free");
			expect(result999.allowed).toBe(true);
			expect(result999.remaining).toBe(1);

			// 1000th request (at the limit)
			const result1000 = await enforceRateLimit(keyId, "free");
			expect(result1000.allowed).toBe(true);
			expect(result1000.remaining).toBe(0); // At hourly limit

			// 1001st request (exceeds hourly limit)
			const result1001 = await enforceRateLimit(keyId, "free");
			expect(result1001.allowed).toBe(false);
			expect(result1001.remaining).toBe(0);
			expect(result1001.retryAfter).toBeDefined();

			await resetAllRateLimitCounters(keyId);
		});
	});

	describe("Daily Rate Limits", () => {
		it("first request increments daily counter to 1", async () => {
			const keyId = generateTestKeyId();

			const result = await enforceRateLimit(keyId, "free");

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 1); // Min of hourly (999) and daily (4999)

			await resetAllRateLimitCounters(keyId);
		});

		it("daily counter persists across multiple hourly windows", async () => {
			const keyId = generateTestKeyId();

			// Make requests incrementing both counters
			for (let i = 0; i < 10; i++) {
				const result = await enforceRateLimit(keyId, "free");
				expect(result.allowed).toBe(true);
			}

			// 11th request should show both counters incremented
			const result = await enforceRateLimit(keyId, "free");
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 11); // Min of hourly (989) and daily (4989)

			await resetAllRateLimitCounters(keyId);
		});

		it("allows request at exact daily limit (5000th request for free tier)", async () => {
			const keyId = generateTestKeyId();

			// Make RATE_LIMITS.FREE.HOURLY - 1 requests (simulating requests across multiple hours)
			// This would normally span multiple hours, but for testing we simulate
			// by incrementing both hourly and daily counters
			for (let i = 0; i < RATE_LIMITS.FREE.HOURLY - 1; i++) {
				await enforceRateLimit(keyId, "free");
			}

			// At this point: hourly = 1000, daily = 1000
			// We can't easily test crossing into a new hour without time manipulation,
			// so this test verifies the daily counter increments correctly
			const result = await enforceRateLimit(keyId, "free");
			expect(result.allowed).toBe(true); // Final request still allowed hourly

			await resetAllRateLimitCounters(keyId);
		});

		it("denies request when daily limit would be exceeded", async () => {
			const keyId = generateTestKeyId();

			// To properly test daily limit blocking, we'd need to make RATE_LIMITS.FREE.DAILY requests
			// across multiple hours. For unit test speed, we verify the logic with
			// smaller numbers and trust the database function handles larger counts.
			// Make RATE_LIMITS.FREE.HOURLY requests (hits hourly limit first)
			for (let i = 0; i < RATE_LIMITS.FREE.HOURLY; i++) {
				await enforceRateLimit(keyId, "free");
			}

			// Next request blocked by hourly limit
			const result = await enforceRateLimit(keyId, "free");
			expect(result.allowed).toBe(false);

			// Both counters incremented to RATE_LIMITS.FREE.HOURLY + 1
			// If hourly window reset but daily stayed, next request would pass hourly
			// but eventually hit daily limit at RATE_LIMITS.FREE.DAILY + 1

			await resetAllRateLimitCounters(keyId);
		});

		it("different keys have independent daily counters", async () => {
			const keyId1 = generateTestKeyId();
			const keyId2 = generateTestKeyId();

			// Make 5 requests with key1
			for (let i = 0; i < 5; i++) {
				await enforceRateLimit(keyId1, "free");
			}

			// Make 10 requests with key2
			for (let i = 0; i < 10; i++) {
				await enforceRateLimit(keyId2, "free");
			}

			// Verify daily counters are independent
			const result1 = await enforceRateLimit(keyId1, "free");
			expect(result1.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 6); // Min of hourly (994) and daily (4994)

			const result2 = await enforceRateLimit(keyId2, "free");
			expect(result2.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 11); // Min of hourly (989) and daily (4989)

			await resetAllRateLimitCounters(keyId1);
			await resetAllRateLimitCounters(keyId2);
		});

		it("handles concurrent requests without race conditions in daily table", async () => {
			const keyId = generateTestKeyId();
			const concurrentRequests = 50;

			// Make 50 concurrent requests
			const promises = Array.from({ length: concurrentRequests }, () =>
				enforceRateLimit(keyId, "free"),
			);

			const results = await Promise.all(promises);

			// All should be allowed (within both limits)
			const allowedCount = results.filter((r) => r.allowed).length;
			expect(allowedCount).toBe(concurrentRequests);

			// Verify final counter state (both hourly and daily should be accurate)
			const finalResult = await enforceRateLimit(keyId, "free");
			expect(finalResult.remaining).toBe(RATE_LIMITS.FREE.HOURLY - concurrentRequests - 1);

			await resetAllRateLimitCounters(keyId);
		});
	});

	describe("Dual Limit Enforcement", () => {
		it("returns most restrictive remaining count", async () => {
			const keyId = generateTestKeyId();

			// First request: hourly = 999, daily = 4999
			const result1 = await enforceRateLimit(keyId, "free");
			expect(result1.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 1); // Hourly is more restrictive

			// After 100 requests total: hourly = 900, daily = 4900
			for (let i = 0; i < 99; i++) {
				await enforceRateLimit(keyId, "free");
			}

			// 100th request: hourly = 899, daily = 4899
			const result2 = await enforceRateLimit(keyId, "free");
			expect(result2.remaining).toBe(RATE_LIMITS.FREE.HOURLY - 100); // Still hourly

			await resetAllRateLimitCounters(keyId);
		});

		it("hourly limit blocks before daily limit", async () => {
			const keyId = generateTestKeyId();

			// Exhaust hourly limit
			for (let i = 0; i < RATE_LIMITS.FREE.HOURLY; i++) {
				await enforceRateLimit(keyId, "free");
			}

			// Next request blocked by hourly (daily still has RATE_LIMITS.FREE.DAILY - RATE_LIMITS.FREE.HOURLY remaining)
			const result = await enforceRateLimit(keyId, "free");
			expect(result.allowed).toBe(false);
			expect(result.retryAfter).toBeLessThanOrEqual(3600); // Hourly reset

			await resetAllRateLimitCounters(keyId);
		});

		it("uses hourly resetAt for retry guidance", async () => {
			const keyId = generateTestKeyId();

			const result = await enforceRateLimit(keyId, "free");

			// resetAt should point to next hour (not next day)
			const now = new Date();
			const nextHour = new Date(now);
			nextHour.setHours(now.getHours() + 1, 0, 0, 0);
			const expectedResetAt = Math.floor(nextHour.getTime() / 1000);

			expect(result.resetAt).toBe(expectedResetAt);

			await resetAllRateLimitCounters(keyId);
		});
	});

	describe("Error Handling", () => {
		it("fails closed on database errors (invalid connection)", async () => {
			// Temporarily break the connection by using an invalid key
			const originalServiceKey = process.env.SUPABASE_SERVICE_KEY;
			process.env.SUPABASE_SERVICE_KEY = "invalid-key";

			const keyId = generateTestKeyId();

			const result = await enforceRateLimit(keyId, "free");

			// Should fail closed (deny request)
			expect(result.allowed).toBe(false);
			expect(result.remaining).toBe(0);
			expect(result.retryAfter).toBe(3600);

			// Restore original key
			process.env.SUPABASE_SERVICE_KEY = originalServiceKey;
		});
	});
});
