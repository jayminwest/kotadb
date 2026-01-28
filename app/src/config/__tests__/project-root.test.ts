import { describe, test, expect } from "bun:test";
import { findProjectRoot } from "../project-root.js";
import { mkdtempSync, mkdirSync, rmdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("findProjectRoot", () => {
	test("finds .git at project root", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "kotadb-test-"));
		const gitDir = join(tmpDir, ".git");
		mkdirSync(gitDir);
		
		const result = findProjectRoot(tmpDir);
		expect(result).toBe(tmpDir);
		
		// Cleanup
		rmSync(tmpDir, { recursive: true });
	});
	
	test("walks up from nested directory", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "kotadb-test-"));
		const gitDir = join(tmpDir, ".git");
		const nestedDir = join(tmpDir, "app", "src");
		mkdirSync(gitDir);
		mkdirSync(nestedDir, { recursive: true });
		
		const result = findProjectRoot(nestedDir);
		expect(result).toBe(tmpDir);
		
		// Cleanup
		rmSync(tmpDir, { recursive: true });
	});
	
	test("returns null when no .git found", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "kotadb-test-"));
		
		const result = findProjectRoot(tmpDir);
		expect(result).toBeNull();
		
		// Cleanup
		rmSync(tmpDir, { recursive: true });
	});
	
	test("uses process.cwd() as default start directory", () => {
		const result = findProjectRoot();
		// Should find .git in kotadb repo itself
		expect(result).not.toBeNull();
		expect(result).toContain("kotadb");
	});
	
	test("stops at filesystem root", () => {
		const result = findProjectRoot("/nonexistent/deep/path");
		expect(result).toBeNull();
	});
});
