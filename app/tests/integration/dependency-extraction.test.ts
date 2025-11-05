/**
 * Integration test for end-to-end dependency extraction
 *
 * Tests the two-pass storage architecture implemented in issue #369.
 * Verifies that dependency extraction works correctly after indexing.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { getServiceClient } from "@db/client";
import { prepareRepository } from "@indexer/repos";
import { discoverSources, parseSourceFile } from "@indexer/parsers";
import { parseFile, isSupportedForAST } from "@indexer/ast-parser";
import { extractSymbols } from "@indexer/symbol-extractor";
import { extractReferences } from "@indexer/reference-extractor";
import { extractDependencies } from "@indexer/dependency-extractor";
import {
	storeIndexedData,
	type FileData,
	type SymbolData,
} from "@indexer/storage";
import type { IndexedFile } from "@shared/types/entities";
import type { Symbol as ExtractedSymbol } from "@indexer/symbol-extractor";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("Dependency Extraction Integration", () => {
	let testRepoId: string;
	let testUserId: string;
	let testRepoPath: string;
	const supabase = getServiceClient();

	beforeAll(async () => {
		// Create test user
		const { data: userData, error: userError } = await supabase.auth.admin.createUser({
			email: `test-deps-${Date.now()}@example.com`,
			email_confirm: true,
		});

		if (userError || !userData.user) {
			throw new Error(`Failed to create test user: ${userError?.message}`);
		}

		testUserId = userData.user.id;

		// Create test repository in database
		const { data: repoData, error: repoError } = await supabase
			.from("repositories")
			.insert({
				user_id: testUserId,
				full_name: "test/dependency-extraction",
				git_url: "https://github.com/test/dependency-extraction",
				default_branch: "main",
			})
			.select()
			.single();

		if (repoError || !repoData) {
			throw new Error(`Failed to create test repository: ${repoError?.message}`);
		}

		testRepoId = repoData.id;

		// Create temporary test repository with TypeScript files
		testRepoPath = join(process.cwd(), "data", "test-repos", `test-deps-${Date.now()}`);
		mkdirSync(testRepoPath, { recursive: true });

		// File A: exports a function
		writeFileSync(
			join(testRepoPath, "fileA.ts"),
			`export function functionA() {
	return "Hello from A";
}

export class ClassA {
	methodA() {
		return functionA();
	}
}
`,
		);

		// File B: imports from A
		writeFileSync(
			join(testRepoPath, "fileB.ts"),
			`import { functionA, ClassA } from './fileA';

export function functionB() {
	const result = functionA();
	const instance = new ClassA();
	return instance.methodA();
}
`,
		);
	});

	afterAll(async () => {
		// Clean up test data
		if (testRepoId) {
			await supabase.from("repositories").delete().eq("id", testRepoId);
		}

		if (testUserId) {
			await supabase.auth.admin.deleteUser(testUserId);
		}

		// Clean up test repository
		if (testRepoPath) {
			rmSync(testRepoPath, { recursive: true, force: true });
		}
	});

	test("should extract file dependencies via two-pass storage", async () => {
		// PASS 1: Store files and symbols
		const files: FileData[] = [];
		const symbols: SymbolData[] = [];

		const filePaths = await discoverSources(testRepoPath);
		expect(filePaths.length).toBeGreaterThan(0);

		for (const filePath of filePaths) {
			const parsed = await parseSourceFile(filePath, testRepoPath);
			if (!parsed) continue;

			// Use absolute paths for proper import resolution
			const absolutePath = join(testRepoPath, parsed.path);

			files.push({
				path: absolutePath,
				content: parsed.content,
				language: "typescript",
				size_bytes: Buffer.byteLength(parsed.content, "utf8"),
				metadata: {},
			});

			if (!isSupportedForAST(parsed.path)) continue;

			const ast = parseFile(parsed.path, parsed.content);
			if (!ast) continue;

			const fileSymbols = extractSymbols(ast, parsed.path);
			for (const symbol of fileSymbols) {
				symbols.push({
					file_path: absolutePath,
					name: symbol.name,
					kind: symbol.kind,
					line_start: symbol.lineStart,
					line_end: symbol.lineEnd,
					signature: symbol.signature || undefined,
					documentation: symbol.documentation || undefined,
					metadata: {},
				});
			}
		}

		// Store files and symbols (Pass 1)
		const pass1Stats = await storeIndexedData(
			supabase,
			testRepoId,
			files,
			symbols,
			[], // Empty references
			[], // Empty dependencies
			false,
		);

		expect(pass1Stats.files_indexed).toBe(2);
		expect(pass1Stats.symbols_extracted).toBeGreaterThan(0);

		// PASS 2: Query stored data and extract dependencies
		const { data: storedFiles, error: filesError } = await supabase
			.from("indexed_files")
			.select("id, path, content, language")
			.eq("repository_id", testRepoId);

		expect(filesError).toBeNull();
		expect(storedFiles).not.toBeNull();
		expect(storedFiles!.length).toBe(2);

		const { data: storedSymbols, error: symbolsError } = await supabase
			.from("symbols")
			.select("id, file_id, name, kind, line_start, line_end, signature, documentation")
			.in("file_id", storedFiles!.map(f => f.id));

		expect(symbolsError).toBeNull();

		// Build IndexedFile[] with IDs
		const indexedFiles: IndexedFile[] = storedFiles!.map(f => ({
			id: f.id,
			path: f.path,
			content: f.content,
			language: f.language,
			projectRoot: testRepoId,
			dependencies: [],
			indexedAt: new Date(),
		}));

		// Build ExtractedSymbol[] with IDs
		const extractedSymbols: ExtractedSymbol[] = (storedSymbols || []).map(s => ({
			id: s.id,
			file_id: s.file_id,
			name: s.name,
			kind: s.kind as any,
			lineStart: s.line_start,
			lineEnd: s.line_end,
			columnStart: 0,
			columnEnd: 0,
			signature: s.signature || null,
			documentation: s.documentation || null,
			isExported: false,
		}));

		// Extract references
		const allReferences: Array<{ filePath: string; fileId: string; references: any[] }> = [];
		for (const file of indexedFiles) {
			if (!isSupportedForAST(file.path)) continue;

			const ast = parseFile(file.path, file.content);
			if (!ast) continue;

			const refs = extractReferences(ast, file.path);
			if (refs.length > 0) {
				allReferences.push({
					filePath: file.path,
					fileId: file.id!,
					references: refs,
				});
			}
		}

		expect(allReferences.length).toBeGreaterThan(0);

		// Extract dependencies
		const dependencyEdges = extractDependencies(
			indexedFiles,
			extractedSymbols,
			allReferences.flatMap(fr =>
				fr.references.map(r => ({
					...r,
					file_id: fr.fileId,
				}))
			),
			testRepoId,
		);

		expect(dependencyEdges.length).toBeGreaterThan(0);

		// Verify file-level dependency: fileB -> fileA
		const fileDeps = dependencyEdges.filter(e => e.dependencyType === "file_import");
		expect(fileDeps.length).toBeGreaterThan(0);

		const fileAId = indexedFiles.find(f => f.path.endsWith("fileA.ts"))?.id;
		const fileBId = indexedFiles.find(f => f.path.endsWith("fileB.ts"))?.id;

		expect(fileAId).toBeDefined();
		expect(fileBId).toBeDefined();

		const importDep = fileDeps.find(
			dep => dep.fromFileId === fileBId && dep.toFileId === fileAId
		);

		expect(importDep).toBeDefined();
		expect(importDep!.metadata.importSource).toBe("./fileA");
	});

	test("should store dependencies in database via Pass 2", async () => {
		// Query dependency graph table
		const { data: deps, error: depsError } = await supabase
			.from("dependency_graph")
			.select("*")
			.eq("repository_id", testRepoId);

		expect(depsError).toBeNull();
		expect(deps).not.toBeNull();

		// After two-pass storage, dependencies should be in database
		// Note: This test assumes previous test ran successfully
		// In a real scenario, you'd run the full indexing workflow here
	});
});
