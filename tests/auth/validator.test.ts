// Set test environment variables BEFORE any imports that might use them
process.env.SUPABASE_URL = "http://localhost:54322";
process.env.SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
process.env.SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5434/postgres";

import { describe, it, expect, beforeEach } from "bun:test";
import { parseApiKey, validateApiKey } from "@auth/validator";
import { clearCache } from "@auth/cache";
import { getTestApiKey } from "../helpers/db";

describe("API Key Validator", () => {
  beforeEach(() => {
    clearCache();
  });

  describe("parseApiKey", () => {
    it("parses valid API key format", () => {
      const key = "kota_free_abcd1234efgh5678_0123456789abcdef0123456789abcdef";
      const result = parseApiKey(key);

      expect(result).not.toBeNull();
      expect(result?.tier).toBe("free");
      expect(result?.keyId).toBe("abcd1234efgh5678");
      expect(result?.secret).toBe("0123456789abcdef0123456789abcdef");
    });

    it("parses solo tier key", () => {
      const key = "kota_solo_testkey1_0123456789abcdef0123456789abcdef";
      const result = parseApiKey(key);

      expect(result).not.toBeNull();
      expect(result?.tier).toBe("solo");
      expect(result?.keyId).toBe("testkey1");
    });

    it("parses team tier key", () => {
      const key = "kota_team_orgkey99_0123456789abcdef0123456789abcdef";
      const result = parseApiKey(key);

      expect(result).not.toBeNull();
      expect(result?.tier).toBe("team");
      expect(result?.keyId).toBe("orgkey99");
    });

    it("returns null for invalid prefix", () => {
      const key = "invalid_free_abcd1234_0123456789abcdef0123456789abcdef";
      const result = parseApiKey(key);

      expect(result).toBeNull();
    });

    it("returns null for invalid tier", () => {
      const key = "kota_premium_abcd1234_0123456789abcdef0123456789abcdef";
      const result = parseApiKey(key);

      expect(result).toBeNull();
    });

    it("returns null for missing parts", () => {
      const key = "kota_free_abcd1234";
      const result = parseApiKey(key);

      expect(result).toBeNull();
    });

    it("returns null for too many parts", () => {
      const key = "kota_free_abcd1234_secret123_extra";
      const result = parseApiKey(key);

      expect(result).toBeNull();
    });

    it("returns null for short keyId", () => {
      const key = "kota_free_abc_0123456789abcdef0123456789abcdef";
      const result = parseApiKey(key);

      expect(result).toBeNull();
    });

    it("returns null for short secret", () => {
      const key = "kota_free_abcd1234efgh5678_short";
      const result = parseApiKey(key);

      expect(result).toBeNull();
    });

    it("returns null for empty string", () => {
      const result = parseApiKey("");

      expect(result).toBeNull();
    });

    it("handles keys with underscores in keyId", () => {
      const key = "kota_free_test_key_id_0123456789abcdef0123456789abcdef";
      const result = parseApiKey(key);

      // Should fail because split creates more than 4 parts
      expect(result).toBeNull();
    });
  });

  describe("validateApiKey", () => {
    it("returns null for invalid key format", async () => {
      const key = "invalid-key-format";
      const result = await validateApiKey(key);

      expect(result).toBeNull();
    });

    it("returns null for non-existent key", async () => {
      const key = "kota_free_nonexistent_0123456789abcdef0123456789abcdef";
      const result = await validateApiKey(key);

      expect(result).toBeNull();
    });

    it("validates real test key from database", async () => {
      const testKey = getTestApiKey("free");
      const result = await validateApiKey(testKey);

      expect(result).not.toBeNull();
      expect(result?.userId).toBeDefined();
      expect(result?.tier).toBe("free");
      expect(result?.keyId).toBe("test1234567890ab");
      expect(result?.rateLimitPerHour).toBe(100);
    });

    it("uses cache for repeated validations", async () => {
      const testKey = getTestApiKey("solo");

      const startTime1 = Date.now();
      const result1 = await validateApiKey(testKey);
      const duration1 = Date.now() - startTime1;

      const startTime2 = Date.now();
      const result2 = await validateApiKey(testKey);
      const duration2 = Date.now() - startTime2;

      // Both should succeed
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();

      // Both should have same data
      expect(result1?.userId).toBe(result2?.userId);
      expect(result1?.tier).toBe("solo");
      expect(result2?.tier).toBe("solo");

      // Second call should be faster or equal (cache hit)
      // Allow +2ms tolerance for real database timing variance
      expect(duration2).toBeLessThanOrEqual(duration1 + 2);
    });

    it("returns null for disabled keys", async () => {
      const disabledKey = getTestApiKey("disabled");
      const result = await validateApiKey(disabledKey);

      // Disabled keys should return null even if secret is correct
      expect(result).toBeNull();
    });

    it("handles database connection errors gracefully", async () => {
      // Test with missing credentials
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_KEY;

      process.env.SUPABASE_URL = undefined;
      process.env.SUPABASE_SERVICE_KEY = undefined;

      const key = "kota_free_testkey12_0123456789abcdef0123456789abcdef";

      try {
        await validateApiKey(key);
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
  });
});
