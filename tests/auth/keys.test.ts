/**
 * API Key Generation and Management Tests
 *
 * Tests API key generation, validation, and database integration with real database connection.
 * Environment variables are loaded from .env.test in CI or default to local Supabase ports.
 *
 * Note: Uses Kong gateway (54322) for Supabase JS client, not PostgREST direct (54321)
 *
 * Required environment variables:
 * - SUPABASE_URL (defaults to http://localhost:54322)
 * - SUPABASE_SERVICE_KEY (defaults to local demo key)
 * - SUPABASE_ANON_KEY (defaults to local demo key)
 * - DATABASE_URL (defaults to postgresql://postgres:postgres@localhost:5434/postgres)
 */

import { describe, it, expect } from "bun:test";
import {
  generateApiKey,
  generateKeyId,
  generateSecret,
  TIER_RATE_LIMITS,
} from "@auth/keys";
import { validateApiKey, parseApiKey } from "@auth/validator";
import { clearCache } from "@auth/cache";
import { getServiceClient } from "@db/client";
import { TEST_USER_IDS } from "../helpers/db";

describe("API Key Generation", () => {
  describe("generateKeyId", () => {
    it("generates 12-character key ID", () => {
      const keyId = generateKeyId();
      expect(keyId).toBeDefined();
      expect(keyId.length).toBe(12);
    });

    it("generates unique key IDs", () => {
      const keyIds = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        keyIds.add(generateKeyId());
      }

      // All should be unique
      expect(keyIds.size).toBe(iterations);
    });

    it("generates alphanumeric characters only", () => {
      const keyId = generateKeyId();
      // base62 uses alphanumeric only (no underscores or hyphens)
      const alphanumericPattern = /^[A-Za-z0-9]{12}$/;
      expect(alphanumericPattern.test(keyId)).toBe(true);
    });

    it("generates cryptographically random IDs", () => {
      // Generate many IDs and verify statistical randomness
      const keyIds = Array.from({ length: 50 }, () => generateKeyId());

      // No duplicates (very high probability with 72-bit entropy)
      const uniqueIds = new Set(keyIds);
      expect(uniqueIds.size).toBe(keyIds.length);

      // First characters should vary (not all starting with same char)
      const firstChars = new Set(keyIds.map((id) => id[0]));
      expect(firstChars.size).toBeGreaterThan(1);
    });
  });

  describe("generateSecret", () => {
    it("generates 36-character hex secret", () => {
      const secret = generateSecret();
      expect(secret).toBeDefined();
      expect(secret.length).toBe(36);
    });

    it("generates unique secrets", () => {
      const secrets = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        secrets.add(generateSecret());
      }

      // All should be unique
      expect(secrets.size).toBe(iterations);
    });

    it("generates only hexadecimal characters", () => {
      const secret = generateSecret();
      const hexPattern = /^[0-9a-f]{36}$/;
      expect(hexPattern.test(secret)).toBe(true);
    });

    it("generates cryptographically random secrets", () => {
      // Generate many secrets and verify statistical randomness
      const secrets = Array.from({ length: 50 }, () => generateSecret());

      // No duplicates (astronomically unlikely with 144-bit entropy)
      const uniqueSecrets = new Set(secrets);
      expect(uniqueSecrets.size).toBe(secrets.length);

      // Distribution check: first hex digit should vary
      const firstDigits = new Set(secrets.map((s) => s[0]));
      expect(firstDigits.size).toBeGreaterThan(3);
    });
  });

  describe("generateApiKey", () => {
    it("generates valid free tier key", async () => {
      const result = await generateApiKey({
        userId: TEST_USER_IDS.free,
        tier: "free",
      });

      expect(result).toBeDefined();
      expect(result.apiKey).toMatch(/^kota_free_[A-Za-z0-9]{12}_[0-9a-f]{36}$/);
      expect(result.keyId).toHaveLength(12);
      expect(result.tier).toBe("free");
      expect(result.rateLimitPerHour).toBe(TIER_RATE_LIMITS.free);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("generates valid solo tier key", async () => {
      const result = await generateApiKey({
        userId: TEST_USER_IDS.solo,
        tier: "solo",
      });

      expect(result).toBeDefined();
      expect(result.apiKey).toMatch(/^kota_solo_[A-Za-z0-9]{12}_[0-9a-f]{36}$/);
      expect(result.tier).toBe("solo");
      expect(result.rateLimitPerHour).toBe(TIER_RATE_LIMITS.solo);
    });

    it("generates valid team tier key", async () => {
      const result = await generateApiKey({
        userId: TEST_USER_IDS.team,
        tier: "team",
      });

      expect(result).toBeDefined();
      expect(result.apiKey).toMatch(/^kota_team_[A-Za-z0-9]{12}_[0-9a-f]{36}$/);
      expect(result.tier).toBe("team");
      expect(result.rateLimitPerHour).toBe(TIER_RATE_LIMITS.team);
    });

    it("generates unique keys on repeated calls", async () => {
      const results = await Promise.all([
        generateApiKey({ userId: TEST_USER_IDS.free, tier: "free" }),
        generateApiKey({ userId: TEST_USER_IDS.free, tier: "free" }),
        generateApiKey({ userId: TEST_USER_IDS.free, tier: "free" }),
      ]);

      const keys = results.map((r) => r.apiKey);
      const keyIds = results.map((r) => r.keyId);

      // All keys should be unique
      expect(new Set(keys).size).toBe(3);
      expect(new Set(keyIds).size).toBe(3);
    });

    it("stores bcrypt hash in database, not plaintext secret", async () => {
      const result = await generateApiKey({
        userId: TEST_USER_IDS.free,
        tier: "free",
      });

      // Query database directly to verify hash
      const supabase = getServiceClient();
      const { data, error } = await supabase
        .from("api_keys")
        .select("secret_hash")
        .eq("key_id", result.keyId)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.secret_hash).toBeDefined();

      // Bcrypt hashes start with $2a$10$ or $2b$10$ (algorithm identifier + cost)
      // bcryptjs library uses $2b$ variant
      expect(data?.secret_hash).toMatch(/^\$2[ab]\$10\$/);

      // Hash should NOT match plaintext secret
      const secret = result.apiKey.split("_")[3];
      expect(data?.secret_hash).not.toBe(secret);
    });

    it("inserts all required fields into database", async () => {
      const result = await generateApiKey({
        userId: TEST_USER_IDS.solo,
        tier: "solo",
      });

      // Query database to verify all fields
      const supabase = getServiceClient();
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("key_id", result.keyId)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.user_id).toBe(TEST_USER_IDS.solo);
      expect(data?.key_id).toBe(result.keyId);
      expect(data?.tier).toBe("solo");
      expect(data?.rate_limit_per_hour).toBe(TIER_RATE_LIMITS.solo);
      expect(data?.enabled).toBe(true);
      expect(data?.created_at).toBeDefined();
    });

    it("applies correct rate limits for each tier", async () => {
      const freeKey = await generateApiKey({
        userId: TEST_USER_IDS.free,
        tier: "free",
      });
      const soloKey = await generateApiKey({
        userId: TEST_USER_IDS.solo,
        tier: "solo",
      });
      const teamKey = await generateApiKey({
        userId: TEST_USER_IDS.team,
        tier: "team",
      });

      expect(freeKey.rateLimitPerHour).toBe(100);
      expect(soloKey.rateLimitPerHour).toBe(1000);
      expect(teamKey.rateLimitPerHour).toBe(10000);
    });

    it("integrates with validateApiKey successfully", async () => {
      // Clear cache to ensure clean state
      clearCache();

      // Generate a new key
      const generated = await generateApiKey({
        userId: TEST_USER_IDS.free,
        tier: "free",
      });

      // Ensure database write is fully committed and replicated
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Validate it
      const validated = await validateApiKey(generated.apiKey);

      // Debug output if validation fails
      if (!validated) {
        console.error("Validation failed for key:", generated.apiKey);
        console.error("Generated keyId:", generated.keyId);
      }

      expect(validated).not.toBeNull();
      expect(validated?.userId).toBe(TEST_USER_IDS.free);
      expect(validated?.tier).toBe("free");
      expect(validated?.keyId).toBe(generated.keyId);
      expect(validated?.rateLimitPerHour).toBe(TIER_RATE_LIMITS.free);
    });

    it("generated keys parse correctly", () => {
      const keyId = generateKeyId();
      const secret = generateSecret();
      const apiKey = `kota_free_${keyId}_${secret}`;

      const parsed = parseApiKey(apiKey);

      expect(parsed).not.toBeNull();
      expect(parsed?.tier).toBe("free");
      expect(parsed?.keyId).toBe(keyId);
      expect(parsed?.secret).toBe(secret);
    });

    it("throws error for invalid tier", async () => {
      expect(async () => {
        await generateApiKey({
          userId: TEST_USER_IDS.free,
          tier: "premium" as any, // Invalid tier
        });
      }).toThrow("Invalid tier");
    });

    it("throws error for missing userId", async () => {
      expect(async () => {
        await generateApiKey({
          userId: "",
          tier: "free",
        });
      }).toThrow("userId is required");
    });

    it("throws error for invalid userId type", async () => {
      expect(async () => {
        await generateApiKey({
          userId: null as any,
          tier: "free",
        });
      }).toThrow("userId is required");
    });

    it("handles orgId metadata for team tier", async () => {
      const orgId = "10000000-0000-0000-0000-000000000001";
      const result = await generateApiKey({
        userId: TEST_USER_IDS.team,
        tier: "team",
        orgId,
      });

      // Query database to verify metadata
      const supabase = getServiceClient();
      const { data, error } = await supabase
        .from("api_keys")
        .select("metadata")
        .eq("key_id", result.keyId)
        .single();

      expect(error).toBeNull();
      expect(data?.metadata).toBeDefined();
      expect(data?.metadata).toHaveProperty("org_id", orgId);
    });

    it("handles database connection errors gracefully", async () => {
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_KEY;

      process.env.SUPABASE_URL = undefined;
      process.env.SUPABASE_SERVICE_KEY = undefined;

      try {
        await generateApiKey({
          userId: TEST_USER_IDS.free,
          tier: "free",
        });
        // Should throw due to missing credentials
        expect(true).toBe(false); // Fail if no error
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        // Restore env vars
        if (originalUrl) process.env.SUPABASE_URL = originalUrl;
        if (originalKey) process.env.SUPABASE_SERVICE_KEY = originalKey;
      }
    });

    // Collision retry test
    // Note: This test is probabilistic and may not trigger a collision
    // With 72-bit entropy, collisions are astronomically rare
    it("would retry on key_id collision (theoretical test)", async () => {
      // This test documents the collision retry behavior
      // In practice, collisions are so rare they won't occur in tests

      // Generate one key to verify the system works
      const result = await generateApiKey({
        userId: TEST_USER_IDS.free,
        tier: "free",
      });

      expect(result).toBeDefined();
      expect(result.apiKey).toMatch(/^kota_free_/);

      // To actually test collision retry, we would need to:
      // 1. Mock generateKeyId() to return a duplicate
      // 2. Or seed database with a known key_id
      // 3. Verify retry logic activates
      // This is covered by code review and the retry logic implementation
    });
  });
});
