import { describe, test, expect } from "bun:test";
import { buildAdjacencyList, findCycles, detectCircularDependencies } from "../src/analysis/circular-detector.js";
import type { DependencyEdge } from "../src/types/dependency.js";

/**
 * Circular Detector Tests
 *
 * Tests circular dependency detection algorithms.
 */

describe("buildAdjacencyList", () => {
	test("builds adjacency list from edges", () => {
		const edges = [
			{ from: "a", to: "b" },
			{ from: "b", to: "c" },
			{ from: "c", to: "a" },
		];

		const graph = buildAdjacencyList(edges);

		expect(graph.get("a")).toEqual(["b"]);
		expect(graph.get("b")).toEqual(["c"]);
		expect(graph.get("c")).toEqual(["a"]);
	});

	test("handles nodes with multiple outgoing edges", () => {
		const edges = [
			{ from: "a", to: "b" },
			{ from: "a", to: "c" },
		];

		const graph = buildAdjacencyList(edges);

		expect(graph.get("a")).toEqual(["b", "c"]);
	});
});

describe("findCycles", () => {
	test("detects simple cycle", () => {
		const graph = new Map([
			["a", ["b"]],
			["b", ["a"]],
		]);

		const cycles = findCycles(graph);

		expect(cycles.length).toBe(1);
		expect(cycles[0]).toContain("a");
		expect(cycles[0]).toContain("b");
	});

	test("detects complex cycle", () => {
		const graph = new Map([
			["a", ["b"]],
			["b", ["c"]],
			["c", ["a"]],
		]);

		const cycles = findCycles(graph);

		expect(cycles.length).toBe(1);
		expect(cycles[0]).toContain("a");
		expect(cycles[0]).toContain("b");
		expect(cycles[0]).toContain("c");
	});

	test("returns empty array for acyclic graph", () => {
		const graph = new Map([
			["a", ["b"]],
			["b", ["c"]],
			["c", []],
		]);

		const cycles = findCycles(graph);

		expect(cycles.length).toBe(0);
	});
});

describe("detectCircularDependencies", () => {
	test("detects file import cycles", () => {
		const dependencies: DependencyEdge[] = [
			{
				fromFileId: "file-a",
				toFileId: "file-b",
				fromSymbolId: null,
				toSymbolId: null,
				dependencyType: "file_import",
				metadata: {},
			},
			{
				fromFileId: "file-b",
				toFileId: "file-a",
				fromSymbolId: null,
				toSymbolId: null,
				dependencyType: "file_import",
				metadata: {},
			},
		];

		const filePaths = new Map([
			["file-a", "/repo/a.ts"],
			["file-b", "/repo/b.ts"],
		]);

		const cycles = detectCircularDependencies(dependencies, filePaths, new Map());

		expect(cycles.length).toBe(1);
		expect(cycles[0]?.type).toBe("file_import");
		expect(cycles[0]?.description).toContain("/repo/a.ts");
		expect(cycles[0]?.description).toContain("/repo/b.ts");
	});

	test("detects symbol usage cycles", () => {
		const dependencies: DependencyEdge[] = [
			{
				fromFileId: null,
				toFileId: null,
				fromSymbolId: "symbol-foo",
				toSymbolId: "symbol-bar",
				dependencyType: "symbol_usage",
				metadata: {},
			},
			{
				fromFileId: null,
				toFileId: null,
				fromSymbolId: "symbol-bar",
				toSymbolId: "symbol-foo",
				dependencyType: "symbol_usage",
				metadata: {},
			},
		];

		const symbolNames = new Map([
			["symbol-foo", "foo"],
			["symbol-bar", "bar"],
		]);

		const cycles = detectCircularDependencies(dependencies, new Map(), symbolNames);

		expect(cycles.length).toBe(1);
		expect(cycles[0]?.type).toBe("symbol_usage");
		expect(cycles[0]?.description).toContain("foo");
		expect(cycles[0]?.description).toContain("bar");
	});
});
