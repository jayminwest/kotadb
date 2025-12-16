import { describe, test, expect } from "bun:test";
import { parseFile, isSupportedForAST } from "../src/parsers/ast-parser.js";
import { AST_NODE_TYPES } from "@typescript-eslint/types";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * AST Parser Tests
 *
 * Tests the @typescript-eslint/parser wrapper for parsing TypeScript and JavaScript files.
 * Uses real parser with real fixture files.
 */

const FIXTURES_DIR = resolve(import.meta.dir, "fixtures/parsing");

/**
 * Read fixture file content for testing
 */
function readFixture(relativePath: string): string {
	return readFileSync(join(FIXTURES_DIR, relativePath), "utf-8");
}

describe("isSupportedForAST", () => {
	test("supports TypeScript files", () => {
		expect(isSupportedForAST("src/index.ts")).toBe(true);
		expect(isSupportedForAST("components/Button.tsx")).toBe(true);
	});

	test("supports JavaScript files", () => {
		expect(isSupportedForAST("src/utils.js")).toBe(true);
		expect(isSupportedForAST("components/App.jsx")).toBe(true);
		expect(isSupportedForAST("config.cjs")).toBe(true);
		expect(isSupportedForAST("module.mjs")).toBe(true);
	});

	test("rejects JSON files", () => {
		expect(isSupportedForAST("package.json")).toBe(false);
		expect(isSupportedForAST("tsconfig.json")).toBe(false);
	});

	test("rejects other extensions", () => {
		expect(isSupportedForAST("README.md")).toBe(false);
		expect(isSupportedForAST("styles.css")).toBe(false);
		expect(isSupportedForAST("image.png")).toBe(false);
	});
});

describe("parseFile - valid TypeScript files", () => {
	test("parses simple TypeScript class with methods", () => {
		const content = readFixture("simple/calculator.ts");
		const ast = parseFile("simple/calculator.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(ast?.body).toBeInstanceOf(Array);
		expect(ast?.body.length).toBeGreaterThan(0);
	});

	test("parses TypeScript with type imports and functions", () => {
		const content = readFixture("simple/utils.ts");
		const ast = parseFile("simple/utils.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(ast?.body.length).toBeGreaterThan(0);
	});

	test("parses TypeScript with type definitions", () => {
		const content = readFixture("simple/types.ts");
		const ast = parseFile("simple/types.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(ast?.body.length).toBeGreaterThan(0);
	});

	test("parses TypeScript with barrel exports", () => {
		const content = readFixture("simple/index.ts");
		const ast = parseFile("simple/index.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(ast?.body.length).toBeGreaterThan(0);
	});
});

describe("parseFile - error handling", () => {
	test("returns null for invalid syntax", () => {
		const invalidContent = "const x = ;"; // Syntax error
		const ast = parseFile("invalid.ts", invalidContent);

		expect(ast).toBeNull();
	});

	test("returns null for unclosed braces", () => {
		const invalidContent = "function foo() { return 1;"; // Missing closing brace
		const ast = parseFile("invalid.ts", invalidContent);

		expect(ast).toBeNull();
	});
});
