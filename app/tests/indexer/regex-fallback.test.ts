import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Regex Fallback Tests
 *
 * Tests the regex-based symbol extraction fallback for files that fail AST parsing.
 * This provides basic symbol extraction when the parser cannot produce a valid AST.
 *
 * Follows anti-mock principles by using real fixture files with intentional syntax errors.
 */

const FIXTURES_DIR = resolve(__dirname, "../fixtures/parsing");

/**
 * Read fixture file content for testing
 */
function readFixture(relativePath: string): string {
	return readFileSync(join(FIXTURES_DIR, relativePath), "utf-8");
}

/**
 * Note: These tests are written against the expected interface of the regex fallback.
 * The actual implementation will be in @indexer/regex-fallback.ts
 * 
 * Expected interface:
 * - extractSymbolsWithRegex(content: string, filePath: string): RegexExtractedSymbol[]
 * 
 * Where RegexExtractedSymbol includes:
 * - name: string
 * - kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'variable'
 * - line: number (approximate)
 * - exported: boolean
 */

describe("Regex Fallback - extractSymbolsWithRegex", () => {
	// Import will be uncommented when implementation exists
	// import { extractSymbolsWithRegex } from "@indexer/regex-fallback";

	describe("extracting from valid code", () => {
		test.skip("extracts exported functions from valid TypeScript", () => {
			const content = `
export function greet(name: string): string {
	return \`Hello, \${name}!\`;
}

export function add(a: number, b: number): number {
	return a + b;
}

function privateFunc(): void {}
`.trim();

			// Placeholder until implementation exists
			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "test.ts");
			
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "greet",
					kind: "function",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "add",
					kind: "function",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "privateFunc",
					kind: "function",
					exported: false,
				})
			);
		});

		test.skip("extracts classes from valid TypeScript", () => {
			const content = `
export class Calculator {
	add(a: number, b: number): number {
		return a + b;
	}
}

class PrivateHelper {
	help(): void {}
}
`.trim();

			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "test.ts");
			
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "Calculator",
					kind: "class",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "PrivateHelper",
					kind: "class",
					exported: false,
				})
			);
		});

		test.skip("extracts interfaces from valid TypeScript", () => {
			const content = `
export interface User {
	name: string;
	email: string;
}

interface InternalConfig {
	debug: boolean;
}
`.trim();

			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "test.ts");
			
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "User",
					kind: "interface",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "InternalConfig",
					kind: "interface",
					exported: false,
				})
			);
		});

		test.skip("extracts type aliases from valid TypeScript", () => {
			const content = `
export type ID = string | number;
export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };
type Internal = string;
`.trim();

			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "test.ts");
			
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "ID",
					kind: "type",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "Result",
					kind: "type",
					exported: true,
				})
			);
		});

		test.skip("extracts const declarations", () => {
			const content = `
export const PI = 3.14159;
export const CONFIG = { debug: true };
const privateConst = "secret";
`.trim();

			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "test.ts");
			
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "PI",
					kind: "const",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "CONFIG",
					kind: "const",
					exported: true,
				})
			);
		});
	});

	describe("extracting from code with syntax errors", () => {
		test.skip("extracts symbols from file with missing semicolons", () => {
			const content = readFixture("errors/missing-semicolon.ts");
			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "missing-semicolon.ts");
			
			// Should still find these despite missing semicolons
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "greet",
					kind: "function",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "Calculator",
					kind: "class",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "PI",
					kind: "const",
					exported: true,
				})
			);
		});

		test.skip("extracts symbols before and after unclosed brace", () => {
			const content = readFixture("errors/unclosed-brace.ts");
			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "unclosed-brace.ts");
			
			// Should find valid symbols before the error
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "validFunction",
					kind: "function",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "ValidClass",
					kind: "class",
					exported: true,
				})
			);
			
			// May or may not find symbols after error depending on recovery
			const afterBroken = symbols.find(
				(s: unknown) => (s as { name: string }).name === "afterBroken"
			);
			// This is informational - regex may or may not recover
			if (afterBroken) {
				expect((afterBroken as { kind: string }).kind).toBe("function");
			}
		});

		test.skip("extracts from file with multiple errors", () => {
			const content = readFixture("errors/multiple-errors.ts");
			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "multiple-errors.ts");
			
			// Should find valid sections
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "validStart",
					kind: "function",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "ValidInterface",
					kind: "interface",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "CONSTANT",
					kind: "const",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "AnotherValidClass",
					kind: "class",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "ValidType",
					kind: "type",
					exported: true,
				})
			);
		});

		test.skip("extracts from completely broken file", () => {
			const content = readFixture("errors/completely-broken.ts");
			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "completely-broken.ts");
			
			// Regex should still find the valid-looking declarations
			// even though the file as a whole is unparseable
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "hiddenFunction",
					kind: "function",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "HiddenClass",
					kind: "class",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "HiddenInterface",
					kind: "interface",
					exported: true,
				})
			);
		});
	});

	describe("edge cases", () => {
		test.skip("handles empty content", () => {
			const symbols: unknown[] = []; // extractSymbolsWithRegex("", "empty.ts");
			expect(symbols).toHaveLength(0);
		});

		test.skip("handles content with only comments", () => {
			const content = `
// Just a comment
/* Block comment */
/**
 * JSDoc comment
 */
`.trim();
			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "comments.ts");
			expect(symbols).toHaveLength(0);
		});

		test.skip("handles arrow function exports", () => {
			const content = `
export const greet = (name: string): string => {
	return \`Hello, \${name}!\`;
};

export const add = (a: number, b: number) => a + b;
`.trim();
			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "arrows.ts");
			
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "greet",
					kind: "const",
					exported: true,
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "add",
					kind: "const",
					exported: true,
				})
			);
		});

		test.skip("handles async functions", () => {
			const content = `
export async function fetchData(): Promise<string> {
	return "data";
}

async function internalFetch(): Promise<void> {}
`.trim();
			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "async.ts");
			
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "fetchData",
					kind: "function",
					exported: true,
				})
			);
		});

		test.skip("handles generic declarations", () => {
			const content = `
export function identity<T>(value: T): T {
	return value;
}

export class Container<T> {
	constructor(private value: T) {}
}

export interface Result<T, E> {
	ok: boolean;
	value?: T;
	error?: E;
}
`.trim();
			const symbols: unknown[] = []; // extractSymbolsWithRegex(content, "generics.ts");
			
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "identity",
					kind: "function",
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "Container",
					kind: "class",
				})
			);
			expect(symbols).toContainEqual(
				expect.objectContaining({
					name: "Result",
					kind: "interface",
				})
			);
		});
	});
});

