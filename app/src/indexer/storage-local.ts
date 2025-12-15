/**
 * Local mode storage implementation for SQLite
 * 
 * This module provides the SQLite implementation of storeIndexedData
 * for local-first operation.
 * 
 * @module @indexer/storage-local
 */

import { randomUUID } from "node:crypto";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { createLogger } from "@logging/logger.js";
import type {
	FileData,
	SymbolData,
	ReferenceData,
	DependencyGraphEntry,
	StorageResult
} from "./storage.js";

const logger = createLogger({ module: "indexer-storage-local" });

/**
 * Store indexed data in SQLite using a single transaction
 */
export function storeIndexedDataLocal(
	db: KotaDatabase,
	repositoryId: string,
	files: FileData[],
	symbols: SymbolData[],
	references: ReferenceData[],
	dependencyGraph: DependencyGraphEntry[]
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
