/**
 * Storage adapter interface for code intelligence data.
 *
 * Defines the contract for storing and retrieving symbols, references,
 * and dependencies. Implementations can use in-memory, SQLite, or other backends.
 */

import type { Symbol } from "./symbol.js";
import type { Reference } from "./reference.js";
import type { DependencyEdge } from "./dependency.js";

/**
 * Storage adapter interface.
 *
 * Provides methods for storing and retrieving code intelligence data.
 * Implementations should handle ID generation and data persistence.
 */
export interface StorageAdapter {
	/**
	 * Store a symbol for a file.
	 *
	 * @param fileId - File identifier
	 * @param symbol - Symbol to store
	 * @returns Generated symbol ID
	 */
	storeSymbol(fileId: string, symbol: Symbol): Promise<string>;

	/**
	 * Store a reference for a file.
	 *
	 * @param fileId - File identifier
	 * @param reference - Reference to store
	 * @returns Generated reference ID
	 */
	storeReference(fileId: string, reference: Reference): Promise<string>;

	/**
	 * Store a dependency edge.
	 *
	 * @param dependency - Dependency edge to store
	 * @returns Generated dependency ID
	 */
	storeDependency(dependency: DependencyEdge): Promise<string>;

	/**
	 * Get all symbols for a file.
	 *
	 * @param fileId - File identifier
	 * @returns Array of symbols for the file
	 */
	getSymbolsByFile(fileId: string): Promise<Symbol[]>;

	/**
	 * Get all references for a file.
	 *
	 * @param fileId - File identifier
	 * @returns Array of references for the file
	 */
	getReferencesByFile(fileId: string): Promise<Reference[]>;

	/**
	 * Get all dependencies for a file.
	 *
	 * @param fileId - File identifier
	 * @returns Array of dependency edges involving the file
	 */
	getDependenciesByFile(fileId: string): Promise<DependencyEdge[]>;

	/**
	 * Clear all stored data.
	 *
	 * Used for testing and cleanup.
	 */
	clear(): Promise<void>;
}