describe("Regex Fallback - Integration with AST Parser", () => {
	test.skip("parseFile falls back to regex when AST completely fails", () => {
		// This tests the integration point where parseFile uses regex fallback
		// when @typescript-eslint/parser throws
		const content = readFixture("errors/completely-broken.ts");
		
		// Expected: parseFile returns a ParseResult with:
		// - partial: true (indicating fallback was used)
		// - symbols extracted via regex
		// - error information about AST failure
		
		// Placeholder for actual implementation
		// const result = parseFileWithFallback(content, "completely-broken.ts");
		// expect(result.partial).toBe(true);
		// expect(result.fallbackMethod).toBe("regex");
		// expect(result.symbols.length).toBeGreaterThan(0);
	});

	test.skip("partial AST is preferred over regex fallback", () => {
		// When AST parsing partially succeeds (recovers some nodes),
		// the partial AST should be used instead of regex fallback
		const content = readFixture("errors/unclosed-brace.ts");
		
		// If the parser can recover to produce partial AST,
		// that should be preferred over regex extraction
		
		// Placeholder for actual implementation
		// const result = parseFileWithFallback(content, "unclosed-brace.ts");
		// if (result.partial && result.ast) {
		//   expect(result.fallbackMethod).not.toBe("regex");
		// }
	});
});
