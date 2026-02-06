/**
 * Incremental indexing support for KotaDB.
 *
 * Provides efficient re-indexing of changed files without full repository scans.
 * Supports both git-based change detection and mtime-based fallback.
 *
 * Key features:
 * - indexChangedFiles: Re-index only specified files
 * - deleteIndexedFiles: Remove files from index
 * - detectChangedFiles: Git-based or mtime-based change detection
 *
 * @module @indexer/incremental
 */

import { stat } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "@logging/logger.js";
import { getGlobalDatabase, type KotaDatabase } from "@db/sqlite/index.js";
import { parseFileWithRecovery, isSupportedForAST } from "@indexer/ast-parser.js";
import { extractSymbols } from "@indexer/symbol-extractor.js";
import { extractReferences, type Reference } from "@indexer/reference-extractor.js";
import { parseTsConfig, type PathMappings } from "@indexer/path-resolver.js";
import { parseSourceFile } from "@indexer/parsers.js";
import { resolveImport } from "@indexer/import-resolver.js";
import { detectLanguage } from "@shared/language-utils.js";
import { Sentry } from "../instrument.js";

const logger = createLogger({ module: "indexer-incremental" });

/**
 * Result of incremental indexing operation.
 */
export interface IncrementalIndexResult {
	/** Number of files updated */
	filesUpdated: number;
	/** Number of files deleted from index */
	filesDeleted: number;
	/** Number of symbols extracted */
	symbolsExtracted: number;
	/** Number of references extracted */
	referencesExtracted: number;
	/** Paths that failed to index */
	errors: Array<{ path: string; error: string }>;
}

/**
 * Changed file entry with metadata.
 */
export interface ChangedFile {
	/** Relative path from repository root */
	path: string;
	/** Change type: added, modified, or deleted */
	status: "added" | "modified" | "deleted";
}

/**
 * Options for change detection.
 */
export interface DetectChangesOptions {
	/** Repository root path */
	repositoryPath: string;
	/** Repository ID in database */
	repositoryId: string;
	/** Use git for change detection (default: true if .git exists) */
	useGit?: boolean;
	/** Base ref for git diff (default: HEAD) */
	baseRef?: string;
}

// Supported file extensions for incremental indexing (matches parsers.ts)
const SUPPORTED_EXTENSIONS = new Set<string>([
	".ts",
	".tsx",
	".js",
	".jsx",
	".cjs",
	".mjs",
	".json",
]);

/**
 * Normalize file path for consistent database storage.
 */
function normalizePath(filePath: string): string {
	let normalized = filePath.replace(/\\/g, "/");
	if (normalized.startsWith("/")) {
		normalized = normalized.slice(1);
	}
	if (normalized.startsWith("./")) {
		normalized = normalized.slice(2);
	}
	return normalized;
}

/**
 * Check if file extension is supported for indexing.
 */
