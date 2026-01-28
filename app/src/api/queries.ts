/**
 * Database query layer for indexed data
 * 
 * Local-only implementation using SQLite for all operations.
 * 
 * @module @api/queries
 */

import { randomUUID } from "node:crypto";
import type { Reference } from "@indexer/reference-extractor";
import type { Symbol as ExtractedSymbol, SymbolKind } from "@indexer/symbol-extractor";
import { createLogger } from "@logging/logger.js";
import type { IndexRequest, IndexedFile } from "@shared/types";
import { detectLanguage } from "@shared/language-utils";
import { getGlobalDatabase, type KotaDatabase } from "@db/sqlite/index.js";

const logger = createLogger({ module: "api-queries" });

export interface SearchOptions {
	repositoryId?: string;
	projectId?: string;
	limit?: number;
}

// ============================================================================
// Internal implementations that accept a database parameter
// These are used by both the new API and backward-compatible aliases
// ============================================================================

function saveIndexedFilesInternal(
	db: KotaDatabase,
	files: IndexedFile[],
	repositoryId: string,
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

function storeSymbolsInternal(
	db: KotaDatabase,
	symbols: ExtractedSymbol[],
	fileId: string,
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

function storeReferencesInternal(
	db: KotaDatabase,
	references: Reference[],
	fileId: string,
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

function storeDependenciesInternal(
	db: KotaDatabase,
	dependencies: Array<{
		repositoryId: string;
		fromFileId: string | null;
		toFileId: string | null;
		fromSymbolId: string | null;
		toSymbolId: string | null;
		dependencyType: "file_import" | "symbol_usage";
		metadata: Record<string, unknown>;
	}>,
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
 * Escape a search term for use in SQLite FTS5 MATCH clause.
 * Wraps the entire term in double quotes for exact phrase matching.
 * Escapes internal double quotes by doubling them.
 * 
 * This ensures that:
 * - Multi-word searches match adjacent words in order ("hello world")
 * - Hyphenated terms don't trigger FTS5 operator parsing ("mom-and-pop")
 * - FTS5 keywords (AND, OR, NOT) are treated as literals, not operators
 * 
 * @param term - Raw search term from user input
 * @returns Escaped term safe for FTS5 MATCH clause
 */
function escapeFts5Term(term: string): string {
	// Escape internal double quotes by doubling them
	const escaped = term.replace(/"/g, '""');
	// Wrap in double quotes for exact phrase matching
	return `"${escaped}"`;
}

function searchFilesInternal(
	db: KotaDatabase,
	term: string,
	repositoryId: string | undefined,
	limit: number,
): IndexedFile[] {
	const hasRepoFilter = repositoryId !== undefined;
	const sql = hasRepoFilter
		? `
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
			AND f.repository_id = ?
			ORDER BY bm25(indexed_files_fts)
			LIMIT ?
		`
		: `
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
			ORDER BY bm25(indexed_files_fts)
			LIMIT ?
		`;

	const escapedTerm = escapeFts5Term(term);
	const params = hasRepoFilter ? [escapedTerm, repositoryId, limit] : [escapedTerm, limit];
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

function listRecentFilesInternal(
	db: KotaDatabase,
	limit: number,
	repositoryId?: string,
): IndexedFile[] {
	const hasRepoFilter = repositoryId !== undefined;
	const sql = hasRepoFilter
		? `
			SELECT
				id, repository_id, path, content, metadata, indexed_at
			FROM indexed_files
			WHERE repository_id = ?
			ORDER BY indexed_at DESC
			LIMIT ?
		`
		: `
			SELECT
				id, repository_id, path, content, metadata, indexed_at
			FROM indexed_files
			ORDER BY indexed_at DESC
			LIMIT ?
		`;

	const params = hasRepoFilter ? [repositoryId, limit] : [limit];
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

function resolveFilePathInternal(
	db: KotaDatabase,
	filePath: string,
	repositoryId: string,
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

function ensureRepositoryInternal(
	db: KotaDatabase,
	fullName: string,
	gitUrl?: string,
	defaultBranch?: string,
): string {
	// Check if repository already exists
	const existing = db.queryOne<{ id: string }>(
		"SELECT id FROM repositories WHERE full_name = ?",
		[fullName]
	);

	if (existing) {
		logger.debug("Repository already exists in SQLite", { fullName, id: existing.id });
		return existing.id;
	}

	// Create new repository
	const id = randomUUID();
	const name = fullName.split("/").pop() || fullName;
	const now = new Date().toISOString();

	db.run(`
		INSERT INTO repositories (id, name, full_name, git_url, default_branch, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, [
		id,
		name,
		fullName,
		gitUrl || null,
		defaultBranch || "main",
		now,
		now
	]);

	logger.info("Created repository in SQLite", { fullName, id });
	return id;
}

function updateRepositoryLastIndexedInternal(
	db: KotaDatabase,
	repositoryId: string,
): void {
	const now = new Date().toISOString();
	db.run(
		"UPDATE repositories SET last_indexed_at = ?, updated_at = ? WHERE id = ?",
		[now, now, repositoryId]
	);
	logger.debug("Updated repository last_indexed_at", { repositoryId });
}

// ============================================================================
// Public API - uses global database
// ============================================================================

/**
 * Save indexed files to SQLite database
 * 
 * @param files - Array of indexed files
 * @param repositoryId - Repository UUID
 * @returns Number of files saved
 */
export function saveIndexedFiles(
	files: IndexedFile[],
	repositoryId: string,
): number {
	return saveIndexedFilesInternal(getGlobalDatabase(), files, repositoryId);
}

/**
 * Store symbols extracted from AST into SQLite database.
 *
 * @param symbols - Array of extracted symbols
 * @param fileId - UUID of the indexed file
 * @returns Number of symbols stored
 */
export function storeSymbols(
	symbols: ExtractedSymbol[],
	fileId: string,
): number {
	return storeSymbolsInternal(getGlobalDatabase(), symbols, fileId);
}

/**
 * Store references extracted from AST into SQLite database.
 *
 * @param references - Array of extracted references
 * @param fileId - UUID of the source file
 * @returns Number of references stored
 */
export function storeReferences(
	references: Reference[],
	fileId: string,
): number {
	return storeReferencesInternal(getGlobalDatabase(), references, fileId);
}

/**
 * Store dependency graph edges into SQLite database.
 *
 * @param dependencies - Array of dependency edges
 * @returns Number of dependencies stored
 */
export function storeDependencies(
	dependencies: Array<{
		repositoryId: string;
		fromFileId: string | null;
		toFileId: string | null;
		fromSymbolId: string | null;
		toSymbolId: string | null;
		dependencyType: "file_import" | "symbol_usage";
		metadata: Record<string, unknown>;
	}>,
): number {
	return storeDependenciesInternal(getGlobalDatabase(), dependencies);
}

/**
 * Search indexed files by content term using FTS5.
 *
 * @param term - Search term to match in file content
 * @param options - Search options (repositoryId filter, limit)
 * @returns Array of matching indexed files
 */
export function searchFiles(
	term: string,
	options: SearchOptions = {},
): IndexedFile[] {
	const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
	return searchFilesInternal(getGlobalDatabase(), term, options.repositoryId, limit);
}

/**
 * List recently indexed files.
 *
 * @param limit - Maximum number of files to return
 * @returns Array of recently indexed files
 */
export function listRecentFiles(
	limit: number,
	repositoryId?: string,
): IndexedFile[] {
	return listRecentFilesInternal(getGlobalDatabase(), limit, repositoryId);
}

/**
 * Resolve file path to file UUID.
 *
 * @param filePath - Relative file path to resolve
 * @param repositoryId - Repository UUID
 * @returns File UUID or null if not found
 */
export function resolveFilePath(
	filePath: string,
	repositoryId: string,
): string | null {
	return resolveFilePathInternal(getGlobalDatabase(), filePath, repositoryId);
}

export interface DependencyResult {
	direct: string[];
	indirect: Record<string, string[]>;
	cycles: string[][];
}

/**
 * Query files that depend on the given file (reverse lookup).
 *
 * @param fileId - Target file UUID
 * @param depth - Recursion depth (1-5)
 * @param includeTests - Whether to include test files
 * @returns Dependency result with direct/indirect relationships and cycles
 */
export function queryDependents(
	fileId: string,
	depth: number,
	includeTests: boolean,
): DependencyResult {
	const db = getGlobalDatabase();
	const fileRecord = db.queryOne<{ repository_id: string }>(
		"SELECT repository_id FROM indexed_files WHERE id = ?",
		[fileId]
	);
	
	if (!fileRecord) {
		throw new Error(`File not found: ${fileId}`);
	}
	
	const results = queryDependentsRaw(db, fileRecord.repository_id, fileId, null, depth);
	return processDepthResults(results, includeTests);
}

/**
 * Query files that the given file depends on (forward lookup).
 *
 * @param fileId - Source file UUID
 * @param depth - Recursion depth (1-5)
 * @returns Dependency result with direct/indirect relationships and cycles
 */
export function queryDependencies(
	fileId: string,
	depth: number,
): DependencyResult {
	const db = getGlobalDatabase();
	const fileRecord = db.queryOne<{ repository_id: string }>(
		"SELECT repository_id FROM indexed_files WHERE id = ?",
		[fileId]
	);
	
	if (!fileRecord) {
		throw new Error(`File not found: ${fileId}`);
	}
	
	const results = queryDependenciesRaw(db, fileRecord.repository_id, fileId, null, depth);
	return processDepthResults(results, true);
}

function processDepthResults(
	results: Array<{
		file_path: string | null;
		depth: number;
	}>,
	includeTests: boolean
): DependencyResult {
	const direct: string[] = [];
	const indirect: Record<string, string[]> = {};
	const cycles: string[][] = [];
	
	for (const result of results) {
		if (!result.file_path) continue;
		
		if (!includeTests && (result.file_path.includes("test") || result.file_path.includes("spec"))) {
			continue;
		}
		
		if (result.depth === 1) {
			if (!direct.includes(result.file_path)) {
				direct.push(result.file_path);
			}
		} else {
			const key = `depth_${result.depth}`;
			if (!indirect[key]) {
				indirect[key] = [];
			}
			if (!indirect[key].includes(result.file_path)) {
				indirect[key].push(result.file_path);
			}
		}
	}
	
	return { direct, indirect, cycles };
}

/**
 * Query dependents (reverse lookup): files/symbols that depend on the target
 * 
 * @internal - Use queryDependents() for the wrapped version
 */
export function queryDependentsRaw(
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
	const targetCondition = symbolId
		? 'AND dg.to_symbol_id = ?'
		: 'AND dg.to_file_id = ?';
	
	const recursiveJoinCondition = symbolId
		? 'dg.to_symbol_id = d.from_symbol_id'
		: 'dg.to_file_id = d.from_file_id';

	const sql = `
		WITH RECURSIVE dependents AS (
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
	return db.query<{
		file_id: string | null;
		file_path: string | null;
		symbol_id: string | null;
		symbol_name: string | null;
		dependency_type: string;
		depth: number;
	}>(sql, [repositoryId, targetParam, repositoryId, depth]);
}

/**
 * Query dependencies (forward lookup): files/symbols that the source depends on
 * 
 * @internal - Use queryDependencies() for the wrapped version
 */
export function queryDependenciesRaw(
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
	const sourceCondition = symbolId
		? 'AND dg.from_symbol_id = ?'
		: 'AND dg.from_file_id = ?';
	
	const recursiveJoinCondition = symbolId
		? 'dg.from_symbol_id = d.to_symbol_id'
		: 'dg.from_file_id = d.to_file_id';

	const sql = `
		WITH RECURSIVE dependencies AS (
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
	return db.query<{
		file_id: string | null;
		file_path: string | null;
		symbol_id: string | null;
		symbol_name: string | null;
		dependency_type: string;
		depth: number;
	}>(sql, [repositoryId, sourceParam, repositoryId, depth]);
}

/**
 * Ensure repository exists in SQLite, create if not.
 * 
 * @param fullName - Repository full name (owner/repo format)
 * @param gitUrl - Git URL for the repository (optional)
 * @param defaultBranch - Default branch name (optional, defaults to 'main')
 * @returns Repository UUID
 */
export function ensureRepository(
	fullName: string,
	gitUrl?: string,
	defaultBranch?: string,
): string {
	return ensureRepositoryInternal(getGlobalDatabase(), fullName, gitUrl, defaultBranch);
}

/**
 * Update repository last_indexed_at timestamp.
 * 
 * @param repositoryId - Repository UUID
 */
export function updateRepositoryLastIndexed(
	repositoryId: string,
): void {
	updateRepositoryLastIndexedInternal(getGlobalDatabase(), repositoryId);
}

/**
 * Run indexing workflow for local mode (synchronous, no queue).
 * 
 * @param request - Index request with repository details
 * @returns Indexing result with stats
 */
export async function runIndexingWorkflow(
	request: IndexRequest,
): Promise<{
	repositoryId: string;
	filesIndexed: number;
	symbolsExtracted: number;
	referencesExtracted: number;
	dependenciesExtracted: number;
}> {
	const { existsSync } = await import("node:fs");
	const { resolve } = await import("node:path");
	const { prepareRepository } = await import("@indexer/repos");
	const { discoverSources, parseSourceFile } = await import("@indexer/parsers");
	const { parseFile, isSupportedForAST } = await import("@indexer/ast-parser");
	const { extractSymbols } = await import("@indexer/symbol-extractor");
	const { extractReferences } = await import("@indexer/reference-extractor");
	const { extractDependencies } = await import("@indexer/dependency-extractor");
	const { detectCircularDependencies } = await import("@indexer/circular-detector");

	const db = getGlobalDatabase();

	let localPath: string;
	let fullName = request.repository;

	if (request.localPath) {
		localPath = resolve(request.localPath);

		const workspaceRoot = resolve(process.cwd());
		if (!localPath.startsWith(workspaceRoot)) {
			throw new Error(`localPath must be within workspace: ${workspaceRoot}`);
		}
		if (!fullName.includes("/")) {
			fullName = `local/${fullName}`;
		}
	} else {
		const repo = await prepareRepository(request);
		localPath = repo.localPath;
	}

	if (!existsSync(localPath)) {
		throw new Error(`Repository path does not exist: ${localPath}`);
	}

	const gitUrl = request.localPath ? localPath : `https://github.com/${fullName}.git`;
	const repositoryId = ensureRepository(fullName, gitUrl, request.ref);

	logger.info("Starting local indexing workflow", {
		repositoryId,
		fullName,
		localPath,
	});

	const sources = await discoverSources(localPath);
	const records = (
		await Promise.all(sources.map((source) => parseSourceFile(source, localPath)))
	).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	const filesIndexed = saveIndexedFiles(records, repositoryId);

	const allSymbolsWithFileId: Array<{
		id: string;
		file_id: string;
		name: string;
		kind: SymbolKind;
		lineStart: number;
		lineEnd: number;
		columnStart: number;
		columnEnd: number;
		signature: string | null;
		documentation: string | null;
		isExported: boolean;
	}> = [];
	const allReferencesWithFileId: Array<Reference & { file_id: string }> = [];
	const filesWithId: IndexedFile[] = [];

	let totalSymbols = 0;
	let totalReferences = 0;

	for (const file of records) {
		if (!isSupportedForAST(file.path)) continue;

		const ast = parseFile(file.path, file.content);
		if (!ast) continue;

		const symbols = extractSymbols(ast, file.path);
		const references = extractReferences(ast, file.path);

		const fileRecord = db.queryOne<{ id: string }>(
			"SELECT id FROM indexed_files WHERE repository_id = ? AND path = ?",
			[repositoryId, file.path]
		);

		if (!fileRecord) {
			logger.warn("Could not find file record after indexing", {
				filePath: file.path,
				repositoryId,
			});
			continue;
		}

		filesWithId.push({ ...file, id: fileRecord.id, repository_id: repositoryId });

		const symbolCount = storeSymbols(symbols, fileRecord.id);
		const referenceCount = storeReferences(references, fileRecord.id);

		totalSymbols += symbolCount;
		totalReferences += referenceCount;

		const storedSymbols = db.query<{
			id: string;
			file_id: string;
			name: string;
			kind: SymbolKind;
			line_start: number;
			line_end: number;
			signature: string | null;
			documentation: string | null;
			metadata: string;
		}>(
			"SELECT id, file_id, name, kind, line_start, line_end, signature, documentation, metadata FROM indexed_symbols WHERE file_id = ?",
			[fileRecord.id]
		);

		for (const s of storedSymbols) {
			const metadata = JSON.parse(s.metadata || "{}");
			allSymbolsWithFileId.push({
				id: s.id,
				file_id: s.file_id,
				name: s.name,
				kind: s.kind as SymbolKind,
				lineStart: s.line_start,
				lineEnd: s.line_end,
				columnStart: metadata.column_start || 0,
				columnEnd: metadata.column_end || 0,
				signature: s.signature || null,
				documentation: s.documentation || null,
				isExported: metadata.is_exported || false,
			});
		}

		for (const ref of references) {
			allReferencesWithFileId.push({ ...ref, file_id: fileRecord.id });
		}
	}

	logger.info("Extracting dependency graph", {
		fileCount: filesWithId.length,
		repositoryId,
	});

	const dependencies = extractDependencies(
		filesWithId,
		allSymbolsWithFileId,
		allReferencesWithFileId,
		repositoryId,
	);

	db.run("DELETE FROM dependency_graph WHERE repository_id = ?", [repositoryId]);
	const dependencyCount = storeDependencies(dependencies);

	const filePathById = new Map(filesWithId.map((f) => [f.id!, f.path]));
	const symbolNameById = new Map(allSymbolsWithFileId.map((s) => [s.id, s.name]));

	const circularChains = detectCircularDependencies(dependencies, filePathById, symbolNameById);

	if (circularChains.length > 0) {
		logger.warn("Circular dependency chains detected", {
			chainCount: circularChains.length,
			repositoryId,
			chains: circularChains.map((c) => ({
				type: c.type,
				description: c.description,
			})),
		});
	}

	updateRepositoryLastIndexed(repositoryId);

	logger.info("Local indexing workflow completed", {
		repositoryId,
		filesIndexed,
		symbolsExtracted: totalSymbols,
		referencesExtracted: totalReferences,
		dependenciesExtracted: dependencyCount,
		circularDependencies: circularChains.length,
	});

	return {
		repositoryId,
		filesIndexed,
		symbolsExtracted: totalSymbols,
		referencesExtracted: totalReferences,
		dependenciesExtracted: dependencyCount,
	};
}

// ============================================================================
// Backward-compatible aliases that accept db parameter
// These use the passed database (for tests) rather than the global one
// ============================================================================

/**
 * @deprecated Use saveIndexedFiles() directly
 */
export function saveIndexedFilesLocal(
	db: KotaDatabase,
	files: IndexedFile[],
	repositoryId: string
): number {
	return saveIndexedFilesInternal(db, files, repositoryId);
}

/**
 * @deprecated Use storeSymbols() directly
 */
export function storeSymbolsLocal(
	db: KotaDatabase,
	symbols: ExtractedSymbol[],
	fileId: string
): number {
	return storeSymbolsInternal(db, symbols, fileId);
}

/**
 * @deprecated Use storeReferences() directly
 */
export function storeReferencesLocal(
	db: KotaDatabase,
	references: Reference[],
	fileId: string
): number {
	return storeReferencesInternal(db, references, fileId);
}

/**
 * @deprecated Use searchFiles() directly
 */
export function searchFilesLocal(
	db: KotaDatabase,
	term: string,
	repositoryId: string | undefined,
	limit: number
): IndexedFile[] {
	return searchFilesInternal(db, term, repositoryId, limit);
}

/**
 * @deprecated Use listRecentFiles() directly
 */
export function listRecentFilesLocal(
	db: KotaDatabase,
	limit: number,
	repositoryId?: string,
): IndexedFile[] {
	return listRecentFilesInternal(db, limit, repositoryId);
}

/**
 * @deprecated Use resolveFilePath() directly
 */
export function resolveFilePathLocal(
	db: KotaDatabase,
	filePath: string,
	repositoryId: string
): string | null {
	return resolveFilePathInternal(db, filePath, repositoryId);
}

/**
 * @deprecated Use storeDependencies() directly
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
	return storeDependenciesInternal(db, dependencies);
}

/**
 * @deprecated Use queryDependentsRaw() directly
 */
export const queryDependentsLocal = queryDependentsRaw;

/**
 * @deprecated Use queryDependenciesRaw() directly
 */
export const queryDependenciesLocal = queryDependenciesRaw;

/**
 * @deprecated Use ensureRepository() directly
 */
export function ensureRepositoryLocal(
	db: KotaDatabase,
	fullName: string,
	gitUrl?: string,
	defaultBranch?: string
): string {
	return ensureRepositoryInternal(db, fullName, gitUrl, defaultBranch);
}

/**
 * @deprecated Use updateRepositoryLastIndexed() directly
 */
export function updateRepositoryLastIndexedLocal(
	db: KotaDatabase,
	repositoryId: string
): void {
	return updateRepositoryLastIndexedInternal(db, repositoryId);
}

// Add alias for runIndexingWorkflowLocal
export const runIndexingWorkflowLocal = runIndexingWorkflow;


/**
 * Create default organization for a new user.
 * 
 * @deprecated This function is not available in local-only mode.
 * Organizations are a cloud-only feature.
 */
export async function createDefaultOrganization(
	_client: unknown,
	_userId: string,
	_userEmail?: string,
): Promise<string> {
	throw new Error('createDefaultOrganization() is not available in local-only mode - organizations are a cloud-only feature');
}
