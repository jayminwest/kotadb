/**
 * Test Environment Setup
 *
 * This script runs before all tests via Bun's --preload flag.
 * It automatically loads environment variables from .env.test if present.
 *
 * Purpose:
 * - Eliminates need for manual `export $(grep -v '^#' .env.test | xargs)` before tests
 * - Ensures local development matches CI behavior
 * - Provides fallback to default values if .env.test doesn't exist
 *
 * Usage: bun test --preload ./tests/setup.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_TEST_PATH = resolve(import.meta.dir, "../.env.test");

/**
 * Load .env.test file and parse into environment variables
 */
function loadEnvTest(): void {
	if (!existsSync(ENV_TEST_PATH)) {
		if (process.env.DEBUG === '1') {
			console.log(
				"[Test Setup] .env.test not found, using fallback values from test helpers",
			);
		}
		return;
	}

	try {
		const envContent = readFileSync(ENV_TEST_PATH, "utf-8");
		const lines = envContent.split("\n");

		let loadedCount = 0;
		for (const line of lines) {
			// Skip empty lines and comments
			if (!line.trim() || line.trim().startsWith("#")) {
				continue;
			}

			// Parse KEY=VALUE format
			const match = line.match(/^([^=]+)=(.*)$/);
			if (match) {
				const [, key, value] = match;
				if (!key || !value) continue;
				const trimmedKey = key.trim();
				const trimmedValue = value.trim();

				// Only set if not already defined (respects existing environment)
				if (!process.env[trimmedKey]) {
					process.env[trimmedKey] = trimmedValue;
					loadedCount++;
				}
			}
		}

		if (process.env.DEBUG === '1') {
			console.log(`[Test Setup] Loaded ${loadedCount} variables from .env.test`);
			console.log(
				`[Test Setup] SUPABASE_URL: ${process.env.SUPABASE_URL || "not set"}`,
			);
		}
	} catch (error) {
		console.error("[Test Setup] Failed to load .env.test:", error);
		if (process.env.DEBUG === '1') {
			console.log("[Test Setup] Using fallback values from test helpers");
		}
	}
}

// Execute setup
loadEnvTest();
