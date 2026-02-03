/**
 * Tests for Memory Layer MCP tools
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 *
 * Test Coverage:
 * - search_decisions: FTS5 decision search with filtering
 * - record_decision: Record architectural decisions
 * - search_failures: FTS5 failure search
 * - record_failure: Record failed approaches
 * - search_patterns: Pattern search by type
 * - record_insight: Store session insights
 *
 * @module tests/mcp/memory-tools
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
	executeSearchDecisions,
	executeRecordDecision,
	executeSearchFailures,
	executeRecordFailure,
	executeSearchPatterns,
	executeRecordInsight,
} from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { createTempDir, cleanupTempDir, clearTestData, createTestRepository } from "../helpers/db.js";

describe("Memory Layer MCP Tools", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let originalDbPath: string | undefined;
	let testRepoId: string;
	const requestId = "test-request-1";
	const userId = "test-user-1";

	beforeAll(() => {
		// Create temp directory and set KOTADB_PATH for test isolation
		tempDir = createTempDir("mcp-memory-tools-test-");
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
			name: "memory-test-repo",
			fullName: "test/memory-test-repo",
		});
		testRepoId = repo.id;
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
	// Decision Recording & Search
	// ============================================================================

	describe("record_decision", () => {
		test("should record decision with all fields", async () => {
			const params = {
				title: "Use SQLite for local storage",
				context: "Need fast local database with FTS5 support",
				decision: "Use SQLite with FTS5 for code search",
				scope: "architecture",
				rationale: "SQLite provides excellent performance and native FTS5",
				alternatives: ["PostgreSQL with pg_trgm", "Elasticsearch"],
				related_files: ["src/db/sqlite/index.ts", "src/db/schema.sql"],
				repository: testRepoId,
			};

			const result = await executeRecordDecision(params, requestId, userId) as {
				success: boolean;
				id: string;
				message: string;
			};

			expect(result.success).toBe(true);
			expect(result.id).toBeDefined();
			expect(typeof result.id).toBe("string");

			// Verify in database
			const row = db.queryOne<{
				title: string;
				context: string;
				decision: string;
				scope: string;
				rationale: string;
				alternatives: string;
				related_files: string;
			}>("SELECT * FROM decisions WHERE id = ?", [result.id]);

			expect(row).toBeDefined();
			expect(row?.title).toBe(params.title);
			expect(row?.context).toBe(params.context);
			expect(row?.decision).toBe(params.decision);
			expect(row?.scope).toBe(params.scope);
			expect(row?.rationale).toBe(params.rationale);
			expect(JSON.parse(row?.alternatives || "[]")).toEqual(params.alternatives);
			expect(JSON.parse(row?.related_files || "[]")).toEqual(params.related_files);
		});

		test("should record decision with minimal required fields", async () => {
			const params = {
				title: "Minimal decision",
				context: "Context info",
				decision: "Decision made",
			};

			const result = await executeRecordDecision(params, requestId, userId) as {
				success: boolean;
				id: string;
			};

			expect(result.success).toBe(true);
			expect(result.id).toBeDefined();

			// Verify defaults
			const row = db.queryOne<{ scope: string; alternatives: string; related_files: string }>(
				"SELECT scope, alternatives, related_files FROM decisions WHERE id = ?",
				[result.id],
			);

			expect(row?.scope).toBe("pattern"); // Default scope
			expect(JSON.parse(row?.alternatives || "[]")).toEqual([]);
			expect(JSON.parse(row?.related_files || "[]")).toEqual([]);
		});

		test("should throw error when title is missing", async () => {
			await expect(async () => {
				await executeRecordDecision(
					{ context: "test", decision: "test" },
					requestId,
					userId,
				);
			}).toThrow("Missing or invalid required parameter: title");
		});

		test("should throw error when context is missing", async () => {
			await expect(async () => {
				await executeRecordDecision(
					{ title: "test", decision: "test" },
					requestId,
					userId,
				);
			}).toThrow("Missing or invalid required parameter: context");
		});

		test("should throw error when decision is missing", async () => {
			await expect(async () => {
				await executeRecordDecision(
					{ title: "test", context: "test" },
					requestId,
					userId,
				);
			}).toThrow("Missing or invalid required parameter: decision");
		});

		test("should throw error for invalid scope", async () => {
			await expect(async () => {
				await executeRecordDecision(
					{
						title: "test",
						context: "test",
						decision: "test",
						scope: "invalid-scope",
					},
					requestId,
					userId,
				);
			}).toThrow("Parameter 'scope' must be one of");
		});
	});

	describe("search_decisions", () => {
		beforeEach(async () => {
			// Insert test decisions
			await executeRecordDecision(
				{
					title: "Use TypeScript for type safety",
					context: "Need static typing",
					decision: "Use TypeScript across the codebase",
					scope: "architecture",
					repository: testRepoId,
				},
				requestId,
				userId,
			);

			await executeRecordDecision(
				{
					title: "Antimocking test pattern",
					context: "Need reliable tests",
					decision: "Use real SQLite in tests, no mocking",
					scope: "pattern",
					repository: testRepoId,
				},
				requestId,
				userId,
			);

			await executeRecordDecision(
				{
					title: "Error logging conventions",
					context: "Need consistent error handling",
					decision: "Always use structured logging",
					scope: "convention",
					repository: testRepoId,
				},
				requestId,
				userId,
			);
		});

		test("should search decisions by query", async () => {
			const result = await executeSearchDecisions(
				{ query: "TypeScript" },
				requestId,
				userId,
			) as {
				results: Array<{ title: string; relevance: number }>;
				count: number;
			};

			expect(result.results).toBeDefined();
			expect(result.count).toBeGreaterThan(0);
			expect(result.results[0]?.title).toContain("TypeScript");
		});

		test("should filter by scope", async () => {
			const result = await executeSearchDecisions(
				{ query: "test", scope: "pattern" },
				requestId,
				userId,
			) as {
				results: Array<{ scope: string }>;
				count: number;
			};

			expect(result.count).toBeGreaterThan(0);
			for (const decision of result.results) {
				expect(decision.scope).toBe("pattern");
			}
		});

		test("should return empty results for non-matching query", async () => {
			const result = await executeSearchDecisions(
				{ query: "nonexistent-term-xyz" },
				requestId,
				userId,
			) as {
				results: Array<unknown>;
				count: number;
			};

			expect(result.results).toEqual([]);
			expect(result.count).toBe(0);
		});

		test("should respect limit parameter", async () => {
			const result = await executeSearchDecisions(
				{ query: "decision", limit: 1 },
				requestId,
				userId,
			) as {
				results: Array<unknown>;
				count: number;
			};

			expect(result.results.length).toBeLessThanOrEqual(1);
		});

		test("should return ranked results with relevance scores", async () => {
			const result = await executeSearchDecisions(
				{ query: "TypeScript" },
				requestId,
				userId,
			) as {
				results: Array<{ relevance: number }>;
			};

			expect(result.results.length).toBeGreaterThan(0);
			expect(result.results[0]?.relevance).toBeDefined();
			expect(typeof result.results[0]?.relevance).toBe("number");
		});

		test("should throw error when query is missing", async () => {
			await expect(async () => {
				await executeSearchDecisions({}, requestId, userId);
			}).toThrow("Missing required parameter: query");
		});
	});

	// ============================================================================
	// Failure Recording & Search
	// ============================================================================

	describe("record_failure", () => {
		test("should record a failed approach", async () => {
			const params = {
				title: "Tried using jest.mock",
				problem: "Need to test database queries",
				approach: "Used jest.mock to mock database calls",
				failure_reason: "Mocks hide real integration bugs and add maintenance burden",
				related_files: ["tests/db/queries.test.ts"],
				repository: testRepoId,
			};

			const result = await executeRecordFailure(params, requestId, userId) as {
				success: boolean;
				id: string;
			};

			expect(result.success).toBe(true);
			expect(result.id).toBeDefined();

			// Verify in database
			const row = db.queryOne<{
				title: string;
				problem: string;
				approach: string;
				failure_reason: string;
				related_files: string;
			}>("SELECT * FROM failures WHERE id = ?", [result.id]);

			expect(row).toBeDefined();
			expect(row?.title).toBe(params.title);
			expect(row?.problem).toBe(params.problem);
			expect(row?.approach).toBe(params.approach);
			expect(row?.failure_reason).toBe(params.failure_reason);
			expect(JSON.parse(row?.related_files || "[]")).toEqual(params.related_files);
		});

		test("should store related_files as JSON", async () => {
			const params = {
				title: "Failed approach",
				problem: "Problem description",
				approach: "Approach tried",
				failure_reason: "Why it failed",
				related_files: ["file1.ts", "file2.ts", "file3.ts"],
			};

			const result = await executeRecordFailure(params, requestId, userId) as {
				success: boolean;
				id: string;
			};

			const row = db.queryOne<{ related_files: string }>(
				"SELECT related_files FROM failures WHERE id = ?",
				[result.id],
			);

			const files = JSON.parse(row?.related_files || "[]");
			expect(files).toEqual(params.related_files);
			expect(files.length).toBe(3);
		});

		test("should throw error when title is missing", async () => {
			await expect(async () => {
				await executeRecordFailure(
					{
						problem: "test",
						approach: "test",
						failure_reason: "test",
					},
					requestId,
					userId,
				);
			}).toThrow("Missing or invalid required parameter: title");
		});

		test("should throw error when problem is missing", async () => {
			await expect(async () => {
				await executeRecordFailure(
					{
						title: "test",
						approach: "test",
						failure_reason: "test",
					},
					requestId,
					userId,
				);
			}).toThrow("Missing or invalid required parameter: problem");
		});
	});

	describe("search_failures", () => {
		beforeEach(async () => {
			// Insert test failures
			await executeRecordFailure(
				{
					title: "Jest mocking approach failed",
					problem: "Testing database code",
					approach: "Used jest.mock for database",
					failure_reason: "Hidden integration bugs",
					repository: testRepoId,
				},
				requestId,
				userId,
			);

			await executeRecordFailure(
				{
					title: "Regex-only parsing failed",
					problem: "Parse TypeScript imports",
					approach: "Used regex to parse import statements",
					failure_reason: "Cannot handle complex syntax",
					repository: testRepoId,
				},
				requestId,
				userId,
			);
		});

		test("should search failures by query", async () => {
			const result = await executeSearchFailures(
				{ query: "jest" },
				requestId,
				userId,
			) as {
				results: Array<{ title: string }>;
				count: number;
			};

			expect(result.results.length).toBeGreaterThan(0);
			expect(result.results[0]?.title.toLowerCase()).toContain("jest");
		});

		test("should return FTS5 ranking", async () => {
			const result = await executeSearchFailures(
				{ query: "parsing" },
				requestId,
				userId,
			) as {
				results: Array<{ relevance: number }>;
			};

			expect(result.results.length).toBeGreaterThan(0);
			expect(result.results[0]?.relevance).toBeDefined();
			expect(typeof result.results[0]?.relevance).toBe("number");
		});

		test("should return empty results for non-matching query", async () => {
			const result = await executeSearchFailures(
				{ query: "nonexistent-xyz-term" },
				requestId,
				userId,
			) as {
				results: Array<unknown>;
				count: number;
			};

			expect(result.results).toEqual([]);
			expect(result.count).toBe(0);
		});

		test("should respect limit parameter", async () => {
			const result = await executeSearchFailures(
				{ query: "failed", limit: 1 },
				requestId,
				userId,
			) as {
				results: Array<unknown>;
			};

			expect(result.results.length).toBeLessThanOrEqual(1);
		});

		test("should throw error when query is missing", async () => {
			await expect(async () => {
				await executeSearchFailures({}, requestId, userId);
			}).toThrow("Missing required parameter: query");
		});
	});

	// ============================================================================
	// Pattern Search
	// ============================================================================

	describe("search_patterns", () => {
		beforeEach(() => {
			// Insert test patterns directly
			db.run(
				`INSERT INTO patterns (id, repository_id, pattern_type, file_path, description, example, created_at)
				VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
				[
					randomUUID(),
					testRepoId,
					"error-handling",
					"src/api/handler.ts",
					"Try-catch with structured logging",
					"try { ... } catch (err) { logger.error(...) }",
				],
			);

			db.run(
				`INSERT INTO patterns (id, repository_id, pattern_type, file_path, description, example, created_at)
				VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
				[
					randomUUID(),
					testRepoId,
					"error-handling",
					"src/db/queries.ts",
					"Database error handling",
					"catch (err) { throw new DatabaseError() }",
				],
			);

			db.run(
				`INSERT INTO patterns (id, repository_id, pattern_type, file_path, description, example, created_at)
				VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
				[
					randomUUID(),
					testRepoId,
					"api-call",
					"src/api/client.ts",
					"REST API call pattern",
					"await fetch(url).then(r => r.json())",
				],
			);
		});

		test("should search patterns by pattern_type", async () => {
			const result = await executeSearchPatterns(
				{ pattern_type: "error-handling" },
				requestId,
				userId,
			) as {
				results: Array<{ pattern_type: string }>;
				count: number;
			};

			expect(result.count).toBe(2);
			for (const pattern of result.results) {
				expect(pattern.pattern_type).toBe("error-handling");
			}
		});

		test("should filter by file", async () => {
			const result = await executeSearchPatterns(
				{ file: "src/api/handler.ts" },
				requestId,
				userId,
			) as {
				results: Array<{ file_path: string }>;
				count: number;
			};

			expect(result.count).toBe(1);
			expect(result.results[0]?.file_path).toBe("src/api/handler.ts");
		});

		test("should return empty array when no matches", async () => {
			const result = await executeSearchPatterns(
				{ pattern_type: "nonexistent-pattern" },
				requestId,
				userId,
			) as {
				results: Array<unknown>;
				count: number;
			};

			expect(result.results).toEqual([]);
			expect(result.count).toBe(0);
		});

		test("should respect limit parameter", async () => {
			const result = await executeSearchPatterns(
				{ pattern_type: "error-handling", limit: 1 },
				requestId,
				userId,
			) as {
				results: Array<unknown>;
			};

			expect(result.results.length).toBe(1);
		});

		test("should work with no parameters", async () => {
			const result = await executeSearchPatterns(
				{},
				requestId,
				userId,
			) as {
				results: Array<unknown>;
				count: number;
			};

			expect(result.count).toBe(3);
			expect(result.results.length).toBe(3);
		});
	});

	// ============================================================================
	// Session Insights
	// ============================================================================

	describe("record_insight", () => {
		test("should record an insight", async () => {
			const params = {
				content: "Found that antimocking improves test reliability",
				insight_type: "discovery",
				session_id: randomUUID(),
				related_file: "tests/db/queries.test.ts",
			};

			const result = await executeRecordInsight(params, requestId, userId) as {
				success: boolean;
				id: string;
			};

			expect(result.success).toBe(true);
			expect(result.id).toBeDefined();

			// Verify in database
			const row = db.queryOne<{
				content: string;
				insight_type: string;
				session_id: string;
				related_file: string;
			}>("SELECT * FROM insights WHERE id = ?", [result.id]);

			expect(row).toBeDefined();
			expect(row?.content).toBe(params.content);
			expect(row?.insight_type).toBe(params.insight_type);
			expect(row?.session_id).toBe(params.session_id);
			expect(row?.related_file).toBe(params.related_file);
		});

		test("should record insight without session_id", async () => {
			const params = {
				content: "Workaround for circular dependency",
				insight_type: "workaround",
			};

			const result = await executeRecordInsight(params, requestId, userId) as {
				success: boolean;
				id: string;
			};

			expect(result.success).toBe(true);

			const row = db.queryOne<{ session_id: string | null }>(
				"SELECT session_id FROM insights WHERE id = ?",
				[result.id],
			);

			expect(row?.session_id).toBeNull();
		});

		test("should throw error when content is missing", async () => {
			await expect(async () => {
				await executeRecordInsight(
					{ insight_type: "discovery" },
					requestId,
					userId,
				);
			}).toThrow("Missing or invalid required parameter: content");
		});

		test("should throw error when insight_type is missing", async () => {
			await expect(async () => {
				await executeRecordInsight(
					{ content: "test content" },
					requestId,
					userId,
				);
			}).toThrow("Missing or invalid required parameter: insight_type");
		});

		test("should throw error for invalid insight_type", async () => {
			await expect(async () => {
				await executeRecordInsight(
					{
						content: "test",
						insight_type: "invalid-type",
					},
					requestId,
					userId,
				);
			}).toThrow("Parameter 'insight_type' must be one of");
		});
	});

	// ============================================================================
	// Integration Tests
	// ============================================================================

	describe("Integration: Full workflows", () => {
		test("should record and search decision", async () => {
			// Record decision
			const recordResult = await executeRecordDecision(
				{
					title: "Path alias usage",
					context: "Need consistent imports",
					decision: "Always use @api, @db, @mcp aliases",
					scope: "convention",
					repository: testRepoId,
				},
				requestId,
				userId,
			) as { id: string };

			// Search for it
			const searchResult = await executeSearchDecisions(
				{ query: "path alias" },
				requestId,
				userId,
			) as {
				results: Array<{ id: string; title: string }>;
			};

			expect(searchResult.results.length).toBeGreaterThan(0);
			const found = searchResult.results.find((d) => d.id === recordResult.id);
			expect(found).toBeDefined();
			expect(found?.title).toBe("Path alias usage");
		});

		test("should record and search failure", async () => {
			// Record failure
			const recordResult = await executeRecordFailure(
				{
					title: "Global state in tests",
					problem: "Tests were flaky",
					approach: "Used shared database connection",
					failure_reason: "Tests polluted each other's state",
					repository: testRepoId,
				},
				requestId,
				userId,
			) as { id: string };

			// Search for it
			const searchResult = await executeSearchFailures(
				{ query: "global state" },
				requestId,
				userId,
			) as {
				results: Array<{ id: string; title: string }>;
			};

			expect(searchResult.results.length).toBeGreaterThan(0);
			const found = searchResult.results.find((f) => f.id === recordResult.id);
			expect(found).toBeDefined();
			expect(found?.title).toBe("Global state in tests");
		});

		test("should handle invalid repository gracefully", async () => {
			// Non-existent repository should not throw, just use null
			const result = await executeRecordDecision(
				{
					title: "Test decision",
					context: "Test context",
					decision: "Test decision",
					repository: "nonexistent/repo",
				},
				requestId,
				userId,
			) as { success: boolean; id: string };

			expect(result.success).toBe(true);

			// Verify it was recorded with null repository_id
			const row = db.queryOne<{ repository_id: string | null }>(
				"SELECT repository_id FROM decisions WHERE id = ?",
				[result.id],
			);

			expect(row?.repository_id).toBeNull();
		});
	});
});
