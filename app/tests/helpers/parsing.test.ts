/**
 * Unit tests for AST parsing test utilities
 */

import { describe, expect, test } from "bun:test";
import {
	type ParsedSymbol,
	type Reference,
	assertReferencesInclude,
	assertSymbolEquals,
	buildDependencyMap,
	countSymbolsByKind,
	findCircularDeps,
	getFileDependencies,
	getFileDependents,
	getSymbolsForFile,
} from "./parsing";

describe("assertSymbolEquals", () => {
	test("matches symbols with all fields", () => {
		const actual: ParsedSymbol = {
			name: "myFunction",
			kind: "function",
			file: "utils.ts",
			line: 10,
			jsdoc: "A test function",
		};

		const expected: ParsedSymbol = {
			name: "myFunction",
			kind: "function",
			file: "utils.ts",
			line: 10,
			jsdoc: "A test function",
		};

		expect(() => assertSymbolEquals(actual, expected)).not.toThrow();
	});

	test("matches symbols without optional fields", () => {
		const actual: ParsedSymbol = {
			name: "myFunction",
			kind: "function",
			file: "utils.ts",
		};

		const expected: ParsedSymbol = {
			name: "myFunction",
			kind: "function",
			file: "utils.ts",
		};

		expect(() => assertSymbolEquals(actual, expected)).not.toThrow();
	});

	test("throws on name mismatch", () => {
		const actual: ParsedSymbol = {
			name: "myFunction",
			kind: "function",
			file: "utils.ts",
		};

		const expected: ParsedSymbol = {
			name: "otherFunction",
			kind: "function",
			file: "utils.ts",
		};

		expect(() => assertSymbolEquals(actual, expected)).toThrow(
			'Symbol name mismatch: expected "otherFunction", got "myFunction"',
		);
	});

	test("throws on kind mismatch", () => {
		const actual: ParsedSymbol = {
			name: "myFunction",
			kind: "function",
			file: "utils.ts",
		};

		const expected: ParsedSymbol = {
			name: "myFunction",
			kind: "class",
			file: "utils.ts",
		};

		expect(() => assertSymbolEquals(actual, expected)).toThrow(
			'Symbol kind mismatch for "myFunction": expected "class", got "function"',
		);
	});

	test("throws on file mismatch", () => {
		const actual: ParsedSymbol = {
			name: "myFunction",
			kind: "function",
			file: "utils.ts",
		};

		const expected: ParsedSymbol = {
			name: "myFunction",
			kind: "function",
			file: "helpers.ts",
		};

		expect(() => assertSymbolEquals(actual, expected)).toThrow(
			'Symbol file mismatch for "myFunction": expected "helpers.ts", got "utils.ts"',
		);
	});
});

