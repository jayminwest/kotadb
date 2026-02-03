/**
 * Tests for auto-indexing feature (MCP tools auto-index helper)
 *
 * Following antimocking philosophy: uses real file-based SQLite databases
 * with proper KOTADB_PATH environment isolation.
 *
 * Test Coverage:
 * - isPathIndexed: Check if a local path has been indexed
 * - detectRepositoryFromCwd: Auto-detect repository from working directory
 * - ensureRepositoryIndexed: Main auto-index entry point
 *
 * @module tests/mcp/auto-indexing
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
	isPathIndexed,
	detectRepositoryFromCwd,
	ensureRepositoryIndexed,
} from "@mcp/auto-index.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { createTempDir, cleanupTempDir, clearTestData } from "../helpers/db.js";

describe("isPathIndexed", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let originalDbPath: string | undefined;

	beforeAll(() => {
		tempDir = createTempDir("auto-index-path-test-");
		dbPath = join(tempDir, "test.db");

		originalDbPath = process.env.KOTADB_PATH;
		process.env.KOTADB_PATH = dbPath;
		closeGlobalConnections();
	});

	afterAll(() => {
		if (originalDbPath !== undefined) {
			process.env.KOTADB_PATH = originalDbPath;
		} else {
			delete process.env.KOTADB_PATH;
		}
		closeGlobalConnections();
		cleanupTempDir(tempDir);
	});

	beforeEach(() => {
		db = getGlobalDatabase();
	});

	afterEach(() => {
		clearTestData(db);
	});

	test("should return indexed: false when path has never been indexed", () => {
		const result = isPathIndexed("/some/nonexistent/path");
		expect(result.indexed).toBe(false);
		expect(result.repositoryId).toBeUndefined();
	});

	test("should return indexed: false when repository exists but has no last_indexed_at", () => {
		const repoId = randomUUID();
		const testPath = "/test/repo/path";

		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch, git_url) VALUES (?, ?, ?, ?, ?)",
			[repoId, "test-repo", "local/test-repo", "main", testPath],
		);

		const result = isPathIndexed(testPath);
		expect(result.indexed).toBe(false);
		expect(result.repositoryId).toBe(repoId);
	});

	test("should return indexed: false when repository has last_indexed_at but no files", () => {
		const repoId = randomUUID();
		const testPath = "/test/repo/with/timestamp";

		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch, git_url, last_indexed_at) VALUES (?, ?, ?, ?, ?, ?)",
			[repoId, "test-repo", "local/test-repo", "main", testPath, new Date().toISOString()],
		);

		const result = isPathIndexed(testPath);
		expect(result.indexed).toBe(false);
		expect(result.repositoryId).toBe(repoId);
	});

	test("should return indexed: true when repository has last_indexed_at and files exist", () => {
		const repoId = randomUUID();
		const fileId = randomUUID();
		const testPath = "/test/repo/fully/indexed";

		// Create repository with last_indexed_at
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch, git_url, last_indexed_at) VALUES (?, ?, ?, ?, ?, ?)",
			[repoId, "test-repo", "local/test-repo", "main", testPath, new Date().toISOString()],
		);

		// Create indexed file
		db.run(
			"INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[fileId, repoId, "src/index.ts", "export const x = 1;", "typescript", new Date().toISOString(), randomUUID()],
		);

		const result = isPathIndexed(testPath);
		expect(result.indexed).toBe(true);
		expect(result.repositoryId).toBe(repoId);
	});

	test("should normalize paths before checking", () => {
		const repoId = randomUUID();
		const fileId = randomUUID();
		const testPath = "/test/repo/path";

		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch, git_url, last_indexed_at) VALUES (?, ?, ?, ?, ?, ?)",
			[repoId, "test-repo", "local/test-repo", "main", resolve(testPath), new Date().toISOString()],
		);

		db.run(
			"INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[fileId, repoId, "src/index.ts", "export const x = 1;", "typescript", new Date().toISOString(), randomUUID()],
		);

		// Check with unnormalized path (trailing slash, etc.)
		const result = isPathIndexed(testPath);
		expect(result.indexed).toBe(true);
	});
});

describe("detectRepositoryFromCwd", () => {
	let tempDir: string;
	let testProjectDir: string;

	beforeAll(() => {
		tempDir = createTempDir("auto-index-detect-test-");
		testProjectDir = join(tempDir, "test-projects");
		mkdirSync(testProjectDir, { recursive: true });
	});

	afterAll(() => {
		cleanupTempDir(tempDir);
	});

	test("should return null for directory without .git", () => {
		const nonGitDir = join(testProjectDir, "non-git-project");
		mkdirSync(nonGitDir, { recursive: true });

		const result = detectRepositoryFromCwd(nonGitDir);
		expect(result).toBeNull();
	});

	test("should return local/name identifier for git repository", () => {
		const gitRepoDir = join(testProjectDir, "my-git-repo");
		mkdirSync(gitRepoDir, { recursive: true });
		mkdirSync(join(gitRepoDir, ".git"), { recursive: true });

		const result = detectRepositoryFromCwd(gitRepoDir);
		expect(result).toBe("local/my-git-repo");
	});

	test("should use directory basename as repository name", () => {
		const repoName = "complex-repo-name-123";
		const gitRepoDir = join(testProjectDir, repoName);
		mkdirSync(gitRepoDir, { recursive: true });
		mkdirSync(join(gitRepoDir, ".git"), { recursive: true });

		const result = detectRepositoryFromCwd(gitRepoDir);
		expect(result).toBe("local/" + repoName);
	});

	test("should handle deeply nested directories with .git", () => {
		const nestedDir = join(testProjectDir, "nested", "deep", "repo");
		mkdirSync(nestedDir, { recursive: true });
		mkdirSync(join(nestedDir, ".git"), { recursive: true });

		const result = detectRepositoryFromCwd(nestedDir);
		expect(result).toBe("local/repo");
	});
});

describe("ensureRepositoryIndexed", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let testProjectsDir: string;
	let originalDbPath: string | undefined;

	beforeAll(() => {
		tempDir = createTempDir("auto-index-ensure-test-");
		dbPath = join(tempDir, "test.db");

		// Create test projects directory within app directory (workspace requirement)
		testProjectsDir = join(process.cwd(), ".test-auto-index-projects");
		if (existsSync(testProjectsDir)) {
			rmSync(testProjectsDir, { recursive: true, force: true });
		}
		mkdirSync(testProjectsDir, { recursive: true });

		originalDbPath = process.env.KOTADB_PATH;
		process.env.KOTADB_PATH = dbPath;
		closeGlobalConnections();
	});

	afterAll(() => {
		if (originalDbPath !== undefined) {
			process.env.KOTADB_PATH = originalDbPath;
		} else {
			delete process.env.KOTADB_PATH;
		}
		closeGlobalConnections();
		cleanupTempDir(tempDir);

		// Clean up test projects directory
		if (existsSync(testProjectsDir)) {
			rmSync(testProjectsDir, { recursive: true, force: true });
		}
	});

	beforeEach(() => {
		db = getGlobalDatabase();
	});

	afterEach(() => {
		clearTestData(db);
	});

	test("should trigger indexing for unindexed repository", async () => {
		// Create a test project with source files
		const projectDir = join(testProjectsDir, "unindexed-project");
		mkdirSync(projectDir, { recursive: true });
		mkdirSync(join(projectDir, ".git"), { recursive: true });
		mkdirSync(join(projectDir, "src"), { recursive: true });

		writeFileSync(
			join(projectDir, "src", "index.ts"),
			"export function hello(name: string) { return \`Hello, \${name}\`; }",
		);

		const result = await ensureRepositoryIndexed("local/unindexed-project", projectDir);

		expect(result.wasIndexed).toBe(true);
		expect(result.repositoryId).toBeDefined();
		expect(result.message).toContain("Automatically indexed");
		expect(result.stats).toBeDefined();
		expect(result.stats!.filesIndexed).toBeGreaterThanOrEqual(1);
	});

	test("should skip indexing for already indexed repository", async () => {
		// First, create and index a project
		const projectDir = join(testProjectsDir, "already-indexed-project");
		mkdirSync(projectDir, { recursive: true });
		mkdirSync(join(projectDir, ".git"), { recursive: true });
		mkdirSync(join(projectDir, "src"), { recursive: true });

		writeFileSync(
			join(projectDir, "src", "main.ts"),
			"export const VERSION = '1.0.0';",
		);

		// First call - should index
		const firstResult = await ensureRepositoryIndexed("local/already-indexed-project", projectDir);
		expect(firstResult.wasIndexed).toBe(true);

		// Second call - should skip indexing
		const secondResult = await ensureRepositoryIndexed("local/already-indexed-project", projectDir);
		expect(secondResult.wasIndexed).toBe(false);
		expect(secondResult.repositoryId).toBe(firstResult.repositoryId);
		expect(secondResult.message).toContain("already indexed");
	});

	test("should detect repository from local path passed as repository param", async () => {
		const projectDir = join(testProjectsDir, "path-as-repo");
		mkdirSync(projectDir, { recursive: true });
		mkdirSync(join(projectDir, ".git"), { recursive: true });

		writeFileSync(join(projectDir, "test.ts"), "export {}");

		// Pass the path as the repository parameter
		const result = await ensureRepositoryIndexed(projectDir);

		expect(result.wasIndexed).toBe(true);
		expect(result.repositoryId).toBeDefined();
		// Should use directory basename as repo name
		expect(result.message).toContain("path-as-repo");
	});

	test("should return progress message during indexing", async () => {
		const projectDir = join(testProjectsDir, "progress-test");
		mkdirSync(projectDir, { recursive: true });
		mkdirSync(join(projectDir, ".git"), { recursive: true });

		writeFileSync(join(projectDir, "app.ts"), "export const APP = 'test';");
		writeFileSync(join(projectDir, "utils.ts"), "export const util = () => {};");

		const result = await ensureRepositoryIndexed("local/progress-test", projectDir);

		// Message should include file count
		expect(result.message).toMatch(/\d+ files/);
		expect(result.stats).toBeDefined();
		expect(result.stats!.filesIndexed).toBeGreaterThanOrEqual(2);
	});

	test("should throw error when repository cannot be detected and no param provided", async () => {
		// Save original cwd
		const originalCwd = process.cwd();

		// Create a temp directory without .git
		const nonGitDir = join(testProjectsDir, "non-git-dir");
		mkdirSync(nonGitDir, { recursive: true });

		// Change to non-git directory
		process.chdir(nonGitDir);

		try {
			await expect(
				ensureRepositoryIndexed(undefined, undefined),
			).rejects.toThrow("Could not detect repository");
		} finally {
			// Restore cwd
			process.chdir(originalCwd);
		}
	});

	test("should index repository with multiple file types", async () => {
		const projectDir = join(testProjectsDir, "multi-type-project");
		mkdirSync(projectDir, { recursive: true });
		mkdirSync(join(projectDir, ".git"), { recursive: true });
		mkdirSync(join(projectDir, "src"), { recursive: true });

		writeFileSync(join(projectDir, "src", "index.ts"), "export function main() {}");
		writeFileSync(join(projectDir, "src", "utils.js"), "module.exports = { helper: () => {} };");
		writeFileSync(join(projectDir, "README.md"), "# Project");

		const result = await ensureRepositoryIndexed("local/multi-type-project", projectDir);

		expect(result.wasIndexed).toBe(true);
		expect(result.stats!.filesIndexed).toBeGreaterThanOrEqual(2);
	});

	test("should handle empty directory gracefully", async () => {
		const emptyDir = join(testProjectsDir, "empty-auto-index");
		mkdirSync(emptyDir, { recursive: true });
		mkdirSync(join(emptyDir, ".git"), { recursive: true });

		const result = await ensureRepositoryIndexed("local/empty-auto-index", emptyDir);

		expect(result.wasIndexed).toBe(true);
		expect(result.stats!.filesIndexed).toBe(0);
	});
});
