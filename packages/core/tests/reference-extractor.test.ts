import { describe, test, expect } from "bun:test";
import { parseFile } from "../src/parsers/ast-parser.js";
import { extractReferences } from "../src/analysis/reference-extractor.js";

/**
 * Reference Extractor Tests
 *
 * Tests reference extraction from parsed AST.
 */

describe("extractReferences - imports", () => {
	test("extracts named imports", () => {
		const content = `
		import { foo, bar } from './module';
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const references = extractReferences(ast, "test.ts");
		const imports = references.filter((r) => r.referenceType === "import");

		expect(imports.length).toBe(2);
		expect(imports.some((i) => i.targetName === "foo")).toBe(true);
		expect(imports.some((i) => i.targetName === "bar")).toBe(true);
	});

	test("extracts default imports", () => {
		const content = `
		import React from 'react';
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const references = extractReferences(ast, "test.ts");
		const defaultImport = references.find((r) => r.targetName === "React");

		expect(defaultImport).toBeDefined();
		expect(defaultImport?.referenceType).toBe("import");
		expect(defaultImport?.metadata.isDefaultImport).toBe(true);
	});

	test("extracts namespace imports", () => {
		const content = `
		import * as utils from './utils';
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const references = extractReferences(ast, "test.ts");
		const namespaceImport = references.find((r) => r.targetName === "utils");

		expect(namespaceImport).toBeDefined();
		expect(namespaceImport?.referenceType).toBe("import");
		expect(namespaceImport?.metadata.isNamespaceImport).toBe(true);
	});
});

describe("extractReferences - function calls", () => {
	test("extracts function calls", () => {
		const content = `
		function greet() {}
		greet();
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const references = extractReferences(ast, "test.ts");
		const calls = references.filter((r) => r.referenceType === "call");

		expect(calls.length).toBe(1);
		expect(calls[0]?.targetName).toBe("greet");
	});

	test("extracts method calls", () => {
		const content = `
		const obj = {
			method() {}
		};
		obj.method();
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const references = extractReferences(ast, "test.ts");
		const methodCalls = references.filter((r) => 
			r.referenceType === "call" && r.metadata.isMethodCall
		);

		expect(methodCalls.length).toBe(1);
		expect(methodCalls[0]?.targetName).toBe("method");
	});
});

describe("extractReferences - type references", () => {
	test("extracts type references", () => {
		const content = `
		interface User {
			name: string;
		}
		
		function getUser(): User {
			return { name: "test" };
		}
		`;
		const ast = parseFile("test.ts", content);
		
		if (!ast) throw new Error("Failed to parse");
		
		const references = extractReferences(ast, "test.ts");
		const typeRefs = references.filter((r) => r.referenceType === "type_reference");

		expect(typeRefs.length).toBeGreaterThan(0);
		expect(typeRefs.some((t) => t.targetName === "User")).toBe(true);
	});
});
