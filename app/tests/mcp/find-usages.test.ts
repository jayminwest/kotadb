/**
 * Tests for find_usages MCP tool
 *
 * Following antimocking philosophy: uses real file-based SQLite databases
 * with proper KOTADB_PATH environment isolation.
 *
 * Test Coverage:
 * - Parameter validation (symbol required, type checking)
 * - Call site usages (import + call references)
 * - Re-export usages
 * - Type reference usages
 * - include_tests filter
 * - include_definitions filter
 * - File disambiguation (same-named symbols in different files)
 * - Symbol not found (graceful empty response)
 * - No usages (symbol exists but no references)
 *
 * @module tests/mcp/find-usages
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { executeFindUsages } from "@mcp/tools.js";
import { closeGlobalConnections, getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { createTempDir, cleanupTempDir, clearTestData } from "../helpers/db.js";

describe("find_usages MCP tool", () => {
	let db: KotaDatabase;
	let tempDir: string;
	let dbPath: string;
	let originalDbPath: string | undefined;
	const requestId = "test-request-1";
	const userId = "test-user-1";

	beforeAll(() => {
		tempDir = createTempDir("mcp-find-usages-test-");
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

	// ========================================================================
	// Helper: seed data using correct schema column names
	// ========================================================================

	function seedRepo(name = "test-repo"): string {
		const repoId = randomUUID();
		db.run(
			"INSERT INTO repositories (id, name, full_name, default_branch) VALUES (?, ?, ?, ?)",
			[repoId, name, `test-owner/${name}`, "main"],
		);
		return repoId;
	}

	function seedFile(repoId: string, path: string, content: string, language = "typescript"): string {
		const fileId = randomUUID();
		db.run(
			"INSERT INTO indexed_files (id, repository_id, path, content, language, indexed_at) VALUES (?, ?, ?, ?, ?, ?)",
			[fileId, repoId, path, content, language, new Date().toISOString()],
		);
		return fileId;
	}

	function seedSymbol(
		fileId: string,
		repoId: string,
		name: string,
		kind: string,
		lineStart: number,
		lineEnd: number,
	): string {
		const symbolId = randomUUID();
		db.run(
			"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
			[symbolId, fileId, repoId, name, kind, lineStart, lineEnd],
		);
		return symbolId;
	}

	function seedReference(
		fileId: string,
		repoId: string,
		symbolName: string,
		targetSymbolId: string | null,
		lineNumber: number,
		columnNumber: number,
		referenceType: string,
	): string {
		const refId = randomUUID();
		db.run(
			"INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_symbol_id, line_number, column_number, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			[refId, fileId, repoId, symbolName, targetSymbolId, lineNumber, columnNumber, referenceType],
		);
		return refId;
	}

	// ========================================================================
	// 1. Parameter Validation
	// ========================================================================

	test("should require symbol parameter", async () => {
		await expect(async () => {
			await executeFindUsages({}, requestId, userId);
		}).toThrow("Missing required parameter: symbol");
	});

	test("should throw error when params is not an object", async () => {
		await expect(async () => {
			await executeFindUsages("invalid", requestId, userId);
		}).toThrow("Parameters must be an object");
	});

	test("should throw error when symbol is not a string", async () => {
		await expect(async () => {
			await executeFindUsages({ symbol: 123 }, requestId, userId);
		}).toThrow("Parameter 'symbol' must be a string");
	});

	// ========================================================================
	// 2. Call Site Usages
	// ========================================================================

	test("should find call site usages", async () => {
		const repoId = seedRepo();

		const fileAContent = [
			"export function processData(input: string): string {",
			"  return input;",
			"}",
		].join("\n");
		const fileBContent = [
			"import { processData } from './utils';",
			'const result = processData("hello");',
		].join("\n");

		const fileAId = seedFile(repoId, "src/utils.ts", fileAContent);
		const fileBId = seedFile(repoId, "src/handler.ts", fileBContent);

		const symbolId = seedSymbol(fileAId, repoId, "processData", "function", 1, 3);

		seedReference(fileBId, repoId, "processData", symbolId, 1, 10, "import");
		seedReference(fileBId, repoId, "processData", symbolId, 2, 16, "call");

		const result = (await executeFindUsages(
			{ symbol: "processData", repository: repoId },
			requestId,
			userId,
		)) as any;

		expect(result.symbol).toBe("processData");
		expect(result.kind).toBe("function");
		expect(result.total_usages).toBeGreaterThanOrEqual(2);

		const usageTypes = result.usages.map((u: any) => u.usage_type);
		expect(usageTypes).toContain("import");
		expect(usageTypes).toContain("call");
	});

	// ========================================================================
	// 3. Re-export Usages
	// ========================================================================

	test("should find re-export usages", async () => {
		const repoId = seedRepo();

		const fileAContent = "export function doWork(): void {}";
		const fileBContent = "export { doWork } from './worker';";

		const fileAId = seedFile(repoId, "src/worker.ts", fileAContent);
		const fileBId = seedFile(repoId, "src/index.ts", fileBContent);

		const symbolId = seedSymbol(fileAId, repoId, "doWork", "function", 1, 1);

		seedReference(fileBId, repoId, "doWork", symbolId, 1, 10, "re_export");

		const result = (await executeFindUsages(
			{ symbol: "doWork", repository: repoId },
			requestId,
			userId,
		)) as any;

		expect(result.symbol).toBe("doWork");
		expect(result.total_usages).toBeGreaterThanOrEqual(1);

		const usageTypes = result.usages.map((u: any) => u.usage_type);
		expect(usageTypes).toContain("re_export");
	});

	// ========================================================================
	// 4. Type Reference Usages
	// ========================================================================

	test("should find type reference usages", async () => {
		const repoId = seedRepo();

		const fileAContent = [
			"export interface UserConfig {",
			"  name: string;",
			"  email: string;",
			"}",
		].join("\n");
		const fileBContent = [
			"import type { UserConfig } from './config';",
			"function setup(config: UserConfig): void {}",
		].join("\n");

		const fileAId = seedFile(repoId, "src/config.ts", fileAContent);
		const fileBId = seedFile(repoId, "src/setup.ts", fileBContent);

		const symbolId = seedSymbol(fileAId, repoId, "UserConfig", "interface", 1, 4);

		seedReference(fileBId, repoId, "UserConfig", symbolId, 1, 15, "import");
		seedReference(fileBId, repoId, "UserConfig", symbolId, 2, 25, "type_reference");

		const result = (await executeFindUsages(
			{ symbol: "UserConfig", repository: repoId },
			requestId,
			userId,
		)) as any;

		expect(result.symbol).toBe("UserConfig");
		expect(result.kind).toBe("interface");
		expect(result.total_usages).toBeGreaterThanOrEqual(2);

		const usageTypes = result.usages.map((u: any) => u.usage_type);
		expect(usageTypes).toContain("import");
		expect(usageTypes).toContain("type_reference");
	});

	// ========================================================================
	// 5. include_tests Filter
	// ========================================================================

	test("should include test file usages by default", async () => {
		const repoId = seedRepo();

		const srcContent = "export function add(a: number, b: number): number { return a + b; }";
		const testContent = [
			"import { add } from '../math';",
			"expect(add(1, 2)).toBe(3);",
		].join("\n");

		const srcFileId = seedFile(repoId, "src/math.ts", srcContent);
		const testFileId = seedFile(repoId, "src/__tests__/math.test.ts", testContent);

		const symbolId = seedSymbol(srcFileId, repoId, "add", "function", 1, 1);

		seedReference(testFileId, repoId, "add", symbolId, 1, 10, "import");
		seedReference(testFileId, repoId, "add", symbolId, 2, 8, "call");

		const result = (await executeFindUsages(
			{ symbol: "add", repository: repoId },
			requestId,
			userId,
		)) as any;

		expect(result.total_usages).toBeGreaterThanOrEqual(2);

		const files = result.usages.map((u: any) => u.file);
		expect(files.some((f: string) => f.includes("test"))).toBe(true);
	});

	test("should exclude test file usages when include_tests is false", async () => {
		const repoId = seedRepo();

		const srcContent = "export function add(a: number, b: number): number { return a + b; }";
		const appContent = [
			"import { add } from './math';",
			"const sum = add(3, 4);",
		].join("\n");
		const testContent = [
			"import { add } from '../math';",
			"expect(add(1, 2)).toBe(3);",
		].join("\n");

		const srcFileId = seedFile(repoId, "src/math.ts", srcContent);
		const appFileId = seedFile(repoId, "src/app.ts", appContent);
		const testFileId = seedFile(repoId, "src/__tests__/math.test.ts", testContent);

		const symbolId = seedSymbol(srcFileId, repoId, "add", "function", 1, 1);

		// Non-test usages
		seedReference(appFileId, repoId, "add", symbolId, 1, 10, "import");
		seedReference(appFileId, repoId, "add", symbolId, 2, 13, "call");

		// Test file usages
		seedReference(testFileId, repoId, "add", symbolId, 1, 10, "import");
		seedReference(testFileId, repoId, "add", symbolId, 2, 8, "call");

		const result = (await executeFindUsages(
			{ symbol: "add", repository: repoId, include_tests: false },
			requestId,
			userId,
		)) as any;

		const files = result.usages.map((u: any) => u.file);
		expect(files.every((f: string) => !f.includes("test") && !f.includes("__tests__"))).toBe(true);
		expect(result.total_usages).toBe(2);
	});

	// ========================================================================
	// 6. include_definitions Filter
	// ========================================================================

	test("should exclude definition location by default", async () => {
		const repoId = seedRepo();

		const fileContent = [
			"export function myFunc(): void {",
			"  // body",
			"}",
		].join("\n");
		const callerContent = "import { myFunc } from './module';\nmyFunc();";

		const defFileId = seedFile(repoId, "src/module.ts", fileContent);
		const callerFileId = seedFile(repoId, "src/caller.ts", callerContent);

		const symbolId = seedSymbol(defFileId, repoId, "myFunc", "function", 1, 3);

		// Reference at the definition site (same file, within symbol line range)
		seedReference(defFileId, repoId, "myFunc", symbolId, 1, 17, "variable_reference");
		// References from another file
		seedReference(callerFileId, repoId, "myFunc", symbolId, 1, 10, "import");
		seedReference(callerFileId, repoId, "myFunc", symbolId, 2, 1, "call");

		const result = (await executeFindUsages(
			{ symbol: "myFunc", repository: repoId },
			requestId,
			userId,
		)) as any;

		// Definition-site reference should be excluded (line 1 in src/module.ts within symbol range 1-3)
		const defSiteUsages = result.usages.filter(
			(u: any) => u.file === "src/module.ts" && u.line >= 1 && u.line <= 3,
		);
		expect(defSiteUsages.length).toBe(0);

		// Caller usages should be present
		const callerUsages = result.usages.filter((u: any) => u.file === "src/caller.ts");
		expect(callerUsages.length).toBe(2);
	});

	test("should include definition location when include_definitions is true", async () => {
		const repoId = seedRepo();

		const fileContent = [
			"export function myFunc(): void {",
			"  // body",
			"}",
		].join("\n");
		const callerContent = "import { myFunc } from './module';\nmyFunc();";

		const defFileId = seedFile(repoId, "src/module.ts", fileContent);
		const callerFileId = seedFile(repoId, "src/caller.ts", callerContent);

		const symbolId = seedSymbol(defFileId, repoId, "myFunc", "function", 1, 3);

		// Reference at the definition site
		seedReference(defFileId, repoId, "myFunc", symbolId, 1, 17, "variable_reference");
		// Reference from another file
		seedReference(callerFileId, repoId, "myFunc", symbolId, 1, 10, "import");

		const result = (await executeFindUsages(
			{ symbol: "myFunc", repository: repoId, include_definitions: true },
			requestId,
			userId,
		)) as any;

		// Definition-site reference should now be included
		const defSiteUsages = result.usages.filter((u: any) => u.file === "src/module.ts");
		expect(defSiteUsages.length).toBeGreaterThanOrEqual(1);
	});

	// ========================================================================
	// 7. File Disambiguation
	// ========================================================================

	test("should disambiguate same-named symbols with file filter", async () => {
		const repoId = seedRepo();

		const fileAContent = "export function render(): void {}";
		const fileBContent = "export function render(): void {}";
		const callerAContent = "import { render } from './componentA';\nrender();";
		const callerBContent = "import { render } from './componentB';\nrender();";

		const fileAId = seedFile(repoId, "src/componentA.ts", fileAContent);
		const fileBId = seedFile(repoId, "src/componentB.ts", fileBContent);
		const callerAFileId = seedFile(repoId, "src/appA.ts", callerAContent);
		const callerBFileId = seedFile(repoId, "src/appB.ts", callerBContent);

		const symbolAId = seedSymbol(fileAId, repoId, "render", "function", 1, 1);
		const symbolBId = seedSymbol(fileBId, repoId, "render", "function", 1, 1);

		// References pointing to componentA's render (via target_symbol_id)
		seedReference(callerAFileId, repoId, "render", symbolAId, 1, 10, "import");
		seedReference(callerAFileId, repoId, "render", symbolAId, 2, 1, "call");

		// References pointing to componentB's render (via target_symbol_id)
		seedReference(callerBFileId, repoId, "render", symbolBId, 1, 10, "import");
		seedReference(callerBFileId, repoId, "render", symbolBId, 2, 1, "call");

		// Query with file filter for componentA - disambiguates definition
		const resultA = (await executeFindUsages(
			{ symbol: "render", repository: repoId, file: "src/componentA.ts" },
			requestId,
			userId,
		)) as any;

		expect(resultA.symbol).toBe("render");
		expect(resultA.defined_in).toContain("src/componentA.ts");

		// Query with file filter for componentB - disambiguates definition
		const resultB = (await executeFindUsages(
			{ symbol: "render", repository: repoId, file: "src/componentB.ts" },
			requestId,
			userId,
		)) as any;

		expect(resultB.symbol).toBe("render");
		expect(resultB.defined_in).toContain("src/componentB.ts");

		// Both queries should find references (symbol_name match is broad)
		// but each resolves to its own definition file
		expect(resultA.defined_in).not.toEqual(resultB.defined_in);
	});

	// ========================================================================
	// 8. Symbol Not Found
	// ========================================================================

	test("should return graceful response when symbol is not found", async () => {
		const repoId = seedRepo();

		// Seed a file so the repository exists with content
		seedFile(repoId, "src/app.ts", "const x = 1;");

		const result = (await executeFindUsages(
			{ symbol: "nonExistentSymbol", repository: repoId },
			requestId,
			userId,
		)) as any;

		expect(result.symbol).toBe("nonExistentSymbol");
		expect(result.total_usages).toBe(0);
		expect(result.usages).toEqual([]);
	});

	// ========================================================================
	// 9. No Usages
	// ========================================================================

	test("should return empty usages when symbol exists but has no references", async () => {
		const repoId = seedRepo();

		const fileContent = "export function orphanedFunction(): void {}";
		const fileId = seedFile(repoId, "src/orphan.ts", fileContent);

		seedSymbol(fileId, repoId, "orphanedFunction", "function", 1, 1);

		const result = (await executeFindUsages(
			{ symbol: "orphanedFunction", repository: repoId },
			requestId,
			userId,
		)) as any;

		expect(result.symbol).toBe("orphanedFunction");
		expect(result.kind).toBe("function");
		expect(result.total_usages).toBe(0);
		expect(result.usages).toEqual([]);
		expect(result.files_with_usages).toBe(0);
	});
});
