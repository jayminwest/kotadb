/**
 * Dependency graph type definitions.
 *
 * Represents file→file and symbol→symbol dependency edges for
 * impact analysis and circular dependency detection.
 */

/**
 * Dependency edge in the dependency graph.
 *
 * Represents either a file→file dependency (imports) or a
 * symbol→symbol dependency (function calls, property access).
 */
export interface DependencyEdge {
	/** Source file ID (for file dependencies) */
	fromFileId: string | null;
	/** Target file ID (for file dependencies) */
	toFileId: string | null;
	/** Source symbol ID (for symbol dependencies) */
	fromSymbolId: string | null;
	/** Target symbol ID (for symbol dependencies) */
	toSymbolId: string | null;
	/** Dependency type ('file_import' or 'symbol_usage') */
	dependencyType: "file_import" | "symbol_usage";
	/** Additional metadata (import source, call context, etc.) */
	metadata: Record<string, unknown>;
}

/**
 * Circular dependency chain.
 *
 * Represents a detected cycle in the dependency graph as a sequence
 * of node IDs forming a closed loop.
 *
 * For file dependencies: node IDs are file IDs or file paths
 * For symbol dependencies: node IDs are symbol IDs or symbol names
 */
export interface CircularChain {
	/** Type of dependency forming the cycle */
	type: "file_import" | "symbol_usage";
	/** Ordered sequence of node IDs forming the cycle */
	chain: string[];
	/** Human-readable description (file paths or symbol names) */
	description: string;
}
