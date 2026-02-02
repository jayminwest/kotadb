/**
 * Unit tests for reference extraction from AST.
 *
 * Tests cover:
 * - Import extraction (named, default, namespace, aliased, side-effect)
 * - Call expression extraction (function calls, method calls, chained calls)
 * - Property access extraction (member expressions, optional chaining)
 * - TypeScript type reference extraction
 * - Re-export extraction (named re-exports, star re-exports, namespaced)
 * - Dynamic import extraction (static, lazy, template patterns, conditional)
 * - Edge cases (empty files, no references, anonymous functions)
 *
 * Uses real test fixtures from tests/fixtures/parsing/simple/
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFile } from "@indexer/ast-parser";
import { extractReferences } from "@indexer/reference-extractor";

const FIXTURES_PATH = join(import.meta.dir, "../fixtures/parsing/simple");

function loadFixture(filename: string): string {
	return readFileSync(join(FIXTURES_PATH, filename), "utf-8");
}

describe("Reference Extraction - Imports", () => {
	test("extracts named imports", () => {
		const content = loadFixture("index.ts");
		const ast = parseFile("index.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "index.ts");

		// Find named imports from './calculator'
		const calculatorImports = references.filter(
			(r) =>
				r.referenceType === "import" &&
				r.metadata.importSource === "./calculator",
		);
		expect(calculatorImports.length).toBeGreaterThanOrEqual(2);

		// Check Calculator import
		const calculatorImport = calculatorImports.find(
			(r) => r.targetName === "Calculator",
		);
		expect(calculatorImport).toBeDefined();
		expect(calculatorImport!.metadata.isDefaultImport).toBeFalsy();
		expect(calculatorImport!.metadata.isNamespaceImport).toBeFalsy();
		expect(calculatorImport!.lineNumber).toBe(6);

		// Check createCalculator import
		const createCalculatorImport = calculatorImports.find(
			(r) => r.targetName === "createCalculator",
		);
		expect(createCalculatorImport).toBeDefined();
	});

	test("extracts type imports", () => {
		const content = loadFixture("index.ts");
		const ast = parseFile("index.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "index.ts");

		// Find type imports from './types'
		const typeImports = references.filter(
			(r) =>
				r.referenceType === "import" && r.metadata.importSource === "./types",
		);
		expect(typeImports.length).toBeGreaterThanOrEqual(4);

		// Check that Product, Result, Status, User are imported
		const importedTypes = typeImports.map((r) => r.targetName);
		expect(importedTypes).toContain("Product");
		expect(importedTypes).toContain("Result");
		expect(importedTypes).toContain("Status");
		expect(importedTypes).toContain("User");
	});

	test("extracts imports from utils with aliases", () => {
		const content = loadFixture("index.ts");
		const ast = parseFile("index.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "index.ts");

		// Find imports from './utils'
		const utilImports = references.filter(
			(r) =>
				r.referenceType === "import" && r.metadata.importSource === "./utils",
		);
		expect(utilImports.length).toBeGreaterThanOrEqual(5);

		// Verify imported names
		const importedNames = utilImports.map((r) => r.targetName);
		expect(importedNames).toContain("doubleNumber");
		expect(importedNames).toContain("err");
		expect(importedNames).toContain("formatUserName");
		expect(importedNames).toContain("isValidEmail");
		expect(importedNames).toContain("ok");
	});

	test("handles empty import specifiers gracefully", () => {
		// Test with a side-effect import
		const content = `import './side-effect';`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		expect(references.length).toBe(1);
		expect(references[0]!.referenceType).toBe("import");
		expect(references[0]!.targetName).toBe("./side-effect");
		expect(references[0]!.metadata.isSideEffectImport).toBe(true);
	});

	test("extracts namespace imports", () => {
		const content = `import * as utils from './utils';`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		expect(references.length).toBe(1);
		expect(references[0]!.targetName).toBe("utils");
		expect(references[0]!.metadata.isNamespaceImport).toBe(true);
		expect(references[0]!.metadata.importSource).toBe("./utils");
	});

	test("extracts default imports", () => {
		const content = `import React from 'react';`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		expect(references.length).toBe(1);
		expect(references[0]!.targetName).toBe("React");
		expect(references[0]!.metadata.isDefaultImport).toBe(true);
		expect(references[0]!.metadata.importSource).toBe("react");
	});

	test("extracts aliased imports", () => {
		const content = `import { foo as bar } from './module';`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		expect(references.length).toBe(1);
		expect(references[0]!.targetName).toBe("foo");
		expect(references[0]!.metadata.importAlias).toBe("bar");
		expect(references[0]!.metadata.importSource).toBe("./module");
	});
});

describe("Reference Extraction - Function Calls", () => {
	test("extracts function calls", () => {
		const content = loadFixture("index.ts");
		const ast = parseFile("index.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "index.ts");

		// Find function call references
		const calls = references.filter((r) => r.referenceType === "call");
		expect(calls.length).toBeGreaterThan(0);

		// Check createCalculator call
		const createCalculatorCall = calls.find(
			(r) => r.targetName === "createCalculator",
		);
		expect(createCalculatorCall).toBeDefined();
		expect(createCalculatorCall?.metadata.isMethodCall).toBe(false);
		expect(createCalculatorCall?.lineNumber).toBe(19);
	});

	test("extracts method calls", () => {
		const content = loadFixture("index.ts");
		const ast = parseFile("index.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "index.ts");

		// Find method call references
		const methodCalls = references.filter(
			(r) => r.referenceType === "call" && r.metadata.isMethodCall === true,
		);
		expect(methodCalls.length).toBeGreaterThan(0);

		// Check calc.add() method call
		const addCall = methodCalls.find((r) => r.targetName === "add");
		expect(addCall).toBeDefined();
		expect(addCall?.metadata.isMethodCall).toBe(true);
		expect(addCall?.lineNumber).toBe(20);
	});

	test("extracts console.log calls", () => {
		const content = loadFixture("index.ts");
		const ast = parseFile("index.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "index.ts");

		// Find console.log calls
		const logCalls = references.filter(
			(r) => r.referenceType === "call" && r.targetName === "log",
		);
		expect(logCalls.length).toBeGreaterThan(0);

		// All log calls should be method calls
		for (const call of logCalls) {
			expect(call.metadata.isMethodCall).toBe(true);
		}
	});

	test("extracts nested function calls", () => {
		const content = `
			const result = doubleNumber(calc.add(5, 3));
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");

		// Should find both doubleNumber() and add() calls
		const calls = references.filter((r) => r.referenceType === "call");
		expect(calls.length).toBeGreaterThanOrEqual(2);

		const doubleNumberCall = calls.find((r) => r.targetName === "doubleNumber");
		const addCall = calls.find((r) => r.targetName === "add");

		expect(doubleNumberCall).toBeDefined();
		expect(addCall).toBeDefined();
	});

	test("handles optional chaining in method calls", () => {
		const content = "obj?.method?.()";
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");

		const calls = references.filter((r) => r.referenceType === "call");
		const methodCall = calls.find((r) => r.targetName === "method");

		expect(methodCall).toBeDefined();
		expect(methodCall?.metadata.isOptionalChaining).toBe(true);
	});
});

describe("Reference Extraction - Property Access", () => {
	test("extracts property access", () => {
		const content = loadFixture("index.ts");
		const ast = parseFile("index.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "index.ts");

		// Find property access references
		const propertyAccess = references.filter(
			(r) => r.referenceType === "property_access",
		);
		expect(propertyAccess.length).toBeGreaterThan(0);

		// Check user.email access
		const emailAccess = propertyAccess.find((r) => r.targetName === "email");
		expect(emailAccess).toBeDefined();
	});

	test("extracts chained property access", () => {
		const content = "const value = obj.foo.bar.baz;";
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");

		const propertyAccess = references.filter(
			(r) => r.referenceType === "property_access",
		);
		expect(propertyAccess.length).toBeGreaterThanOrEqual(3);

		const propertyNames = propertyAccess.map((r) => r.targetName);
		expect(propertyNames).toContain("foo");
		expect(propertyNames).toContain("bar");
		expect(propertyNames).toContain("baz");
	});

	test("handles optional chaining in property access", () => {
		const content = "const value = obj?.prop?.nested;";
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");

		const propertyAccess = references.filter(
			(r) => r.referenceType === "property_access",
		);
		expect(propertyAccess.length).toBeGreaterThanOrEqual(2);

		// Check that optional chaining is tracked
		const optionalAccess = propertyAccess.filter(
			(r) => r.metadata.isOptionalChaining === true,
		);
		expect(optionalAccess.length).toBeGreaterThan(0);
	});

	test("skips computed properties", () => {
		const content = "const value = obj[key];";
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");

		// Should only find the 'obj' identifier in call/property contexts, not 'key'
		// Computed properties cannot be resolved statically, so no property_access reference
		const propertyAccess = references.filter(
			(r) => r.referenceType === "property_access",
		);
		// Computed property should not create a property_access reference
		expect(propertyAccess.length).toBe(0);
	});
});

describe("Reference Extraction - Type References", () => {
	test("extracts TypeScript type references", () => {
		const content = `
			type User = { name: string };
			const user: User = { name: "John" };
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");

		const typeRefs = references.filter(
			(r) => r.referenceType === "type_reference",
		);
		expect(typeRefs.length).toBeGreaterThanOrEqual(1);

		const userTypeRef = typeRefs.find((r) => r.targetName === "User");
		expect(userTypeRef).toBeDefined();
	});

	test("extracts generic type references", () => {
		const content = `
			type Result<T> = { data: T };
			const result: Result<string> = { data: "test" };
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");

		const typeRefs = references.filter(
			(r) => r.referenceType === "type_reference",
		);
		expect(typeRefs.length).toBeGreaterThanOrEqual(1);

		const resultTypeRef = typeRefs.find((r) => r.targetName === "Result");
		expect(resultTypeRef).toBeDefined();
	});

	test("extracts type references from function parameters", () => {
		const content = loadFixture("index.ts");
		const ast = parseFile("index.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "index.ts");

		// Find type references
		const typeRefs = references.filter(
			(r) => r.referenceType === "type_reference",
		);
		expect(typeRefs.length).toBeGreaterThan(0);

		// Check User type reference in processUser function parameter
		const userTypeRefs = typeRefs.filter((r) => r.targetName === "User");
		expect(userTypeRefs.length).toBeGreaterThanOrEqual(1);
	});

	test("extracts type references from return types", () => {
		const content = loadFixture("index.ts");
		const ast = parseFile("index.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "index.ts");

		// Find Result type reference in return type
		const typeRefs = references.filter(
			(r) => r.referenceType === "type_reference",
		);
		const resultTypeRefs = typeRefs.filter((r) => r.targetName === "Result");
		expect(resultTypeRefs.length).toBeGreaterThanOrEqual(1);
	});
});

describe("Reference Extraction - Edge Cases", () => {
	test("handles empty files", () => {
		const content = "";
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		expect(references).toEqual([]);
	});

	test("handles files with no references", () => {
		const content = `
			const x = 5;
			const y = 10;
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		// Should have no references (just variable declarations)
		expect(references.length).toBe(0);
	});

	test("handles files with only comments", () => {
		const content = `
			// This is a comment
			/* This is a block comment */
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		expect(references).toEqual([]);
	});

	test("extracts references from arrow functions", () => {
		const content = `
			const helper = (x: number) => doubleNumber(x);
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");

		// Should find doubleNumber call
		const calls = references.filter((r) => r.referenceType === "call");
		expect(calls.length).toBe(1);
		expect(calls[0]!.targetName).toBe("doubleNumber");
	});

	test("handles complex expressions", () => {
		const content = `
			const result = foo().bar().baz;
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");

		// Should find foo() and bar() calls, and baz property access
		const calls = references.filter((r) => r.referenceType === "call");
		const propertyAccess = references.filter(
			(r) => r.referenceType === "property_access",
		);

		expect(calls.length).toBeGreaterThanOrEqual(2);
		expect(propertyAccess.length).toBeGreaterThanOrEqual(1);
	});
});

