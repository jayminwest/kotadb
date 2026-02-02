import { describe, test, expect } from "bun:test";
import { parseFile, isSupportedForAST } from "@indexer/ast-parser";
import { AST_NODE_TYPES, AST_TOKEN_TYPES } from "@typescript-eslint/types";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * AST Parser Tests
 *
 * Tests the @typescript-eslint/parser wrapper for parsing TypeScript and JavaScript files.
 * Follows anti-mock principles by using real parser with real fixture files.
 */

const FIXTURES_DIR = resolve(__dirname, "../fixtures/parsing");

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

describe("parseFile - complex TypeScript fixtures", () => {
	test("parses file with interfaces and arrow functions", () => {
		const content = readFixture("complex/src/api/handlers.ts");
		const ast = parseFile("complex/src/api/handlers.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(ast?.body.length).toBeGreaterThan(0);
	});

	test("parses file with middleware patterns", () => {
		const content = readFixture("complex/src/api/middleware.ts");
		const ast = parseFile("complex/src/api/middleware.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
	});

	test("parses file with Express route definitions", () => {
		const content = readFixture("complex/src/api/routes.ts");
		const ast = parseFile("complex/src/api/routes.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
	});

	test("parses file with database client initialization", () => {
		const content = readFixture("complex/src/db/client.ts");
		const ast = parseFile("complex/src/db/client.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
	});

	test("parses file with async database queries", () => {
		const content = readFixture("complex/src/db/queries.ts");
		const ast = parseFile("complex/src/db/queries.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
	});

	test("parses file with type definitions and enums", () => {
		const content = readFixture("complex/src/db/schema.ts");
		const ast = parseFile("complex/src/db/schema.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
	});

	test("parses file with configuration object", () => {
		const content = readFixture("complex/src/utils/config.ts");
		const ast = parseFile("complex/src/utils/config.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
	});

	test("parses file with logger utility", () => {
		const content = readFixture("complex/src/utils/logger.ts");
		const ast = parseFile("complex/src/utils/logger.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
	});
});

describe("parseFile - location information", () => {
	test("includes location metadata (loc property)", () => {
		const content = "function foo() {}";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.loc).toBeDefined();
		expect(ast?.loc?.start.line).toBeGreaterThan(0);
		expect(ast?.loc?.start.column).toBeGreaterThanOrEqual(0);
		expect(ast?.loc?.end.line).toBeGreaterThan(0);
		expect(ast?.loc?.end.column).toBeGreaterThan(0);
	});

	test("includes character range offsets", () => {
		const content = "function foo() {}";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.range).toBeDefined();
		expect(ast?.range?.[0]).toBeGreaterThanOrEqual(0);
		expect(ast?.range?.[1]).toBeGreaterThan(0);
		expect(ast?.range?.[1]).toBeGreaterThan(ast?.range?.[0] ?? 0);
	});

	test("provides accurate location for function declaration", () => {
		const content = "function foo() {}";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		const firstNode = ast?.body[0];
		expect(firstNode?.type).toBe(AST_NODE_TYPES.FunctionDeclaration);
		expect(firstNode?.loc?.start.line).toBe(1);
		expect(firstNode?.loc?.start.column).toBe(0);
	});

	test("tracks locations across multiple lines", () => {
		const content = `
function foo() {
  return 42;
}
`.trim();
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		const funcNode = ast?.body[0];
		expect(funcNode?.loc?.start.line).toBe(1);
		expect(funcNode?.loc?.end.line).toBe(3);
	});
});

describe("parseFile - comment preservation", () => {
	test("preserves JSDoc comments from calculator fixture", () => {
		const content = readFixture("simple/calculator.ts");
		const ast = parseFile("simple/calculator.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.comments).toBeDefined();
		expect(ast?.comments?.length).toBeGreaterThan(0);

		// Verify JSDoc comment exists
		const jsdocComments = ast?.comments?.filter(
			(c) => c.type === "Block" && c.value.includes("@param"),
		);
		expect(jsdocComments?.length).toBeGreaterThan(0);
	});

	test("preserves single-line comments", () => {
		const content = `
// This is a comment
function foo() {}
`.trim();
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.comments).toBeDefined();
		expect(ast?.comments?.length).toBeGreaterThan(0);
		const firstComment = ast?.comments?.[0];
		if (firstComment) {
			expect(firstComment.type).toBe(AST_TOKEN_TYPES.Line);
			expect(firstComment.value).toContain("This is a comment");
		}
	});

	test("preserves multi-line block comments", () => {
		const content = `
/**
 * Multi-line comment
 * with multiple lines
 */
function foo() {}
`.trim();
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.comments?.length).toBeGreaterThan(0);
		const firstComment = ast?.comments?.[0];
		if (firstComment) {
			expect(firstComment.type).toBe(AST_TOKEN_TYPES.Block);
			expect(firstComment.value).toContain("Multi-line comment");
		}
	});
});

describe("parseFile - token preservation", () => {
	test("preserves tokens for simple function", () => {
		const content = "function foo() {}";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.tokens).toBeDefined();
		expect(ast?.tokens?.length).toBeGreaterThan(0);

		// Verify we have keyword, identifier, and punctuation tokens
		const tokenTypes = new Set(ast?.tokens?.map((t) => t.type));
		expect(tokenTypes.has(AST_TOKEN_TYPES.Keyword)).toBe(true); // 'function'
		expect(tokenTypes.has(AST_TOKEN_TYPES.Identifier)).toBe(true); // 'foo'
		expect(tokenTypes.has(AST_TOKEN_TYPES.Punctuator)).toBe(true); // '(', ')', '{', '}'
	});

	test("tokens include source locations", () => {
		const content = "const x = 42;";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		const firstToken = ast?.tokens?.[0];
		expect(firstToken?.loc).toBeDefined();
		expect(firstToken?.range).toBeDefined();
		expect(firstToken?.value).toBeDefined();
	});
});

describe("parseFile - error handling", () => {
	test("returns null for syntax error (invalid code)", () => {
		const invalidContent = "const x = ;"; // Missing value
		const ast = parseFile("test.ts", invalidContent);

		expect(ast).toBeNull();
	});

	test("returns null for unclosed brace", () => {
		const invalidContent = "function foo() {";
		const ast = parseFile("test.ts", invalidContent);

		expect(ast).toBeNull();
	});

	test("returns null for invalid import syntax", () => {
		const invalidContent = "import from 'module';";
		const ast = parseFile("test.ts", invalidContent);

		expect(ast).toBeNull();
	});

	test("handles empty file gracefully (returns valid empty program)", () => {
		const emptyContent = "";
		const ast = parseFile("test.ts", emptyContent);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(ast?.body.length).toBe(0);
	});

	test("handles whitespace-only file", () => {
		const whitespaceContent = "   \n\n  \t  \n  ";
		const ast = parseFile("test.ts", whitespaceContent);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(ast?.body.length).toBe(0);
	});

	test("handles file with only comments", () => {
		const commentOnlyContent = "// Just a comment\n/* Another comment */";
		const ast = parseFile("test.ts", commentOnlyContent);

		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(ast?.body.length).toBe(0);
		expect(ast?.comments?.length).toBe(2);
	});
});

describe("parseFile - modern JavaScript syntax", () => {
	test("parses ES module imports/exports", () => {
		const content = `
import { foo } from './bar';
export const baz = 42;
`.trim();
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.sourceType).toBe("module" as const);
		expect(ast?.body[0]?.type).toBe(AST_NODE_TYPES.ImportDeclaration);
		expect(ast?.body[1]?.type).toBe(AST_NODE_TYPES.ExportNamedDeclaration);
	});

	test("parses optional chaining", () => {
		const content = "const value = obj?.prop?.nested;";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
	});

	test("parses nullish coalescing", () => {
		const content = "const value = foo ?? 'default';";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
	});

	test("parses async/await", () => {
		const content = `
async function fetchData() {
  const result = await fetch('/api');
  return result;
}
`.trim();
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.body[0]?.type).toBe(AST_NODE_TYPES.FunctionDeclaration);
	});

	test("parses arrow functions", () => {
		const content = "const add = (a, b) => a + b;";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
	});

	test("parses destructuring", () => {
		const content = "const { name, age } = user;";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
	});

	test("parses spread operator", () => {
		const content = "const merged = { ...obj1, ...obj2 };";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
	});
});

describe("parseFile - TypeScript-specific syntax", () => {
	test("parses type annotations", () => {
		const content = "const name: string = 'John';";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
	});

	test("parses interface declarations", () => {
		const content = `
interface User {
  name: string;
  age: number;
}
`.trim();
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.body[0]?.type).toBe(AST_NODE_TYPES.TSInterfaceDeclaration);
	});

	test("parses type aliases", () => {
		const content = "type ID = string | number;";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.body[0]?.type).toBe(AST_NODE_TYPES.TSTypeAliasDeclaration);
	});

	test("parses generics", () => {
		const content = "function identity<T>(arg: T): T { return arg; }";
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
	});

	test("parses enums", () => {
		const content = `
enum Color {
  Red,
  Green,
  Blue
}
`.trim();
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.body[0]?.type).toBe(AST_NODE_TYPES.TSEnumDeclaration);
	});

	test("parses access modifiers", () => {
		const content = `
class Foo {
  private x: number;
  public y: number;
  protected z: number;
}
`.trim();
		const ast = parseFile("test.ts", content);

		expect(ast).not.toBeNull();
		expect(ast?.body[0]?.type).toBe(AST_NODE_TYPES.ClassDeclaration);
	});
});

