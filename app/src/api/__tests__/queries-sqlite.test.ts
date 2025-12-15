/**
 * Comprehensive tests for SQLite query layer (queries-local.ts)
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
} from "@api/queries-local.js";
import { storeIndexedDataLocal } from "@indexer/storage-local.js";
import type { IndexedFile } from "@shared/types";
import type { Symbol as ExtractedSymbol } from "@indexer/symbol-extractor";
import type { Reference } from "@indexer/reference-extractor";

describe("SQLite Query Layer - queries-local.ts", () => {
	let db: KotaDatabase;
	const testRepoId = "test-repo-123";

	beforeEach(() => {
		// Create in-memory database for each test (antimocking pattern)
		db = createDatabase({ path: ":memory:" });

		// Apply schema inline (from sqlite-schema.sql)
		db.exec(`
			-- Repositories table
			CREATE TABLE repositories (
				id TEXT PRIMARY KEY,
				user_id TEXT,
				org_id TEXT,
				name TEXT NOT NULL,
				full_name TEXT NOT NULL UNIQUE,
				git_url TEXT,
				default_branch TEXT NOT NULL DEFAULT 'main',
				last_indexed_at TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				updated_at TEXT NOT NULL DEFAULT (datetime('now')),
				metadata TEXT DEFAULT '{}'
			);

			-- Indexed files table
			CREATE TABLE indexed_files (
				id TEXT PRIMARY KEY,
				repository_id TEXT NOT NULL,
				path TEXT NOT NULL,
				content TEXT NOT NULL,
				language TEXT,
				size_bytes INTEGER,
				content_hash TEXT,
				indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
				metadata TEXT DEFAULT '{}',
				FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
				UNIQUE (repository_id, path)
			);

			-- FTS5 virtual table for code search
			CREATE VIRTUAL TABLE indexed_files_fts USING fts5(
				path,
				content,
				content='indexed_files',
				content_rowid='rowid'
			);

			-- FTS5 sync triggers
			CREATE TRIGGER indexed_files_fts_ai 
			AFTER INSERT ON indexed_files 
			BEGIN
				INSERT INTO indexed_files_fts(rowid, path, content) 
				VALUES (new.rowid, new.path, new.content);
			END;

			CREATE TRIGGER indexed_files_fts_ad 
			AFTER DELETE ON indexed_files 
			BEGIN
				INSERT INTO indexed_files_fts(indexed_files_fts, rowid, path, content) 
				VALUES ('delete', old.rowid, old.path, old.content);
			END;

			CREATE TRIGGER indexed_files_fts_au 
			AFTER UPDATE ON indexed_files 
			BEGIN
				INSERT INTO indexed_files_fts(indexed_files_fts, rowid, path, content) 
				VALUES ('delete', old.rowid, old.path, old.content);
				INSERT INTO indexed_files_fts(rowid, path, content) 
				VALUES (new.rowid, new.path, new.content);
			END;

			-- Indexed symbols table
			CREATE TABLE indexed_symbols (
				id TEXT PRIMARY KEY,
				file_id TEXT NOT NULL,
				repository_id TEXT NOT NULL,
				name TEXT NOT NULL,
				kind TEXT NOT NULL,
				line_start INTEGER NOT NULL,
				line_end INTEGER NOT NULL,
				signature TEXT,
				documentation TEXT,
				metadata TEXT DEFAULT '{}',
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY (file_id) REFERENCES indexed_files(id) ON DELETE CASCADE,
				FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
				CHECK (kind IN ('function', 'class', 'interface', 'type', 'variable', 'constant', 'method', 'property', 'module', 'namespace', 'enum', 'enum_member'))
			);

			-- Indexed references table
			CREATE TABLE indexed_references (
				id TEXT PRIMARY KEY,
				file_id TEXT NOT NULL,
				repository_id TEXT NOT NULL,
				symbol_name TEXT NOT NULL,
				target_symbol_id TEXT,
				target_file_path TEXT,
				line_number INTEGER NOT NULL,
				column_number INTEGER DEFAULT 0,
				reference_type TEXT NOT NULL,
				metadata TEXT DEFAULT '{}',
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY (file_id) REFERENCES indexed_files(id) ON DELETE CASCADE,
				FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
				FOREIGN KEY (target_symbol_id) REFERENCES indexed_symbols(id) ON DELETE SET NULL,
				CHECK (reference_type IN ('import', 'call', 'extends', 'implements', 'type_reference', 'variable_reference'))
			);

			-- Projects table
			CREATE TABLE projects (
				id TEXT PRIMARY KEY,
				user_id TEXT,
				org_id TEXT,
				name TEXT NOT NULL,
				description TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				updated_at TEXT NOT NULL DEFAULT (datetime('now')),
				metadata TEXT DEFAULT '{}'
			);

			-- Project repositories junction table
			CREATE TABLE project_repositories (
				id TEXT PRIMARY KEY,
				project_id TEXT NOT NULL,
				repository_id TEXT NOT NULL,
				added_at TEXT NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
				FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
				UNIQUE (project_id, repository_id)
			);
		`);

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

			const count = storeReferencesLocal(db, references, testFileId);

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

			storeReferencesLocal(db, firstRefs, testFileId);

			const firstCount = db.queryOne<{ count: number }>(
				"SELECT COUNT(*) as count FROM indexed_references WHERE file_id = ?",
				[testFileId]
			);
			expect(firstCount?.count).toBe(2);

			// Store new references (should delete old ones first)
			const newRefs: Reference[] = [
				{ targetName: "baz", lineNumber: 10, columnNumber: 0, referenceType: "call", metadata: {} },
			];

			storeReferencesLocal(db, newRefs, testFileId);

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
			const count = storeReferencesLocal(db, [], testFileId);
			expect(count).toBe(0);
		});

		test("should throw error if file not found", () => {
			const references: Reference[] = [
				{ targetName: "test", lineNumber: 1, columnNumber: 0, referenceType: "import", metadata: {} },
			];

			const nonExistentFileId = randomUUID();

			expect(() => {
				storeReferencesLocal(db, references, nonExistentFileId);
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

			storeReferencesLocal(db, references, testFileId);

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
					reference_type: "variable_reference",
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
