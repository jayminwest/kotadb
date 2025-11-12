/**
 * Dependency graph extraction from AST symbols and references.
 *
 * This module constructs file→file and symbol→symbol dependency graphs by:
 * - Converting import references to file dependency edges
 * - Resolving import paths using import-resolver module
 * - Converting call references to symbol dependency edges
 * - Matching callers and callees to symbol positions
 *
 * The extracted dependency graph is stored in the `dependency_graph` table
 * for impact analysis, circular dependency detection, and reference tracking.
 *
 * Key features:
 * - Import path resolution (relative paths, index files, extensions)
 * - Symbol matching by line number range (for call expressions)
 * - Graceful handling of missing targets (log warnings, continue)
 * - Batch processing for performance
 *
 * @see app/src/indexer/import-resolver.ts - Import path resolution logic
 * @see app/src/indexer/circular-detector.ts - Cycle detection algorithms
 * @see app/src/api/queries.ts - Database storage functions
 */

import type { IndexedFile } from "@shared/types/entities";
import type { Symbol as ExtractedSymbol } from "@indexer/symbol-extractor";
import type { Reference } from "@indexer/reference-extractor";
import { resolveImport } from "./import-resolver";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "indexer-dependency-extractor" });

/**
 * Dependency edge in the dependency graph.
 *
 * Represents either a file→file dependency (imports) or a
 * symbol→symbol dependency (function calls, property access).
 *
 * Note: Table name is `dependency_graph` to avoid conflict with
 * existing `dependencies` table for external packages.
 */
export interface DependencyEdge {
	/** Repository UUID */
	repositoryId: string;
	/** Source file UUID (for file dependencies) */
	fromFileId: string | null;
	/** Target file UUID (for file dependencies) */
	toFileId: string | null;
	/** Source symbol UUID (for symbol dependencies) */
	fromSymbolId: string | null;
	/** Target symbol UUID (for symbol dependencies) */
	toSymbolId: string | null;
	/** Dependency type ('file_import' or 'symbol_usage') */
	dependencyType: "file_import" | "symbol_usage";
	/** Additional metadata (import source, call context, etc.) */
	metadata: Record<string, unknown>;
}

/**
 * Extract all dependencies from indexed files, symbols, and references.
 *
 * Main entry point for dependency graph extraction. Combines file→file
 * dependencies (from imports) and symbol→symbol dependencies (from calls).
 *
 * @param files - Indexed files with paths
 * @param symbols - Extracted symbols with positions
 * @param references - Extracted references with types
 * @param repositoryId - Repository UUID
 * @returns Array of dependency edges for database storage
 *
 * @example
 * ```typescript
 * const files = [{ id: 'file1', path: '/repo/src/a.ts', ... }];
 * const symbols = [{ id: 'sym1', file_id: 'file1', name: 'foo', ... }];
 * const references = [{ targetName: 'bar', referenceType: 'import', ... }];
 * const deps = extractDependencies(files, symbols, references, 'repo-uuid');
 * process.stdout.write(`Extracted ${deps.length} dependency edges`);
 * ```
 */
export function extractDependencies(
	files: IndexedFile[],
	symbols: ExtractedSymbol[],
	references: Reference[],
	repositoryId: string,
): DependencyEdge[] {
	const dependencies: DependencyEdge[] = [];

	// Build file dependencies from import references
	const fileDeps = buildFileDependencies(references, files, repositoryId);
	dependencies.push(...fileDeps);

	// Build symbol dependencies from call references
	const symbolDeps = buildSymbolDependencies(
		references,
		symbols,
		files,
		repositoryId,
	);
	dependencies.push(...symbolDeps);

	return dependencies;
}

/**
 * Build file→file dependencies from import references.
 *
 * For each import reference:
 * 1. Extract the import source path from metadata
 * 2. Resolve the import path to an absolute file path
 * 3. Match the target file to an IndexedFile record
 * 4. Create a dependency edge (fromFileId → toFileId)
 *
 * Logs warnings for unresolved imports but continues processing.
 *
 * @param references - All extracted references
 * @param files - Indexed files for path matching
 * @param repositoryId - Repository UUID
 * @returns Array of file dependency edges
 */
export function buildFileDependencies(
	references: Reference[],
	files: IndexedFile[],
	repositoryId: string,
): DependencyEdge[] {
	const dependencies: DependencyEdge[] = [];

	// Create maps for O(1) lookups
	const fileByPath = new Map<string, IndexedFile>();
	for (const file of files) {
		fileByPath.set(file.path, file);
	}

	// Process import references
	for (const ref of references) {
		if (ref.referenceType !== "import") continue;

		// Skip side-effect imports (no specific file target)
		if (ref.metadata.isSideEffectImport) continue;

		const importSource = ref.metadata.importSource;
		if (!importSource) {
			logger.warn("Import reference missing importSource metadata", {
				reference_type: ref.referenceType,
				target_name: ref.targetName,
				line_number: ref.lineNumber,
			});
			continue;
		}

		// Find the source file containing this import
		const sourceFile = files.find((f) => {
			// Match by checking if reference is within this file
			// Note: This requires reference to have file context (added in integration phase)
			return f.id && (ref as any).file_id === f.id;
		});

		if (!sourceFile) {
			logger.warn("Could not find source file for import reference", {
				line_number: ref.lineNumber,
				import_source: importSource,
			});
			continue;
		}

		// Resolve the import path
		const resolvedPath = resolveImport(importSource, sourceFile.path, files);

		if (!resolvedPath) {
			logger.debug("Could not resolve import path", {
				import_source: importSource,
				from_file: sourceFile.path,
			});
			continue;
		}

		// Find the target file
		const targetFile = fileByPath.get(resolvedPath);
		if (!targetFile || !targetFile.id) {
			logger.debug("Resolved import path not found in indexed files", {
				resolved_path: resolvedPath,
				import_source: importSource,
				from_file: sourceFile.path,
			});
			continue;
		}

		// Create dependency edge
		dependencies.push({
			repositoryId,
			fromFileId: sourceFile.id!,
			toFileId: targetFile.id,
			fromSymbolId: null,
			toSymbolId: null,
			dependencyType: "file_import",
			metadata: {
				importSource,
				importAlias: ref.metadata.importAlias,
				isDefaultImport: ref.metadata.isDefaultImport,
				isNamespaceImport: ref.metadata.isNamespaceImport,
			},
		});
	}

	return dependencies;
}