describe("Reference Extraction - Re-exports", () => {
	test("extracts named re-exports", () => {
		const content = `export { foo, bar as baz } from './utils';`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const reExports = references.filter((r) => r.referenceType === "re_export");

		expect(reExports.length).toBe(2);

		// foo re-export
		const fooExport = reExports.find((r) => r.targetName === "foo");
		expect(fooExport).toBeDefined();
		expect(fooExport?.metadata.importSource).toBe("./utils");
		expect(fooExport?.metadata.localName).toBe("foo");
		expect(fooExport?.metadata.exportedName).toBe("foo");

		// bar as baz re-export
		const bazExport = reExports.find((r) => r.targetName === "baz");
		expect(bazExport).toBeDefined();
		expect(bazExport?.metadata.localName).toBe("bar");
		expect(bazExport?.metadata.exportedName).toBe("baz");
	});

	test("extracts star re-exports", () => {
		const content = `export * from './validators';`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const exportAll = references.filter((r) => r.referenceType === "export_all");

		expect(exportAll.length).toBe(1);
		expect(exportAll[0]?.targetName).toBe("*");
		expect(exportAll[0]?.metadata.importSource).toBe("./validators");
		expect(exportAll[0]?.metadata.exportedAs).toBeNull();
	});

	test("extracts namespaced star re-exports", () => {
		const content = `export * as utils from './utils';`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const exportAll = references.filter((r) => r.referenceType === "export_all");

		expect(exportAll.length).toBe(1);
		expect(exportAll[0]?.targetName).toBe("utils");
		expect(exportAll[0]?.metadata.importSource).toBe("./utils");
		expect(exportAll[0]?.metadata.exportedAs).toBe("utils");
	});

	test("ignores local exports without source", () => {
		const content = `
			const x = 5;
			export { x };
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const reExports = references.filter((r) => r.referenceType === "re_export");

		// Should not extract local exports as re-exports
		expect(reExports.length).toBe(0);
	});

	test("extracts multiple re-exports from same file", () => {
		const content = `
			export { a, b, c } from './abc';
			export { x } from './xyz';
			export * from './all';
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const reExports = references.filter((r) => r.referenceType === "re_export");
		const exportAll = references.filter((r) => r.referenceType === "export_all");

		expect(reExports.length).toBe(4); // a, b, c, x
		expect(exportAll.length).toBe(1); // *
	});
});

