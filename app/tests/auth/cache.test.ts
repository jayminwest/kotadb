import { beforeEach, describe, expect, it } from "bun:test";
import {
	type CacheEntry,
	clearCache,
	getCacheSize,
	getCachedValidation,
	setCachedValidation,
} from "@auth/cache";

describe("Auth Cache", () => {
	beforeEach(() => {
		clearCache();
	});

	describe("getCachedValidation", () => {
		it("returns null for non-existent key", () => {
			const result = getCachedValidation("non-existent");
			expect(result).toBeNull();
		});

		it("returns cached entry for valid key", () => {
			const entry = {
				userId: "user-123",
				tier: "free" as const,
				keyId: "key-abc",
				rateLimitPerHour: 100,
			};

			setCachedValidation("key-abc", entry);
			const result = getCachedValidation("key-abc");

			expect(result).not.toBeNull();
			expect(result?.userId).toBe("user-123");
			expect(result?.tier).toBe("free");
			expect(result?.keyId).toBe("key-abc");
			expect(result?.rateLimitPerHour).toBe(100);
		});

		it("includes orgId when present", () => {
			const entry = {
				userId: "user-123",
				tier: "team" as const,
				orgId: "org-456",
				keyId: "key-abc",
				rateLimitPerHour: 1000,
			};

			setCachedValidation("key-abc", entry);
			const result = getCachedValidation("key-abc");

			expect(result?.orgId).toBe("org-456");
		});

		it("returns null for expired entries", async () => {
			const entry = {
				userId: "user-123",
				tier: "free" as const,
				keyId: "key-abc",
				rateLimitPerHour: 100,
			};

			setCachedValidation("key-abc", entry);

			// Wait for entry to expire (5 seconds + buffer)
			await new Promise((resolve) => setTimeout(resolve, 5200));

			const result = getCachedValidation("key-abc");
			expect(result).toBeNull();
		}, 10000); // Increase test timeout to 10 seconds

		it("removes expired entries from cache", async () => {
			const entry = {
				userId: "user-123",
				tier: "free" as const,
				keyId: "key-abc",
				rateLimitPerHour: 100,
			};

			setCachedValidation("key-abc", entry);
			expect(getCacheSize()).toBe(1);

			// Wait for expiry
			await new Promise((resolve) => setTimeout(resolve, 5200));

			getCachedValidation("key-abc");
			expect(getCacheSize()).toBe(0);
		}, 10000); // Increase test timeout to 10 seconds
	});

	describe("setCachedValidation", () => {
		it("stores entry with expiry timestamp", () => {
			const beforeSet = Date.now();

			const entry = {
				userId: "user-123",
				tier: "free" as const,
				keyId: "key-abc",
				rateLimitPerHour: 100,
			};

			setCachedValidation("key-abc", entry);
			const result = getCachedValidation("key-abc");

			expect(result).not.toBeNull();
			expect(result!.expiresAt).toBeGreaterThan(beforeSet);
			expect(result!.expiresAt).toBeLessThanOrEqual(Date.now() + 5000);
		});

		it("handles multiple keys concurrently", () => {
			for (let i = 0; i < 10; i++) {
				setCachedValidation(`key-${i}`, {
					userId: `user-${i}`,
					tier: "free",
					keyId: `key-${i}`,
					rateLimitPerHour: 100,
				});
			}

			expect(getCacheSize()).toBe(10);

			for (let i = 0; i < 10; i++) {
				const result = getCachedValidation(`key-${i}`);
				expect(result?.userId).toBe(`user-${i}`);
			}
		});

		it("enforces max cache size limit", () => {
			// Cache max is 1000, but we'll test eviction logic with smaller set
			for (let i = 0; i < 1001; i++) {
				setCachedValidation(`key-${i}`, {
					userId: `user-${i}`,
					tier: "free",
					keyId: `key-${i}`,
					rateLimitPerHour: 100,
				});
			}

			// Cache should not exceed 1000
			expect(getCacheSize()).toBeLessThanOrEqual(1000);

			// Most recent entry should exist
			const lastEntry = getCachedValidation("key-1000");
			expect(lastEntry).not.toBeNull();
		});

		it("overwrites existing entry", () => {
			setCachedValidation("key-abc", {
				userId: "user-123",
				tier: "free",
				keyId: "key-abc",
				rateLimitPerHour: 100,
			});

			setCachedValidation("key-abc", {
				userId: "user-456",
				tier: "solo",
				keyId: "key-abc",
				rateLimitPerHour: 500,
			});

			const result = getCachedValidation("key-abc");
			expect(result?.userId).toBe("user-456");
			expect(result?.tier).toBe("solo");
			expect(getCacheSize()).toBe(1);
		});
	});

	describe("clearCache", () => {
		it("removes all entries", () => {
			for (let i = 0; i < 5; i++) {
				setCachedValidation(`key-${i}`, {
					userId: `user-${i}`,
					tier: "free",
					keyId: `key-${i}`,
					rateLimitPerHour: 100,
				});
			}

			expect(getCacheSize()).toBe(5);

			clearCache();

			expect(getCacheSize()).toBe(0);
			expect(getCachedValidation("key-0")).toBeNull();
		});

		it("allows new entries after clear", () => {
			setCachedValidation("key-1", {
				userId: "user-1",
				tier: "free",
				keyId: "key-1",
				rateLimitPerHour: 100,
			});

			clearCache();

			setCachedValidation("key-2", {
				userId: "user-2",
				tier: "free",
				keyId: "key-2",
				rateLimitPerHour: 100,
			});

			expect(getCacheSize()).toBe(1);
			expect(getCachedValidation("key-2")).not.toBeNull();
		});
	});

	describe("getCacheSize", () => {
		it("returns 0 for empty cache", () => {
			expect(getCacheSize()).toBe(0);
		});

		it("returns correct count for populated cache", () => {
			setCachedValidation("key-1", {
				userId: "user-1",
				tier: "free",
				keyId: "key-1",
				rateLimitPerHour: 100,
			});

			expect(getCacheSize()).toBe(1);

			setCachedValidation("key-2", {
				userId: "user-2",
				tier: "free",
				keyId: "key-2",
				rateLimitPerHour: 100,
			});

			expect(getCacheSize()).toBe(2);
		});
	});
});