/**
 * Build symbol→symbol dependencies from call references.
 *
 * For each call reference:
 * 1. Find the caller symbol by matching line number to symbol ranges
 * 2. Find the callee symbol by matching target name
 * 3. Create a dependency edge (fromSymbolId → toSymbolId)
 *
 * Handles ambiguous matches (multiple symbols with same name) by:
 * - Preferring symbols in the same file
 * - Logging warnings for ambiguous cases
 * - Skipping unresolved references
 *
 * @param references - All extracted references
 * @param symbols - All extracted symbols with positions
 * @param files - Indexed files for context
 * @param repositoryId - Repository UUID
 * @returns Array of symbol dependency edges
 */
export function buildSymbolDependencies(
	references: Reference[],
	symbols: ExtractedSymbol[],
	files: IndexedFile[],
	repositoryId: string,
): DependencyEdge[] {
	const dependencies: DependencyEdge[] = [];

	// Create symbol lookup maps
	const symbolsByName = new Map<string, ExtractedSymbol[]>();
	for (const symbol of symbols) {
		const existing = symbolsByName.get(symbol.name) || [];
		existing.push(symbol);
		symbolsByName.set(symbol.name, existing);
	}

	// Process call references
	for (const ref of references) {
		if (ref.referenceType !== "call") continue;

		// Find caller symbol (symbol containing this reference)
		const caller = findSymbolByLineNumber(
			(ref as any).file_id,
			ref.lineNumber,
			symbols,
		);

		if (!caller || !(caller as any).id) {
			// Reference not inside a symbol (top-level code)
			// Skip for now, could track file-level calls in future
			continue;
		}

		// Find callee symbol (symbol being called)
		const callees = symbolsByName.get(ref.targetName) || [];

		if (callees.length === 0) {
			// Callee not found (external function, built-in, etc.)
			continue;
		}

		// If multiple callees, prefer one in the same file
		let callee: ExtractedSymbol | null = null;
		if (callees.length === 1) {
			callee = callees[0]!;
		} else {
			// Multiple matches, try to find one in the same file
			const sameFileCallee = callees.find(
				(s) => (s as any).file_id === (ref as any).file_id,
			);
			if (sameFileCallee) {
				callee = sameFileCallee;
			} else {
				// Ambiguous match, log and skip
				logger.debug("Ambiguous call target with multiple matches", {
					target_name: ref.targetName,
					line_number: ref.lineNumber,
					match_count: callees.length,
				});
				continue;
			}
		}

		if (!(callee as any).id) {
			logger.warn("Callee symbol missing id", {
				symbol_name: callee.name,
			});
			continue;
		}

		// Create dependency edge
		dependencies.push({
			repositoryId,
			fromFileId: null,
			toFileId: null,
			fromSymbolId: (caller as any).id,
			toSymbolId: (callee as any).id,
			dependencyType: "symbol_usage",
			metadata: {
				callerName: caller.name,
				calleeName: callee.name,
				isMethodCall: ref.metadata.isMethodCall,
				isOptionalChaining: ref.metadata.isOptionalChaining,
			},
		});
	}

	return dependencies;
}

/**
 * Find the symbol containing a specific line number.
 *
 * Searches for the innermost symbol whose line range includes the given line.
 * For nested symbols (e.g., method inside class), returns the most specific match.
 *
 * @param fileId - File UUID to search within
 * @param lineNumber - Line number to match
 * @param symbols - All symbols to search
 * @returns Matching symbol or null if not found
 */
function findSymbolByLineNumber(
	fileId: string,
	lineNumber: number,
	symbols: ExtractedSymbol[],
): ExtractedSymbol | null {
	let bestMatch: ExtractedSymbol | null = null;
	let smallestRange = Number.POSITIVE_INFINITY;

	for (const symbol of symbols) {
		// Check if symbol is in the same file
		if ((symbol as any).file_id !== fileId) continue;

		// Check if line is within symbol's range
		if (lineNumber >= symbol.lineStart && lineNumber <= symbol.lineEnd) {
			const range = symbol.lineEnd - symbol.lineStart;

			// Prefer smaller range (more specific/nested symbol)
			if (range < smallestRange) {
				bestMatch = symbol;
				smallestRange = range;
			}
		}
	}

	return bestMatch;
}