function isSupportedSource(filePath: string): boolean {
	return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/**
 * Delete indexed data for specified file paths.
 *
 * Removes files, associated symbols, and references in a single transaction.
 * This operation is atomic - either all deletions succeed or none do.
 *
 * @param repositoryId - Repository UUID
 * @param paths - Array of relative file paths to delete
 * @returns Number of files deleted
 */
export function deleteIndexedFiles(
	repositoryId: string,
	paths: string[],
): number {
	const db = getGlobalDatabase();
	return deleteIndexedFilesInternal(db, repositoryId, paths);
}

/**
 * Internal implementation with explicit database parameter.
 */
function deleteIndexedFilesInternal(
	db: KotaDatabase,
	repositoryId: string,
	paths: string[],
): number {
	if (paths.length === 0) {
		return 0;
	}

	let deletedCount = 0;

	db.transaction(() => {
		for (const filePath of paths) {
			const normalizedPath = normalizePath(filePath);

			// Find file ID
			const fileRecord = db.queryOne<{ id: string }>(
				"SELECT id FROM indexed_files WHERE repository_id = ? AND path = ?",
				[repositoryId, normalizedPath],
			);

			if (!fileRecord) {
				logger.debug("File not found in index, skipping delete", {
					path: normalizedPath,
					repositoryId,
				});
				continue;
			}

			// Delete references first (foreign key constraint)
			db.run("DELETE FROM indexed_references WHERE file_id = ?", [fileRecord.id]);

			// Delete symbols (foreign key constraint)
			db.run("DELETE FROM indexed_symbols WHERE file_id = ?", [fileRecord.id]);

			// Delete the file record
			db.run("DELETE FROM indexed_files WHERE id = ?", [fileRecord.id]);

			deletedCount++;
			logger.debug("Deleted indexed file", {
				path: normalizedPath,
				fileId: fileRecord.id,
			});
		}
	});

	logger.info("Deleted indexed files", {
		repositoryId,
		count: deletedCount,
		requested: paths.length,
	});

	return deletedCount;
}

/**
 * Index or re-index specified changed files.
 *
 * For each file:
 * 1. Deletes existing data (if file was previously indexed)
 * 2. Reads and parses file content
 * 3. Extracts symbols and references
 * 4. Stores new data
 *
 * @param repositoryId - Repository UUID
 * @param repositoryPath - Absolute path to repository root
 * @param changedFiles - Array of changed file entries
 * @returns Indexing result with counts and errors
 */
export async function indexChangedFiles(
	repositoryId: string,
	repositoryPath: string,
	changedFiles: ChangedFile[],
): Promise<IncrementalIndexResult> {
	const db = getGlobalDatabase();
	return indexChangedFilesInternal(db, repositoryId, repositoryPath, changedFiles);
}

/**
 * Internal implementation with explicit database parameter.
 */
async function indexChangedFilesInternal(
	db: KotaDatabase,
	repositoryId: string,
	repositoryPath: string,
	changedFiles: ChangedFile[],
): Promise<IncrementalIndexResult> {
	const absoluteRoot = resolve(repositoryPath);
	const result: IncrementalIndexResult = {
		filesUpdated: 0,
		filesDeleted: 0,
		symbolsExtracted: 0,
		referencesExtracted: 0,
		errors: [],
	};

	if (changedFiles.length === 0) {
		return result;
	}

	// Separate deleted files from added/modified
	const deletedPaths: string[] = [];
	const filesToIndex: ChangedFile[] = [];

	for (const file of changedFiles) {
		if (file.status === "deleted") {
			deletedPaths.push(file.path);
		} else if (isSupportedSource(file.path)) {
			filesToIndex.push(file);
		}
	}

	// Handle deletions first
	if (deletedPaths.length > 0) {
		result.filesDeleted = deleteIndexedFilesInternal(db, repositoryId, deletedPaths);
	}

	if (filesToIndex.length === 0) {
		return result;
	}

	// Parse tsconfig.json for path alias resolution
	const pathMappings = parseTsConfig(absoluteRoot);
	if (pathMappings) {
		logger.debug("Loaded path mappings for incremental indexing", {
			aliasCount: Object.keys(pathMappings.paths).length,
		});
	}

	// Get all indexed files for reference resolution
	const allIndexedFiles = db
		.query<{ id: string; path: string }>(
			"SELECT id, path FROM indexed_files WHERE repository_id = ?",
			[repositoryId],
		)
		.map((row) => ({ id: row.id, path: row.path }));

	// Build set of existing paths for quick lookup
	const existingPaths = new Set(allIndexedFiles.map((f) => f.path));

	// Process each file to index
	for (const changedFile of filesToIndex) {
		const normalizedPath = normalizePath(changedFile.path);
		const absolutePath = resolve(absoluteRoot, changedFile.path);

		try {
			// Parse source file
			const fileRecord = await parseSourceFile(absolutePath, absoluteRoot);
			if (!fileRecord) {
				result.errors.push({
					path: changedFile.path,
					error: "Failed to parse source file",
				});
				continue;
			}

			// Delete existing data if file was previously indexed
			if (existingPaths.has(normalizedPath)) {
				deleteIndexedFilesInternal(db, repositoryId, [normalizedPath]);
			}

			// Store file in database
			const fileId = randomUUID();
			const language = detectLanguage(fileRecord.path);
			const sizeBytes = new TextEncoder().encode(fileRecord.content).length;
			const indexedAt = new Date().toISOString();
			const metadata = JSON.stringify({ dependencies: fileRecord.dependencies || [] });

			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content, language, size_bytes, content_hash, indexed_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
				[fileId, repositoryId, normalizedPath, fileRecord.content, language, sizeBytes, null, indexedAt, metadata],
			);

			result.filesUpdated++;

			// Extract and store symbols/references if AST-supported
			if (isSupportedForAST(normalizedPath)) {
				const parseResult = parseFileWithRecovery(normalizedPath, fileRecord.content);
				if (parseResult.ast) {
					const symbols = extractSymbols(parseResult.ast, normalizedPath);
					const references = extractReferences(parseResult.ast, normalizedPath);

					// Store symbols
					if (symbols.length > 0) {
						const symbolStmt = db.prepare(
							"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end, signature, documentation, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
						);

						for (const symbol of symbols) {
							const symbolId = randomUUID();
							const symbolMetadata = JSON.stringify({
								column_start: symbol.columnStart,
								column_end: symbol.columnEnd,
								is_exported: symbol.isExported,
								is_async: symbol.isAsync,
								access_modifier: symbol.accessModifier,
							});

							symbolStmt.run([
								symbolId, fileId, repositoryId, symbol.name, symbol.kind,
								symbol.lineStart, symbol.lineEnd, symbol.signature || null,
								symbol.documentation || null, symbolMetadata,
							]);

							result.symbolsExtracted++;
						}
					}

					// Store references
					if (references.length > 0) {
						const updatedFiles = [...allIndexedFiles, { id: fileId, path: normalizedPath }];
						const refCount = storeReferencesForFile(db, fileId, repositoryId, normalizedPath, references, updatedFiles, pathMappings, absoluteRoot);
						result.referencesExtracted += refCount;
					}
				}
			}

			logger.debug("Indexed changed file", { path: normalizedPath, status: changedFile.status });
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			result.errors.push({ path: changedFile.path, error: errorMessage });
			logger.error("Failed to index changed file", error instanceof Error ? error : undefined, { path: changedFile.path });

			if (error instanceof Error) {
				Sentry.captureException(error, { tags: { module: "incremental-indexer" }, contexts: { file: { path: changedFile.path } } });
			}
		}
	}

	logger.info("Incremental indexing complete", {
		repositoryId,
		filesUpdated: result.filesUpdated,
		filesDeleted: result.filesDeleted,
		symbolsExtracted: result.symbolsExtracted,
		referencesExtracted: result.referencesExtracted,
		errors: result.errors.length,
	});

	return result;
}

