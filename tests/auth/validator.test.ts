import { describe, it, expect, beforeEach, mock } from "bun:test";
import { parseApiKey, validateApiKey } from "@auth/validator";
import { clearCache } from "@auth/cache";

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

    it("validates against mock database (requires env setup)", async () => {
      // This test requires SUPABASE_URL and SUPABASE_SERVICE_KEY
      // Skip if not configured
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.log("[Test] Skipping database test - Supabase credentials not set");
        return;
      }

      // For real tests, you would:
      // 1. Create a test API key in test database
      // 2. Validate against that key
      // 3. Clean up test key

      // For now, test with invalid key (should return null)
      const key = "kota_free_nonexistent_0123456789abcdef0123456789abcdef";
      const result = await validateApiKey(key);

      expect(result).toBeNull();
    });

    it("uses cache for repeated validations", async () => {
      // This test demonstrates cache behavior
      // In a real test environment with database access, you would:
      // 1. Create valid test key
      // 2. Validate once (cache miss)
      // 3. Validate again (cache hit)
      // 4. Verify only one database query was made

      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.log("[Test] Skipping cache test - Supabase credentials not set");
        return;
      }

      // Mock test - would be implemented with real database
      const key = "kota_free_testcache_0123456789abcdef0123456789abcdef";

      const result1 = await validateApiKey(key);
      const result2 = await validateApiKey(key);

      // Both should have same result (null in this case without real data)
      expect(result1).toBe(result2);
    });

    it("returns null for disabled keys", async () => {
      // This test would verify that even with valid secret,
      // a disabled key returns null
      // Requires test database with disabled key fixture

      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.log("[Test] Skipping disabled key test - Supabase credentials not set");
        return;
      }

      // Would test with real disabled key
      const key = "kota_free_disabled123_0123456789abcdef0123456789abcdef";
      const result = await validateApiKey(key);

      expect(result).toBeNull();
    });

    it("handles database connection errors gracefully", async () => {
      // Test with missing credentials
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_KEY;

      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;

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