describe("assertReferencesInclude", () => {
	test("matches when all expected references are present", () => {
		const refs: Reference[] = [
			{ from: "index.ts", to: "utils.ts", symbols: ["formatName", "validate"] },
			{ from: "index.ts", to: "types.ts", symbols: ["User"] },
		];

		const expected: Reference[] = [
			{ from: "index.ts", to: "utils.ts", symbols: ["formatName"] },
		];

		expect(() => assertReferencesInclude(refs, expected)).not.toThrow();
	});

	test("allows extra references not in expected", () => {
		const refs: Reference[] = [
			{ from: "index.ts", to: "utils.ts", symbols: ["formatName"] },
			{ from: "index.ts", to: "types.ts", symbols: ["User"] },
			{ from: "utils.ts", to: "types.ts", symbols: ["User"] },
		];

		const expected: Reference[] = [
			{ from: "index.ts", to: "utils.ts", symbols: ["formatName"] },
		];

		expect(() => assertReferencesInclude(refs, expected)).not.toThrow();
	});

	test("throws when expected reference is missing", () => {
		const refs: Reference[] = [
			{ from: "index.ts", to: "utils.ts", symbols: ["formatName"] },
		];

		const expected: Reference[] = [
			{ from: "index.ts", to: "types.ts", symbols: ["User"] },
		];

		expect(() => assertReferencesInclude(refs, expected)).toThrow(
			'Expected reference from "index.ts" to "types.ts" not found',
		);
	});

	test("throws when expected symbol is missing from reference", () => {
		const refs: Reference[] = [
			{ from: "index.ts", to: "utils.ts", symbols: ["formatName"] },
		];

		const expected: Reference[] = [
			{ from: "index.ts", to: "utils.ts", symbols: ["formatName", "validate"] },
		];

		expect(() => assertReferencesInclude(refs, expected)).toThrow(
			'Expected symbol "validate" in reference',
		);
	});

	test("validates isTypeOnly flag when specified", () => {
		const refs: Reference[] = [
			{
				from: "index.ts",
				to: "types.ts",
				symbols: ["User"],
				isTypeOnly: true,
			},
		];

		const expected: Reference[] = [
			{
				from: "index.ts",
				to: "types.ts",
				symbols: ["User"],
				isTypeOnly: true,
			},
		];

		expect(() => assertReferencesInclude(refs, expected)).not.toThrow();
	});
});

describe("buildDependencyMap", () => {
	test("builds graph from single reference", () => {
		const refs: Reference[] = [
			{ from: "index.ts", to: "utils.ts", symbols: ["formatName"] },
		];

		const graph = buildDependencyMap(refs);

		expect(graph.get("index.ts")).toEqual(["utils.ts"]);
	});

	test("builds graph from multiple references", () => {
		const refs: Reference[] = [
			{ from: "index.ts", to: "utils.ts", symbols: ["formatName"] },
			{ from: "index.ts", to: "types.ts", symbols: ["User"] },
			{ from: "utils.ts", to: "types.ts", symbols: ["User"] },
		];

		const graph = buildDependencyMap(refs);

		expect(graph.get("index.ts")).toEqual(["utils.ts", "types.ts"]);
		expect(graph.get("utils.ts")).toEqual(["types.ts"]);
	});

	test("deduplicates multiple references to same file", () => {
		const refs: Reference[] = [
			{ from: "index.ts", to: "utils.ts", symbols: ["formatName"] },
			{ from: "index.ts", to: "utils.ts", symbols: ["validate"] },
		];

		const graph = buildDependencyMap(refs);

		expect(graph.get("index.ts")).toEqual(["utils.ts"]);
	});

	test("returns empty graph for empty references", () => {
		const refs: Reference[] = [];
		const graph = buildDependencyMap(refs);

		expect(graph.size).toBe(0);
	});
});

describe("findCircularDeps", () => {
	test("finds no cycles in acyclic graph", () => {
		const graph = new Map<string, string[]>([
			["index.ts", ["utils.ts", "types.ts"]],
			["utils.ts", ["types.ts"]],
		]);

		const cycles = findCircularDeps(graph);

		expect(cycles).toHaveLength(0);
	});

	test("finds simple circular dependency", () => {
		const graph = new Map<string, string[]>([
			["routes.ts", ["handlers.ts"]],
			["handlers.ts", ["routes.ts"]],
		]);

		const cycles = findCircularDeps(graph);

		expect(cycles).toHaveLength(1);
		expect(cycles[0]?.cycle).toContain("routes.ts");
		expect(cycles[0]?.cycle).toContain("handlers.ts");
	});

	test("finds self-referential cycle", () => {
		const graph = new Map<string, string[]>([["utils.ts", ["utils.ts"]]]);

		const cycles = findCircularDeps(graph);

		expect(cycles).toHaveLength(1);
		expect(cycles[0]?.cycle).toContain("utils.ts");
	});

	test("finds three-way circular dependency", () => {
		const graph = new Map<string, string[]>([
			["a.ts", ["b.ts"]],
			["b.ts", ["c.ts"]],
			["c.ts", ["a.ts"]],
		]);

		const cycles = findCircularDeps(graph);

		expect(cycles).toHaveLength(1);
		expect(cycles[0]?.cycle).toContain("a.ts");
		expect(cycles[0]?.cycle).toContain("b.ts");
		expect(cycles[0]?.cycle).toContain("c.ts");
	});

	test("returns empty array for empty graph", () => {
		const graph = new Map<string, string[]>();
		const cycles = findCircularDeps(graph);

		expect(cycles).toHaveLength(0);
	});
});

