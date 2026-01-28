import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDefaultDbPath, resolveDbPath } from "../sqlite-client.js";

describe("Database path resolution", () => {
	let originalKotadbPath: string | undefined;
	
	beforeEach(() => {
		// Save original environment variable
		originalKotadbPath = process.env.KOTADB_PATH;
		// Clear environment variable
		delete process.env.KOTADB_PATH;
	});
	
	afterEach(() => {
		// Restore original environment variable
		if (originalKotadbPath !== undefined) {
			process.env.KOTADB_PATH = originalKotadbPath;
		} else {
			delete process.env.KOTADB_PATH;
		}
	});
	
	test("resolveDbPath prioritizes explicit config", () => {
		process.env.KOTADB_PATH = "/env/path/kota.db";
		const result = resolveDbPath("/explicit/path/kota.db");
		expect(result).toBe("/explicit/path/kota.db");
	});
	
	test("resolveDbPath falls back to env var", () => {
		process.env.KOTADB_PATH = "/env/path/kota.db";
		const result = resolveDbPath();
		expect(result).toBe("/env/path/kota.db");
	});
	
	test("resolveDbPath falls back to project-local default", () => {
		const result = resolveDbPath();
		// Should find project root and return .kotadb/kota.db
		expect(result).toContain(".kotadb");
		expect(result).toContain("kota.db");
		// Should end with project-local path, not be in HOME/.kotadb/
		expect(result.endsWith("/.kotadb/kota.db")).toBe(true);
		// Should NOT be the old global path
		if (process.env.HOME) {
			const oldGlobalPath = `${process.env.HOME}/.kotadb/kota.db`;
			expect(result).not.toBe(oldGlobalPath);
		}
	});
	
	test("getDefaultDbPath returns project-local path when .git found", () => {
		// Should find .git in kotadb repo
		const result = getDefaultDbPath();
		expect(result).toContain(".kotadb");
		expect(result).toContain("kota.db");
		expect(result).toContain("kotadb"); // Repo name
		expect(result.endsWith("/.kotadb/kota.db")).toBe(true);
	});
	
	test("getDefaultDbPath throws when run from non-project directory", () => {
		// Save original cwd
		const originalCwd = process.cwd();
		
		try {
			// Change to root directory (no .git present)
			process.chdir("/");
			
			expect(() => getDefaultDbPath()).toThrow("Unable to determine project root");
		} finally {
			// Restore cwd
			process.chdir(originalCwd);
		}
	});
});
