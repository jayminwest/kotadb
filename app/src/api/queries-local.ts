/**
 * Local mode query implementations for SQLite
 * 
 * This module provides SQLite implementations for core query functions
 * when running in local-first mode (KOTA_LOCAL_MODE=true).
 * 
 * @module @api/queries-local
 */

import { randomUUID } from "node:crypto";
import type { KotaDatabase } from "@db/sqlite/index.js";
import { createLogger } from "@logging/logger.js";
import type { IndexedFile } from "@shared/types";
import type { Symbol as ExtractedSymbol } from "@indexer/symbol-extractor";
import type { Reference } from "@indexer/reference-extractor";

const logger = createLogger({ module: "api-queries-local" });

/**
 * Detect programming language from file path
 */
function detectLanguage(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase();
	const languageMap: Record<string, string> = {
		ts: "typescript",
		tsx: "typescript",
		js: "javascript",
		jsx: "javascript",
		mjs: "javascript",
		cjs: "javascript",
		json: "json",
		py: "python",
		go: "go",
		rs: "rust",
		java: "java",
		cpp: "cpp",
		c: "c",
		h: "c",
	};
	return languageMap[ext ?? ""] ?? "unknown";
}

/**
 * Save indexed files to SQLite database
 */
export function saveIndexedFilesLocal(
	db: KotaDatabase,
	files: IndexedFile[],
	repositoryId: string
): number {
	if (files.length === 0) {
		return 0;
	}

	let count = 0;

	db.transaction(() => {
		const stmt = db.prepare(`
			INSERT OR REPLACE INTO indexed_files (
				id, repository_id, path, content, language,
				size_bytes, content_hash, indexed_at, metadata
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		for (const file of files) {
			const id = randomUUID();
			const language = detectLanguage(file.path);
			const sizeBytes = new TextEncoder().encode(file.content).length;
			const indexedAt = file.indexedAt ? file.indexedAt.toISOString() : new Date().toISOString();
			const metadata = JSON.stringify({ dependencies: file.dependencies || [] });

			stmt.run([
				id,
				repositoryId,
				file.path,
				file.content,
				language,
				sizeBytes,
				null, // content_hash
				indexedAt,
				metadata
			]);
			count++;
		}
	});

	logger.info("Saved indexed files to SQLite", { count, repositoryId });
	return count;
}

/**
 * Store symbols to SQLite database
 */
export function storeSymbolsLocal(
	db: KotaDatabase,
	symbols: ExtractedSymbol[],
	fileId: string
): number {
	if (symbols.length === 0) {
		return 0;
	}

	// Get repository_id from the file
	const fileResult = db.queryOne<{ repository_id: string }>(
		"SELECT repository_id FROM indexed_files WHERE id = ?",
		[fileId]
	);

	if (!fileResult) {
		throw new Error(`File not found: ${fileId}`);
	}

	const repositoryId = fileResult.repository_id;
	let count = 0;

	db.transaction(() => {
		const stmt = db.prepare(`
			INSERT OR REPLACE INTO indexed_symbols (
				id, file_id, repository_id, name, kind,
				line_start, line_end, signature, documentation, metadata
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		for (const symbol of symbols) {
			const id = randomUUID();
			const metadata = JSON.stringify({
				column_start: symbol.columnStart,
				column_end: symbol.columnEnd,
				is_exported: symbol.isExported,
				is_async: symbol.isAsync,
				access_modifier: symbol.accessModifier,
			});

			stmt.run([
				id,
				fileId,
				repositoryId,
				symbol.name,
				symbol.kind,
				symbol.lineStart,
				symbol.lineEnd,
				symbol.signature || null,
				symbol.documentation || null,
				metadata
			]);
			count++;
		}
	});

	logger.info("Stored symbols to SQLite", { count, fileId });
	return count;
}

/**
 * Store references to SQLite database
 */
export function storeReferencesLocal(
	db: KotaDatabase,
	references: Reference[],
	fileId: string
): number {
	if (references.length === 0) {
		return 0;
	}

	// Get repository_id from the file
	const fileResult = db.queryOne<{ repository_id: string }>(
		"SELECT repository_id FROM indexed_files WHERE id = ?",
		[fileId]
	);

	if (!fileResult) {
		throw new Error(`File not found: ${fileId}`);
	}

	const repositoryId = fileResult.repository_id;
	let count = 0;

	db.transaction(() => {
		// First, delete existing references for this file
		db.run("DELETE FROM indexed_references WHERE file_id = ?", [fileId]);

		const stmt = db.prepare(`
			INSERT INTO indexed_references (
				id, file_id, repository_id, symbol_name, target_symbol_id,
				target_file_path, line_number, column_number, reference_type, metadata
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		for (const ref of references) {
			const id = randomUUID();
			const metadata = JSON.stringify({
				target_name: ref.targetName,
				column_number: ref.columnNumber,
				...ref.metadata,
			});

			stmt.run([
				id,
				fileId,
				repositoryId,
				ref.targetName || "unknown",
				null, // target_symbol_id - deferred
				null, // target_file_path - deferred
				ref.lineNumber,
				ref.columnNumber || 0,
				ref.referenceType,
				metadata
			]);
			count++;
		}
	});

	logger.info("Stored references to SQLite", { count, fileId });
	return count;
}

/**
 * Search files using FTS5
 */
export function searchFilesLocal(
	db: KotaDatabase,
	term: string,
	repositoryId: string | undefined,
	limit: number
): IndexedFile[] {
	const hasRepoFilter = repositoryId !== undefined;
	const sql = `
		SELECT
			f.id,
			f.repository_id,
			f.path,
			f.content,
			f.metadata,
			f.indexed_at,
			snippet(indexed_files_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet
		FROM indexed_files_fts fts
		JOIN indexed_files f ON fts.rowid = f.rowid
		WHERE indexed_files_fts MATCH ?
		${hasRepoFilter ? 'AND f.repository_id = ?' : ''}
		ORDER BY bm25(indexed_files_fts)
		LIMIT ?
	`;

	const params = hasRepoFilter ? [term, repositoryId, limit] : [term, limit];
	const rows = db.query<{
		id: string;
		repository_id: string;
		path: string;
		content: string;
		metadata: string;
		indexed_at: string;
	}>(sql, params);

	return rows.map((row) => {
		const metadata = JSON.parse(row.metadata || '{}');
		return {
			id: row.id,
			projectRoot: row.repository_id,
			path: row.path,
			content: row.content,
			dependencies: metadata.dependencies || [],
			indexedAt: new Date(row.indexed_at),
		};
	});
}

/**
 * List recently indexed files
 */
export function listRecentFilesLocal(
	db: KotaDatabase,
	limit: number
): IndexedFile[] {
	const sql = `
		SELECT
			id, repository_id, path, content, metadata, indexed_at
		FROM indexed_files
		ORDER BY indexed_at DESC
		LIMIT ?
	`;

	const rows = db.query<{
		id: string;
		repository_id: string;
		path: string;
		content: string;
		metadata: string;
		indexed_at: string;
	}>(sql, [limit]);

	return rows.map((row) => {
		const metadata = JSON.parse(row.metadata || '{}');
		return {
			id: row.id,
			projectRoot: row.repository_id,
			path: row.path,
			content: row.content,
			dependencies: metadata.dependencies || [],
			indexedAt: new Date(row.indexed_at),
		};
	});
}

/**
 * Resolve file path to file ID
 */
export function resolveFilePathLocal(
	db: KotaDatabase,
	filePath: string,
	repositoryId: string
): string | null {
	const sql = `
		SELECT id
		FROM indexed_files
		WHERE repository_id = ? AND path = ?
		LIMIT 1
	`;

	const result = db.queryOne<{ id: string }>(sql, [repositoryId, filePath]);
	return result?.id || null;
}

/**
 * Store dependency graph edges to SQLite database
 * 
 * Dependency edges represent file→file (imports) and symbol→symbol (calls)
 * relationships extracted from the codebase.
 */
export function storeDependenciesLocal(
	db: KotaDatabase,
	dependencies: Array<{
		repositoryId: string;
		fromFileId: string | null;
		toFileId: string | null;
		fromSymbolId: string | null;
		toSymbolId: string | null;
		dependencyType: "file_import" | "symbol_usage";
		metadata: Record<string, unknown>;
	}>
): number {
	if (dependencies.length === 0) {
		return 0;
	}

	let count = 0;

	db.transaction(() => {
		const stmt = db.prepare(`
			INSERT INTO dependency_graph (
				id, repository_id, from_file_id, to_file_id,
				from_symbol_id, to_symbol_id, dependency_type, metadata
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);

		for (const dep of dependencies) {
			const id = randomUUID();
			const metadata = JSON.stringify(dep.metadata);

			stmt.run([
				id,
				dep.repositoryId,
				dep.fromFileId,
				dep.toFileId,
				dep.fromSymbolId,
				dep.toSymbolId,
				dep.dependencyType,
				metadata
			]);
			count++;
		}
	});

	logger.info("Stored dependencies to SQLite", { count });
	return count;
}

/**
 * Query dependents (reverse lookup): files/symbols that depend on the target
 * 
 * Uses recursive CTE to traverse dependency chain up to specified depth.
 * Includes cycle detection via path tracking.
 */
export function queryDependentsLocal(
	db: KotaDatabase,
	repositoryId: string,
	fileId: string | null,
	symbolId: string | null = null,
	depth: number = 5
): Array<{
	file_id: string | null;
	file_path: string | null;
	symbol_id: string | null;
	symbol_name: string | null;
	dependency_type: string;
	depth: number;
}> {
	// Build recursive CTE query based on whether we're querying by file or symbol
	const targetCondition = symbolId
		? 'AND dg.to_symbol_id = ?'
		: 'AND dg.to_file_id = ?';
	
	const recursiveJoinCondition = symbolId
		? 'dg.to_symbol_id = d.from_symbol_id'
		: 'dg.to_file_id = d.from_file_id';

	const sql = `
		WITH RECURSIVE dependents AS (
			-- Base case: direct dependents
			SELECT
				dg.id,
				dg.from_file_id,
				dg.from_symbol_id,
				dg.dependency_type,
				1 AS depth,
				'/' || dg.id || '/' AS path
			FROM dependency_graph dg
			WHERE dg.repository_id = ?
				${targetCondition}
			
			UNION ALL
			
			-- Recursive case: follow dependency chain
			SELECT
				dg.id,
				dg.from_file_id,
				dg.from_symbol_id,
				dg.dependency_type,
				d.depth + 1,
				d.path || dg.id || '/'
			FROM dependency_graph dg
			JOIN dependents d ON ${recursiveJoinCondition}
			WHERE dg.repository_id = ?
				AND d.depth < ?
				AND INSTR(d.path, '/' || dg.id || '/') = 0
		)
		SELECT DISTINCT
			d.from_file_id AS file_id,
			f.path AS file_path,
			d.from_symbol_id AS symbol_id,
			s.name AS symbol_name,
			d.dependency_type,
			d.depth
		FROM dependents d
		LEFT JOIN indexed_files f ON d.from_file_id = f.id
		LEFT JOIN indexed_symbols s ON d.from_symbol_id = s.id
		ORDER BY d.depth ASC
	`;

	const targetParam = symbolId || fileId;
	const rows = db.query<{
		file_id: string | null;
		file_path: string | null;
		symbol_id: string | null;
		symbol_name: string | null;
		dependency_type: string;
		depth: number;
	}>(sql, [repositoryId, targetParam, repositoryId, depth]);

	return rows;
}

/**
 * Query dependencies (forward lookup): files/symbols that the source depends on
 * 
 * Uses recursive CTE to traverse dependency chain up to specified depth.
 * Includes cycle detection via path tracking.
 */
export function queryDependenciesLocal(
	db: KotaDatabase,
	repositoryId: string,
	fileId: string | null,
	symbolId: string | null = null,
	depth: number = 5
): Array<{
	file_id: string | null;
	file_path: string | null;
	symbol_id: string | null;
	symbol_name: string | null;
	dependency_type: string;
	depth: number;
}> {
	// Build recursive CTE query based on whether we're querying by file or symbol
	const sourceCondition = symbolId
		? 'AND dg.from_symbol_id = ?'
		: 'AND dg.from_file_id = ?';
	
	const recursiveJoinCondition = symbolId
		? 'dg.from_symbol_id = d.to_symbol_id'
		: 'dg.from_file_id = d.to_file_id';

	const sql = `
		WITH RECURSIVE dependencies AS (
			-- Base case: direct dependencies
			SELECT
				dg.id,
				dg.to_file_id,
				dg.to_symbol_id,
				dg.dependency_type,
				1 AS depth,
				'/' || dg.id || '/' AS path
			FROM dependency_graph dg
			WHERE dg.repository_id = ?
				${sourceCondition}
			
			UNION ALL
			
			-- Recursive case: follow dependency chain
			SELECT
				dg.id,
				dg.to_file_id,
				dg.to_symbol_id,
				dg.dependency_type,
				d.depth + 1,
				d.path || dg.id || '/'
			FROM dependency_graph dg
			JOIN dependencies d ON ${recursiveJoinCondition}
			WHERE dg.repository_id = ?
				AND d.depth < ?
				AND INSTR(d.path, '/' || dg.id || '/') = 0
		)
		SELECT DISTINCT
			d.to_file_id AS file_id,
			f.path AS file_path,
			d.to_symbol_id AS symbol_id,
			s.name AS symbol_name,
			d.dependency_type,
			d.depth
		FROM dependencies d
		LEFT JOIN indexed_files f ON d.to_file_id = f.id
		LEFT JOIN indexed_symbols s ON d.to_symbol_id = s.id
		ORDER BY d.depth ASC
	`;

	const sourceParam = symbolId || fileId;
	const rows = db.query<{
		file_id: string | null;
		file_path: string | null;
		symbol_id: string | null;
		symbol_name: string | null;
		dependency_type: string;
		depth: number;
	}>(sql, [repositoryId, sourceParam, repositoryId, depth]);

	return rows;
}


/**
 * Wrapper for queryDependentsLocal that returns DependencyResult format
 * Converts flat array with depth to direct/indirect/cycles structure
 */
export function queryDependentsLocalWrapped(
	db: KotaDatabase,
	fileId: string,
	depth: number,
	includeTests: boolean
): { direct: string[]; indirect: Record<string, string[]>; cycles: string[][] } {
	// First, get the repository_id from the file
	const fileRecord = db.queryOne<{ repository_id: string }>(
		"SELECT repository_id FROM indexed_files WHERE id = ?",
		[fileId]
	);
	
	if (!fileRecord) {
		throw new Error(`File not found: ${fileId}`);
	}
	
	const results = queryDependentsLocal(db, fileRecord.repository_id, fileId, null, depth);
	
	const direct: string[] = [];
	const indirect: Record<string, string[]> = {};
	const cycles: string[][] = [];
	
	// Group results by depth
	for (const result of results) {
		if (!result.file_path) continue;
		
		// Filter test files if requested
		if (!includeTests && (result.file_path.includes("test") || result.file_path.includes("spec"))) {
			continue;
		}
		
		if (result.depth === 1) {
			if (!direct.includes(result.file_path)) {
				direct.push(result.file_path);
			}
		} else {
			// For indirect, we don't have parent path info in the result,
			// so we just use the depth level as the key
			const key = `depth_${result.depth}`;
			if (!indirect[key]) {
				indirect[key] = [];
			}
			if (!indirect[key].includes(result.file_path)) {
				indirect[key].push(result.file_path);
			}
		}
	}
	
	// Note: Cycle detection is handled in the SQL query via path tracking
	// Cycles would create duplicate IDs which are filtered by DISTINCT
	// For full cycle reconstruction, we'd need to track paths in the SQL result
	
	return { direct, indirect, cycles };
}

/**
 * Wrapper for queryDependenciesLocal that returns DependencyResult format
 * Converts flat array with depth to direct/indirect/cycles structure
 */
export function queryDependenciesLocalWrapped(
	db: KotaDatabase,
	fileId: string,
	depth: number
): { direct: string[]; indirect: Record<string, string[]>; cycles: string[][] } {
	// First, get the repository_id from the file
	const fileRecord = db.queryOne<{ repository_id: string }>(
		"SELECT repository_id FROM indexed_files WHERE id = ?",
		[fileId]
	);
	
	if (!fileRecord) {
		throw new Error(`File not found: ${fileId}`);
	}
	
	const results = queryDependenciesLocal(db, fileRecord.repository_id, fileId, null, depth);
	
	const direct: string[] = [];
	const indirect: Record<string, string[]> = {};
	const cycles: string[][] = [];
	
	// Group results by depth
	for (const result of results) {
		if (!result.file_path) continue;
		
		if (result.depth === 1) {
			if (!direct.includes(result.file_path)) {
				direct.push(result.file_path);
			}
		} else {
			// For indirect, we don't have parent path info in the result,
			// so we just use the depth level as the key
			const key = `depth_${result.depth}`;
			if (!indirect[key]) {
				indirect[key] = [];
			}
			if (!indirect[key].includes(result.file_path)) {
				indirect[key].push(result.file_path);
			}
		}
	}
	
	// Note: Cycle detection is handled in the SQL query via path tracking
	// Cycles would create duplicate IDs which are filtered by DISTINCT
	// For full cycle reconstruction, we'd need to track paths in the SQL result
	
	return { direct, indirect, cycles };
}
