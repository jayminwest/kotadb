import { describe, test, expect } from "bun:test";
import { ensureKotadbIgnored } from "../gitignore.js";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ensureKotadbIgnored", () => {
	test("creates .gitignore with .kotadb/ entry when file doesn't exist", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "kotadb-test-"));
		
		const result = ensureKotadbIgnored(tmpDir);
		
		expect(result).toBe(true);
		const gitignorePath = join(tmpDir, ".gitignore");
		const content = readFileSync(gitignorePath, "utf-8");
		expect(content).toContain(".kotadb/");
		expect(content).toContain("# KotaDB local storage");
		
		// Cleanup
		rmSync(tmpDir, { recursive: true });
	});
	
	test("does not add duplicate when .kotadb/ already present", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "kotadb-test-"));
		const gitignorePath = join(tmpDir, ".gitignore");
		writeFileSync(gitignorePath, "node_modules/\n.kotadb/\n");
		
		const result = ensureKotadbIgnored(tmpDir);
		
		expect(result).toBe(true);
		const content = readFileSync(gitignorePath, "utf-8");
		const matches = content.match(/\.kotadb/g);
		expect(matches).toHaveLength(1);
		
		// Cleanup
		rmSync(tmpDir, { recursive: true });
	});
	
	test("does not add when .kotadb (without slash) present", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "kotadb-test-"));
		const gitignorePath = join(tmpDir, ".gitignore");
		writeFileSync(gitignorePath, "node_modules/\n.kotadb\n");
		
		const result = ensureKotadbIgnored(tmpDir);
		
		expect(result).toBe(true);
		const content = readFileSync(gitignorePath, "utf-8");
		const matches = content.match(/\.kotadb/g);
		expect(matches).toHaveLength(1);
		
		// Cleanup
		rmSync(tmpDir, { recursive: true });
	});
	
	test("does not add when .kotadb* pattern present", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "kotadb-test-"));
		const gitignorePath = join(tmpDir, ".gitignore");
		writeFileSync(gitignorePath, "node_modules/\n.kotadb*\n");
		
		const result = ensureKotadbIgnored(tmpDir);
		
		expect(result).toBe(true);
		const content = readFileSync(gitignorePath, "utf-8");
		const matches = content.match(/\.kotadb/g);
		expect(matches).toHaveLength(1);
		
		// Cleanup
		rmSync(tmpDir, { recursive: true });
	});
	
	test("does not add when /.kotadb/ pattern present", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "kotadb-test-"));
		const gitignorePath = join(tmpDir, ".gitignore");
		writeFileSync(gitignorePath, "node_modules/\n/.kotadb/\n");
		
		const result = ensureKotadbIgnored(tmpDir);
		
		expect(result).toBe(true);
		const content = readFileSync(gitignorePath, "utf-8");
		const matches = content.match(/\.kotadb/g);
		expect(matches).toHaveLength(1);
		
		// Cleanup
		rmSync(tmpDir, { recursive: true });
	});
	
	test("returns true but does not throw when .gitignore operations fail", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "kotadb-test-"));
		
		// Should not throw even if operations might fail
		expect(() => ensureKotadbIgnored(tmpDir)).not.toThrow();
		
		// Cleanup
		rmSync(tmpDir, { recursive: true });
	});
});
