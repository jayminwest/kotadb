/**
 * Circular dependency detector unit tests.
 *
 * Tests cycle detection using DFS algorithm.
 * Uses simple graph structures to verify correctness.
 */

import { describe, it, expect } from "bun:test";
import {
	buildAdjacencyList,
	findCycles,
	detectCircularDependencies,
} from "@indexer/circular-detector";
import type { DependencyEdge } from "@indexer/dependency-extractor";

describe("circular-detector", () => {
	describe("buildAdjacencyList", () => {
		it("builds adjacency list from edges", () => {
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

		it("handles nodes with no outgoing edges", () => {
			const edges = [{ from: "a", to: "b" }];

			const graph = buildAdjacencyList(edges);

			expect(graph.get("a")).toEqual(["b"]);
			expect(graph.get("b")).toEqual([]);
		});

		it("handles multiple edges from same node", () => {
			const edges = [
				{ from: "a", to: "b" },
				{ from: "a", to: "c" },
			];

			const graph = buildAdjacencyList(edges);

			expect(graph.get("a")).toEqual(["b", "c"]);
		});
	});

	describe("findCycles", () => {
		it("detects simple cycle (A→B→A)", () => {
			const graph = new Map([
				["a", ["b"]],
				["b", ["a"]],
			]);

			const cycles = findCycles(graph);

			expect(cycles.length).toBe(1);
			expect(cycles[0]).toContain("a");
			expect(cycles[0]).toContain("b");
		});

		it("detects complex cycle (A→B→C→A)", () => {
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

		it("detects self-reference (A→A)", () => {
			const graph = new Map([["a", ["a"]]]);

			const cycles = findCycles(graph);

			expect(cycles.length).toBe(1);
			expect(cycles[0]).toContain("a");
		});

		it("returns empty array for linear graph (no cycles)", () => {
			const graph = new Map([
				["a", ["b"]],
				["b", ["c"]],
				["c", []],
			]);

			const cycles = findCycles(graph);

			expect(cycles.length).toBe(0);
		});

		it("detects multiple independent cycles", () => {
			const graph = new Map([
				["a", ["b"]],
				["b", ["a"]],
				["c", ["d"]],
				["d", ["c"]],
			]);

			const cycles = findCycles(graph);

			expect(cycles.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("detectCircularDependencies", () => {
		it("detects file import cycles", () => {
			const dependencies: DependencyEdge[] = [
				{
					repositoryId: "repo1",
					fromFileId: "file1",
					toFileId: "file2",
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import",
					metadata: {},
				},
				{
					repositoryId: "repo1",
					fromFileId: "file2",
					toFileId: "file1",
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import",
					metadata: {},
				},
			];

			const filePathById = new Map([
				["file1", "/repo/src/a.ts"],
				["file2", "/repo/src/b.ts"],
			]);

			const chains = detectCircularDependencies(
				dependencies,
				filePathById,
				new Map(),
			);

			expect(chains.length).toBe(1);
			expect(chains[0]?.type).toBe("file_import");
			expect(chains[0]?.description).toContain("/repo/src/a.ts");
			expect(chains[0]?.description).toContain("/repo/src/b.ts");
		});

		it("detects symbol usage cycles", () => {
			const dependencies: DependencyEdge[] = [
				{
					repositoryId: "repo1",
					fromFileId: null,
					toFileId: null,
					fromSymbolId: "sym1",
					toSymbolId: "sym2",
					dependencyType: "symbol_usage",
					metadata: {},
				},
				{
					repositoryId: "repo1",
					fromFileId: null,
					toFileId: null,
					fromSymbolId: "sym2",
					toSymbolId: "sym1",
					dependencyType: "symbol_usage",
					metadata: {},
				},
			];

			const symbolNameById = new Map([
				["sym1", "functionA"],
				["sym2", "functionB"],
			]);

			const chains = detectCircularDependencies(
				dependencies,
				new Map(),
				symbolNameById,
			);

			expect(chains.length).toBe(1);
			expect(chains[0]?.type).toBe("symbol_usage");
			expect(chains[0]?.description).toContain("functionA");
			expect(chains[0]?.description).toContain("functionB");
		});

		it("returns empty array when no cycles detected", () => {
			const dependencies: DependencyEdge[] = [
				{
					repositoryId: "repo1",
					fromFileId: "file1",
					toFileId: "file2",
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import",
					metadata: {},
				},
				{
					repositoryId: "repo1",
					fromFileId: "file2",
					toFileId: "file3",
					fromSymbolId: null,
					toSymbolId: null,
					dependencyType: "file_import",
					metadata: {},
				},
			];

			const filePathById = new Map([
				["file1", "/repo/src/a.ts"],
				["file2", "/repo/src/b.ts"],
				["file3", "/repo/src/c.ts"],
			]);

			const chains = detectCircularDependencies(
				dependencies,
				filePathById,
				new Map(),
			);

			expect(chains.length).toBe(0);
		});
	});
});