describe("countSymbolsByKind", () => {
	test("counts symbols by kind", () => {
		const symbols: ParsedSymbol[] = [
			{ name: "fn1", kind: "function", file: "utils.ts" },
			{ name: "fn2", kind: "function", file: "utils.ts" },
			{ name: "MyClass", kind: "class", file: "utils.ts" },
			{ name: "User", kind: "interface", file: "types.ts" },
		];

		const counts = countSymbolsByKind(symbols);

		expect(counts.get("function")).toBe(2);
		expect(counts.get("class")).toBe(1);
		expect(counts.get("interface")).toBe(1);
	});

	test("returns empty map for empty symbols", () => {
		const symbols: ParsedSymbol[] = [];
		const counts = countSymbolsByKind(symbols);

		expect(counts.size).toBe(0);
	});
});

describe("getSymbolsForFile", () => {
	test("filters symbols by file", () => {
		const symbols: ParsedSymbol[] = [
			{ name: "fn1", kind: "function", file: "utils.ts" },
			{ name: "fn2", kind: "function", file: "utils.ts" },
			{ name: "User", kind: "interface", file: "types.ts" },
		];

		const filtered = getSymbolsForFile(symbols, "utils.ts");

		expect(filtered).toHaveLength(2);
		expect(filtered.every((s) => s.file === "utils.ts")).toBe(true);
	});

	test("returns empty array when no symbols match", () => {
		const symbols: ParsedSymbol[] = [
			{ name: "fn1", kind: "function", file: "utils.ts" },
		];

		const filtered = getSymbolsForFile(symbols, "types.ts");

		expect(filtered).toHaveLength(0);
	});
});

describe("getFileDependencies", () => {
	test("gets dependencies for file", () => {
		const graph = new Map<string, string[]>([
			["index.ts", ["utils.ts", "types.ts"]],
			["utils.ts", ["types.ts"]],
		]);

		const deps = getFileDependencies("index.ts", graph);

		expect(deps).toEqual(["utils.ts", "types.ts"]);
	});

	test("returns empty array for file with no dependencies", () => {
		const graph = new Map<string, string[]>([["types.ts", []]]);

		const deps = getFileDependencies("types.ts", graph);

		expect(deps).toEqual([]);
	});

	test("returns empty array for file not in graph", () => {
		const graph = new Map<string, string[]>();

		const deps = getFileDependencies("missing.ts", graph);

		expect(deps).toEqual([]);
	});
});

describe("getFileDependents", () => {
	test("gets files that depend on target file", () => {
		const graph = new Map<string, string[]>([
			["index.ts", ["utils.ts", "types.ts"]],
			["utils.ts", ["types.ts"]],
		]);

		const dependents = getFileDependents("types.ts", graph);

		expect(dependents).toContain("index.ts");
		expect(dependents).toContain("utils.ts");
		expect(dependents).toHaveLength(2);
	});

	test("returns empty array for file with no dependents", () => {
		const graph = new Map<string, string[]>([
			["index.ts", ["utils.ts"]],
			["utils.ts", []],
		]);

		const dependents = getFileDependents("index.ts", graph);

		expect(dependents).toEqual([]);
	});

	test("returns empty array for file not in graph", () => {
		const graph = new Map<string, string[]>();

		const dependents = getFileDependents("missing.ts", graph);

		expect(dependents).toEqual([]);
	});
});
