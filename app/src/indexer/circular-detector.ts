/**
 * Circular dependency detection using depth-first search.
 *
 * This module detects circular dependencies in file→file and symbol→symbol
 * dependency graphs using a DFS-based cycle detection algorithm. It:
 * - Builds adjacency lists from dependency edges
 * - Detects back edges (cycles) during DFS traversal
 * - Reconstructs circular chains from cycle paths
 * - Logs warnings without blocking indexing
 *
 * The algorithm used is a modified DFS that tracks:
 * - Visited nodes (completed traversal)
 * - Current stack (nodes being explored)
 * - Current path (for cycle reconstruction)
 *
 * Limitations:
 * - Detects simple cycles (A→B→A) and complex cycles (A→B→C→A)
 * - May not detect all cycles in graphs with complex structures
 * - Static analysis only (no runtime behavior)
 *
 * @see app/src/indexer/dependency-extractor.ts - Produces dependency edges
 * @see https://en.wikipedia.org/wiki/Cycle_(graph_theory) - Cycle detection theory
 */

import type { DependencyEdge } from "./dependency-extractor";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "indexer-circular-detector" });

/**
 * Circular dependency chain.
 *
 * Represents a detected cycle in the dependency graph as a sequence
 * of node IDs forming a closed loop.
 *
 * For file dependencies: node IDs are file UUIDs or file paths
 * For symbol dependencies: node IDs are symbol UUIDs or symbol names
 */
export interface CircularChain {
	/** Type of dependency forming the cycle */
	type: "file_import" | "symbol_usage";
	/** Ordered sequence of node IDs forming the cycle */
	chain: string[];
	/** Human-readable description (file paths or symbol names) */
	description: string;
}

/**
 * Detect all circular dependencies in a dependency graph.
 *
 * Main entry point for cycle detection. Separates file and symbol dependencies,
 * builds adjacency lists, and runs DFS to find cycles.
 *
 * Returns all detected cycles as CircularChain objects with type and description.
 *
 * @param dependencies - All dependency edges to analyze
 * @param filePathById - Map of file UUIDs to file paths (for descriptions)
 * @param symbolNameById - Map of symbol UUIDs to symbol names (for descriptions)
 * @returns Array of detected circular dependency chains
 *
 * @example
 * ```typescript
 * const deps = [
 *   { fromFileId: 'a', toFileId: 'b', dependencyType: 'file_import', ... },
 *   { fromFileId: 'b', toFileId: 'a', dependencyType: 'file_import', ... }
 * ];
 * const filePaths = new Map([['a', '/repo/a.ts'], ['b', '/repo/b.ts']]);
 * const cycles = detectCircularDependencies(deps, filePaths, new Map());
 * process.stdout.write(cycles); // [{ type: 'file_import', chain: ['a', 'b', 'a'], ... }]
 * ```
 */
export function detectCircularDependencies(
	dependencies: DependencyEdge[],
	filePathById: Map<string, string>,
	symbolNameById: Map<string, string>,
): CircularChain[] {
	const cycles: CircularChain[] = [];

	// Separate file and symbol dependencies
	const fileDeps = dependencies.filter((d) => d.dependencyType === "file_import");
	const symbolDeps = dependencies.filter(
		(d) => d.dependencyType === "symbol_usage",
	);

	// Detect file dependency cycles
	if (fileDeps.length > 0) {
		const fileGraph = buildAdjacencyList(
			fileDeps.map((d) => ({
				from: d.fromFileId!,
				to: d.toFileId!,
			})),
		);

		const fileCycles = findCycles(fileGraph);

		for (const cycle of fileCycles) {
			const paths = cycle.map((id) => filePathById.get(id) || id);
			const circularChain = {
				type: "file_import" as const,
				chain: cycle,
				description: paths.join(" → "),
			};
			cycles.push(circularChain);

			logger.warn("Detected circular file dependency", {
				cycle_type: "file_import",
				cycle_length: cycle.length,
				cycle_description: circularChain.description,
			});
		}
	}

	// Detect symbol dependency cycles
	if (symbolDeps.length > 0) {
		const symbolGraph = buildAdjacencyList(
			symbolDeps.map((d) => ({
				from: d.fromSymbolId!,
				to: d.toSymbolId!,
			})),
		);

		const symbolCycles = findCycles(symbolGraph);

		for (const cycle of symbolCycles) {
			const names = cycle.map((id) => symbolNameById.get(id) || id);
			const circularChain = {
				type: "symbol_usage" as const,
				chain: cycle,
				description: names.join(" → "),
			};
			cycles.push(circularChain);

			logger.warn("Detected circular symbol dependency", {
				cycle_type: "symbol_usage",
				cycle_length: cycle.length,
				cycle_description: circularChain.description,
			});
		}
	}

	return cycles;
}

