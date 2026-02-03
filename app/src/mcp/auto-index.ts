/**
 * Auto-indexing utilities for MCP tools
 *
 * Provides automatic repository detection and indexing on first tool use.
 * This enables "just works" behavior where users don't need to manually
 * index their codebase before using search/analysis tools.
 *
 * Issue: #35 - Automatic indexing implementation
 */

import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { getGlobalDatabase } from "@db/sqlite/index.js";
import { createLogger } from "@logging/logger.js";
import { 
	runIndexingWorkflow,
	isRepositoryIndexed as isRepositoryIndexedQuery,
	deleteFileByPath as deleteFileByPathQuery,
	deleteFilesByPaths as deleteFilesByPathsQuery,
} from "@api/queries";
import type { IndexRequest } from "@shared/types";

const logger = createLogger({ module: "auto-index" });

// Re-export the database functions for convenience
export { isRepositoryIndexedQuery as isRepositoryIndexed };

/**
 * Check if a repository path has been indexed.
 *
 * @param localPath - Absolute path to the repository
 * @returns Object with indexed status and repository ID if found
 */
export function isPathIndexed(localPath: string): { indexed: boolean; repositoryId?: string } {
	const db = getGlobalDatabase();

	// Normalize path
	const normalizedPath = resolve(localPath);

	// Check for repository with matching git_url (local paths are stored as git_url)
	const repo = db.queryOne<{ id: string; last_indexed_at: string | null }>(
		"SELECT id, last_indexed_at FROM repositories WHERE git_url = ?",
		[normalizedPath],
	);

	if (!repo) {
		return { indexed: false };
	}

	if (!repo.last_indexed_at) {
		return { indexed: false, repositoryId: repo.id };
	}

	// Verify at least one file exists using the query function
	const indexed = isRepositoryIndexedQuery(repo.id);
	return {
		indexed,
		repositoryId: repo.id,
	};
}

/**
 * Detect repository identifier from the current working directory.
 *
 * Uses the following heuristics:
 * 1. Check if a .git directory exists
 * 2. Extract repository name from directory name
 * 3. Create a local/* identifier for local repositories
 *
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Repository identifier in "local/name" format, or null if not a repository
 */
export function detectRepositoryFromCwd(cwd?: string): string | null {
	const workDir = cwd || process.cwd();

	// Check if this looks like a git repository
	const gitDir = resolve(workDir, ".git");
	if (!existsSync(gitDir)) {
		logger.debug("Not a git repository (no .git directory)", { path: workDir });
		return null;
	}

	// Extract repository name from directory
	const repoName = basename(workDir);
	const identifier = "local/" + repoName;

	logger.debug("Detected repository from cwd", { path: workDir, identifier });
	return identifier;
}

/**
 * Result of auto-index operation
 */
export interface AutoIndexResult {
	/** Whether indexing was performed (false if already indexed) */
	wasIndexed: boolean;
	/** Repository ID (either existing or newly created) */
	repositoryId: string;
	/** Human-readable message about what happened */
	message: string;
	/** Indexing stats (only present if wasIndexed is true) */
	stats?: {
		filesIndexed: number;
		symbolsExtracted: number;
		referencesExtracted: number;
	};
}

/**
 * Ensure a repository is indexed before tool execution.
 *
 * This is the main auto-index entry point. It:
 * 1. Resolves the repository identifier (from param or cwd)
 * 2. Checks if already indexed
 * 3. Performs indexing if needed
 * 4. Returns the repository ID for use by the tool
 *
 * @param repositoryParam - Optional repository identifier from tool params
 * @param localPath - Optional local path override
 * @returns AutoIndexResult with repository ID and status
 */
export async function ensureRepositoryIndexed(
	repositoryParam?: string,
	localPath?: string,
): Promise<AutoIndexResult> {
	const db = getGlobalDatabase();

	// Determine the repository identifier
	let identifier: string;
	let repoLocalPath: string | undefined = localPath;

	if (repositoryParam) {
		identifier = repositoryParam;

		// Check if this is a local path being passed as repository
		if (existsSync(repositoryParam) && existsSync(resolve(repositoryParam, ".git"))) {
			repoLocalPath = resolve(repositoryParam);
			identifier = "local/" + basename(repositoryParam);
		}
	} else {
		// Auto-detect from cwd
		const detected = detectRepositoryFromCwd();
		if (!detected) {
			throw new Error(
				"Could not detect repository. Please provide a 'repository' parameter or run from within a git repository.",
			);
		}
		identifier = detected;
		repoLocalPath = process.cwd();
	}

	// Check if already indexed by full_name
	const existing = db.queryOne<{ id: string; last_indexed_at: string | null }>(
		"SELECT id, last_indexed_at FROM repositories WHERE full_name = ?",
		[identifier],
	);

	if (existing && existing.last_indexed_at) {
		// Verify files exist using the database function
		if (isRepositoryIndexedQuery(existing.id)) {
			logger.debug("Repository already indexed", {
				identifier,
				repositoryId: existing.id,
			});

			return {
				wasIndexed: false,
				repositoryId: existing.id,
				message: "Repository '" + identifier + "' is already indexed",
			};
		}
	}

	// Need to index - prepare request
	logger.info("Auto-indexing repository", { identifier, localPath: repoLocalPath });

	const indexRequest: IndexRequest = {
		repository: identifier,
		ref: "main",
		localPath: repoLocalPath,
	};

	try {
		const result = await runIndexingWorkflow(indexRequest);

		logger.info("Auto-indexing completed", {
			identifier,
			repositoryId: result.repositoryId,
			filesIndexed: result.filesIndexed,
		});

		return {
			wasIndexed: true,
			repositoryId: result.repositoryId,
			message: "Automatically indexed repository '" + identifier + "' (" + result.filesIndexed + " files)",
			stats: {
				filesIndexed: result.filesIndexed,
				symbolsExtracted: result.symbolsExtracted,
				referencesExtracted: result.referencesExtracted,
			},
		};
	} catch (error) {
		logger.error(
			"Auto-indexing failed",
			error instanceof Error ? error : new Error(String(error)),
			{ identifier },
		);
		throw new Error(
			"Failed to auto-index repository '" + identifier + "': " + (error instanceof Error ? error.message : String(error)),
		);
	}
}

/**
 * Delete indexed files by path for incremental updates.
 * Delegates to the database layer function which handles CASCADE deletes properly.
 *
 * @param repositoryId - Repository UUID
 * @param filePaths - Array of file paths to delete (relative to repo root)
 * @returns Number of files deleted
 */
export function deleteFilesByPath(repositoryId: string, filePaths: string[]): number {
	const result = deleteFilesByPathsQuery(repositoryId, filePaths);
	return result.deletedCount;
}

/**
 * Delete a single file by path.
 * Delegates to the database layer function.
 *
 * @param repositoryId - Repository UUID
 * @param filePath - File path to delete (relative to repo root)
 * @returns true if file was deleted, false if not found
 */
export function deleteFileByPath(repositoryId: string, filePath: string): boolean {
	return deleteFileByPathQuery(repositoryId, filePath);
}
