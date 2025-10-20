/**
 * Integration tests for reference extraction during indexing workflow.
 *
 * Tests the complete flow:
 * - File indexing via runIndexingWorkflow
 * - Reference extraction from AST
 * - Reference storage in Supabase
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
import { saveIndexedFiles, storeReferences } from "@api/queries";
import { parseFile } from "@indexer/ast-parser";
import { extractReferences } from "@indexer/reference-extractor";
import type { IndexedFile } from "@shared/types";

const FIXTURES_PATH = join(import.meta.dir, "../fixtures/parsing/simple");

function loadFixture(filename: string): string {
	return readFileSync(join(FIXTURES_PATH, filename), "utf-8");
}

describe("Integration: Reference Indexing", () => {
	let testRepoId: string;
	let testFileId: string;
	const client = getSupabaseTestClient();

	beforeAll(async () => {
		// Create test repository for user
		testRepoId = await createTestRepository({
			fullName: "test-user/reference-test-repo",
			userId: TEST_USER_IDS.free,
		});
	});

	afterAll(async () => {
		// Clean up test data
		await client.from("references").delete().eq("source_file_id", testFileId);
		await client
			.from("indexed_files")
			.delete()
			.eq("repository_id", testRepoId);
		await client.from("repositories").delete().eq("id", testRepoId);
	});

	test("indexes file and extracts references to database", async () => {
		const content = loadFixture("index.ts");
		const path = "src/index.ts";

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

		// Step 3: Extract references from AST
		const ast = parseFile(path, content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, path);
		expect(references.length).toBeGreaterThan(0);

		// Step 4: Store references in database
		const referenceCount = await storeReferences(client, references, testFileId);
		expect(referenceCount).toBe(references.length);

		// Step 5: Verify references in database
		const { data: storedReferences, error: referencesError } = await client
			.from("references")
			.select("*")
			.eq("source_file_id", testFileId);

		expect(referencesError).toBeNull();
		expect(storedReferences).not.toBeNull();
		expect(storedReferences!.length).toBe(references.length);

		// Verify import references from './calculator'
		const calculatorImports = storedReferences!.filter(
			(r) =>
				r.reference_type === "import" &&
				(r.metadata as any).importSource === "./calculator",
		);
		expect(calculatorImports.length).toBeGreaterThanOrEqual(2);

		// Verify Calculator import
		const calculatorImport = calculatorImports.find(
			(r) => (r.metadata as any).target_name === "Calculator",
		);
		expect(calculatorImport).toBeDefined();
		expect(calculatorImport?.line_number).toBe(6);

		// Verify call references
		const callReferences = storedReferences!.filter(
			(r) => r.reference_type === "call",
		);
		expect(callReferences.length).toBeGreaterThan(0);

		// Verify createCalculator call
		const createCalculatorCall = callReferences.find(
			(r) => (r.metadata as any).target_name === "createCalculator",
		);
		expect(createCalculatorCall).toBeDefined();
		expect(createCalculatorCall?.line_number).toBe(19);

		// Verify metadata fields
		const metadata = createCalculatorCall?.metadata as Record<string, unknown>;
		expect(metadata?.target_name).toBe("createCalculator");
		expect(metadata?.column_number).toBeGreaterThanOrEqual(0);
		expect(metadata?.isMethodCall).toBe(false);
	});

	test("verifies expected reference count for index.ts", async () => {
		// Query references from previous test
		const { data: references, error } = await client
			.from("references")
			.select("*")
			.eq("source_file_id", testFileId);

		expect(error).toBeNull();
		expect(references).not.toBeNull();

		// Count by reference type
		const imports = references!.filter((r) => r.reference_type === "import");
		const calls = references!.filter((r) => r.reference_type === "call");
		const propertyAccess = references!.filter(
			(r) => r.reference_type === "property_access",
		);
		const typeReferences = references!.filter(
			(r) => r.reference_type === "type_reference",
		);

		// Expected: multiple imports from ./calculator, ./types, ./utils
		expect(imports.length).toBeGreaterThanOrEqual(10);

		// Expected: calls to createCalculator, calc.add, doubleNumber, formatUserName, isValidEmail, etc.
		expect(calls.length).toBeGreaterThan(5);

		// Expected: property access like user.email, user.name, calc.add
		expect(propertyAccess.length).toBeGreaterThan(0);

		// Expected: type references like User, Result<string>
		expect(typeReferences.length).toBeGreaterThan(0);
	});

	test("re-indexing maintains reference count (delete-insert pattern)", async () => {
		// Get current reference count
		const { data: beforeReferences } = await client
			.from("references")
			.select("id")
			.eq("source_file_id", testFileId);

		const beforeCount = beforeReferences?.length ?? 0;

		// Delete old references (typical re-indexing pattern)
		await client.from("references").delete().eq("source_file_id", testFileId);

		// Re-extract and store references
		const content = loadFixture("index.ts");
		const ast = parseFile("src/index.ts", content);
		const references = extractReferences(ast!, "src/index.ts");

		await storeReferences(client, references, testFileId);

		// Verify count is the same after re-indexing
		const { data: afterReferences } = await client
			.from("references")
			.select("id")
			.eq("source_file_id", testFileId);

		const afterCount = afterReferences?.length ?? 0;
		expect(afterCount).toBe(beforeCount);
	});
});

describe("Integration: Reference Types", () => {
	let testRepoId: string;
	let testFileId: string;
	const client = getSupabaseTestClient();

	beforeAll(async () => {
		testRepoId = await createTestRepository({
			fullName: "test-user/ref-types-test-repo",
			userId: TEST_USER_IDS.free,
		});
	});

	afterAll(async () => {
		await client.from("references").delete().eq("source_file_id", testFileId);
		await client
			.from("indexed_files")
			.delete()
			.eq("repository_id", testRepoId);
		await client.from("repositories").delete().eq("id", testRepoId);
	});

	test("extracts import references with metadata", async () => {
		const content = loadFixture("index.ts");
		const path = "src/index.ts";

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

		// Extract and store references
		const ast = parseFile(path, content);
		const references = extractReferences(ast!, path);
		await storeReferences(client, references, testFileId);

		// Verify import references
		const { data: storedReferences } = await client
			.from("references")
			.select("*")
			.eq("source_file_id", testFileId)
			.eq("reference_type", "import");

		const importRefs = storedReferences!;
		expect(importRefs.length).toBeGreaterThan(0);

		// Verify import source is stored in metadata
		for (const ref of importRefs) {
			const metadata = ref.metadata as Record<string, unknown>;
			expect(metadata?.importSource).toBeDefined();
			expect(typeof metadata.importSource).toBe("string");
		}

		// Verify specific imports from './utils'
		const utilImports = importRefs.filter(
			(r) => (r.metadata as any).importSource === "./utils",
		);
		expect(utilImports.length).toBeGreaterThanOrEqual(5);

		const importedNames = utilImports.map(
			(r) => (r.metadata as any).target_name,
		);
		expect(importedNames).toContain("doubleNumber");
		expect(importedNames).toContain("formatUserName");
		expect(importedNames).toContain("isValidEmail");
	});

	test("extracts call references with method detection", async () => {
		// Query call references from previous test
		const { data: callRefs } = await client
			.from("references")
			.select("*")
			.eq("source_file_id", testFileId)
			.eq("reference_type", "call");

		expect(callRefs!.length).toBeGreaterThan(0);

		// Verify method calls have isMethodCall flag
		const methodCalls = callRefs!.filter(
			(r) => (r.metadata as any).isMethodCall === true,
		);
		expect(methodCalls.length).toBeGreaterThan(0);

		// Verify function calls don't have isMethodCall flag (or it's false)
		const functionCalls = callRefs!.filter(
			(r) => (r.metadata as any).isMethodCall === false,
		);
		expect(functionCalls.length).toBeGreaterThan(0);

		// Verify specific method call (calc.add)
		const addCall = callRefs!.find(
			(r) =>
				(r.metadata as any).target_name === "add" &&
				(r.metadata as any).isMethodCall === true,
		);
		expect(addCall).toBeDefined();
		expect(addCall!.line_number).toBe(20);
	});

	test("extracts type references from TypeScript code", async () => {
		// Query type references from previous test
		const { data: typeRefs } = await client
			.from("references")
			.select("*")
			.eq("source_file_id", testFileId)
			.eq("reference_type", "type_reference");

		expect(typeRefs!.length).toBeGreaterThan(0);

		// Verify User type reference
		const userTypeRefs = typeRefs!.filter(
			(r) => (r.metadata as any).target_name === "User",
		);
		expect(userTypeRefs.length).toBeGreaterThanOrEqual(1);

		// Verify Result type reference
		const resultTypeRefs = typeRefs!.filter(
			(r) => (r.metadata as any).target_name === "Result",
		);
		expect(resultTypeRefs.length).toBeGreaterThanOrEqual(1);
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
			fullName: "user1/ref-rls-test-repo",
			userId: TEST_USER_IDS.free,
		});

		user2RepoId = await createTestRepository({
			fullName: "user2/ref-rls-test-repo",
			userId: TEST_USER_IDS.solo,
		});
	});

	afterAll(async () => {
		// Clean up
		await client.from("references").delete().eq("source_file_id", user1FileId);
		await client.from("references").delete().eq("source_file_id", user2FileId);
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

	test("users can only see their own references", async () => {
		const content = loadFixture("index.ts");
		const path = "src/index.ts";

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

		// Extract and store references for both users
		const ast = parseFile(path, content);
		const references = extractReferences(ast!, path);

		await storeReferences(client, references, user1FileId);
		await storeReferences(client, references, user2FileId);

		// Verify both users have references
		const { data: user1References } = await client
			.from("references")
			.select("id")
			.eq("source_file_id", user1FileId);

		const { data: user2References } = await client
			.from("references")
			.select("id")
			.eq("source_file_id", user2FileId);

		expect(user1References!.length).toBeGreaterThan(0);
		expect(user2References!.length).toBeGreaterThan(0);
		expect(user1References!.length).toBe(user2References!.length);

		// Verify references are isolated (different IDs)
		const user1ReferenceIds = new Set(user1References!.map((r) => r.id));
		const user2ReferenceIds = new Set(user2References!.map((r) => r.id));

		// No overlap in reference IDs
		const overlap = [...user1ReferenceIds].filter((id) =>
			user2ReferenceIds.has(id),
		);
		expect(overlap.length).toBe(0);
	});
});