/**
 * Store references for a single file with import resolution.
 */
function storeReferencesForFile(
	db: KotaDatabase,
	fileId: string,
	repositoryId: string,
	filePath: string,
	references: Reference[],
	allFiles: Array<{ path: string }>,
	pathMappings: PathMappings | null,
	repoRoot?: string,
): number {
	let count = 0;

	const stmt = db.prepare(
		"INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_symbol_id, target_file_path, line_number, column_number, reference_type, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
	);

	for (const ref of references) {
		const id = randomUUID();
		const metadata = JSON.stringify({ target_name: ref.targetName, column_number: ref.columnNumber, ...ref.metadata });

		let targetFilePath: string | null = null;
		if (ref.referenceType === "import" && ref.metadata?.importSource) {
			const resolved = resolveImport(ref.metadata.importSource, filePath, allFiles, pathMappings, repoRoot);
			if (resolved) {
				targetFilePath = normalizePath(resolved);
			}
		}

		stmt.run([id, fileId, repositoryId, ref.targetName || "unknown", null, targetFilePath, ref.lineNumber, ref.columnNumber || 0, ref.referenceType, metadata]);
		count++;
	}

	return count;
}

/**
 * Detect changed files using git or mtime comparison.
 */
export async function detectChangedFiles(options: DetectChangesOptions): Promise<ChangedFile[]> {
	const { repositoryPath, repositoryId } = options;
	const absoluteRoot = resolve(repositoryPath);
	const useGit = options.useGit ?? (await hasGitDirectory(absoluteRoot));

	if (useGit) {
		return detectChangedFilesGit(absoluteRoot, repositoryId, options.baseRef);
	}
	return detectChangedFilesMtime(absoluteRoot, repositoryId);
}

