/**
 * Unit tests for environment configuration module
 *
 * KotaDB v2.0.0 - Local-Only Mode Tests
 * Tests local mode configuration and behavior.
 * Following antimocking philosophy: uses real process.env manipulation
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
	getEnvironmentConfig,
	isLocalMode,
	clearEnvironmentCache,
	type EnvironmentConfig,
} from "@config/environment";

describe("environment configuration - local-only mode (v2.0.0)", () => {
	// Store original env vars to restore after tests
	const originalEnv = {
		KOTADB_PATH: process.env.KOTADB_PATH,
	};

	beforeEach(() => {
		// Clear cache before each test to ensure clean state
		clearEnvironmentCache();
		
		// Clear relevant environment variables
		delete process.env.KOTADB_PATH;
	});

	afterEach(() => {
		// Clear cache after each test
		clearEnvironmentCache();
		
		// Restore original environment variables
		if (originalEnv.KOTADB_PATH !== undefined) {
			process.env.KOTADB_PATH = originalEnv.KOTADB_PATH;
		} else {
			delete process.env.KOTADB_PATH;
		}
	});

	describe("isLocalMode", () => {
		it("always returns true in v2.0.0", () => {
			expect(isLocalMode()).toBe(true);
		});

		it("returns true regardless of environment variables", () => {
			// Even with random env vars set, should return true
			process.env.SOME_OTHER_VAR = "test";
			expect(isLocalMode()).toBe(true);
			delete process.env.SOME_OTHER_VAR;
		});
	});

	describe("getEnvironmentConfig", () => {
		it("returns local mode config by default", () => {
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("local");
		});

		it("includes localDbPath when KOTADB_PATH is set", () => {
			process.env.KOTADB_PATH = "/custom/path/kota.db";
			
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("local");
			expect(config.localDbPath).toBe("/custom/path/kota.db");
		});

		it("has undefined localDbPath when KOTADB_PATH is not set", () => {
			const config = getEnvironmentConfig();
			
			expect(config.mode).toBe("local");
			expect(config.localDbPath).toBeUndefined();
		});

		it("handles empty KOTADB_PATH", () => {
			process.env.KOTADB_PATH = "";
			
			const config = getEnvironmentConfig();
			
			// Empty string is falsy, so should be undefined
			expect(config.localDbPath).toBeUndefined();
		});

		it("handles special characters in paths", () => {
			process.env.KOTADB_PATH = "/path/with spaces/and-special_chars@123.db";
			
			const config = getEnvironmentConfig();
			
			expect(config.localDbPath).toBe("/path/with spaces/and-special_chars@123.db");
		});

		it("handles home directory paths", () => {
			process.env.KOTADB_PATH = "~/.kotadb/custom.db";
			
			const config = getEnvironmentConfig();
			
			expect(config.localDbPath).toBe("~/.kotadb/custom.db");
		});
	});

	describe("clearEnvironmentCache", () => {
		it("clears cached configuration", () => {
			// First call caches the result
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

		it("allows path changes after cache clear", () => {
			// Start with no path
			let config = getEnvironmentConfig();
			expect(config.localDbPath).toBeUndefined();
			
			// Set a path
			clearEnvironmentCache();
			process.env.KOTADB_PATH = "/new/path.db";
			
			config = getEnvironmentConfig();
			expect(config.localDbPath).toBe("/new/path.db");
		});
	});

	describe("configuration caching", () => {
		it("returns same object instance when called multiple times", () => {
			const config1 = getEnvironmentConfig();
			const config2 = getEnvironmentConfig();
			
			expect(config1).toBe(config2);
		});

		it("caches result even when path changes", () => {
			process.env.KOTADB_PATH = "/original/path.db";
			
			const config1 = getEnvironmentConfig();
			
			// Change path but don't clear cache
			process.env.KOTADB_PATH = "/new/path.db";
			
			const config2 = getEnvironmentConfig();
			
			// Should still have original path due to caching
			expect(config2.localDbPath).toBe("/original/path.db");
			expect(config1).toBe(config2);
		});
	});

	describe("type checking", () => {
		it("returns correct EnvironmentConfig type", () => {
			const config: EnvironmentConfig = getEnvironmentConfig();
			
			expect(config).toHaveProperty("mode");
			expect(config.mode).toBe("local");
		});

		it("mode type is always 'local'", () => {
			const config = getEnvironmentConfig();
			
			// TypeScript ensures this, runtime check confirms
			const mode: "local" = config.mode;
			expect(mode).toBe("local");
		});
	});
});