describe("Reference Extraction - Dynamic Imports", () => {
	test("extracts static dynamic imports", () => {
		const content = `const mod = await import('./utils');`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const dynamicImports = references.filter(
			(r) => r.referenceType === "dynamic_import",
		);

		expect(dynamicImports.length).toBe(1);
		expect(dynamicImports[0]?.targetName).toBe("__dynamic_import__");
		expect(dynamicImports[0]?.metadata.importSource).toBe("./utils");
		expect(dynamicImports[0]?.metadata.isDynamic).toBe(true);
	});

	test("extracts lazy React imports", () => {
		const content = `const Dashboard = lazy(() => import('./pages/Dashboard'));`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const dynamicImports = references.filter(
			(r) => r.referenceType === "dynamic_import",
		);

		expect(dynamicImports.length).toBe(1);
		expect(dynamicImports[0]?.metadata.importSource).toBe("./pages/Dashboard");
		expect(dynamicImports[0]?.metadata.isDynamic).toBe(true);
	});

	test("handles template literal imports with pattern", () => {
		const content = "const page = await import(`./pages/${name}`);";
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const dynamicImports = references.filter(
			(r) => r.referenceType === "dynamic_import",
		);

		expect(dynamicImports.length).toBe(1);
		expect(dynamicImports[0]?.metadata.importSource).toBe("./pages/*");
		expect(dynamicImports[0]?.metadata.isTemplatePattern).toBe(true);
	});

	test("handles conditional dynamic imports", () => {
		const content = `
			if (isAdmin) {
				const adminModule = await import('./admin/tools');
			}
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const dynamicImports = references.filter(
			(r) => r.referenceType === "dynamic_import",
		);

		expect(dynamicImports.length).toBe(1);
		expect(dynamicImports[0]?.metadata.importSource).toBe("./admin/tools");
	});

	test("extracts multiple dynamic imports", () => {
		const content = `
			const a = await import('./a');
			const b = await import('./b');
			const c = lazy(() => import('./c'));
		`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const dynamicImports = references.filter(
			(r) => r.referenceType === "dynamic_import",
		);

		expect(dynamicImports.length).toBe(3);
	});

	test("handles unresolvable dynamic imports", () => {
		const content = `const mod = await import(getModulePath());`;
		const ast = parseFile("test.ts", content);
		expect(ast).not.toBeNull();

		const references = extractReferences(ast!, "test.ts");
		const dynamicImports = references.filter(
			(r) => r.referenceType === "dynamic_import",
		);

		expect(dynamicImports.length).toBe(1);
		expect(dynamicImports[0]?.metadata.importSource).toBe("<dynamic>");
	});
});
