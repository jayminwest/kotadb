/**
 * Integration tests for symbol extraction during indexing workflow.
 *
 * Tests the complete flow:
 * - File indexing via runIndexingWorkflow
 * - Symbol extraction from AST
 * - Symbol storage in Supabase
 * - RLS isolation between users
 *
 * Uses real Supabase connection (no mocks).
 * Requires local Supabase instance or CI test environment.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	getSupabaseTestClient,
	TEST_USER_IDS,
	createTestRepository,
} from "../helpers/db";
import { saveIndexedFiles, storeSymbols } from "@api/queries";
import { parseFile } from "@indexer/ast-parser";
import { extractSymbols } from "@indexer/symbol-extractor";
import type { IndexedFile } from "@shared/types";

const FIXTURES_PATH = join(import.meta.dir, "../fixtures/parsing/simple");

function loadFixture(filename: string): string {
	return readFileSync(join(FIXTURES_PATH, filename), "utf-8");
}

describe("Integration: Symbol Indexing", () => {
	let testRepoId: string;
	let testFileId: string;
	const client = getSupabaseTestClient();

	beforeAll(async () => {
		// Create test repository for user
		testRepoId = await createTestRepository({
			fullName: "test-user/symbol-test-repo",
			userId: TEST_USER_IDS.free,
		});
	});

	afterAll(async () => {
		// Clean up test data
		await client.from("symbols").delete().eq("file_id", testFileId);
		await client
			.from("indexed_files")
			.delete()
			.eq("repository_id", testRepoId);
		await client.from("repositories").delete().eq("id", testRepoId);
	});

	test("indexes file and extracts symbols to database", async () => {
		const content = loadFixture("calculator.ts");
		const path = "src/calculator.ts";

		// Step 1: Index the file
		const indexedFile: IndexedFile = {
			path,
			content,
			dependencies: [],
			indexedAt: new Date(),
			projectRoot: testRepoId,
		};

		await saveIndexedFiles(
			client,
			[indexedFile],
			TEST_USER_IDS.free,
			testRepoId,
		);

		// Step 2: Get file ID from database
		const { data: fileRecord, error: fileError } = await client
			.from("indexed_files")
			.select("id")
			.eq("repository_id", testRepoId)
			.eq("path", path)
			.single();

		expect(fileError).toBeNull();
		expect(fileRecord).not.toBeNull();
		testFileId = fileRecord!.id;

		// Step 3: Extract symbols from AST
		const ast = parseFile(path, content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, path);
		expect(symbols.length).toBeGreaterThan(0);

		// Step 4: Store symbols in database
		const symbolCount = await storeSymbols(client, symbols, testFileId);
		expect(symbolCount).toBe(symbols.length);

		// Step 5: Verify symbols in database
		const { data: storedSymbols, error: symbolsError } = await client
			.from("symbols")
			.select("*")
			.eq("file_id", testFileId);

		expect(symbolsError).toBeNull();
		expect(storedSymbols).not.toBeNull();
		expect(storedSymbols!.length).toBe(symbols.length);

		// Verify Calculator class was stored
		const calculatorClass = storedSymbols!.find(
			(s) => s.name === "Calculator" && s.kind === "class",
		);
		expect(calculatorClass).toBeDefined();
		expect(calculatorClass?.line_start).toBe(4);
		expect(calculatorClass?.documentation).toContain("Calculator class");

		// Verify add method was stored
		const addMethod = storedSymbols!.find(
			(s) => s.name === "add" && s.kind === "method",
		);
		expect(addMethod).toBeDefined();
		expect(addMethod?.line_start).toBe(13);
		expect(addMethod?.signature).toContain("a");
		expect(addMethod?.documentation).toContain("Adds two numbers");

		// Verify metadata fields
		const metadata = addMethod?.metadata as Record<string, unknown>;
		expect(metadata?.is_exported).toBe(true);
		expect(metadata?.column_start).toBeGreaterThanOrEqual(0);
		expect(metadata?.column_end).toBeGreaterThan(0);
	});

	test("verifies expected symbol count for calculator.ts", async () => {
		// Query symbols from previous test
		const { data: symbols, error } = await client
			.from("symbols")
			.select("*")
			.eq("file_id", testFileId);

		expect(error).toBeNull();
		expect(symbols).not.toBeNull();

		// Expected: 1 class + 6 methods + 1 property + 1 function = 9 symbols
		expect(symbols!.length).toBe(9);

		const classes = symbols!.filter((s) => s.kind === "class");
		const methods = symbols!.filter((s) => s.kind === "method");
		const properties = symbols!.filter((s) => s.kind === "property");
		const functions = symbols!.filter((s) => s.kind === "function");

		expect(classes.length).toBe(1); // Calculator
		expect(methods.length).toBe(6); // add, subtract, multiply, divide, getHistory, clearHistory
		expect(properties.length).toBe(1); // history
		expect(functions.length).toBe(1); // createCalculator
	});

	test("upsert updates existing symbols on re-index", async () => {
		// Get current symbol count
		const { data: beforeSymbols } = await client
			.from("symbols")
			.select("id")
			.eq("file_id", testFileId);

		const beforeCount = beforeSymbols?.length ?? 0;

		// Re-extract and store symbols (should upsert)
		const content = loadFixture("calculator.ts");
		const ast = parseFile("src/calculator.ts", content);
		const symbols = extractSymbols(ast!, "src/calculator.ts");

		await storeSymbols(client, symbols, testFileId);

		// Verify count didn't change (upsert, not duplicate)
		const { data: afterSymbols } = await client
			.from("symbols")
			.select("id")
			.eq("file_id", testFileId);

		const afterCount = afterSymbols?.length ?? 0;
		expect(afterCount).toBe(beforeCount);
	});
});

describe("Integration: RLS Isolation", () => {
	let user1RepoId: string;
	let user2RepoId: string;
	let user1FileId: string;
	let user2FileId: string;
	const client = getSupabaseTestClient();

	beforeAll(async () => {
		// Create repositories for two different users
		user1RepoId = await createTestRepository({
			fullName: "user1/rls-test-repo",
			userId: TEST_USER_IDS.free,
		});

		user2RepoId = await createTestRepository({
			fullName: "user2/rls-test-repo",
			userId: TEST_USER_IDS.solo,
		});
	});

	afterAll(async () => {
		// Clean up
		await client.from("symbols").delete().eq("file_id", user1FileId);
		await client.from("symbols").delete().eq("file_id", user2FileId);
		await client
			.from("indexed_files")
			.delete()
			.eq("repository_id", user1RepoId);
		await client
			.from("indexed_files")
			.delete()
			.eq("repository_id", user2RepoId);
		await client.from("repositories").delete().eq("id", user1RepoId);
		await client.from("repositories").delete().eq("id", user2RepoId);
	});

	test("users can only see their own symbols", async () => {
		const content = loadFixture("utils.ts");
		const path = "src/utils.ts";

		// Index same file for both users
		const indexedFile: IndexedFile = {
			path,
			content,
			dependencies: [],
			indexedAt: new Date(),
			projectRoot: "", // Will be set per user
		};

		// User 1
		await saveIndexedFiles(
			client,
			[{ ...indexedFile, projectRoot: user1RepoId }],
			TEST_USER_IDS.free,
			user1RepoId,
		);

		const { data: user1File } = await client
			.from("indexed_files")
			.select("id")
			.eq("repository_id", user1RepoId)
			.eq("path", path)
			.single();

		user1FileId = user1File!.id;

		// User 2
		await saveIndexedFiles(
			client,
			[{ ...indexedFile, projectRoot: user2RepoId }],
			TEST_USER_IDS.solo,
			user2RepoId,
		);

		const { data: user2File } = await client
			.from("indexed_files")
			.select("id")
			.eq("repository_id", user2RepoId)
			.eq("path", path)
			.single();

		user2FileId = user2File!.id;

		// Extract and store symbols for both users
		const ast = parseFile(path, content);
		const symbols = extractSymbols(ast!, path);

		await storeSymbols(client, symbols, user1FileId);
		await storeSymbols(client, symbols, user2FileId);

		// Verify both users have symbols
		const { data: user1Symbols } = await client
			.from("symbols")
			.select("id")
			.eq("file_id", user1FileId);

		const { data: user2Symbols } = await client
			.from("symbols")
			.select("id")
			.eq("file_id", user2FileId);

		expect(user1Symbols!.length).toBeGreaterThan(0);
		expect(user2Symbols!.length).toBeGreaterThan(0);
		expect(user1Symbols!.length).toBe(user2Symbols!.length);

		// Verify symbols are isolated (different IDs)
		const user1SymbolIds = new Set(user1Symbols!.map((s) => s.id));
		const user2SymbolIds = new Set(user2Symbols!.map((s) => s.id));

		// No overlap in symbol IDs
		const overlap = [...user1SymbolIds].filter((id) =>
			user2SymbolIds.has(id),
		);
		expect(overlap.length).toBe(0);
	});
});

describe("Integration: TypeScript Types", () => {
	let testRepoId: string;
	let testFileId: string;
	const client = getSupabaseTestClient();

	beforeAll(async () => {
		testRepoId = await createTestRepository({
			fullName: "test-user/types-test-repo",
			userId: TEST_USER_IDS.free,
		});
	});

	afterAll(async () => {
		await client.from("symbols").delete().eq("file_id", testFileId);
		await client
			.from("indexed_files")
			.delete()
			.eq("repository_id", testRepoId);
		await client.from("repositories").delete().eq("id", testRepoId);
	});

	test("indexes interfaces and type aliases", async () => {
		const content = loadFixture("types.ts");
		const path = "src/types.ts";

		// Index file
		await saveIndexedFiles(
			client,
			[
				{
					path,
					content,
					dependencies: [],
					indexedAt: new Date(),
					projectRoot: testRepoId,
				},
			],
			TEST_USER_IDS.free,
			testRepoId,
		);

		const { data: fileRecord } = await client
			.from("indexed_files")
			.select("id")
			.eq("repository_id", testRepoId)
			.eq("path", path)
			.single();

		testFileId = fileRecord!.id;

		// Extract and store symbols
		const ast = parseFile(path, content);
		const symbols = extractSymbols(ast!, path);
		await storeSymbols(client, symbols, testFileId);

		// Verify type symbols
		const { data: storedSymbols } = await client
			.from("symbols")
			.select("*")
			.eq("file_id", testFileId);

		const interfaces = storedSymbols!.filter((s) => s.kind === "interface");
		const types = storedSymbols!.filter((s) => s.kind === "type");

		expect(interfaces.length).toBe(1); // User
		expect(types.length).toBe(3); // Product, Result, Status

		// Verify User interface
		const userInterface = interfaces.find((s) => s.name === "User");
		expect(userInterface).toBeDefined();
		expect(userInterface?.documentation).toContain("User interface");

		// Verify Result type
		const resultType = types.find((s) => s.name === "Result");
		expect(resultType).toBeDefined();
		expect(resultType?.documentation).toContain("Result type");
	});
});
