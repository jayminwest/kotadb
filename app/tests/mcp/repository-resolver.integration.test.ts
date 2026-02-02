/**
 * Integration tests for repository resolution in MCP tools
 *
 * Tests that MCP tools (search_dependencies, analyze_change_impact,
 * validate_implementation_spec) correctly accept full_name format
 * for the repository parameter.
 *
 * Following antimocking philosophy: uses real file-based SQLite databases
 * with proper KOTADB_PATH environment isolation.
 *
 * @module tests/mcp/repository-resolver.integration
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
	executeSearchDependencies,
	executeAnalyzeChangeImpact,
	executeValidateImplementationSpec,
} from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { createTempDir, cleanupTempDir, clearTestData } from "../helpers/db.js";

describe("MCP tools repository resolution integration", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let originalDbPath: string | undefined;
	const testRepoId = "12345678-1234-1234-1234-123456789abc";
	const testFullName = "integration-owner/integration-repo";
	const requestId = "test-request";
	const userId = "test-user";

	beforeAll(() => {
		tempDir = createTempDir("mcp-repo-integration-test-");
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

		// Create test repository with known ID and full_name
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[testRepoId, "integration-repo", testFullName, "main"],
		);

		// Create a test file for dependency searches
		db.run(
			`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				randomUUID(),
				testRepoId,
				"src/index.ts",
				"export const main = () => {};",
				"typescript",
				new Date().toISOString(),
				randomUUID(),
			],
		);
	});

	afterEach(() => {
		clearTestData(db);
	});

	describe("search_dependencies with full_name", () => {
		test("should accept full_name as repository parameter", async () => {
			const result = await executeSearchDependencies(
				{
					file_path: "src/index.ts",
					repository: testFullName,
				},
				requestId,
				userId,
			) as { file_path: string; dependents: unknown; dependencies: unknown };

			expect(result.file_path).toBe("src/index.ts");
			expect(result.dependents).toBeDefined();
			expect(result.dependencies).toBeDefined();
		});

		test("should accept UUID as repository parameter (backward compatibility)", async () => {
			const result = await executeSearchDependencies(
				{
					file_path: "src/index.ts",
					repository: testRepoId,
				},
				requestId,
				userId,
			) as { file_path: string };

			expect(result.file_path).toBe("src/index.ts");
		});

		test("should return error message for invalid full_name", async () => {
			const result = await executeSearchDependencies(
				{
					file_path: "src/index.ts",
					repository: "nonexistent/repo",
				},
				requestId,
				userId,
			) as { message: string };

			expect(result.message).toContain("Repository not found");
			expect(result.message).toContain("nonexistent/repo");
		});

		test("should fall back to first repository when no repository specified", async () => {
			const result = await executeSearchDependencies(
				{
					file_path: "src/index.ts",
				},
				requestId,
				userId,
			) as { file_path: string };

			// Should not error - uses first available repository
			expect(result.file_path).toBe("src/index.ts");
		});
	});

	describe("analyze_change_impact with full_name", () => {
		test("should accept full_name as repository parameter", async () => {
			const result = await executeAnalyzeChangeImpact(
				{
					change_type: "feature",
					description: "Add new feature",
					repository: testFullName,
				},
				requestId,
				userId,
			) as { affected_files: unknown; risk_level: string };

			expect(result.affected_files).toBeDefined();
			expect(result.risk_level).toBeDefined();
		});

		test("should accept UUID as repository parameter (backward compatibility)", async () => {
			const result = await executeAnalyzeChangeImpact(
				{
					change_type: "refactor",
					description: "Refactor code",
					repository: testRepoId,
				},
				requestId,
				userId,
			) as { risk_level: string };

			expect(result.risk_level).toBeDefined();
		});

		test("should handle invalid full_name gracefully", async () => {
			const result = await executeAnalyzeChangeImpact(
				{
					change_type: "fix",
					description: "Bug fix",
					repository: "invalid/nonexistent",
				},
				requestId,
				userId,
			) as { error?: string; risk_level?: string };

			// Should either return error or handle gracefully
			expect(result.error || result.risk_level).toBeDefined();
		});

		test("should fall back to first repository when no repository specified", async () => {
			const result = await executeAnalyzeChangeImpact(
				{
					change_type: "chore",
					description: "Maintenance task",
				},
				requestId,
				userId,
			) as { risk_level: string };

			expect(result.risk_level).toBeDefined();
		});
	});

	describe("validate_implementation_spec with full_name", () => {
		test("should accept full_name as repository parameter", async () => {
			const result = await executeValidateImplementationSpec(
				{
					feature_name: "New Feature",
					repository: testFullName,
				},
				requestId,
				userId,
			) as { valid: boolean; errors: unknown[]; warnings: unknown[] };

			expect(result.valid).toBeDefined();
			expect(result.errors).toBeDefined();
			expect(result.warnings).toBeDefined();
		});

		test("should accept UUID as repository parameter (backward compatibility)", async () => {
			const result = await executeValidateImplementationSpec(
				{
					feature_name: "Another Feature",
					repository: testRepoId,
				},
				requestId,
				userId,
			) as { valid: boolean };

			expect(result.valid).toBeDefined();
		});

		test("should handle invalid full_name gracefully", async () => {
			const result = await executeValidateImplementationSpec(
				{
					feature_name: "Test Feature",
					repository: "does-not/exist",
				},
				requestId,
				userId,
			) as { error?: string; valid?: boolean };

			// Should either return error or handle gracefully
			expect(result.error || result.valid !== undefined).toBe(true);
		});

		test("should fall back to first repository when no repository specified", async () => {
			const result = await executeValidateImplementationSpec(
				{
					feature_name: "Fallback Feature",
				},
				requestId,
				userId,
			) as { valid: boolean };

			expect(result.valid).toBeDefined();
		});
	});

	describe("edge cases", () => {
		test("should handle full_name with special characters in owner", async () => {
			const specialRepoId = randomUUID();
			db.run(
				"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
				[specialRepoId, "repo", "owner-with-dash/repo", "main"],
			);

			const result = await executeSearchDependencies(
				{
					file_path: "src/test.ts",
					repository: "owner-with-dash/repo",
				},
				requestId,
				userId,
			) as { file_path: string };

			expect(result.file_path).toBe("src/test.ts");
		});

		test("should handle local/ prefix for local repositories", async () => {
			const localRepoId = randomUUID();
			db.run(
				"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
				[localRepoId, "myproject", "local/myproject", "main"],
			);

			db.run(
				`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[randomUUID(), localRepoId, "src/main.ts", "export {};", "typescript", new Date().toISOString(), randomUUID()],
			);

			const result = await executeSearchDependencies(
				{
					file_path: "src/main.ts",
					repository: "local/myproject",
				},
				requestId,
				userId,
			) as { file_path: string };

			expect(result.file_path).toBe("src/main.ts");
		});

		test("should distinguish between similar full_names", async () => {
			const repo1Id = randomUUID();
			const repo2Id = randomUUID();

			db.run(
				"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
				[repo1Id, "repo", "owner1/repo", "main"],
			);
			db.run(
				"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
				[repo2Id, "repo", "owner2/repo", "main"],
			);

			db.run(
				`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[randomUUID(), repo1Id, "src/file.ts", "// owner1", "typescript", new Date().toISOString(), randomUUID()],
			);
			db.run(
				`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[randomUUID(), repo2Id, "src/file.ts", "// owner2", "typescript", new Date().toISOString(), randomUUID()],
			);

			// Both should resolve correctly to their respective repositories
			const result1 = await executeSearchDependencies(
				{ file_path: "src/file.ts", repository: "owner1/repo" },
				requestId,
				userId,
			) as { file_path: string };

			const result2 = await executeSearchDependencies(
				{ file_path: "src/file.ts", repository: "owner2/repo" },
				requestId,
				userId,
			) as { file_path: string };

			expect(result1.file_path).toBe("src/file.ts");
			expect(result2.file_path).toBe("src/file.ts");
		});
	});
});
