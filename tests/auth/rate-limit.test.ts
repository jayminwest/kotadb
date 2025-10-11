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

import { describe, it, expect, beforeEach } from "bun:test";
import { enforceRateLimit } from "@auth/rate-limit";
import { getServiceClient } from "@db/client";

describe("Rate Limiting", () => {
  // Use unique key IDs per test to avoid interference
  function generateTestKeyId(): string {
    return `test_key_${crypto.randomUUID().slice(0, 16)}`;
  }

  // Helper to clean up rate limit counters for a key
  async function cleanupRateLimitCounter(keyId: string) {
    const supabase = getServiceClient();
    await supabase
      .from("rate_limit_counters")
      .delete()
      .eq("key_id", keyId);
  }

  describe("enforceRateLimit", () => {
    it("allows first request and increments counter to 1", async () => {
      const keyId = generateTestKeyId();
      const rateLimitPerHour = 100;

      const result = await enforceRateLimit(keyId, rateLimitPerHour);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
      expect(result.limit).toBe(100);
      expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(result.retryAfter).toBeUndefined();

      await cleanupRateLimitCounter(keyId);
    });

    it("increments counter correctly for subsequent requests", async () => {
      const keyId = generateTestKeyId();
      const rateLimitPerHour = 100;

      const result1 = await enforceRateLimit(keyId, rateLimitPerHour);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(99);

      const result2 = await enforceRateLimit(keyId, rateLimitPerHour);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(98);

      const result3 = await enforceRateLimit(keyId, rateLimitPerHour);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(97);

      await cleanupRateLimitCounter(keyId);
    });

    it("allows request at exact limit (100th request for free tier)", async () => {
      const keyId = generateTestKeyId();
      const rateLimitPerHour = 100;

      // Make 99 requests
      for (let i = 0; i < 99; i++) {
        await enforceRateLimit(keyId, rateLimitPerHour);
      }

      // 100th request should be allowed
      const result = await enforceRateLimit(keyId, rateLimitPerHour);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeUndefined();

      await cleanupRateLimitCounter(keyId);
    });

    it("denies request when limit exceeded", async () => {
      const keyId = generateTestKeyId();
      const rateLimitPerHour = 5; // Small limit for faster test

      // Make requests up to limit
      for (let i = 0; i < 5; i++) {
        const result = await enforceRateLimit(keyId, rateLimitPerHour);
        expect(result.allowed).toBe(true);
      }

      // Next request should be denied
      const result = await enforceRateLimit(keyId, rateLimitPerHour);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(3600);

      await cleanupRateLimitCounter(keyId);
    });

    it("handles different tier limits correctly", async () => {
      const freeKeyId = generateTestKeyId();
      const soloKeyId = generateTestKeyId();
      const teamKeyId = generateTestKeyId();

      const freeResult = await enforceRateLimit(freeKeyId, 100);
      expect(freeResult.limit).toBe(100);
      expect(freeResult.remaining).toBe(99);

      const soloResult = await enforceRateLimit(soloKeyId, 1000);
      expect(soloResult.limit).toBe(1000);
      expect(soloResult.remaining).toBe(999);

      const teamResult = await enforceRateLimit(teamKeyId, 10000);
      expect(teamResult.limit).toBe(10000);
      expect(teamResult.remaining).toBe(9999);

      await cleanupRateLimitCounter(freeKeyId);
      await cleanupRateLimitCounter(soloKeyId);
      await cleanupRateLimitCounter(teamKeyId);
    });

    it("maintains separate counters for different keys", async () => {
      const keyId1 = generateTestKeyId();
      const keyId2 = generateTestKeyId();
      const rateLimitPerHour = 100;

      // Make 3 requests with key1
      for (let i = 0; i < 3; i++) {
        await enforceRateLimit(keyId1, rateLimitPerHour);
      }

      // Make 5 requests with key2
      for (let i = 0; i < 5; i++) {
        await enforceRateLimit(keyId2, rateLimitPerHour);
      }

      // Verify counters are independent
      const result1 = await enforceRateLimit(keyId1, rateLimitPerHour);
      expect(result1.remaining).toBe(96); // 4th request

      const result2 = await enforceRateLimit(keyId2, rateLimitPerHour);
      expect(result2.remaining).toBe(94); // 6th request

      await cleanupRateLimitCounter(keyId1);
      await cleanupRateLimitCounter(keyId2);
    });

    it("calculates reset timestamp within current hour window", async () => {
      const keyId = generateTestKeyId();
      const rateLimitPerHour = 100;

      const result = await enforceRateLimit(keyId, rateLimitPerHour);

      // Reset should be at top of next hour
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);
      const expectedResetAt = Math.floor(nextHour.getTime() / 1000);

      expect(result.resetAt).toBe(expectedResetAt);

      await cleanupRateLimitCounter(keyId);
    });

    it("handles concurrent requests without race conditions", async () => {
      const keyId = generateTestKeyId();
      const rateLimitPerHour = 100;
      const concurrentRequests = 50;

      // Make 50 concurrent requests
      const promises = Array.from({ length: concurrentRequests }, () =>
        enforceRateLimit(keyId, rateLimitPerHour)
      );

      const results = await Promise.all(promises);

      // All should be allowed (within limit)
      const allowedCount = results.filter((r) => r.allowed).length;
      expect(allowedCount).toBe(concurrentRequests);

      // Verify final counter state
      const finalResult = await enforceRateLimit(keyId, rateLimitPerHour);
      expect(finalResult.remaining).toBe(100 - concurrentRequests - 1);

      await cleanupRateLimitCounter(keyId);
    });

    it("returns consistent resetAt across multiple requests in same window", async () => {
      const keyId = generateTestKeyId();
      const rateLimitPerHour = 100;

      const result1 = await enforceRateLimit(keyId, rateLimitPerHour);
      const result2 = await enforceRateLimit(keyId, rateLimitPerHour);
      const result3 = await enforceRateLimit(keyId, rateLimitPerHour);

      // All requests in same hourly window should have same resetAt
      expect(result1.resetAt).toBe(result2.resetAt);
      expect(result2.resetAt).toBe(result3.resetAt);

      await cleanupRateLimitCounter(keyId);
    });

    it("calculates retryAfter correctly when limit exceeded", async () => {
      const keyId = generateTestKeyId();
      const rateLimitPerHour = 3;

      // Exhaust limit
      for (let i = 0; i < 3; i++) {
        await enforceRateLimit(keyId, rateLimitPerHour);
      }

      // Exceeding request
      const result = await enforceRateLimit(keyId, rateLimitPerHour);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);

      // retryAfter should be less than or equal to 1 hour (3600 seconds)
      expect(result.retryAfter).toBeLessThanOrEqual(3600);

      await cleanupRateLimitCounter(keyId);
    });

    it("enforces limit correctly near boundary (99, 100, 101 requests)", async () => {
      const keyId = generateTestKeyId();
      const rateLimitPerHour = 100;

      // Make 98 requests
      for (let i = 0; i < 98; i++) {
        await enforceRateLimit(keyId, rateLimitPerHour);
      }

      // 99th request
      const result99 = await enforceRateLimit(keyId, rateLimitPerHour);
      expect(result99.allowed).toBe(true);
      expect(result99.remaining).toBe(1);

      // 100th request
      const result100 = await enforceRateLimit(keyId, rateLimitPerHour);
      expect(result100.allowed).toBe(true);
      expect(result100.remaining).toBe(0);

      // 101st request (exceeds limit)
      const result101 = await enforceRateLimit(keyId, rateLimitPerHour);
      expect(result101.allowed).toBe(false);
      expect(result101.remaining).toBe(0);
      expect(result101.retryAfter).toBeDefined();

      await cleanupRateLimitCounter(keyId);
    });
  });

  describe("Error Handling", () => {
    it("fails closed on database errors (invalid connection)", async () => {
      // Temporarily break the connection by using an invalid key
      const originalServiceKey = process.env.SUPABASE_SERVICE_KEY;
      process.env.SUPABASE_SERVICE_KEY = "invalid-key";

      const keyId = generateTestKeyId();
      const rateLimitPerHour = 100;

      const result = await enforceRateLimit(keyId, rateLimitPerHour);

      // Should fail closed (deny request)
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBe(3600);

      // Restore original key
      process.env.SUPABASE_SERVICE_KEY = originalServiceKey;
    });
  });
});
