/**
 * Unit tests for environment configuration module
 *
 * Tests local-first vs cloud-sync mode detection and configuration
 * Following antimocking philosophy: uses real process.env manipulation
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
	getEnvironmentConfig,
	isLocalMode,
	clearEnvironmentCache,
	type EnvironmentConfig,
} from "@config/environment";

describe("environment configuration", () => {
	// Store original env vars to restore after tests
	const originalEnv = {
		KOTA_LOCAL_MODE: process.env.KOTA_LOCAL_MODE,
		KOTADB_PATH: process.env.KOTADB_PATH,
		SUPABASE_URL: process.env.SUPABASE_URL,
		SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
		SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
	};

	beforeEach(() => {
		// Clear cache before each test to ensure clean state
		clearEnvironmentCache();
		
		// Clear all environment variables
		delete process.env.KOTA_LOCAL_MODE;
		delete process.env.KOTADB_PATH;
		delete process.env.SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_KEY;
		delete process.env.SUPABASE_ANON_KEY;
	});

	afterEach(() => {
		// Clear cache after each test
		clearEnvironmentCache();
		
		// Restore original environment variables
		if (originalEnv.KOTA_LOCAL_MODE !== undefined) {
			process.env.KOTA_LOCAL_MODE = originalEnv.KOTA_LOCAL_MODE;
		} else {
			delete process.env.KOTA_LOCAL_MODE;
		}
		
		if (originalEnv.KOTADB_PATH !== undefined) {
			process.env.KOTADB_PATH = originalEnv.KOTADB_PATH;
		} else {
			delete process.env.KOTADB_PATH;
		}
		
		if (originalEnv.SUPABASE_URL !== undefined) {
			process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
		} else {
			delete process.env.SUPABASE_URL;
		}
		
		if (originalEnv.SUPABASE_SERVICE_KEY !== undefined) {
			process.env.SUPABASE_SERVICE_KEY = originalEnv.SUPABASE_SERVICE_KEY;
		} else {
			delete process.env.SUPABASE_SERVICE_KEY;
		}
		
		if (originalEnv.SUPABASE_ANON_KEY !== undefined) {
			process.env.SUPABASE_ANON_KEY = originalEnv.SUPABASE_ANON_KEY;
		} else {
			delete process.env.SUPABASE_ANON_KEY;
		}
	});

	describe("isLocalMode", () => {
		it("returns true when KOTA_LOCAL_MODE=true", () => {
			process.env.KOTA_LOCAL_MODE = "true";
			expect(isLocalMode()).toBe(true);
		});

		it("returns false when KOTA_LOCAL_MODE is not set and Supabase credentials exist", () => {
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			expect(isLocalMode()).toBe(false);
		});

		it("returns false when KOTA_LOCAL_MODE=false", () => {
			process.env.KOTA_LOCAL_MODE = "false";
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			expect(isLocalMode()).toBe(false);
		});

		it("returns false when KOTA_LOCAL_MODE is empty string", () => {
			process.env.KOTA_LOCAL_MODE = "";
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			expect(isLocalMode()).toBe(false);
		});
	});

	describe("getEnvironmentConfig - local mode", () => {
		it("returns local config when KOTA_LOCAL_MODE=true", () => {
			process.env.KOTA_LOCAL_MODE = "true";
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("local");
			expect(config.supabaseUrl).toBeUndefined();
			expect(config.supabaseServiceKey).toBeUndefined();
			expect(config.supabaseAnonKey).toBeUndefined();
		});

		it("includes localDbPath when KOTADB_PATH is set", () => {
			process.env.KOTA_LOCAL_MODE = "true";
			process.env.KOTADB_PATH = "/custom/path/kota.db";
			
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("local");
			expect(config.localDbPath).toBe("/custom/path/kota.db");
		});

		it("has undefined localDbPath when KOTADB_PATH is not set", () => {
			process.env.KOTA_LOCAL_MODE = "true";
			
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("local");
			expect(config.localDbPath).toBeUndefined();
		});

		it("ignores Supabase credentials when in local mode", () => {
			process.env.KOTA_LOCAL_MODE = "true";
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			process.env.SUPABASE_ANON_KEY = "test-anon-key";
			
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("local");
			expect(config.supabaseUrl).toBeUndefined();
			expect(config.supabaseServiceKey).toBeUndefined();
			expect(config.supabaseAnonKey).toBeUndefined();
		});
	});

	describe("getEnvironmentConfig - cloud mode", () => {
		it("returns cloud config with Supabase credentials", () => {
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("cloud");
			expect(config.supabaseUrl).toBe("http://localhost:54322");
			expect(config.supabaseServiceKey).toBe("test-service-key");
			expect(config.localDbPath).toBeUndefined();
		});

		it("includes supabaseAnonKey when provided", () => {
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			process.env.SUPABASE_ANON_KEY = "test-anon-key";
			
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("cloud");
			expect(config.supabaseAnonKey).toBe("test-anon-key");
		});

		it("works with production Supabase URLs", () => {
			process.env.SUPABASE_URL = "https://example.supabase.co";
			process.env.SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
			
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("cloud");
			expect(config.supabaseUrl).toBe("https://example.supabase.co");
		});

		it("throws error when SUPABASE_URL is missing", () => {
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			
			expect(() => getEnvironmentConfig()).toThrow(
				"Cloud mode requires SUPABASE_URL and SUPABASE_SERVICE_KEY"
			);
		});

		it("throws error when SUPABASE_SERVICE_KEY is missing", () => {
			process.env.SUPABASE_URL = "http://localhost:54322";
			
			expect(() => getEnvironmentConfig()).toThrow(
				"Cloud mode requires SUPABASE_URL and SUPABASE_SERVICE_KEY"
			);
		});

		it("throws error when both Supabase credentials are missing", () => {
			expect(() => getEnvironmentConfig()).toThrow(
				"Cloud mode requires SUPABASE_URL and SUPABASE_SERVICE_KEY"
			);
		});

		it("error message suggests setting KOTA_LOCAL_MODE", () => {
			expect(() => getEnvironmentConfig()).toThrow(
				"Set KOTA_LOCAL_MODE=true for local operation"
			);
		});
	});

	describe("clearEnvironmentCache", () => {
		it("clears cached configuration", () => {
			// First call caches the result
			process.env.KOTA_LOCAL_MODE = "true";
			process.env.KOTADB_PATH = "/original/path.db";
			
			const config1 = getEnvironmentConfig();
			expect(config1.localDbPath).toBe("/original/path.db");
			
			// Change env var
			process.env.KOTADB_PATH = "/new/path.db";
			
			// Without clearing cache, should return cached value
			const config2 = getEnvironmentConfig();
			expect(config2.localDbPath).toBe("/original/path.db");
			
			// After clearing cache, should return new value
			clearEnvironmentCache();
			const config3 = getEnvironmentConfig();
			expect(config3.localDbPath).toBe("/new/path.db");
		});

		it("allows mode switching after cache clear", () => {
			// Start in local mode
			process.env.KOTA_LOCAL_MODE = "true";
			let config = getEnvironmentConfig();
			expect(config.mode).toBe("local");
			
			// Switch to cloud mode
			clearEnvironmentCache();
			delete process.env.KOTA_LOCAL_MODE;
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			
			config = getEnvironmentConfig();
			expect(config.mode).toBe("cloud");
		});
	});

	describe("configuration caching", () => {
		it("returns same object instance when called multiple times", () => {
			process.env.KOTA_LOCAL_MODE = "true";
			
			const config1 = getEnvironmentConfig();
			const config2 = getEnvironmentConfig();
			
			expect(config1).toBe(config2);
		});

		it("returns same object through isLocalMode and getEnvironmentConfig", () => {
			process.env.KOTA_LOCAL_MODE = "true";
			
			// isLocalMode calls getEnvironmentConfig internally
			isLocalMode();
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("local");
		});

		it("caches result even with different credentials", () => {
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "original-key";
			
			const config1 = getEnvironmentConfig();
			
			// Change credentials but don't clear cache
			process.env.SUPABASE_SERVICE_KEY = "new-key";
			
			const config2 = getEnvironmentConfig();
			
			// Should still have original key due to caching
			expect(config2.supabaseServiceKey).toBe("original-key");
			expect(config1).toBe(config2);
		});
	});

	describe("edge cases", () => {
		it("handles KOTA_LOCAL_MODE with whitespace", () => {
			process.env.KOTA_LOCAL_MODE = " true ";
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			
			// String comparison is exact, so " true " !== "true"
			const config = getEnvironmentConfig();
			expect(config.mode).toBe("cloud");
		});

		it("handles empty KOTADB_PATH", () => {
			process.env.KOTA_LOCAL_MODE = "true";
			process.env.KOTADB_PATH = "";
			
			const config = getEnvironmentConfig();
			
			// Empty string is falsy, so should be undefined
			expect(config.localDbPath).toBeUndefined();
		});

		it("handles empty SUPABASE_URL", () => {
			process.env.SUPABASE_URL = "";
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			
			expect(() => getEnvironmentConfig()).toThrow(
				"Cloud mode requires SUPABASE_URL and SUPABASE_SERVICE_KEY"
			);
		});

		it("handles empty SUPABASE_SERVICE_KEY", () => {
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "";
			
			expect(() => getEnvironmentConfig()).toThrow(
				"Cloud mode requires SUPABASE_URL and SUPABASE_SERVICE_KEY"
			);
		});

		it("handles special characters in paths", () => {
			process.env.KOTA_LOCAL_MODE = "true";
			process.env.KOTADB_PATH = "/path/with spaces/and-special_chars@123.db";
			
			const config = getEnvironmentConfig();
			
			expect(config.localDbPath).toBe("/path/with spaces/and-special_chars@123.db");
		});
	});

	describe("type checking", () => {
		it("returns correct EnvironmentConfig type for local mode", () => {
			process.env.KOTA_LOCAL_MODE = "true";
			
			const config: EnvironmentConfig = getEnvironmentConfig();
			
			expect(config).toHaveProperty("mode");
			expect(config.mode).toBe("local");
		});

		it("returns correct EnvironmentConfig type for cloud mode", () => {
			process.env.SUPABASE_URL = "http://localhost:54322";
			process.env.SUPABASE_SERVICE_KEY = "test-service-key";
			
			const config: EnvironmentConfig = getEnvironmentConfig();
			
			expect(config).toHaveProperty("mode");
			expect(config).toHaveProperty("supabaseUrl");
			expect(config).toHaveProperty("supabaseServiceKey");
			expect(config.mode).toBe("cloud");
		});
	});
});
