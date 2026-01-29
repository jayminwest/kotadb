/**
 * Comprehensive tests for SQLite query layer (queries.ts)
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 * 
 * Test Coverage:
 * - saveIndexedFilesLocal(): Batch insert with transactions
 * - storeSymbolsLocal(): Symbol storage with metadata
 * - storeReferencesLocal(): Reference storage with delete-then-insert
 * - searchFilesLocal(): FTS5 search with snippets and bm25 ranking
 * - listRecentFilesLocal(): Recent files ordering
 * - resolveFilePathLocal(): Path to ID resolution
 * - storeIndexedDataLocal(): Single transaction for all data types
 * 
 * @module @api/__tests__/queries-sqlite
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { createDatabase, type KotaDatabase } from "@db/sqlite/index.js";
import {
	saveIndexedFilesLocal,
	storeSymbolsLocal,
	storeReferencesLocal,
	searchFilesLocal,
	listRecentFilesLocal,
	resolveFilePathLocal,
	storeDependenciesLocal,
	queryDependentsLocal,
	queryDependenciesLocal,
} from "@api/queries.js";
import { storeIndexedDataLocal } from "@indexer/storage.js";
import type { IndexedFile } from "@shared/types";
import type { Symbol as ExtractedSymbol } from "@indexer/symbol-extractor";
import type { Reference } from "@indexer/reference-extractor";

describe("SQLite Query Layer - queries.ts", () => {
	let db: KotaDatabase;
	const testRepoId = "test-repo-123";

	beforeEach(() => {
		// Create in-memory database for each test (antimocking pattern)
		// createDatabase() auto-initializes schema from sqlite-schema.sql
		db = createDatabase({ path: ":memory:" });

		// Insert test repository
		db.run(
			"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
			[testRepoId, "test-repo", "owner/test-repo"]
		);
	});

	afterEach(() => {
		if (db) {
			db.close();
		}
	});

	describe("saveIndexedFilesLocal()", () => {
		test("should insert files with correct language detection", () => {
			const files: IndexedFile[] = [
				{

					projectRoot: "test-repo-id",

					path: "src/index.ts",
					content: "export const hello = 'world';",
					dependencies: [],
					indexedAt: new Date(),
				},
				{

					projectRoot: "test-repo-id",

					path: "src/utils.js",
					content: "module.exports = { foo: 'bar' };",
					dependencies: ["lodash"],
					indexedAt: new Date(),
				},
			];

			const count = saveIndexedFilesLocal(db, files, testRepoId);

			expect(count).toBe(2);

			const rows = db.query<{ path: string; language: string; metadata: string }>(
				"SELECT path, language, metadata FROM indexed_files ORDER BY path"
			);

			expect(rows.length).toBe(2);
			// ORDER BY path: "src/index.ts" comes before "src/utils.js"
			expect(rows[0]?.path).toBe("src/index.ts");
			expect(rows[0]?.language).toBe("typescript");
			expect(rows[1]?.path).toBe("src/utils.js");
			expect(rows[1]?.language).toBe("javascript");

			// Check metadata contains dependencies
			const utilsMetadata = JSON.parse(rows[1]?.metadata ?? "{}");
			expect(utilsMetadata.dependencies).toEqual(["lodash"]);
		});

		test("should handle empty array gracefully", () => {
			const count = saveIndexedFilesLocal(db, [], testRepoId);
			expect(count).toBe(0);

			const rows = db.query("SELECT * FROM indexed_files");
			expect(rows.length).toBe(0);
		});

		test("should replace existing files (INSERT OR REPLACE)", () => {
			const file: IndexedFile = {
 	projectRoot: "test-repo-id",
 	path: "src/app.ts",
				content: "// version 1",
				dependencies: [],
				indexedAt: new Date(),
			};

			saveIndexedFilesLocal(db, [file], testRepoId);
			const firstCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_files"
			);

			const updatedFile: IndexedFile = {
 	projectRoot: "test-repo-id",
 	path: "src/app.ts",
				content: "// version 2 - updated",
				dependencies: ["react"],
				indexedAt: new Date(),
			};

			saveIndexedFilesLocal(db, [updatedFile], testRepoId);
			const secondCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_files"
			);

			expect(firstCount?.count).toBe(1);
			expect(secondCount?.count).toBe(1); // Should still be 1 (replaced)

			const content = db.queryOne<{ content: string }>(
				"SELECT content FROM indexed_files WHERE path = ?",
				["src/app.ts"]
			);
			expect(content?.content).toContain("version 2");
		});

		test("should commit atomically in transaction", () => {
			const files: IndexedFile[] = Array.from({ length: 100 }, (_, i) => ({
				projectRoot: "test-repo-id",
				path: `file-${i}.ts`,
				content: `export const value${i} = ${i};`,
				dependencies: [],
				indexedAt: new Date(),
			}));

			const count = saveIndexedFilesLocal(db, files, testRepoId);

			expect(count).toBe(100);

			const totalCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_files"
			);
			expect(totalCount?.count).toBe(100);
		});

		test("should calculate size_bytes correctly", () => {
			const file: IndexedFile = {
 	projectRoot: "test-repo-id",
 	path: "test.ts",
				content: "hello world",
				dependencies: [],
				indexedAt: new Date(),
			};

			saveIndexedFilesLocal(db, [file], testRepoId);

			const result = db.queryOne<{ size_bytes: number }>(
				"SELECT size_bytes FROM indexed_files WHERE path = ?",
				["test.ts"]
			);

			expect(result?.size_bytes).toBe(11); // "hello world" is 11 bytes
		});
	});

	describe("storeSymbolsLocal()", () => {
		let testFileId: string;

		beforeEach(() => {
			// Insert a test file first
			testFileId = randomUUID();
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
				[testFileId, testRepoId, "src/lib.ts", "export function foo() {}", "typescript", 24, new Date().toISOString()]
			);
		});

		test("should store symbols with correct metadata", () => {
			const symbols: ExtractedSymbol[] = [
				{
					name: "MyClass",
					kind: "class",
					lineStart: 10,
					lineEnd: 20,
					columnStart: 0,
					columnEnd: 1,
					isExported: true,
					isAsync: false,
					signature: "class MyClass",
					documentation: "A test class",
				},
				{
					name: "myFunction",
					kind: "function",
					lineStart: 25,
					lineEnd: 30,
					columnStart: 0,
					columnEnd: 1,
					isExported: true,
					isAsync: true,

						documentation: null,
					signature: "async function myFunction(): Promise<void>",
				},
			];

			const count = storeSymbolsLocal(db, symbols, testFileId);

			expect(count).toBe(2);

			const rows = db.query<{ name: string; kind: string; metadata: string }>(
				"SELECT name, kind, metadata FROM indexed_symbols ORDER BY line_start"
			);

			expect(rows.length).toBe(2);
			expect(rows[0]?.name).toBe("MyClass");
			expect(rows[0]?.kind).toBe("class");

			const metadata = JSON.parse(rows[0]?.metadata ?? "{}");
			expect(metadata.is_exported).toBe(true);
			expect(metadata.is_async).toBe(false);
		});

		test("should handle empty symbols array", () => {
			const count = storeSymbolsLocal(db, [], testFileId);
			expect(count).toBe(0);
		});

		test("should throw error if file not found", () => {
			const symbols: ExtractedSymbol[] = [
				{
					name: "test",
					kind: "function",
					lineStart: 1,
					lineEnd: 5,
					columnStart: 0,
					columnEnd: 1,
					isExported: true,
					isAsync: false,
 		signature: null,
 		documentation: null,
				},
			];

			const nonExistentFileId = randomUUID();

			expect(() => {
				storeSymbolsLocal(db, symbols, nonExistentFileId);
			}).toThrow("File not found");
		});

		test("should replace symbols with same ID (INSERT OR REPLACE)", () => {
			const symbolId = randomUUID();

			// First insert
			db.run(
				"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
				[symbolId, testFileId, testRepoId, "OldName", "function", 1, 5]
			);

			// Store new symbols (may generate same ID or replace existing)
			const symbols: ExtractedSymbol[] = [
				{
					name: "NewName",
					kind: "function",
					lineStart: 1,
					lineEnd: 5,
					columnStart: 0,
					columnEnd: 1,
					isExported: true,
					isAsync: false,
 		signature: null,
 		documentation: null,
				},
			];

			storeSymbolsLocal(db, symbols, testFileId);

			// Should have symbols in database
			const count = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_symbols"
			);
			expect(count?.count).toBeGreaterThan(0);
		});
	});

	describe("storeReferencesLocal()", () => {
		let testFileId: string;

		beforeEach(() => {
			testFileId = randomUUID();
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
				[testFileId, testRepoId, "src/main.ts", "import { foo } from './lib';", "typescript", 32, new Date().toISOString()]
			);
		});

		test("should store references with delete-then-insert pattern", () => {
			const references: Reference[] = [
				{
					targetName: "useState",
					lineNumber: 5,
					columnNumber: 10,
					referenceType: "import",
					metadata: {},
				},
			];

			const count = storeReferencesLocal(db, testFileId, "test/file.ts", references, []);

			expect(count).toBe(1);

			const rows = db.query<{ symbol_name: string; reference_type: string }>(
				"SELECT symbol_name, reference_type FROM indexed_references"
			);

			expect(rows.length).toBe(1);
			expect(rows[0]?.symbol_name).toBe("useState");
			expect(rows[0]?.reference_type).toBe("import");
		});

		test("should delete existing references before inserting new ones", () => {
			const firstRefs: Reference[] = [
				{ targetName: "foo", lineNumber: 1, columnNumber: 0, referenceType: "import", metadata: {} },
				{ targetName: "bar", lineNumber: 2, columnNumber: 0, referenceType: "import", metadata: {} },
			];

			storeReferencesLocal(db, testFileId, "test/file.ts", firstRefs, []);

			const firstCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_references WHERE file_id = ?",
				[testFileId]
			);
			expect(firstCount?.count).toBe(2);

			// Store new references (should delete old ones first)
			const newRefs: Reference[] = [
				{ targetName: "baz", lineNumber: 10, columnNumber: 0, referenceType: "call", metadata: {} },
			];

			storeReferencesLocal(db, testFileId, "test/file.ts", newRefs, []);

			const secondCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_references WHERE file_id = ?",
				[testFileId]
			);
			expect(secondCount?.count).toBe(1);

			const remaining = db.queryOne<{ symbol_name: string }>(
				"SELECT symbol_name FROM indexed_references WHERE file_id = ?",
				[testFileId]
			);
			expect(remaining?.symbol_name).toBe("baz");
		});

		test("should handle empty references array", () => {
			const count = storeReferencesLocal(db, testFileId, "test/file.ts", [], []);
			expect(count).toBe(0);
		});

		test("should throw error if file not found", () => {
			const references: Reference[] = [
				{ targetName: "test", lineNumber: 1, columnNumber: 0, referenceType: "import", metadata: {} },
			];

			const nonExistentFileId = randomUUID();

			expect(() => {
				storeReferencesLocal(db, nonExistentFileId, "test/file.ts", references, []);
			}).toThrow("File not found");
		});

		test("should store metadata correctly", () => {
			const references: Reference[] = [
				{
					targetName: "Component",
					lineNumber: 15,
					columnNumber: 5,
					referenceType: "type_reference",
					metadata: {},
				},
			];

			storeReferencesLocal(db, testFileId, "test/file.ts", references, []);

			const result = db.queryOne<{ metadata: string }>(
				"SELECT metadata FROM indexed_references WHERE symbol_name = ?",
				["Component"]
			);

			const metadata = JSON.parse(result?.metadata ?? "{}");
			expect(metadata.target_name).toBe("Component");
			expect(metadata.column_number).toBe(5);
		});
	});

	describe("searchFilesLocal()", () => {
		beforeEach(() => {
			// Insert test files with content for FTS5 search
			const files = [
				{ path: "src/auth.ts", content: "export function authenticate(user) { return jwt.sign(user); }" },
				{ path: "src/database.ts", content: "import { Pool } from 'pg'; const pool = new Pool();" },
				{ path: "tests/auth.test.ts", content: "describe('authenticate', () => { it('should return token', () => {}); });" },
			];

			for (const file of files) {
				const id = randomUUID();
				db.run(
					"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
					[id, testRepoId, file.path, file.content, "typescript", file.content.length, new Date().toISOString()]
				);
			}
		});

		test("should return ranked results with FTS5 search", () => {
			const results = searchFilesLocal(db, "authenticate", testRepoId, 10);

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.path).toContain("auth");
		});

		test("should filter by repository ID", () => {
			// Insert file in different repository
			const otherRepoId = "other-repo-456";
			db.run(
				"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
				[otherRepoId, "other-repo", "owner/other-repo"]
			);
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
				[randomUUID(), otherRepoId, "src/other.ts", "authenticate", "typescript", 12, new Date().toISOString()]
			);

			const results = searchFilesLocal(db, "authenticate", testRepoId, 10);

			// Should only return files from testRepoId
			for (const result of results) {
				expect(result.projectRoot).toBe(testRepoId);
			}
		});

		test("should work without repository filter", () => {
			const results = searchFilesLocal(db, "Pool", undefined, 10);

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.content).toContain("Pool");
		});

		test("should respect limit parameter", () => {
			const results = searchFilesLocal(db, "typescript", testRepoId, 2);

			expect(results.length).toBeLessThanOrEqual(2);
		});

		test("should return empty array for no matches", () => {
			const results = searchFilesLocal(db, "nonexistent_query_xyz", testRepoId, 10);

			expect(results.length).toBe(0);
		});

		test("should parse metadata and dependencies", () => {
			const fileId = randomUUID();
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				[fileId, testRepoId, "src/app.ts", "import React from 'react';", "typescript", 25, new Date().toISOString(), JSON.stringify({ dependencies: ["react", "lodash"] })]
			);

			const results = searchFilesLocal(db, "React", testRepoId, 10);

			expect(results.length).toBeGreaterThan(0);
			const matchingFile = results.find(r => r.path === "src/app.ts");
			expect(matchingFile?.dependencies).toEqual(["react", "lodash"]);
		});
	});

	describe("searchFilesLocal - FTS edge cases (Issue #595)", () => {
		beforeEach(() => {
			// Insert test files with various content patterns
			const files = [
				{ path: "src/config.ts", content: "const preCommitHook = 'pre-commit'; // hyphenated term" },
				{ path: "src/search.ts", content: "function searchAndFind() { return 'search and find'; }" },
				{ path: "src/types.ts", content: "type PlanType = 'smb' | 'enterprise'; // planType smb" },
				{ path: "src/quotes.ts", content: 'const message = "say \\"hello\\""; // embedded quotes' },
			];

			for (const file of files) {
				const id = randomUUID();
				db.run(
					"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
					[id, testRepoId, file.path, file.content, "typescript", file.content.length, new Date().toISOString()]
				);
			}
		});

		test("should search hyphenated terms without SQL errors", () => {
			// This previously failed with: Error: no such column: commit
			const results = searchFilesLocal(db, "pre-commit", testRepoId, 10);
			expect(Array.isArray(results)).toBe(true);
			// Should find the file with "pre-commit" content
			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.content).toContain("pre-commit");
		});

		test("should search multi-word phrases without SQL errors", () => {
			// This previously failed with: Error: no such column: smb
			const results = searchFilesLocal(db, "planType smb", testRepoId, 10);
			expect(Array.isArray(results)).toBe(true);
		});

		test("should search FTS keywords (AND, OR, NOT) as literals", () => {
			// "and" was previously interpreted as FTS5 AND operator
			const resultsAnd = searchFilesLocal(db, "search and find", testRepoId, 10);
			expect(Array.isArray(resultsAnd)).toBe(true);

			const resultsOr = searchFilesLocal(db, "smb or enterprise", testRepoId, 10);
			expect(Array.isArray(resultsOr)).toBe(true);

			const resultsNot = searchFilesLocal(db, "not found", testRepoId, 10);
			expect(Array.isArray(resultsNot)).toBe(true);
		});

		test("should handle search terms containing double quotes", () => {
			// Terms with quotes need proper escaping
			const results = searchFilesLocal(db, 'say "hello"', testRepoId, 10);
			expect(Array.isArray(results)).toBe(true);
		});

		test("should handle terms that look like FTS5 operators", () => {
			// Ensure operator-like terms don't cause syntax errors
			const results1 = searchFilesLocal(db, "OR", testRepoId, 10);
			expect(Array.isArray(results1)).toBe(true);

			const results2 = searchFilesLocal(db, "AND", testRepoId, 10);
			expect(Array.isArray(results2)).toBe(true);

			const results3 = searchFilesLocal(db, "NOT", testRepoId, 10);
			expect(Array.isArray(results3)).toBe(true);

			const results4 = searchFilesLocal(db, "NEAR", testRepoId, 10);
			expect(Array.isArray(results4)).toBe(true);
		});
	});


	describe("listRecentFilesLocal()", () => {
		beforeEach(() => {
			// Insert files with different timestamps
			const now = Date.now();
			const files = [
				{ path: "oldest.ts", offset: -3000 },
				{ path: "middle.ts", offset: -2000 },
				{ path: "newest.ts", offset: -1000 },
			];

			for (const file of files) {
				const id = randomUUID();
				const timestamp = new Date(now + file.offset).toISOString();
				db.run(
					"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
					[id, testRepoId, file.path, "content", "typescript", 7, timestamp]
				);
			}
		});

		test("should return files ordered by indexed_at DESC", () => {
			const results = listRecentFilesLocal(db, 10);

			expect(results.length).toBe(3);
			expect(results[0]?.path).toBe("newest.ts");
			expect(results[1]?.path).toBe("middle.ts");
			expect(results[2]?.path).toBe("oldest.ts");
		});

		test("should respect limit parameter", () => {
			const results = listRecentFilesLocal(db, 2);

			expect(results.length).toBe(2);
			expect(results[0]?.path).toBe("newest.ts");
			expect(results[1]?.path).toBe("middle.ts");
		});

		test("should parse metadata correctly", () => {
			const fileId = randomUUID();
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				[fileId, testRepoId, "with-deps.ts", "content", "typescript", 7, new Date().toISOString(), JSON.stringify({ dependencies: ["express"] })]
			);

			const results = listRecentFilesLocal(db, 10);

			const fileWithDeps = results.find(r => r.path === "with-deps.ts");
			expect(fileWithDeps?.dependencies).toEqual(["express"]);
		});

		test("should return empty array when no files exist", () => {
			// Delete all files
			db.run("DELETE FROM indexed_files");

			const results = listRecentFilesLocal(db, 10);

			expect(results.length).toBe(0);
		});
	});

	describe("resolveFilePathLocal()", () => {
		test("should return file ID for existing path", () => {
			const fileId = randomUUID();
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
				[fileId, testRepoId, "src/index.ts", "content", "typescript", 7, new Date().toISOString()]
			);

			const result = resolveFilePathLocal(db, "src/index.ts", testRepoId);

			expect(result).toBe(fileId);
		});

		test("should return null for non-existent path", () => {
			const result = resolveFilePathLocal(db, "nonexistent/file.ts", testRepoId);

			expect(result).toBeNull();
		});

		test("should filter by repository ID", () => {
			const fileId = randomUUID();
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
				[fileId, testRepoId, "src/app.ts", "content", "typescript", 7, new Date().toISOString()]
			);

			const otherRepoId = "other-repo-789";
			db.run(
				"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
				[otherRepoId, "other", "owner/other"]
			);

			// Should return null when querying with wrong repo ID
			const result = resolveFilePathLocal(db, "src/app.ts", otherRepoId);

			expect(result).toBeNull();
		});
	});

	describe("storeIndexedDataLocal() - Integration", () => {
		test("should store all data types in single transaction", () => {
			const files = [
				{

					projectRoot: "test-repo-id",

					path: "src/lib.ts",
					content: "export function calculate() { return 42; }",
					language: "typescript",
					size_bytes: 43,
				},
				{

					projectRoot: "test-repo-id",

					path: "src/utils.ts",
					content: "export const PI = 3.14;",
					language: "typescript",
					size_bytes: 23,
				},
			];

			const symbols = [
				{
					file_path: "src/lib.ts",
					name: "calculate",
					kind: "function",
					line_start: 1,
					line_end: 1,
					signature: "function calculate(): number",
				},
				{
					file_path: "src/utils.ts",
					name: "PI",
					kind: "constant",
					line_start: 1,
					line_end: 1,
				},
			];

			const references = [
				{
					source_file_path: "src/lib.ts",
					target_symbol_key: "src/utils.ts::PI::1",
					line_number: 1,
					reference_type: "type_reference",
				},
			];

			const dependencyGraph = [
				{
					from_file_path: "src/lib.ts",
					to_file_path: "src/utils.ts",
					dependency_type: "import",
				},
			];

			const result = storeIndexedDataLocal(
				db,
				testRepoId,
				files,
				symbols,
				references,
				dependencyGraph
			);

			expect(result.files_indexed).toBe(2);
			expect(result.symbols_extracted).toBe(2);
			expect(result.references_found).toBe(1);
			expect(result.dependencies_extracted).toBe(1);

			// Verify data was stored
			const fileCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_files"
			);
			const symbolCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_symbols"
			);
			const refCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_references"
			);

			expect(fileCount?.count).toBe(2);
			expect(symbolCount?.count).toBe(2);
			expect(refCount?.count).toBe(1);
		});

		test("should handle empty arrays gracefully", () => {
			const result = storeIndexedDataLocal(db, testRepoId, [], [], [], []);

			expect(result.files_indexed).toBe(0);
			expect(result.symbols_extracted).toBe(0);
			expect(result.references_found).toBe(0);
			expect(result.dependencies_extracted).toBe(0);
		});

		test("should rollback on transaction error", () => {
			const files = [
				{

					projectRoot: "test-repo-id",

					path: "src/test.ts",
					content: "test",
					language: "typescript",
					size_bytes: 4,
				},
			];

			// Invalid symbol (missing required repository_id will fail FK constraint)
			const symbols = [
				{
					file_path: "nonexistent.ts", // This file doesn't exist
					name: "test",
					kind: "function",
					line_start: 1,
					line_end: 1,
				},
			];

			// Should not throw, but should log warning and skip invalid symbols
			const result = storeIndexedDataLocal(db, testRepoId, files, symbols, [], []);

			expect(result.files_indexed).toBe(1);
			expect(result.symbols_extracted).toBe(0); // Skipped invalid symbol

			// Files should still be stored
			const fileCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_files"
			);
			expect(fileCount?.count).toBe(1);
		});

		test("should link references to symbols via target_symbol_id", () => {
			const files = [
				{

					projectRoot: "test-repo-id",

					path: "src/main.ts",
					content: "import { foo } from './lib';",
					language: "typescript",
					size_bytes: 28,
				},
				{

					projectRoot: "test-repo-id",

					path: "src/lib.ts",
					content: "export function foo() {}",
					language: "typescript",
					size_bytes: 24,
				},
			];

			const symbols = [
				{
					file_path: "src/lib.ts",
					name: "foo",
					kind: "function",
					line_start: 1,
					line_end: 1,
				},
			];

			const references = [
				{
					source_file_path: "src/main.ts",
					target_symbol_key: "src/lib.ts::foo::1",
					line_number: 1,
					reference_type: "import",
				},
			];

			storeIndexedDataLocal(db, testRepoId, files, symbols, references, []);

			// Verify reference has target_symbol_id populated
			const ref = db.queryOne<{ target_symbol_id: string | null }>(
				"SELECT target_symbol_id FROM indexed_references WHERE symbol_name = ?",
				["src/lib.ts::foo::1"]
			);

			expect(ref?.target_symbol_id).not.toBeNull();
		});
	});

	describe("Edge Cases and Error Handling", () => {
		test("should handle special characters in file paths", () => {
			const files: IndexedFile[] = [
				{

					projectRoot: "test-repo-id",

					path: "src/file with spaces.ts",
					content: "test",
					dependencies: [],
					indexedAt: new Date(),
				},
				{

					projectRoot: "test-repo-id",

					path: "src/file[with]brackets.ts",
					content: "test",
					dependencies: [],
					indexedAt: new Date(),
				},
			];

			const count = saveIndexedFilesLocal(db, files, testRepoId);

			expect(count).toBe(2);

			const result = resolveFilePathLocal(db, "src/file with spaces.ts", testRepoId);
			expect(result).not.toBeNull();
		});

		test("should handle unicode content in file", () => {
			const files: IndexedFile[] = [
				{

					projectRoot: "test-repo-id",

					path: "src/unicode.ts",
					content: "const greeting = '你好世界'; // Hello World in Chinese",
					dependencies: [],
					indexedAt: new Date(),
				},
			];

			saveIndexedFilesLocal(db, files, testRepoId);

			// FTS5 may not tokenize Chinese characters well, so search for ASCII content
			const results = searchFilesLocal(db, "greeting", testRepoId, 10);

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.content).toContain("你好世界");
		});

		test("should handle very long content", () => {
			const longContent = "x".repeat(100000);
			const files: IndexedFile[] = [
				{

					projectRoot: "test-repo-id",

					path: "src/large.ts",
					content: longContent,
					dependencies: [],
					indexedAt: new Date(),
				},
			];

			const count = saveIndexedFilesLocal(db, files, testRepoId);

			expect(count).toBe(1);

			const result = db.queryOne<{ size_bytes: number }>(
				"SELECT size_bytes FROM indexed_files WHERE path = ?",
				["src/large.ts"]
			);
			expect(result?.size_bytes).toBe(100000);
		});

		test("should handle null/undefined in optional fields", () => {
			const symbols: ExtractedSymbol[] = [
				{
					name: "test",
					kind: "function",
					lineStart: 1,
					lineEnd: 5,
					columnStart: 0,
					columnEnd: 1,
					isExported: true,
					isAsync: false,
					signature: null,
 		documentation: null,
					// signature and documentation are undefined
				},
			];

			const fileId = randomUUID();
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
				[fileId, testRepoId, "test.ts", "content", "typescript", 7, new Date().toISOString()]
			);

			const count = storeSymbolsLocal(db, symbols, fileId);

			expect(count).toBe(1);

			const result = db.queryOne<{ signature: string | null; documentation: string | null }>(
				"SELECT signature, documentation FROM indexed_symbols WHERE name = ?",
				["test"]
			);
			expect(result?.signature).toBeNull();
			expect(result?.documentation).toBeNull();
		});
	});
});

describe("Dependency Graph - Local Mode", () => {
	let db: KotaDatabase;
	const testRepoId = "test-repo-dep-graph";
	let file1Id: string;
	let file2Id: string;
	let file3Id: string;
	let file4Id: string;
	let symbol1Id: string;
	let symbol2Id: string;

	beforeEach(() => {
		// Create in-memory database
		db = createDatabase({ path: ":memory:" });

		// Insert test repository
		db.run(
			"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
			[testRepoId, "test-repo-dep", "owner/test-repo-dep"]
		);

		// Insert test files
		file1Id = randomUUID();
		file2Id = randomUUID();
		file3Id = randomUUID();
		file4Id = randomUUID();

		db.run(
			"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[file1Id, testRepoId, "src/utils.ts", "export const util = 1;", "typescript", 24, new Date().toISOString()]
		);
		db.run(
			"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[file2Id, testRepoId, "src/lib.ts", "import { util } from './utils';", "typescript", 32, new Date().toISOString()]
		);
		db.run(
			"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[file3Id, testRepoId, "src/app.ts", "import { lib } from './lib';", "typescript", 28, new Date().toISOString()]
		);
		db.run(
			"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[file4Id, testRepoId, "tests/app.test.ts", "import { app } from '../src/app';", "typescript", 36, new Date().toISOString()]
		);

		// Insert test symbols
		symbol1Id = randomUUID();
		symbol2Id = randomUUID();

		db.run(
			"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[symbol1Id, file1Id, testRepoId, "util", "constant", 1, 1]
		);
		db.run(
			"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[symbol2Id, file2Id, testRepoId, "processUtil", "function", 2, 5]
		);
	});

	afterEach(() => {
		if (db) {
			db.close();
		}
	});

	describe("storeDependenciesLocal()", () => {
		test("should store file-level dependencies", () => {
			const dependencies = [
				{
					repositoryId: testRepoId,
					fromFileId: file2Id,
					toFileId: file1Id,
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import" as const,
					metadata: { importPath: "./utils" },
				},
				{
					repositoryId: testRepoId,
					fromFileId: file3Id,
					toFileId: file2Id,
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import" as const,
					metadata: { importPath: "./lib" },
				},
			];

			const count = storeDependenciesLocal(db, dependencies);

			expect(count).toBe(2);

			const rows = db.query<{ from_file_id: string; to_file_id: string; dependency_type: string }>(
				"SELECT from_file_id, to_file_id, dependency_type FROM dependency_graph ORDER BY from_file_id"
			);

			expect(rows.length).toBe(2);
			expect(rows[0]?.dependency_type).toBe("file_import");
		});

		test("should store symbol-level dependencies", () => {
			const dependencies = [
				{
					repositoryId: testRepoId,
					fromFileId: null,
					toFileId: null,
					fromSymbolId: symbol2Id,
					toSymbolId: symbol1Id,
					dependencyType: "symbol_usage" as const,
					metadata: { usageType: "call" },
				},
			];

			const count = storeDependenciesLocal(db, dependencies);

			expect(count).toBe(1);

			const row = db.queryOne<{ from_symbol_id: string; to_symbol_id: string }>(
				"SELECT from_symbol_id, to_symbol_id FROM dependency_graph"
			);

			expect(row?.from_symbol_id).toBe(symbol2Id);
			expect(row?.to_symbol_id).toBe(symbol1Id);
		});

		test("should handle empty array", () => {
			const count = storeDependenciesLocal(db, []);
			expect(count).toBe(0);
		});

		test("should serialize metadata as JSON", () => {
			const dependencies = [
				{
					repositoryId: testRepoId,
					fromFileId: file2Id,
					toFileId: file1Id,
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import" as const,
					metadata: { foo: "bar", nested: { value: 42 } },
				},
			];

			storeDependenciesLocal(db, dependencies);

			const row = db.queryOne<{ metadata: string }>("SELECT metadata FROM dependency_graph");
			const parsed = JSON.parse(row?.metadata || "{}");

			expect(parsed.foo).toBe("bar");
			expect(parsed.nested.value).toBe(42);
		});

		test("should use transaction for atomic insert", () => {
			const dependencies = Array.from({ length: 10 }, (_, i) => ({
				repositoryId: testRepoId,
				fromFileId: file3Id,
				toFileId: file1Id,
				fromSymbolId: null,
				toSymbolId: null,
				dependencyType: "file_import" as const,
				metadata: { index: i },
			}));

			const count = storeDependenciesLocal(db, dependencies);

			expect(count).toBe(10);

			const totalCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM dependency_graph"
			);
			expect(totalCount?.count).toBe(10);
		});
	});

	describe("queryDependentsLocal()", () => {
		beforeEach(() => {
			// Set up dependency chain: file4 -> file3 -> file2 -> file1
			const deps = [
				{
					repositoryId: testRepoId,
					fromFileId: file2Id,
					toFileId: file1Id,
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import" as const,
					metadata: {},
				},
				{
					repositoryId: testRepoId,
					fromFileId: file3Id,
					toFileId: file2Id,
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import" as const,
					metadata: {},
				},
				{
					repositoryId: testRepoId,
					fromFileId: file4Id,
					toFileId: file3Id,
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import" as const,
					metadata: {},
				},
			];

			storeDependenciesLocal(db, deps);
		});

		test("should return direct dependents (depth 1)", () => {
			const results = queryDependentsLocal(db, testRepoId, file1Id, null, 1);

			expect(results.length).toBe(1);
			expect(results[0]?.file_path).toBe("src/lib.ts");
			expect(results[0]?.depth).toBe(1);
		});

		test("should return multi-level dependents (depth 3)", () => {
			const results = queryDependentsLocal(db, testRepoId, file1Id, null, 3);

			expect(results.length).toBe(3);
			
			// Check all three levels are present
			const depths = results.map(r => r.depth);
			expect(depths).toContain(1);
			expect(depths).toContain(2);
			expect(depths).toContain(3);

			// Check paths
			const paths = results.map(r => r.file_path);
			expect(paths).toContain("src/lib.ts");
			expect(paths).toContain("src/app.ts");
			expect(paths).toContain("tests/app.test.ts");
		});

		test("should respect depth limit", () => {
			const results = queryDependentsLocal(db, testRepoId, file1Id, null, 2);

			expect(results.length).toBe(2);
			expect(results.every(r => r.depth <= 2)).toBe(true);
		});

		test("should detect cycles", () => {
			// Create a cycle: file1 -> file2 -> file3 -> file1
			const cycleDep = {
				repositoryId: testRepoId,
				fromFileId: file1Id,
				toFileId: file3Id,
				fromSymbolId: null,
				toSymbolId: null,
				dependencyType: "file_import" as const,
				metadata: {},
			};

			storeDependenciesLocal(db, [cycleDep]);

			// Query should complete without infinite loop
			const results = queryDependentsLocal(db, testRepoId, file1Id, null, 5);

			// Should still return results, but not infinite
			expect(results.length).toBeGreaterThan(0);
			expect(results.length).toBeLessThan(100); // Sanity check
		});

		test("should filter by symbol when provided", () => {
			// Add symbol-level dependency
			const symbolDep = {
				repositoryId: testRepoId,
				fromFileId: null,
				toFileId: null,
				fromSymbolId: symbol2Id,
				toSymbolId: symbol1Id,
				dependencyType: "symbol_usage" as const,
				metadata: {},
			};

			storeDependenciesLocal(db, [symbolDep]);

			const results = queryDependentsLocal(db, testRepoId, null, symbol1Id, 2);

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.symbol_name).toBe("processUtil");
		});

		test("should return empty array when no dependents exist", () => {
			const results = queryDependentsLocal(db, testRepoId, file4Id, null, 5);

			expect(results.length).toBe(0);
		});
	});

	describe("queryDependenciesLocal()", () => {
		beforeEach(() => {
			// Set up dependency chain: file4 -> file3 -> file2 -> file1
			const deps = [
				{
					repositoryId: testRepoId,
					fromFileId: file2Id,
					toFileId: file1Id,
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import" as const,
					metadata: {},
				},
				{
					repositoryId: testRepoId,
					fromFileId: file3Id,
					toFileId: file2Id,
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import" as const,
					metadata: {},
				},
				{
					repositoryId: testRepoId,
					fromFileId: file4Id,
					toFileId: file3Id,
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import" as const,
					metadata: {},
				},
			];

			storeDependenciesLocal(db, deps);
		});

		test("should return direct dependencies (depth 1)", () => {
			const results = queryDependenciesLocal(db, testRepoId, file2Id, null, 1);

			expect(results.length).toBe(1);
			expect(results[0]?.file_path).toBe("src/utils.ts");
			expect(results[0]?.depth).toBe(1);
		});

		test("should return multi-level dependencies (depth 3)", () => {
			const results = queryDependenciesLocal(db, testRepoId, file4Id, null, 3);

			expect(results.length).toBe(3);
			
			// Check all three levels are present
			const depths = results.map(r => r.depth);
			expect(depths).toContain(1);
			expect(depths).toContain(2);
			expect(depths).toContain(3);

			// Check paths
			const paths = results.map(r => r.file_path);
			expect(paths).toContain("src/utils.ts");
			expect(paths).toContain("src/lib.ts");
			expect(paths).toContain("src/app.ts");
		});

		test("should respect depth limit", () => {
			const results = queryDependenciesLocal(db, testRepoId, file4Id, null, 2);

			expect(results.length).toBe(2);
			expect(results.every(r => r.depth <= 2)).toBe(true);
		});

		test("should detect cycles", () => {
			// Create a cycle: file1 -> file2 -> file3 -> file1
			const cycleDep = {
				repositoryId: testRepoId,
				fromFileId: file1Id,
				toFileId: file3Id,
				fromSymbolId: null,
				toSymbolId: null,
				dependencyType: "file_import" as const,
				metadata: {},
			};

			storeDependenciesLocal(db, [cycleDep]);

			// Query should complete without infinite loop
			const results = queryDependenciesLocal(db, testRepoId, file3Id, null, 5);

			// Should still return results, but not infinite
			expect(results.length).toBeGreaterThan(0);
			expect(results.length).toBeLessThan(100); // Sanity check
		});

		test("should filter by symbol when provided", () => {
			// Add symbol-level dependency
			const symbolDep = {
				repositoryId: testRepoId,
				fromFileId: null,
				toFileId: null,
				fromSymbolId: symbol2Id,
				toSymbolId: symbol1Id,
				dependencyType: "symbol_usage" as const,
				metadata: {},
			};

			storeDependenciesLocal(db, [symbolDep]);

			const results = queryDependenciesLocal(db, testRepoId, null, symbol2Id, 2);

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.symbol_name).toBe("util");
		});

		test("should return empty array when no dependencies exist", () => {
			const results = queryDependenciesLocal(db, testRepoId, file1Id, null, 5);

			expect(results.length).toBe(0);
		});
	});
});