/**
 * Error Recovery Tests
 *
 * Tests for the enhanced parseFile function that supports partial AST recovery
 * when encountering syntax errors. These tests verify:
 * 
 * 1. Partial recovery with minor syntax errors (missing semicolons)
 * 2. Partial recovery with major syntax errors (unclosed braces)
 * 3. ParseResult includes error information
 * 4. partial:true flag is set when recovery is used
 *
 * Note: These tests are written against the expected interface after
 * error recovery implementation. Some tests are skipped until the
 * implementation is complete.
 */

const ERRORS_FIXTURES_DIR = resolve(__dirname, "../fixtures/parsing/errors");

function readErrorFixture(filename: string): string {
	return readFileSync(join(ERRORS_FIXTURES_DIR, filename), "utf-8");
}

describe("parseFile - error recovery with minor syntax errors", () => {
	test.skip("recovers partial AST for file with missing semicolons", () => {
		// Missing semicolons are often recoverable by modern parsers
		const content = readErrorFixture("missing-semicolon.ts");
		
		// Expected: parseFileWithRecovery returns a ParseResult with:
		// - success: true (partial recovery succeeded)
		// - partial: true (indicating recovery was used)
		// - ast: partial AST with recovered nodes
		// - errors: array of parse errors encountered
		
		// Current behavior: parseFile returns null on any error
		// After implementation: should return partial AST
		const ast = parseFile("missing-semicolon.ts", content);
		
		// Current expectation (before error recovery implementation)
		// This may change to expect partial recovery
		if (ast === null) {
			// Parser couldn't recover - expected for strict parsing
			expect(ast).toBeNull();
		} else {
			// If parser did recover, verify it found some declarations
			expect(ast.type).toBe(AST_NODE_TYPES.Program);
			expect(ast.body.length).toBeGreaterThan(0);
		}
	});

	test("parses valid TypeScript code without semicolons (ASI)", () => {
		// JavaScript/TypeScript supports Automatic Semicolon Insertion (ASI)
		// This should parse successfully without recovery
		const content = `
function greet(name: string): string {
	return \`Hello, \${name}!\`
}

const PI = 3.14159

function add(a: number, b: number): number {
	return a + b
}
`.trim();
		
		const ast = parseFile("asi.ts", content);
		
		// ASI should allow this to parse successfully
		expect(ast).not.toBeNull();
		expect(ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(ast?.body.length).toBe(3); // 2 functions + 1 const
	});
});

describe("parseFile - error recovery with major syntax errors", () => {
	test("returns null for unclosed brace (current behavior)", () => {
		const content = readErrorFixture("unclosed-brace.ts");
		const ast = parseFile("unclosed-brace.ts", content);
		
		// Current behavior: returns null on syntax errors
		expect(ast).toBeNull();
	});

	test.skip("recovers partial AST from unclosed brace (after implementation)", () => {
		const content = readErrorFixture("unclosed-brace.ts");
		
		// After error recovery implementation:
		// Should return partial AST with nodes before the error
		// const result = parseFileWithRecovery("unclosed-brace.ts", content);
		// expect(result.partial).toBe(true);
		// expect(result.ast).not.toBeNull();
		// expect(result.ast.body.length).toBeGreaterThan(0);
		// 
		// Verify it found validFunction and ValidClass before the broken part
		// const nodeTypes = result.ast.body.map(n => n.type);
		// expect(nodeTypes).toContain(AST_NODE_TYPES.FunctionDeclaration);
		// expect(nodeTypes).toContain(AST_NODE_TYPES.ClassDeclaration);
	});

	test("returns null for multiple syntax errors (current behavior)", () => {
		const content = readErrorFixture("multiple-errors.ts");
		const ast = parseFile("multiple-errors.ts", content);
		
		// Current behavior: returns null
		expect(ast).toBeNull();
	});
});

describe("parseFile - ParseResult structure", () => {
	test.skip("ParseResult includes error information when recovery is used", () => {
		// After implementation, parseFileWithRecovery should return structured results
		// const content = readErrorFixture("unclosed-brace.ts");
		// const result = parseFileWithRecovery("unclosed-brace.ts", content);
		//
		// expect(result).toMatchObject({
		//   success: true,
		//   partial: true,
		//   errors: expect.arrayContaining([
		//     expect.objectContaining({
		//       message: expect.any(String),
		//       line: expect.any(Number),
		//     })
		//   ])
		// });
	});

	test.skip("partial flag is false for successfully parsed files", () => {
		const content = readFixture("simple/calculator.ts");
		// const result = parseFileWithRecovery("calculator.ts", content);
		//
		// expect(result.success).toBe(true);
		// expect(result.partial).toBe(false);
		// expect(result.errors).toHaveLength(0);
	});

	test.skip("partial flag is true when recovery is used", () => {
		const content = readErrorFixture("unclosed-brace.ts");
		// const result = parseFileWithRecovery("unclosed-brace.ts", content);
		//
		// expect(result.partial).toBe(true);
	});
});

describe("parseFile - error fixture validation", () => {
	test("error fixtures exist and are readable", () => {
		// Verify the error fixtures were created correctly
		const fixtures = [
			"missing-semicolon.ts",
			"unclosed-brace.ts",
			"multiple-errors.ts",
			"completely-broken.ts",
		];
		
		for (const fixture of fixtures) {
			const content = readErrorFixture(fixture);
			expect(content.length).toBeGreaterThan(0);
		}
	});

	test("missing-semicolon fixture contains expected declarations", () => {
		const content = readErrorFixture("missing-semicolon.ts");
		
		// Verify fixture has the expected structure
		expect(content).toContain("export function greet");
		expect(content).toContain("export const PI");
		expect(content).toContain("export class Calculator");
	});

	test("unclosed-brace fixture has valid code before error", () => {
		const content = readErrorFixture("unclosed-brace.ts");
		
		expect(content).toContain("export function validFunction");
		expect(content).toContain("export class ValidClass");
		expect(content).toContain("export function brokenFunction");
	});

	test("multiple-errors fixture has mixed valid/invalid sections", () => {
		const content = readErrorFixture("multiple-errors.ts");
		
		// Valid sections
		expect(content).toContain("export function validStart");
		expect(content).toContain("export interface ValidInterface");
		expect(content).toContain("export const CONSTANT");
		expect(content).toContain("export class AnotherValidClass");
		expect(content).toContain("export type ValidType");
		
		// Broken sections
		expect(content).toContain("broken1");
		expect(content).toContain("broken2");
	});

	test("completely-broken fixture is unparseable but has recognizable patterns", () => {
		const content = readErrorFixture("completely-broken.ts");
		
		// File has syntax that breaks parsing
		expect(content).toContain("{{{{");
		expect(content).toContain("@@@");
		
		// But also has recognizable declaration patterns
		expect(content).toContain("export function hiddenFunction");
		expect(content).toContain("export class HiddenClass");
		expect(content).toContain("export interface HiddenInterface");
	});
});

/**
 * parseFileWithRecovery Tests
 *
 * Tests for the parseFileWithRecovery function that returns a ParseResult
 * with AST, errors, and partial flag.
 */

import { parseFileWithRecovery } from "@indexer/ast-parser";

describe("parseFileWithRecovery - successful parsing", () => {
	test("returns ParseResult with AST for valid code", () => {
		const content = "const x = 42;";
		const result = parseFileWithRecovery("test.ts", content);
		
		expect(result.ast).not.toBeNull();
		expect(result.ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(result.errors).toHaveLength(0);
		expect(result.partial).toBe(false);
	});

	test("parses valid fixture without recovery", () => {
		const content = readFixture("simple/calculator.ts");
		const result = parseFileWithRecovery("calculator.ts", content);
		
		expect(result.ast).not.toBeNull();
		expect(result.partial).toBe(false);
		expect(result.errors).toHaveLength(0);
	});

	test("parses code with ASI (automatic semicolon insertion)", () => {
		const content = readErrorFixture("missing-semicolon.ts");
		const result = parseFileWithRecovery("missing-semicolon.ts", content);
		
		// ASI handles missing semicolons - parses successfully without recovery
		expect(result.ast).not.toBeNull();
		expect(result.ast?.type).toBe(AST_NODE_TYPES.Program);
		expect(result.ast?.body.length).toBeGreaterThan(0);
		expect(result.partial).toBe(false);
		expect(result.errors).toHaveLength(0);
	});
});

describe("parseFileWithRecovery - error handling", () => {
	test("returns errors for unclosed brace", () => {
		const content = readErrorFixture("unclosed-brace.ts");
		const result = parseFileWithRecovery("unclosed-brace.ts", content);
		
		// Should have at least one error
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]!.message).toBeTruthy();
	});

	test("returns errors for multiple syntax errors", () => {
		const content = readErrorFixture("multiple-errors.ts");
		const result = parseFileWithRecovery("multiple-errors.ts", content);
		
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test("returns errors for completely broken file", () => {
		const content = readErrorFixture("completely-broken.ts");
		const result = parseFileWithRecovery("completely-broken.ts", content);
		
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test("error includes line number for unclosed brace", () => {
		const content = readErrorFixture("unclosed-brace.ts");
		const result = parseFileWithRecovery("unclosed-brace.ts", content);
		
		expect(result.errors.length).toBeGreaterThan(0);
		const error = result.errors[0]!;
		expect(typeof error.line).toBe("number");
		expect(error!.line).toBeGreaterThan(0);
	});

	test("error message describes the problem", () => {
		const content = "const x = ;"; // Invalid syntax
		const result = parseFileWithRecovery("test.ts", content);
		
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]!.message).toContain("expected");
	});
});

describe("parseFileWithRecovery - ParseResult structure", () => {
	test("has correct structure for successful parse", () => {
		const content = "export function foo() { return 42; }";
		const result = parseFileWithRecovery("test.ts", content);
		
		expect(result).toHaveProperty("ast");
		expect(result).toHaveProperty("errors");
		expect(result).toHaveProperty("partial");
		expect(result.ast).not.toBeNull();
		expect(Array.isArray(result.errors)).toBe(true);
		expect(typeof result.partial).toBe("boolean");
	});

	test("has correct structure for failed parse", () => {
		const content = "function foo() {"; // Unclosed
		const result = parseFileWithRecovery("test.ts", content);
		
		expect(result).toHaveProperty("ast");
		expect(result).toHaveProperty("errors");
		expect(result).toHaveProperty("partial");
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test("partial is false for successful parse", () => {
		const content = "const x = 42;";
		const result = parseFileWithRecovery("test.ts", content);
		
		expect(result.partial).toBe(false);
	});

	test("partial indicates recovery status for errors", () => {
		const content = "const x = ;"; // Invalid
		const result = parseFileWithRecovery("test.ts", content);
		
		// Either recovered (partial=true, ast not null) or failed (partial=false, ast null)
		if (result.ast !== null) {
			expect(result.partial).toBe(true);
		} else {
			expect(result.partial).toBe(false);
		}
	});
});

describe("parseFileWithRecovery - partial recovery behavior", () => {
	test("attempts recovery with allowInvalidAST for errors", () => {
		const content = readErrorFixture("unclosed-brace.ts");
		const result = parseFileWithRecovery("unclosed-brace.ts", content);
		
		// Errors should be captured
		expect(result.errors.length).toBeGreaterThan(0);
		
		// If AST was recovered, partial should be true
		if (result.ast !== null) {
			expect(result.partial).toBe(true);
		}
	});

	test("captures error location when available", () => {
		const content = readErrorFixture("unclosed-brace.ts");
		const result = parseFileWithRecovery("unclosed-brace.ts", content);
		
		expect(result.errors.length).toBeGreaterThan(0);
		const error = result.errors[0]!;
		
		// Line should be defined (unclosed brace is detectable)
		expect(error!.line).toBeDefined();
		expect(error!.line).toBeGreaterThan(0);
	});

	test("reports first parse error encountered", () => {
		const content = "const x = ;"; // Error at position
		const result = parseFileWithRecovery("test.ts", content);
		
		expect(result.errors.length).toBeGreaterThan(0);
		// Should have a meaningful error message
		expect(result.errors[0]!.message.length).toBeGreaterThan(0);
	});
});
