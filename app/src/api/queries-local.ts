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
		throw new Error(`File not found: ${'${fileId}'}`);
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
		throw new Error(`File not found: ${'${fileId}'}`);
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
		${'${hasRepoFilter ? \'AND f.repository_id = ?\'  : \'\'}'}
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
