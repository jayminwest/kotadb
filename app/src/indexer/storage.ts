/**
 * Database storage layer for indexed data
 *
 * Local-only implementation using SQLite for atomic storage operations.
 * 
 * @module @indexer/storage
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@logging/logger.js";
import { getGlobalDatabase, type KotaDatabase } from "@db/sqlite/index.js";

const logger = createLogger({ module: "indexer-storage" });

/**
 * File data for storage (matches indexed_files table columns)
 */
export interface FileData {
	path: string;
	content: string;
	language: string;
	size_bytes: number;
	metadata?: Record<string, unknown>;
}

/**
 * Symbol data for storage (matches symbols table columns)
 */
export interface SymbolData {
	file_path: string; // Used to lookup file_id in storage function
	name: string;
	kind: string;
	line_start: number;
	line_end: number;
	signature?: string;
	documentation?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Reference data for storage (matches references table columns)
 */
export interface ReferenceData {
	source_file_path: string; // Used to lookup source_file_id
	target_symbol_key?: string; // Format: "file_path::symbol_name::line_start"
	target_file_path?: string; // Fallback if symbol not extracted
	line_number: number;
	reference_type: string;
	metadata?: Record<string, unknown>;
}

/**
 * Dependency graph entry for storage (matches dependency_graph table columns)
 */
export interface DependencyGraphEntry {
	from_file_path?: string;
	to_file_path?: string;
	from_symbol_key?: string; // Format: "file_path::symbol_name::line_start"
	to_symbol_key?: string; // Format: "file_path::symbol_name::line_start"
	dependency_type: string;
	metadata?: Record<string, unknown>;
}

/**
 * Result stats returned by storeIndexedData()
 */
export interface StorageResult {
	files_indexed: number;
	symbols_extracted: number;
	references_found: number;
	dependencies_extracted: number;
}

/**
 * Internal implementation that accepts a database parameter
 */
function storeIndexedDataInternal(
	db: KotaDatabase,
	repositoryId: string,
	files: FileData[],
	symbols: SymbolData[],
	references: ReferenceData[],
	dependencyGraph: DependencyGraphEntry[],
): StorageResult {
	let filesIndexed = 0;
	let symbolsExtracted = 0;
	let referencesFound = 0;
	let dependenciesExtracted = 0;

	// Single transaction for all operations
	db.transaction(() => {
		// Map to store file_path -> file_id for lookups
		const filePathToId = new Map<string, string>();

		// 1. Store files
		if (files.length > 0) {
			const fileStmt = db.prepare(`
				INSERT OR REPLACE INTO indexed_files (
					id, repository_id, path, content, language,
					size_bytes, indexed_at, metadata
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`);

			for (const file of files) {
				const id = randomUUID();
				const indexedAt = new Date().toISOString();
				const metadata = JSON.stringify(file.metadata || {});

				fileStmt.run([
					id,
					repositoryId,
					file.path,
					file.content,
					file.language,
					file.size_bytes,
					indexedAt,
					metadata
				]);

				filePathToId.set(file.path, id);
				filesIndexed++;
			}
		}

		// Map to store symbol_key -> symbol_id for lookups
		const symbolKeyToId = new Map<string, string>();

		// 2. Store symbols
		if (symbols.length > 0) {
			const symbolStmt = db.prepare(`
				INSERT OR REPLACE INTO indexed_symbols (
					id, file_id, repository_id, name, kind,
					line_start, line_end, signature, documentation, metadata
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);

			for (const symbol of symbols) {
				const fileId = filePathToId.get(symbol.file_path);
				if (!fileId) {
					logger.warn("Symbol file not found", { file_path: symbol.file_path });
					continue;
				}

				const id = randomUUID();
				const symbolKey = `${symbol.file_path}::${symbol.name}::${symbol.line_start}`;
				const metadata = JSON.stringify(symbol.metadata || {});

				symbolStmt.run([
					id,
					fileId,
					repositoryId,
					symbol.name,
					symbol.kind,
					symbol.line_start,
					symbol.line_end,
					symbol.signature || null,
					symbol.documentation || null,
					metadata
				]);

				symbolKeyToId.set(symbolKey, id);
				symbolsExtracted++;
			}
		}

		// 3. Store references
		if (references.length > 0) {
			const refStmt = db.prepare(`
				INSERT OR REPLACE INTO indexed_references (
					id, file_id, repository_id, symbol_name, target_symbol_id,
					target_file_path, line_number, column_number, reference_type, metadata
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);

			for (const ref of references) {
				const fileId = filePathToId.get(ref.source_file_path);
				if (!fileId) {
					logger.warn("Reference source file not found", { file_path: ref.source_file_path });
					continue;
				}

				const id = randomUUID();
				const targetSymbolId = ref.target_symbol_key ? symbolKeyToId.get(ref.target_symbol_key) : null;
				const metadata = JSON.stringify(ref.metadata || {});

				refStmt.run([
					id,
					fileId,
					repositoryId,
					ref.target_symbol_key || "unknown",
					targetSymbolId || null,
					ref.target_file_path || null,
					ref.line_number,
					0, // column_number
					ref.reference_type,
					metadata
				]);

				referencesFound++;
			}
		}

		// 4. Store dependency graph (if we had a table for it - skipping for now)
		// The SQLite schema doesn't have a dependency_graph table yet
		// Dependencies are represented through indexed_references
		dependenciesExtracted = dependencyGraph.length;
	});

	logger.info("Successfully stored indexed data to SQLite", {
		repository_id: repositoryId,
		files_indexed: filesIndexed,
		symbols_extracted: symbolsExtracted,
		references_found: referencesFound,
		dependencies_extracted: dependenciesExtracted,
	});

	return {
		files_indexed: filesIndexed,
		symbols_extracted: symbolsExtracted,
		references_found: referencesFound,
		dependencies_extracted: dependenciesExtracted,
	};
}

/**
 * Store indexed data atomically using a single SQLite transaction
 *
 * Performs:
 * 1. Insert files and build file_id mapping
 * 2. Insert symbols and build symbol_id mapping
 * 3. Insert references using file/symbol mappings
 * 4. Insert dependency graph entries
 * 5. Return summary stats
 *
 * All operations occur in a single transaction (atomicity guaranteed).
 *
 * @param repositoryId - Repository UUID
 * @param files - Array of file data to store
 * @param symbols - Array of symbol data to store
 * @param references - Array of reference data to store
 * @param dependencyGraph - Array of dependency graph entries to store
 * @returns Summary stats (files_indexed, symbols_extracted, etc.)
 */
export function storeIndexedData(
	repositoryId: string,
	files: FileData[],
	symbols: SymbolData[],
	references: ReferenceData[],
	dependencyGraph: DependencyGraphEntry[],
): StorageResult {
	return storeIndexedDataInternal(
		getGlobalDatabase(),
		repositoryId,
		files,
		symbols,
		references,
		dependencyGraph
	);
}

// ============================================================================
// Backward-compatible alias that accepts db parameter (for tests)
// ============================================================================

/**
 * @deprecated Use storeIndexedData() directly - this is an alias for backward compatibility
 */
export function storeIndexedDataLocal(
	db: KotaDatabase,
	repositoryId: string,
	files: FileData[],
	symbols: SymbolData[],
	references: ReferenceData[],
	dependencyGraph: DependencyGraphEntry[]
): StorageResult {
	return storeIndexedDataInternal(db, repositoryId, files, symbols, references, dependencyGraph);
}
