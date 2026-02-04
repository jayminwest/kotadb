/**
 * Tests for unified search MCP tool
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 *
 * Test Coverage:
 * - executeSearch: Unified search across multiple scopes
 * - Output format transformation (full, paths, compact)
 * - Scope-specific filters
 * - Error handling for invalid parameters
 *
 * @module tests/mcp/unified-search
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { executeSearch } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/index.js";
import {
	createTempDir,
	cleanupTempDir,
	clearTestData,
	createTestRepository,
	createTestFile,
} from "../helpers/db.js";

describe("executeSearch - unified search tool", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let originalDbPath: string | undefined;
	let testRepoId: string;
	const requestId = "test-request-1";
	const userId = "test-user-1";

	beforeAll(() => {
		// Create temp directory and set KOTADB_PATH for test isolation
		tempDir = createTempDir("mcp-unified-search-test-");
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
		// Create test repository
		const repo = createTestRepository(db, {
			name: "unified-search-test-repo",
			fullName: "test/unified-search-test-repo",
		});
		testRepoId = repo.id;

		// Create test files with searchable content
		createTestFile(db, testRepoId, {
			path: "src/api/handler.ts",
			content: "export function handleRequest(req: Request): Response { return new Response(); }",
			language: "typescript",
		});

		createTestFile(db, testRepoId, {
			path: "src/db/queries.ts",
			content: "export function queryDatabase(sql: string): Result { return db.query(sql); }",
			language: "typescript",
		});

		// Create test symbols directly using correct schema columns
		const file1Id = randomUUID();
		db.run(
			`INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at, content_hash)
			VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
			[file1Id, testRepoId, "src/utils/helper.ts", "export function helperFunction() {}", "typescript", randomUUID()],
		);

		db.run(
			`INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, signature, line_start, line_end, documentation, metadata)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[randomUUID(), file1Id, testRepoId, "handleRequest", "function", "function handleRequest(req: Request): Response", 1, 1, "Handles HTTP requests", "{}"],
		);

		db.run(
			`INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, signature, line_start, line_end, documentation, metadata)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[randomUUID(), file1Id, testRepoId, "queryDatabase", "function", "function queryDatabase(sql: string): Result", 1, 1, "Queries the database", "{}"],
		);
	});

	afterEach(() => {
		clearTestData(db);
		// Clear memory layer tables
		db.run("DELETE FROM insights");
		db.run("DELETE FROM patterns");
		db.run("DELETE FROM failures");
		db.run("DELETE FROM decisions");
	});

	// ============================================================================
	// Basic Search Tests
	// ============================================================================

	describe("single scope search", () => {
		test("should search code scope by default", async () => {
			const result = (await executeSearch(
				{ query: "function" },
				requestId,
				userId,
			)) as {
				query: string;
				scopes: string[];
				results: Record<string, unknown[]>;
				counts: Record<string, number>;
			};

			expect(result.query).toBe("function");
			expect(result.scopes).toEqual(["code"]);
			expect(result.results.code).toBeDefined();
			expect(Array.isArray(result.results.code)).toBe(true);
			expect(result.counts.code).toBeDefined();
			expect(typeof result.counts.total).toBe("number");
		});

		test("should search symbols scope", async () => {
			const result = (await executeSearch(
				{ query: "handle", scope: ["symbols"] },
				requestId,
				userId,
			)) as {
				scopes: string[];
				results: Record<string, unknown[]>;
				counts: Record<string, number>;
			};

			expect(result.scopes).toEqual(["symbols"]);
			expect(result.results.symbols).toBeDefined();
			expect(Array.isArray(result.results.symbols)).toBe(true);
		});

		test("should return empty results for non-matching query", async () => {
			const result = (await executeSearch(
				{ query: "nonExistentTermXYZ12345" },
				requestId,
				userId,
			)) as {
				results: Record<string, unknown[]>;
				counts: Record<string, number>;
			};

			expect(result.results.code).toBeDefined();
			expect(result.counts.total).toBe(0);
		});
	});

	// ============================================================================
	// Multi-Scope Search Tests
	// ============================================================================

	describe("multi-scope search", () => {
		test("should search multiple scopes in parallel", async () => {
			const result = (await executeSearch(
				{ query: "function", scope: ["code", "symbols"] },
				requestId,
				userId,
			)) as {
				scopes: string[];
				results: Record<string, unknown[]>;
				counts: Record<string, number>;
			};

			expect(result.scopes).toContain("code");
			expect(result.scopes).toContain("symbols");
			expect(result.results.code).toBeDefined();
			expect(result.results.symbols).toBeDefined();
			expect(typeof result.counts.code).toBe("number");
			expect(typeof result.counts.symbols).toBe("number");
			expect(result.counts.total).toBe((result.counts.code ?? 0) + (result.counts.symbols ?? 0));
		});

		test("should search all scopes when specified", async () => {
			const result = (await executeSearch(
				{
					query: "test",
					scope: ["code", "symbols", "decisions", "patterns", "failures"],
				},
				requestId,
				userId,
			)) as {
				scopes: string[];
				results: Record<string, unknown[]>;
			};

			expect(result.scopes).toHaveLength(5);
			expect(result.results.code).toBeDefined();
			expect(result.results.symbols).toBeDefined();
			expect(result.results.decisions).toBeDefined();
			expect(result.results.patterns).toBeDefined();
			expect(result.results.failures).toBeDefined();
		});
	});

	// ============================================================================
	// Output Format Tests
	// ============================================================================

	describe("output formats", () => {
		test("should return full format by default", async () => {
			const result = (await executeSearch(
				{ query: "function" },
				requestId,
				userId,
			)) as {
				results: Record<string, unknown[]>;
			};

			// Full format includes complete object details
			if (result.results.code && result.results.code.length > 0) {
				const codeResult = result.results.code[0] as Record<string, unknown>;
				expect(codeResult).toHaveProperty("path");
			}
		});

		test("should return paths only with output: paths", async () => {
			const result = (await executeSearch(
				{ query: "function", output: "paths" },
				requestId,
				userId,
			)) as {
				results: Record<string, unknown[]>;
			};

			// Paths format returns only file paths as strings
			if (result.results.code && result.results.code.length > 0) {
				const pathResult = result.results.code[0];
				expect(typeof pathResult).toBe("string");
			}
		});

		test("should return compact format with output: compact", async () => {
			const result = (await executeSearch(
				{ query: "handle", scope: ["symbols"], output: "compact" },
				requestId,
				userId,
			)) as {
				results: Record<string, unknown[]>;
			};

			// Compact format for symbols includes name, kind, file
			if (result.results.symbols && result.results.symbols.length > 0) {
				const symbolResult = result.results.symbols[0] as Record<string, unknown>;
				expect(symbolResult).toHaveProperty("name");
				expect(symbolResult).toHaveProperty("kind");
				expect(symbolResult).toHaveProperty("file");
			}
		});
	});

	// ============================================================================
	// Filter Tests
	// ============================================================================

	describe("filters", () => {
		test("should apply symbol_kind filter for symbols scope", async () => {
			const result = (await executeSearch(
				{
					query: "handle",
					scope: ["symbols"],
					filters: { symbol_kind: ["function"] },
				},
				requestId,
				userId,
			)) as {
				results: Record<string, unknown[]>;
			};

			expect(result.results.symbols).toBeDefined();
			// All results should be functions
			if (result.results.symbols) {
				for (const symbol of result.results.symbols) {
					const s = symbol as { kind: string };
					expect(s.kind).toBe("function");
				}
			}
		});

		test("should apply repository filter", async () => {
			const result = (await executeSearch(
				{
					query: "function",
					filters: { repository: testRepoId },
				},
				requestId,
				userId,
			)) as {
				results: Record<string, unknown[]>;
				counts: Record<string, number>;
			};

			expect(result.results.code).toBeDefined();
			// Results should be from the test repository
		});

		test("should apply limit parameter", async () => {
			const result = (await executeSearch(
				{ query: "function", limit: 1 },
				requestId,
				userId,
			)) as {
				results: Record<string, unknown[]>;
			};

			expect(result.results.code).toBeDefined();
			expect(result.results.code?.length ?? 0).toBeLessThanOrEqual(1);
		});
	});

	// ============================================================================
	// Error Handling Tests
	// ============================================================================

	describe("error handling", () => {
		test("should throw error when query is missing", async () => {
			await expect(async () => {
				await executeSearch({}, requestId, userId);
			}).toThrow("Missing required parameter: query");
		});

		test("should throw error when query is not a string", async () => {
			await expect(async () => {
				await executeSearch({ query: 123 }, requestId, userId);
			}).toThrow("Parameter 'query' must be a string");
		});

		test("should reject invalid scope values", async () => {
			await expect(async () => {
				await executeSearch(
					{ query: "test", scope: ["invalid-scope"] },
					requestId,
					userId,
				);
			}).toThrow("Invalid scope: invalid-scope");
		});

		test("should throw error when scope is not an array", async () => {
			await expect(async () => {
				await executeSearch(
					{ query: "test", scope: "code" },
					requestId,
					userId,
				);
			}).toThrow("Parameter 'scope' must be an array");
		});

		test("should throw error when limit is not a number", async () => {
			await expect(async () => {
				await executeSearch(
					{ query: "test", limit: "invalid" },
					requestId,
					userId,
				);
			}).toThrow("Parameter 'limit' must be a number");
		});

		test("should throw error for invalid output format", async () => {
			await expect(async () => {
				await executeSearch(
					{ query: "test", output: "invalid" },
					requestId,
					userId,
				);
			}).toThrow("Parameter 'output' must be one of: full, paths, compact");
		});

		test("should throw error when params is not an object", async () => {
			await expect(async () => {
				await executeSearch("invalid", requestId, userId);
			}).toThrow("Parameters must be an object");
		});
	});

	// ============================================================================
	// Integration Tests
	// ============================================================================

	describe("integration", () => {
		test("should handle decisions scope with recorded decisions", async () => {
			// Record a decision first
			db.run(
				`INSERT INTO decisions (id, repository_id, title, context, decision, scope, rationale, alternatives, related_files, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
				[
					randomUUID(),
					testRepoId,
					"Use unified search",
					"Need to consolidate search tools",
					"Implement unified search tool",
					"architecture",
					"Reduces tool count",
					"[]",
					"[]",
				],
			);

			const result = (await executeSearch(
				{ query: "unified", scope: ["decisions"] },
				requestId,
				userId,
			)) as {
				results: Record<string, unknown[]>;
				counts: Record<string, number>;
			};

			expect(result.results.decisions).toBeDefined();
			expect(result.counts.decisions).toBeGreaterThan(0);
		});

		test("should handle patterns scope with recorded patterns", async () => {
			// Record a pattern first
			db.run(
				`INSERT INTO patterns (id, repository_id, pattern_type, file_path, description, example, created_at)
				VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
				[
					randomUUID(),
					testRepoId,
					"error-handling",
					"src/api/handler.ts",
					"Try-catch with structured logging",
					"try { ... } catch (e) { logger.error(e) }",
				],
			);

			const result = (await executeSearch(
				{ query: "error", scope: ["patterns"] },
				requestId,
				userId,
			)) as {
				results: Record<string, unknown[]>;
				counts: Record<string, number>;
			};

			expect(result.results.patterns).toBeDefined();
		});

		test("should handle failures scope with recorded failures", async () => {
			// Record a failure first
			db.run(
				`INSERT INTO failures (id, repository_id, title, problem, approach, failure_reason, related_files, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
				[
					randomUUID(),
					testRepoId,
					"Mocking approach failed",
					"Need reliable tests",
					"Used jest.mock",
					"Hidden integration bugs",
					"[]",
				],
			);

			const result = (await executeSearch(
				{ query: "mocking", scope: ["failures"] },
				requestId,
				userId,
			)) as {
				results: Record<string, unknown[]>;
				counts: Record<string, number>;
			};

			expect(result.results.failures).toBeDefined();
			expect(result.counts.failures).toBeGreaterThan(0);
		});
	});
});
