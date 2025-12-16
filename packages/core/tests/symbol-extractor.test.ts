import { describe, test, expect } from "bun:test";
import { parseFile } from "../src/parsers/ast-parser.js";
import { extractSymbols } from "../src/analysis/symbol-extractor.js";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Symbol Extractor Tests
 *
 * Tests symbol extraction from parsed AST.
 * Uses real parser with real fixture files.
 */

const FIXTURES_DIR = resolve(import.meta.dir, "fixtures/parsing");

function readFixture(relativePath: string): string {
	return readFileSync(join(FIXTURES_DIR, relativePath), "utf-8");
}

describe("extractSymbols - functions", () => {
	test("extracts regular function declarations", () => {
		const content = readFixture("simple/utils.ts");
		const ast = parseFile("simple/utils.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const symbols = extractSymbols(ast, "simple/utils.ts");
		const functions = symbols.filter((s) => s.kind === "function");

		expect(functions.length).toBeGreaterThan(0);
		expect(functions.some((f) => f.name === "formatUserName")).toBe(true);
	});

	test("extracts async functions", () => {
		const content = `
		export async function fetchData(url: string): Promise<string> {
			return fetch(url).then(r => r.text());
		}
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const symbols = extractSymbols(ast, "test.ts");
		const asyncFunc = symbols.find((s) => s.name === "fetchData");

		expect(asyncFunc).toBeDefined();
		expect(asyncFunc?.kind).toBe("function");
		expect(asyncFunc?.isAsync).toBe(true);
		expect(asyncFunc?.isExported).toBe(true);
	});
});

describe("extractSymbols - classes", () => {
	test("extracts class declarations", () => {
		const content = readFixture("simple/calculator.ts");
		const ast = parseFile("simple/calculator.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const symbols = extractSymbols(ast, "simple/calculator.ts");
		const classes = symbols.filter((s) => s.kind === "class");

		expect(classes.length).toBeGreaterThan(0);
		expect(classes.some((c) => c.name === "Calculator")).toBe(true);
	});

	test("extracts class methods and properties", () => {
		const content = `
		export class User {
			name: string;
			
			constructor(name: string) {
				this.name = name;
			}
			
			greet(): string {
				return \`Hello, \${this.name}\`;
			}
		}
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const symbols = extractSymbols(ast, "test.ts");
		
		const classSymbol = symbols.find((s) => s.kind === "class" && s.name === "User");
		expect(classSymbol).toBeDefined();
		
		const methods = symbols.filter((s) => s.kind === "method");
		expect(methods.length).toBeGreaterThan(0);
		
		const properties = symbols.filter((s) => s.kind === "property");
		expect(properties.length).toBeGreaterThan(0);
	});
});

describe("extractSymbols - TypeScript types", () => {
	test("extracts interfaces", () => {
		const content = readFixture("simple/types.ts");
		const ast = parseFile("simple/types.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const symbols = extractSymbols(ast, "simple/types.ts");
		const interfaces = symbols.filter((s) => s.kind === "interface");

		expect(interfaces.length).toBeGreaterThan(0);
	});

	test("extracts type aliases", () => {
		const content = `
		export type Status = "pending" | "approved" | "rejected";
		export type Callback = (data: string) => void;
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const symbols = extractSymbols(ast, "test.ts");
		const types = symbols.filter((s) => s.kind === "type");

		expect(types.length).toBe(2);
		expect(types.some((t) => t.name === "Status")).toBe(true);
		expect(types.some((t) => t.name === "Callback")).toBe(true);
	});

	test("extracts enums", () => {
		const content = `
		export enum Color {
			Red = "RED",
			Green = "GREEN",
			Blue = "BLUE"
		}
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const symbols = extractSymbols(ast, "test.ts");
		const enums = symbols.filter((s) => s.kind === "enum");

		expect(enums.length).toBe(1);
		expect(enums[0]?.name).toBe("Color");
		expect(enums[0]?.isExported).toBe(true);
	});
});

describe("extractSymbols - export detection", () => {
	test("detects exported symbols", () => {
		const content = `
		export function exportedFunc() {}
		function notExported() {}
		export const exportedConst = 42;
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const symbols = extractSymbols(ast, "test.ts");

		const exported = symbols.filter((s) => s.isExported);
		expect(exported.length).toBe(2);
		
		const notExported = symbols.filter((s) => !s.isExported);
		expect(notExported.length).toBe(1);
	});
});
