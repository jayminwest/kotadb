/**
 * Unit tests for symbol extraction from AST.
 *
 * Tests cover:
 * - Function extraction with JSDoc comments
 * - Class extraction with methods and properties
 * - Interface and type alias extraction
 * - Variable and constant extraction
 * - Edge cases (async functions, anonymous functions, etc.)
 *
 * Uses real test fixtures from tests/fixtures/parsing/simple/
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFile } from "@indexer/ast-parser";
import { extractSymbols } from "@indexer/symbol-extractor";

const FIXTURES_PATH = join(import.meta.dir, "../fixtures/parsing/simple");

function loadFixture(filename: string): string {
	return readFileSync(join(FIXTURES_PATH, filename), "utf-8");
}

describe("Symbol Extraction - Functions", () => {
	test("extracts functions with JSDoc comments", () => {
		const content = loadFixture("utils.ts");
		const ast = parseFile("utils.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "utils.ts");

		// Find formatUserName function
		const formatUserName = symbols.find(
			(s) => s.name === "formatUserName" && s.kind === "function",
		);
		expect(formatUserName).toBeDefined();
		expect(formatUserName?.isExported).toBe(true);
		expect(formatUserName?.documentation).toContain(
			"Formats a user's display name",
		);
		expect(formatUserName?.signature).toContain("user");
		expect(formatUserName?.lineStart).toBe(8);
	});

	test("extracts arrow function constants", () => {
		const content = loadFixture("utils.ts");
		const ast = parseFile("utils.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "utils.ts");

		// Find doubleNumber arrow function
		const doubleNumber = symbols.find(
			(s) => s.name === "doubleNumber" && s.kind === "function",
		);
		expect(doubleNumber).toBeDefined();
		expect(doubleNumber?.isExported).toBe(true);
		expect(doubleNumber?.documentation).toContain("Arrow function");
		expect(doubleNumber?.signature).toContain("n");
	});

	test("extracts async functions", () => {
		const content = loadFixture("utils.ts");
		const ast = parseFile("utils.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "utils.ts");

		// Find fetchUserById async function
		const fetchUserById = symbols.find(
			(s) => s.name === "fetchUserById" && s.kind === "function",
		);
		expect(fetchUserById).toBeDefined();
		expect(fetchUserById?.isExported).toBe(true);
		expect(fetchUserById?.isAsync).toBe(true);
		expect(fetchUserById?.documentation).toContain("Async function");
	});

	test("extracts generic functions with type parameters", () => {
		const content = loadFixture("utils.ts");
		const ast = parseFile("utils.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "utils.ts");

		// Find ok and err generic functions
		const ok = symbols.find((s) => s.name === "ok" && s.kind === "function");
		const err = symbols.find((s) => s.name === "err" && s.kind === "function");

		expect(ok).toBeDefined();
		expect(ok?.isExported).toBe(true);
		expect(ok?.signature).toContain("data");

		expect(err).toBeDefined();
		expect(err?.isExported).toBe(true);
		expect(err?.signature).toContain("error");
	});
});

describe("Symbol Extraction - Classes", () => {
	test("extracts class symbol", () => {
		const content = loadFixture("calculator.ts");
		const ast = parseFile("calculator.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "calculator.ts");

		// Find Calculator class
		const calculatorClass = symbols.find(
			(s) => s.name === "Calculator" && s.kind === "class",
		);
		expect(calculatorClass).toBeDefined();
		expect(calculatorClass?.isExported).toBe(true);
		expect(calculatorClass?.documentation).toContain(
			"Calculator class demonstrating",
		);
		expect(calculatorClass?.lineStart).toBe(4);
	});

	test("extracts class methods with JSDoc", () => {
		const content = loadFixture("calculator.ts");
		const ast = parseFile("calculator.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "calculator.ts");

		// Find add method
		const add = symbols.find((s) => s.name === "add" && s.kind === "method");
		expect(add).toBeDefined();
		expect(add?.isExported).toBe(true); // Class is exported, so methods inherit
		expect(add?.documentation).toContain("Adds two numbers");
		expect(add?.signature).toContain("a");
		expect(add?.signature).toContain("b");
		expect(add?.lineStart).toBe(13);

		// Find divide method with @throws
		const divide = symbols.find(
			(s) => s.name === "divide" && s.kind === "method",
		);
		expect(divide).toBeDefined();
		expect(divide?.documentation).toContain("Divides a by b");
		expect(divide?.lineStart).toBe(44);
	});

	test("extracts class properties with access modifiers", () => {
		const content = loadFixture("calculator.ts");
		const ast = parseFile("calculator.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "calculator.ts");

		// Find history property
		const history = symbols.find(
			(s) => s.name === "history" && s.kind === "property",
		);
		expect(history).toBeDefined();
		expect(history?.isExported).toBe(true);
		expect(history?.accessModifier).toBe("private");
		expect(history?.lineStart).toBe(5);
	});

	test("extracts all methods from class", () => {
		const content = loadFixture("calculator.ts");
		const ast = parseFile("calculator.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "calculator.ts");

		// Count method symbols
		const methods = symbols.filter((s) => s.kind === "method");
		expect(methods.length).toBeGreaterThanOrEqual(6); // add, subtract, multiply, divide, getHistory, clearHistory

		// Verify method names
		const methodNames = methods.map((m) => m.name);
		expect(methodNames).toContain("add");
		expect(methodNames).toContain("subtract");
		expect(methodNames).toContain("multiply");
		expect(methodNames).toContain("divide");
		expect(methodNames).toContain("getHistory");
		expect(methodNames).toContain("clearHistory");
	});
});

describe("Symbol Extraction - TypeScript Types", () => {
	test("extracts interface declarations", () => {
		const content = loadFixture("types.ts");
		const ast = parseFile("types.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "types.ts");

		// Find User interface
		const user = symbols.find(
			(s) => s.name === "User" && s.kind === "interface",
		);
		expect(user).toBeDefined();
		expect(user?.isExported).toBe(true);
		expect(user?.documentation).toContain("User interface");
		expect(user?.lineStart).toBe(9);
	});

	test("extracts type alias declarations", () => {
		const content = loadFixture("types.ts");
		const ast = parseFile("types.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "types.ts");

		// Find Product type
		const product = symbols.find(
			(s) => s.name === "Product" && s.kind === "type",
		);
		expect(product).toBeDefined();
		expect(product?.isExported).toBe(true);
		expect(product?.documentation).toContain("Product type");

		// Find Result type (generic)
		const result = symbols.find(
			(s) => s.name === "Result" && s.kind === "type",
		);
		expect(result).toBeDefined();
		expect(result?.isExported).toBe(true);
		expect(result?.documentation).toContain("Result type for operations");

		// Find Status type (union)
		const status = symbols.find(
			(s) => s.name === "Status" && s.kind === "type",
		);
		expect(status).toBeDefined();
		expect(status?.isExported).toBe(true);
		expect(status?.documentation).toContain("Status enum-like type");
	});
});

describe("Symbol Extraction - Variables and Constants", () => {
	test("extracts exported constants", () => {
		const content = loadFixture("utils.ts");
		const ast = parseFile("utils.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "utils.ts");

		// Exported constants should be extracted
		// Note: arrow function assigned to const is classified as function
		const doubleNumber = symbols.find((s) => s.name === "doubleNumber");
		expect(doubleNumber).toBeDefined();
		expect(doubleNumber?.kind).toBe("function"); // Arrow function
		expect(doubleNumber?.isExported).toBe(true);
	});

	test("does not extract non-exported variables", () => {
		const content = `
			const internalVar = 42;
			let internalLet = "private";

			export const PUBLIC_CONST = 100;
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "test.ts");

		// Only exported constant should be present
		const publicConst = symbols.find((s) => s.name === "PUBLIC_CONST");
		expect(publicConst).toBeDefined();
		expect(publicConst?.kind).toBe("constant");
		expect(publicConst?.isExported).toBe(true);

		// Internal variables should not be extracted
		const internalVar = symbols.find((s) => s.name === "internalVar");
		const internalLet = symbols.find((s) => s.name === "internalLet");
		expect(internalVar).toBeUndefined();
		expect(internalLet).toBeUndefined();
	});
});

describe("Symbol Extraction - Edge Cases", () => {
	test("handles anonymous functions", () => {
		const content = `
			export default function() {
				return 42;
			}
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "test.ts");

		const anonymous = symbols.find((s) => s.name === "<anonymous>");
		expect(anonymous).toBeDefined();
		expect(anonymous?.kind).toBe("function");
		expect(anonymous?.isExported).toBe(true);
	});

	test("handles default exports", () => {
		const content = loadFixture("calculator.ts");
		const ast = parseFile("calculator.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "calculator.ts");

		// createCalculator is exported
		const createCalculator = symbols.find(
			(s) => s.name === "createCalculator",
		);
		expect(createCalculator).toBeDefined();
		expect(createCalculator?.isExported).toBe(true);
	});

	test("handles files with no symbols", () => {
		const content = `
			// Just a comment file
			// No actual code symbols
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "test.ts");
		expect(symbols).toEqual([]);
	});

	test("handles files with only imports", () => {
		const content = loadFixture("utils.ts");
		const ast = parseFile("utils.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "utils.ts");

		// Should not extract import symbols
		const importSymbols = symbols.filter((s) => s.name === "Result");
		// Result is imported, not defined here, so should not appear
		// (unless it's re-exported, which it's not in utils.ts)
		expect(
			importSymbols.every((s) => s.kind !== "variable"),
		).toBe(true);
	});

	test("preserves position information accurately", () => {
		const content = loadFixture("calculator.ts");
		const ast = parseFile("calculator.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "calculator.ts");

		// Check Calculator class position
		const calculatorClass = symbols.find(
			(s) => s.name === "Calculator" && s.kind === "class",
		);
		expect(calculatorClass).toBeDefined();
		expect(calculatorClass?.lineStart).toBe(4);
		expect(calculatorClass?.lineEnd).toBe(66);
		expect(calculatorClass?.columnStart).toBeGreaterThanOrEqual(0);
		expect(calculatorClass?.columnEnd).toBeGreaterThan(0);

		// Check add method position
		const add = symbols.find((s) => s.name === "add" && s.kind === "method");
		expect(add).toBeDefined();
		expect(add?.lineStart).toBe(13);
		expect(add?.lineEnd).toBe(17);
	});
});

describe("Symbol Extraction - Complete Fixture Validation", () => {
	test("calculator.ts extracts expected symbol count", () => {
		const content = loadFixture("calculator.ts");
		const ast = parseFile("calculator.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "calculator.ts");

		// Expected: 1 class + 6 methods + 1 property + 1 function = 9 symbols
		expect(symbols.length).toBeGreaterThanOrEqual(9);

		const classes = symbols.filter((s) => s.kind === "class");
		const methods = symbols.filter((s) => s.kind === "method");
		const properties = symbols.filter((s) => s.kind === "property");
		const functions = symbols.filter((s) => s.kind === "function");

		expect(classes.length).toBe(1); // Calculator
		expect(methods.length).toBe(6); // add, subtract, multiply, divide, getHistory, clearHistory
		expect(properties.length).toBe(1); // history
		expect(functions.length).toBe(1); // createCalculator
	});

	test("types.ts extracts expected symbol count", () => {
		const content = loadFixture("types.ts");
		const ast = parseFile("types.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "types.ts");

		// Expected: 1 interface + 3 type aliases = 4 symbols
		expect(symbols.length).toBeGreaterThanOrEqual(4);

		const interfaces = symbols.filter((s) => s.kind === "interface");
		const types = symbols.filter((s) => s.kind === "type");

		expect(interfaces.length).toBe(1); // User
		expect(types.length).toBe(3); // Product, Result, Status
	});

	test("utils.ts extracts expected symbol count", () => {
		const content = loadFixture("utils.ts");
		const ast = parseFile("utils.ts", content);
		expect(ast).not.toBeNull();

		const symbols = extractSymbols(ast!, "utils.ts");

		// Expected: 6 functions (formatUserName, isValidEmail, ok, err, doubleNumber, fetchUserById)
		expect(symbols.length).toBeGreaterThanOrEqual(6);

		const functions = symbols.filter((s) => s.kind === "function");
		expect(functions.length).toBe(6);

		// All should be exported
		expect(symbols.every((s) => s.isExported)).toBe(true);
	});
});