async function hasGitDirectory(repositoryPath: string): Promise<boolean> {
	try {
		const gitPath = resolve(repositoryPath, ".git");
		const stats = await stat(gitPath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

async function detectChangedFilesGit(repositoryPath: string, repositoryId: string, baseRef: string = "HEAD"): Promise<ChangedFile[]> {
	const changed: ChangedFile[] = [];

	try {
		const diffResult = await runGit(["diff", "--name-status", baseRef], { cwd: repositoryPath, allowFailure: true });

		if (diffResult.exitCode === 0 && diffResult.stdout.trim()) {
			const lines = diffResult.stdout.trim().split("\n");
			for (const line of lines) {
				const parts = line.split("\t");
				const statusCode = parts[0];
				const filePath = parts.slice(1).join("\t");

				if (!filePath || !isSupportedSource(filePath)) continue;

				let status: ChangedFile["status"];
				switch (statusCode?.[0]) {
					case "A": status = "added"; break;
					case "D": status = "deleted"; break;
					default: status = "modified"; break;
				}

				changed.push({ path: normalizePath(filePath), status });
			}
		}

		const statusResult = await runGit(["status", "--porcelain", "--untracked-files=normal"], { cwd: repositoryPath, allowFailure: true });

		if (statusResult.exitCode === 0 && statusResult.stdout.trim()) {
			const lines = statusResult.stdout.trim().split("\n");
			for (const line of lines) {
				const statusCode = line.slice(0, 2);
				const filePath = line.slice(3);

				if (!filePath || !isSupportedSource(filePath)) continue;

				if (statusCode === "??") {
					const normalizedPath = normalizePath(filePath);
					if (!changed.some((c) => c.path === normalizedPath)) {
						changed.push({ path: normalizedPath, status: "added" });
					}
				}
			}
		}

		logger.info("Detected changed files via git", { repositoryPath, count: changed.length, baseRef });
	} catch (error) {
		logger.warn("Git change detection failed, falling back to mtime", { error: error instanceof Error ? error.message : String(error) });
		return detectChangedFilesMtime(repositoryPath, repositoryId);
	}

	return changed;
}

async function detectChangedFilesMtime(repositoryPath: string, repositoryId: string): Promise<ChangedFile[]> {
	const db = getGlobalDatabase();
	const changed: ChangedFile[] = [];

	const indexedFiles = db.query<{ path: string; indexed_at: string }>(
		"SELECT path, indexed_at FROM indexed_files WHERE repository_id = ?",
		[repositoryId],
	);

	const indexedMap = new Map<string, Date>();
	for (const file of indexedFiles) {
		indexedMap.set(file.path, new Date(file.indexed_at));
	}

	const { discoverSources } = await import("@indexer/parsers.js");
	const allSources = await discoverSources(repositoryPath);

	for (const absolutePath of allSources) {
		const relativePath = normalizePath(relative(repositoryPath, absolutePath));

		try {
			const fileStat = await stat(absolutePath);
			const mtime = fileStat.mtime;
			const indexedAt = indexedMap.get(relativePath);

			if (!indexedAt) {
				changed.push({ path: relativePath, status: "added" });
			} else if (mtime > indexedAt) {
				changed.push({ path: relativePath, status: "modified" });
			}

			indexedMap.delete(relativePath);
		} catch {
			if (indexedMap.has(relativePath)) {
				changed.push({ path: relativePath, status: "deleted" });
				indexedMap.delete(relativePath);
			}
		}
	}

	for (const [path] of indexedMap) {
		changed.push({ path, status: "deleted" });
	}

	logger.info("Detected changed files via mtime", { repositoryPath, count: changed.length });
	return changed;
}

interface GitCommandResult { stdout: string; stderr: string; exitCode: number; }
interface GitCommandOptions { cwd?: string; allowFailure?: boolean; }

async function runGit(args: string[], options: GitCommandOptions = {}): Promise<GitCommandResult> {
	const proc = Bun.spawn({ cmd: ["git", ...args], stdout: "pipe", stderr: "pipe", cwd: options.cwd });
	const stdoutPromise = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("");
	const stderrPromise = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("");
	const exitCode = await proc.exited;
	const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

	if (exitCode !== 0 && !options.allowFailure) {
		const gitError = new Error("git " + args.join(" ") + " failed with code " + exitCode + ": " + stderr.trim());
		logger.error("Git command failed", gitError, { git_command: args.join(" "), exit_code: exitCode, cwd: options.cwd });
		throw gitError;
	}

	return { stdout, stderr, exitCode };
}

// Test-friendly aliases
export function deleteIndexedFilesLocal(db: KotaDatabase, repositoryId: string, paths: string[]): number {
	return deleteIndexedFilesInternal(db, repositoryId, paths);
}

export async function indexChangedFilesLocal(db: KotaDatabase, repositoryId: string, repositoryPath: string, changedFiles: ChangedFile[]): Promise<IncrementalIndexResult> {
	return indexChangedFilesInternal(db, repositoryId, repositoryPath, changedFiles);
}
