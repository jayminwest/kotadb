/**
 * Test utilities for AST parsing validation
 * Provides helpers for comparing symbols, references, and dependency graphs
 */

/**
 * Symbol metadata extracted from AST
 */
export interface ParsedSymbol {
	name: string;
	kind:
		| "function"
		| "class"
		| "interface"
		| "type"
		| "enum"
		| "const"
		| "variable";
	file: string;
	line?: number;
	jsdoc?: string;
}

/**
 * Import/export reference between files
 */
export interface Reference {
	from: string;
	to: string;
	symbols: string[];
	isTypeOnly?: boolean;
}

/**
 * Dependency graph representation
 */
export type DependencyGraph = Map<string, string[]>;

/**
 * Circular dependency cycle
 */
export interface CircularDependency {
	cycle: string[];
}

/**
 * Deep equality comparison for symbols
 * Compares all fields except optional ones (line, jsdoc) unless explicitly provided
 */
export function assertSymbolEquals(
	actual: ParsedSymbol,
	expected: ParsedSymbol,
): void {
	if (actual.name !== expected.name) {
		throw new Error(
			`Symbol name mismatch: expected "${expected.name}", got "${actual.name}"`,
		);
	}

	if (actual.kind !== expected.kind) {
		throw new Error(
			`Symbol kind mismatch for "${actual.name}": expected "${expected.kind}", got "${actual.kind}"`,
		);
	}

	if (actual.file !== expected.file) {
		throw new Error(
			`Symbol file mismatch for "${actual.name}": expected "${expected.file}", got "${actual.file}"`,
		);
	}

	// Only check line if expected has it
	if (expected.line !== undefined && actual.line !== expected.line) {
		throw new Error(
			`Symbol line mismatch for "${actual.name}": expected ${expected.line}, got ${actual.line}`,
		);
	}

	// Only check JSDoc if expected has it
	if (expected.jsdoc !== undefined && actual.jsdoc !== expected.jsdoc) {
		throw new Error(
			`Symbol JSDoc mismatch for "${actual.name}": expected "${expected.jsdoc}", got "${actual.jsdoc}"`,
		);
	}
}

/**
 * Assert that a list of references includes the expected references
 * Validates that expected references are present, allows extra references
 */
export function assertReferencesInclude(
	refs: Reference[],
	expected: Reference[],
): void {
	for (const expectedRef of expected) {
		const match = refs.find(
			(r) => r.from === expectedRef.from && r.to === expectedRef.to,
		);

		if (!match) {
			throw new Error(
				`Expected reference from "${expectedRef.from}" to "${expectedRef.to}" not found`,
			);
		}

		// Validate that all expected symbols are present
		for (const symbol of expectedRef.symbols) {
			if (!match.symbols.includes(symbol)) {
				throw new Error(
					`Expected symbol "${symbol}" in reference from "${expectedRef.from}" to "${expectedRef.to}", but it was not found. Found symbols: ${match.symbols.join(", ")}`,
				);
			}
		}

		// Check type-only flag if specified
		if (expectedRef.isTypeOnly !== undefined) {
			if (match.isTypeOnly !== expectedRef.isTypeOnly) {
				throw new Error(
					`Expected reference from "${expectedRef.from}" to "${expectedRef.to}" to have isTypeOnly=${expectedRef.isTypeOnly}, got ${match.isTypeOnly}`,
				);
			}
		}
	}
}

/**
 * Build a dependency map from import references
 * Maps each file to the list of files it imports from
 */
export function buildDependencyMap(refs: Reference[]): DependencyGraph {
	const graph = new Map<string, string[]>();

	for (const ref of refs) {
		const existing = graph.get(ref.from) || [];
		if (!existing.includes(ref.to)) {
			existing.push(ref.to);
		}
		graph.set(ref.from, existing);
	}

	return graph;
}

/**
 * Find circular dependencies in a dependency graph using depth-first search
 * Returns an array of cycles, where each cycle is an array of file paths
 */
export function findCircularDeps(graph: DependencyGraph): CircularDependency[] {
	const cycles: CircularDependency[] = [];
	const visited = new Set<string>();
	const recursionStack = new Set<string>();

	function dfs(node: string, path: string[]): void {
		if (recursionStack.has(node)) {
			// Found a cycle
			const cycleStart = path.indexOf(node);
			if (cycleStart !== -1) {
				const cycle = [...path.slice(cycleStart), node];
				// Check if this cycle is already recorded (in any rotation)
				const cycleKey = normalizeCycle(cycle);
				const alreadyRecorded = cycles.some(
					(c) => normalizeCycle(c.cycle) === cycleKey,
				);
				if (!alreadyRecorded) {
					cycles.push({ cycle });
				}
			}
			return;
		}

		if (visited.has(node)) {
			return;
		}

		visited.add(node);
		recursionStack.add(node);
		path.push(node);

		const dependencies = graph.get(node) || [];
		for (const dep of dependencies) {
			dfs(dep, [...path]);
		}

		recursionStack.delete(node);
	}

	// Start DFS from each node
	for (const node of graph.keys()) {
		if (!visited.has(node)) {
			dfs(node, []);
		}
	}

	return cycles;
}

/**
 * Normalize a cycle to a canonical form for comparison
 * Rotates the cycle so it starts with the lexicographically smallest element
 */
function normalizeCycle(cycle: string[]): string {
	if (cycle.length === 0) return "";

	// Find the index of the smallest element
	let minIndex = 0;
	for (let i = 1; i < cycle.length - 1; i++) {
		// -1 because last element is duplicate of first
		const currentElement = cycle[i];
		const minElement = cycle[minIndex];
		if (currentElement && minElement && currentElement < minElement) {
			minIndex = i;
		}
	}

	// Rotate the cycle to start with the smallest element
	const rotated = [
		...cycle.slice(minIndex, cycle.length - 1),
		...cycle.slice(0, minIndex),
		cycle[minIndex],
	];

	return rotated.join(" -> ");
}

/**
 * Count symbols by kind in a list of symbols
 * Returns a map of kind -> count
 */
export function countSymbolsByKind(symbols: ParsedSymbol[]): Map<string, number> {
	const counts = new Map<string, number>();

	for (const symbol of symbols) {
		const current = counts.get(symbol.kind) || 0;
		counts.set(symbol.kind, current + 1);
	}

	return counts;
}

/**
 * Filter symbols by file
 */
export function getSymbolsForFile(
	symbols: ParsedSymbol[],
	file: string,
): ParsedSymbol[] {
	return symbols.filter((s) => s.file === file);
}

/**
 * Get all files that a given file imports from
 */
export function getFileDependencies(
	file: string,
	graph: DependencyGraph,
): string[] {
	return graph.get(file) || [];
}

/**
 * Get all files that import from a given file (reverse dependencies)
 */
export function getFileDependents(
	file: string,
	graph: DependencyGraph,
): string[] {
	const dependents: string[] = [];

	for (const [from, tos] of graph.entries()) {
		if (tos.includes(file)) {
			dependents.push(from);
		}
	}

	return dependents;
}