/**
 * Build adjacency list representation of a directed graph.
 *
 * Converts an edge list (from → to pairs) into a Map where each node
 * maps to an array of its outgoing edges.
 *
 * @param edges - Array of directed edges (from → to)
 * @returns Adjacency list as Map<nodeId, targetIds[]>
 *
 * @example
 * ```typescript
 * const edges = [
 *   { from: 'a', to: 'b' },
 *   { from: 'b', to: 'c' },
 *   { from: 'c', to: 'a' }
 * ];
 * const graph = buildAdjacencyList(edges);
 * process.stdout.write(graph.get('a')); // ['b']
 * process.stdout.write(graph.get('b')); // ['c']
 * process.stdout.write(graph.get('c')); // ['a']
 * ```
 */
export function buildAdjacencyList(
	edges: Array<{ from: string; to: string }>,
): Map<string, string[]> {
	const graph = new Map<string, string[]>();

	for (const edge of edges) {
		if (!graph.has(edge.from)) {
			graph.set(edge.from, []);
		}
		graph.get(edge.from)!.push(edge.to);

		// Ensure target node exists in graph even if it has no outgoing edges
		if (!graph.has(edge.to)) {
			graph.set(edge.to, []);
		}
	}

	return graph;
}

/**
 * Find all cycles in a directed graph using DFS.
 *
 * Uses depth-first search with a stack to detect back edges (edges that
 * point to a node currently in the DFS stack). When a back edge is found,
 * reconstructs the cycle from the current path.
 *
 * @param graph - Adjacency list representation of the graph
 * @returns Array of cycles, where each cycle is an array of node IDs
 *
 * @example
 * ```typescript
 * const graph = new Map([
 *   ['a', ['b']],
 *   ['b', ['c']],
 *   ['c', ['a']]  // Back edge creating cycle
 * ]);
 * const cycles = findCycles(graph);
 * process.stdout.write(cycles); // [['a', 'b', 'c', 'a']]
 * ```
 */
export function findCycles(graph: Map<string, string[]>): string[][] {
	const visited = new Set<string>();
	const stack = new Set<string>();
	const cycles: string[][] = [];

	/**
	 * DFS helper function that explores the graph and detects cycles.
	 *
	 * @param node - Current node being visited
	 * @param path - Path from root to current node
	 */
	function dfs(node: string, path: string[]): void {
		if (stack.has(node)) {
			// Back edge detected - cycle found!
			// Find where the cycle starts in the current path
			const cycleStart = path.indexOf(node);
			if (cycleStart !== -1) {
				// Extract the cycle and close it
				const cycle = path.slice(cycleStart);
				cycle.push(node); // Close the cycle
				cycles.push(cycle);
			}
			return;
		}

		if (visited.has(node)) {
			// Already fully explored this node
			return;
		}

		// Mark as being explored
		stack.add(node);
		path.push(node);

		// Explore neighbors
		const neighbors = graph.get(node) || [];
		for (const neighbor of neighbors) {
			dfs(neighbor, path);
		}

		// Mark as fully explored
		stack.delete(node);
		visited.add(node);
		path.pop();
	}

	// Run DFS from each unvisited node
	for (const node of graph.keys()) {
		if (!visited.has(node)) {
			dfs(node, []);
		}
	}

	return cycles;
}
