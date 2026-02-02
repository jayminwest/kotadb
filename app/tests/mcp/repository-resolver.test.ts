/**
 * Unit tests for repository-resolver module
 *
 * Following antimocking philosophy: uses real file-based SQLite databases
 * with proper KOTADB_PATH environment isolation.
 *
 * Test Coverage:
 * - isUUID: UUID format validation
 * - resolveRepositoryIdentifier: UUID/full_name resolution
 * - resolveRepositoryIdentifierWithError: Error handling variant
 *
 * @module tests/mcp/repository-resolver
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
	isUUID,
	resolveRepositoryIdentifier,
	resolveRepositoryIdentifierWithError,
	resolveRepositoryParam,
} from "@mcp/repository-resolver.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { createTempDir, cleanupTempDir, clearTestData } from "../helpers/db.js";

describe("isUUID", () => {
	test("should return true for valid lowercase UUID", () => {
		expect(isUUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
	});

	test("should return true for valid uppercase UUID", () => {
		expect(isUUID("A1B2C3D4-E5F6-7890-ABCD-EF1234567890")).toBe(true);
	});

	test("should return true for valid mixed case UUID", () => {
		expect(isUUID("A1b2C3d4-E5f6-7890-AbCd-Ef1234567890")).toBe(true);
	});

	test("should return true for randomUUID output", () => {
		const uuid = randomUUID();
		expect(isUUID(uuid)).toBe(true);
	});

	test("should return false for full_name format (owner/repo)", () => {
		expect(isUUID("owner/repo")).toBe(false);
	});

	test("should return false for local full_name format", () => {
		expect(isUUID("local/kotadb")).toBe(false);
	});

	test("should return false for empty string", () => {
		expect(isUUID("")).toBe(false);
	});

	test("should return false for random string", () => {
		expect(isUUID("not-a-uuid")).toBe(false);
	});

	test("should return false for UUID without dashes", () => {
		expect(isUUID("a1b2c3d4e5f67890abcdef1234567890")).toBe(false);
	});

	test("should return false for partial UUID", () => {
		expect(isUUID("a1b2c3d4-e5f6-7890")).toBe(false);
	});

	test("should return false for UUID with extra characters", () => {
		expect(isUUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890-extra")).toBe(false);
	});
});

describe("resolveRepositoryIdentifier", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let originalDbPath: string | undefined;
	const testRepoId = "11111111-2222-3333-4444-555555555555";
	const testFullName = "test-owner/test-repo";

	beforeAll(() => {
		// Create temp directory and set KOTADB_PATH for test isolation
		tempDir = createTempDir("mcp-repo-resolver-test-");
		dbPath = join(tempDir, "test.db");

		originalDbPath = process.env.KOTADB_PATH;
		process.env.KOTADB_PATH = dbPath;
		closeGlobalConnections();
	});

	afterAll(() => {
		// Restore original KOTADB_PATH
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

	test("should return null when no repositories exist and param is undefined", () => {
		const result = resolveRepositoryIdentifier(undefined);
		expect(result).toBeNull();
	});

	test("should return first repository ID when param is undefined", () => {
		// Create a test repository
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[testRepoId, "test-repo", testFullName, "main"],
		);

		const result = resolveRepositoryIdentifier(undefined);
		expect(result).toBe(testRepoId);
	});

	test("should return most recent repository when multiple exist and param is undefined", () => {
		const olderRepoId = randomUUID();
		const newerRepoId = randomUUID();

		// Insert older repository first
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch, created_at) VALUES (?, ?, ?, ?, ?)",
			[olderRepoId, "older-repo", "owner/older-repo", "main", "2024-01-01T00:00:00Z"],
		);

		// Insert newer repository
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch, created_at) VALUES (?, ?, ?, ?, ?)",
			[newerRepoId, "newer-repo", "owner/newer-repo", "main", "2025-01-01T00:00:00Z"],
		);

		const result = resolveRepositoryIdentifier(undefined);
		expect(result).toBe(newerRepoId);
	});

	test("should return UUID as-is when valid UUID provided (passthrough)", () => {
		const inputUuid = randomUUID();
		const result = resolveRepositoryIdentifier(inputUuid);
		expect(result).toBe(inputUuid);
	});

	test("should return UUID as-is even if repository does not exist in database", () => {
		// UUID passthrough doesn't validate existence - this is by design
		// for backward compatibility with existing workflows
		const nonExistentUuid = "99999999-9999-9999-9999-999999999999";
		const result = resolveRepositoryIdentifier(nonExistentUuid);
		expect(result).toBe(nonExistentUuid);
	});

	test("should resolve full_name to UUID when repository exists", () => {
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[testRepoId, "test-repo", testFullName, "main"],
		);

		const result = resolveRepositoryIdentifier(testFullName);
		expect(result).toBe(testRepoId);
	});

	test("should resolve local full_name format", () => {
		const localRepoId = randomUUID();
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[localRepoId, "kotadb", "local/kotadb", "main"],
		);

		const result = resolveRepositoryIdentifier("local/kotadb");
		expect(result).toBe(localRepoId);
	});

	test("should return null for non-existent full_name", () => {
		const result = resolveRepositoryIdentifier("nonexistent/repo");
		expect(result).toBeNull();
	});

	test("should be case-sensitive for full_name matching", () => {
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[testRepoId, "test-repo", testFullName, "main"],
		);

		// Different case should not match
		const result = resolveRepositoryIdentifier("TEST-OWNER/TEST-REPO");
		expect(result).toBeNull();
	});

	test("should handle empty string as no repository provided", () => {
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[testRepoId, "test-repo", testFullName, "main"],
		);

		// Empty string is falsy, should return first repository
		const result = resolveRepositoryIdentifier("");
		expect(result).toBe(testRepoId);
	});
});

describe("resolveRepositoryParam (alias)", () => {
	test("should be the same function as resolveRepositoryIdentifier", () => {
		expect(resolveRepositoryIdentifier).toBe(resolveRepositoryParam);
	});
});

describe("resolveRepositoryIdentifierWithError", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let originalDbPath: string | undefined;
	const testRepoId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
	const testFullName = "error-test-owner/error-test-repo";

	beforeAll(() => {
		tempDir = createTempDir("mcp-repo-resolver-error-test-");
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

	test("should return error when no repositories exist and param is undefined", () => {
		const result = resolveRepositoryIdentifierWithError(undefined);
		expect("error" in result).toBe(true);
		if ("error" in result) {
			expect(result.error).toContain("No repositories found");
			expect(result.error).toContain("index_repository");
		}
	});

	test("should return id when repository exists and param is undefined", () => {
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[testRepoId, "test-repo", testFullName, "main"],
		);

		const result = resolveRepositoryIdentifierWithError(undefined);
		expect("id" in result).toBe(true);
		if ("id" in result) {
			expect(result.id).toBe(testRepoId);
		}
	});

	test("should return id for valid UUID (passthrough without validation)", () => {
		// UUID passthrough doesn't validate existence - by design
		const inputUuid = randomUUID();
		const result = resolveRepositoryIdentifierWithError(inputUuid);
		expect("id" in result).toBe(true);
		if ("id" in result) {
			expect(result.id).toBe(inputUuid);
		}
	});

	test("should return id for non-existent UUID (passthrough)", () => {
		// UUID passthrough doesn't validate existence - this is by design
		const nonExistentUuid = "99999999-9999-9999-9999-999999999999";
		const result = resolveRepositoryIdentifierWithError(nonExistentUuid);
		expect("id" in result).toBe(true);
		if ("id" in result) {
			expect(result.id).toBe(nonExistentUuid);
		}
	});

	test("should return id when full_name resolves", () => {
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[testRepoId, "test-repo", testFullName, "main"],
		);

		const result = resolveRepositoryIdentifierWithError(testFullName);
		expect("id" in result).toBe(true);
		if ("id" in result) {
			expect(result.id).toBe(testRepoId);
		}
	});

	test("should return error for non-existent full_name", () => {
		const result = resolveRepositoryIdentifierWithError("nonexistent/repo");
		expect("error" in result).toBe(true);
		if ("error" in result) {
			expect(result.error).toContain("Repository not found");
			expect(result.error).toContain("nonexistent/repo");
		}
	});

	test("should include repository name in error message", () => {
		const result = resolveRepositoryIdentifierWithError("my-org/my-project");
		expect("error" in result).toBe(true);
		if ("error" in result) {
			expect(result.error).toContain("my-org/my-project");
		}
	});
});
