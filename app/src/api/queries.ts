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
import { resolveImport } from "@indexer/import-resolver.js";

const logger = createLogger({ module: "api-queries" });


/**
 * Normalize file path to consistent format for database storage.
 * 
 * Rules:
 * - No leading slashes
 * - Forward slashes only (replace backslashes)
 * - No ./ prefix
 * - Consistent relative-to-repo-root format
 * 
 * @param filePath - Absolute or relative file path
 * @returns Normalized relative path
 */
function normalizePath(filePath: string): string {
	let normalized = filePath;
	
	// Replace backslashes with forward slashes
	normalized = normalized.replace(/\\/g, '/');
	
	// Remove leading slash if present
	if (normalized.startsWith('/')) {
		normalized = normalized.slice(1);
	}
	
	// Remove ./ prefix
	if (normalized.startsWith('./')) {
		normalized = normalized.slice(2);
	}
	
	return normalized;
}

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
	fileId: string,
	repositoryId: string,
	filePath: string,
	references: Reference[],
	allFiles: Array<{ path: string }>,
): number {
	if (references.length === 0) {
		return 0;
	}

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
			
			// Resolve target_file_path for import references
			let targetFilePath: string | null = null;
			if (ref.referenceType === 'import' && ref.metadata?.importSource) {
				const resolved = resolveImport(
					ref.metadata.importSource,
					filePath,
					allFiles
				);
				
				// Normalize path if resolved
				if (resolved) {
					targetFilePath = normalizePath(resolved);
				}
			}

			stmt.run([
				id,
				fileId,
				repositoryId,
				ref.targetName || "unknown",
				null, // target_symbol_id - deferred
				targetFilePath, // NOW RESOLVED for imports
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
	fileId: string,
	filePath: string,
	references: Reference[],
	allFiles: Array<{ path: string }>
): number {
	const db = getGlobalDatabase();

	// Get repository_id from file
	const result = db.queryOne<{ repository_id: string }>(
		"SELECT repository_id FROM indexed_files WHERE id = ?",
		[fileId]
	);

	if (!result) {
		throw new Error(`File not found: ${fileId}`);
	}

	return storeReferencesInternal(
		db, 
		fileId, 
		result.repository_id, 
		filePath,
		references,
		allFiles
	);
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
/**
 * Query files that depend on the given file (reverse lookup).
 *
 * Uses recursive CTE on indexed_references table to traverse the dependency graph.
 * Supports depth limiting, cycle detection, and test file filtering.
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
	
	// Get repository_id and path for target file
	const fileRecord = db.queryOne<{ repository_id: string; path: string }>(
		"SELECT repository_id, path FROM indexed_files WHERE id = ?",
		[fileId]
	);
	
	if (!fileRecord) {
		throw new Error(`File not found: ${fileId}`);
	}
	
	const sql = `
		WITH RECURSIVE 
		dependents AS (
			SELECT
				f.id AS file_id,
				f.path AS file_path,
				1 AS depth,
				'|' || f.path || '|' AS path_tracker
			FROM indexed_references r
			JOIN indexed_files f ON r.file_id = f.id
			WHERE r.reference_type = 'import'
				AND r.repository_id = ?
				AND r.target_file_path = ?
			
			UNION ALL
			
			SELECT
				f2.id AS file_id,
				f2.path AS file_path,
				d.depth + 1 AS depth,
				d.path_tracker || f2.path || '|' AS path_tracker
			FROM indexed_references r2
			JOIN indexed_files f2 ON r2.file_id = f2.id
			JOIN indexed_files target2 ON r2.target_file_path = target2.path
			JOIN dependents d ON target2.id = d.file_id
			WHERE r2.reference_type = 'import'
				AND r2.repository_id = ?
				AND d.depth < ?
				AND INSTR(d.path_tracker, '|' || f2.path || '|') = 0
		),
		cycles AS (
			SELECT DISTINCT
				d.path_tracker || f2.path || '|' AS cycle_path
			FROM indexed_references r2
			JOIN indexed_files f2 ON r2.file_id = f2.id
			JOIN indexed_files target2 ON r2.target_file_path = target2.path
			JOIN dependents d ON target2.id = d.file_id
			WHERE r2.reference_type = 'import'
				AND r2.repository_id = ?
				AND d.depth < ?
				AND INSTR(d.path_tracker, '|' || f2.path || '|') > 0
		)
		SELECT 
			file_path,
			depth,
			NULL AS cycle_path
		FROM dependents
		UNION ALL
		SELECT
			NULL AS file_path,
			NULL AS depth,
			cycle_path
		FROM cycles
		ORDER BY depth ASC, file_path ASC
	`;
	
	const results = db.query<{
		file_path: string | null;
		depth: number | null;
		cycle_path: string | null;
	}>(sql, [fileRecord.repository_id, fileRecord.path, fileRecord.repository_id, depth, fileRecord.repository_id, depth]);
	
	return processDepthResults(results, includeTests);
}


/**
 * Query files that the given file depends on (forward lookup).
 *
 * Uses recursive CTE on indexed_references table to traverse the dependency graph.
 * Supports depth limiting and cycle detection.
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
	
	// Get repository_id for source file
	const fileRecord = db.queryOne<{ repository_id: string }>(
		"SELECT repository_id FROM indexed_files WHERE id = ?",
		[fileId]
	);
	
	if (!fileRecord) {
		throw new Error(`File not found: ${fileId}`);
	}
	
	const sql = `
		WITH RECURSIVE 
		dependencies AS (
			SELECT
				target.id AS file_id,
				target.path AS file_path,
				1 AS depth,
				'|' || target.path || '|' AS path_tracker
			FROM indexed_references r
			JOIN indexed_files target ON r.target_file_path = target.path
			WHERE r.reference_type = 'import'
				AND r.repository_id = ?
				AND r.file_id = ?
			
			UNION ALL
			
			SELECT
				target2.id AS file_id,
				target2.path AS file_path,
				d.depth + 1 AS depth,
				d.path_tracker || target2.path || '|' AS path_tracker
			FROM indexed_references r2
			JOIN indexed_files target2 ON r2.target_file_path = target2.path
			JOIN dependencies d ON r2.file_id = d.file_id
			WHERE r2.reference_type = 'import'
				AND r2.repository_id = ?
				AND d.depth < ?
				AND INSTR(d.path_tracker, '|' || target2.path || '|') = 0
		),
		cycles AS (
			SELECT DISTINCT
				d.path_tracker || target2.path || '|' AS cycle_path
			FROM indexed_references r2
			JOIN indexed_files target2 ON r2.target_file_path = target2.path
			JOIN dependencies d ON r2.file_id = d.file_id
			WHERE r2.reference_type = 'import'
				AND r2.repository_id = ?
				AND d.depth < ?
				AND INSTR(d.path_tracker, '|' || target2.path || '|') > 0
		)
		SELECT 
			file_path,
			depth,
			NULL AS cycle_path
		FROM dependencies
		UNION ALL
		SELECT
			NULL AS file_path,
			NULL AS depth,
			cycle_path
		FROM cycles
		ORDER BY depth ASC, file_path ASC
	`;
	
	const results = db.query<{
		file_path: string | null;
		depth: number | null;
		cycle_path: string | null;
	}>(sql, [fileRecord.repository_id, fileId, fileRecord.repository_id, depth, fileRecord.repository_id, depth]);
	
	return processDepthResults(results, true); // Always include tests for dependencies
}


function processDepthResults(
	results: Array<{
		file_path: string | null;
		depth: number | null;
		cycle_path: string | null;
	}>,
	includeTests: boolean
): DependencyResult {
	const direct: string[] = [];
	const indirect: Record<string, string[]> = {};
	const cycles: string[][] = [];
	const seenCycles = new Set<string>();
	
	for (const result of results) {
		// Handle cycle detection
		if (result.cycle_path) {
			const cycleKey = result.cycle_path;
			if (!seenCycles.has(cycleKey)) {
				seenCycles.add(cycleKey);
				const cyclePaths = result.cycle_path
					.split('|')
					.filter(path => path.length > 0);
				
				if (cyclePaths.length > 1) {
					cycles.push(cyclePaths);
				}
			}
			continue;  // Don't add cycles to direct/indirect
		}
		
		// Skip if file_path is null (cycle-only rows)
		if (!result.file_path || result.depth === null) {
			continue;
		}
		
		// Filter test files if requested
		if (!includeTests && (result.file_path.includes("test") || result.file_path.includes("spec"))) {
			continue;
		}
		
		// Categorize by depth
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
}> {
	const { existsSync } = await import("node:fs");
	const { resolve } = await import("node:path");
	const { prepareRepository } = await import("@indexer/repos");
	const { discoverSources, parseSourceFile } = await import("@indexer/parsers");
	const { parseFile, isSupportedForAST } = await import("@indexer/ast-parser");
	const { extractSymbols } = await import("@indexer/symbol-extractor");
	const { extractReferences } = await import("@indexer/reference-extractor");

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
		const referenceCount = storeReferences(fileRecord.id, file.path, references, filesWithId);

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

	updateRepositoryLastIndexed(repositoryId);

	logger.info("Local indexing workflow completed", {
		repositoryId,
		filesIndexed,
		symbolsExtracted: totalSymbols,
		referencesExtracted: totalReferences,
	});

	return {
		repositoryId,
		filesIndexed,
		symbolsExtracted: totalSymbols,
		referencesExtracted: totalReferences,
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
	fileId: string,
	filePath: string,
	references: Reference[],
	allFiles: Array<{ path: string }>
): number {
	const repositoryId = db.queryOne<{ repository_id: string }>(
		"SELECT repository_id FROM indexed_files WHERE id = ?",
		[fileId]
	)?.repository_id;
	
	if (!repositoryId) {
		throw new Error(`File not found: ${fileId}`);
	}
	
	return storeReferencesInternal(db, fileId, repositoryId, filePath, references, allFiles);
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
