import type { IndexRequest, IndexedFile } from "@shared/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Symbol as ExtractedSymbol } from "@indexer/symbol-extractor";
import type { Reference } from "@indexer/reference-extractor";

export interface SearchOptions {
	repositoryId?: string;
	limit?: number;
}

/**
 * Record a new index run for a repository.
 *
 * @param client - Supabase client instance
 * @param request - Index request details
 * @param userId - User UUID for RLS context
 * @param repositoryId - Repository UUID
 * @param status - Initial status (default: "pending")
 * @returns Index job UUID
 */
export async function recordIndexRun(
	client: SupabaseClient,
	request: IndexRequest,
	userId: string,
	repositoryId: string,
	status = "pending",
): Promise<string> {
	const { data, error } = await client
		.from("index_jobs")
		.insert({
			repository_id: repositoryId,
			ref: request.ref ?? null,
			status,
			started_at: new Date().toISOString(),
		})
		.select("id")
		.single();

	if (error) {
		throw new Error(`Failed to record index run: ${error.message}`);
	}

	return data.id;
}

/**
 * Update the status of an index job.
 *
 * @param client - Supabase client instance
 * @param id - Index job UUID
 * @param status - New status value
 * @param errorMessage - Optional error message if status is "failed"
 * @param stats - Optional statistics to store in metadata (files indexed, symbols extracted, references extracted)
 */
export async function updateIndexRunStatus(
	client: SupabaseClient,
	id: string,
	status: string,
	errorMessage?: string,
	stats?: {
		files_indexed?: number;
		symbols_extracted?: number;
		references_extracted?: number;
	},
): Promise<void> {
	const updateData: {
		status: string;
		completed_at?: string;
		error_message?: string;
		metadata?: Record<string, unknown>;
	} = {
		status,
	};

	if (status === "completed" || status === "failed") {
		updateData.completed_at = new Date().toISOString();
	}

	if (errorMessage) {
		updateData.error_message = errorMessage;
	}

	if (stats) {
		updateData.metadata = stats;
	}

	const { error } = await client
		.from("index_jobs")
		.update(updateData)
		.eq("id", id);

	if (error) {
		throw new Error(`Failed to update index run status: ${error.message}`);
	}
}

/**
 * Save indexed files to database.
 *
 * @param client - Supabase client instance
 * @param files - Array of indexed files
 * @param userId - User UUID for RLS context
 * @param repositoryId - Repository UUID
 * @returns Number of files saved
 */
export async function saveIndexedFiles(
	client: SupabaseClient,
	files: IndexedFile[],
	userId: string,
	repositoryId: string,
): Promise<number> {
	if (files.length === 0) {
		return 0;
	}

	const records = files.map((file) => ({
		repository_id: repositoryId,
		path: file.path,
		content: file.content,
		language: detectLanguage(file.path),
		size_bytes: new TextEncoder().encode(file.content).length,
		indexed_at: file.indexedAt.toISOString(),
		metadata: {
			dependencies: file.dependencies,
		},
	}));

	const { error, count } = await client.from("indexed_files").upsert(records, {
		onConflict: "repository_id,path",
	});

	if (error) {
		throw new Error(`Failed to save indexed files: ${error.message}`);
	}

	return count ?? files.length;
}

/**
 * Store symbols extracted from AST into database.
 *
 * Symbols are associated with their file via file_id foreign key.
 * Upsert strategy handles re-indexing by updating existing symbols.
 *
 * @param client - Supabase client instance
 * @param symbols - Array of extracted symbols
 * @param fileId - UUID of the indexed file
 * @returns Number of symbols stored
 */
export async function storeSymbols(
	client: SupabaseClient,
	symbols: ExtractedSymbol[],
	fileId: string,
): Promise<number> {
	if (symbols.length === 0) {
		return 0;
	}

	const records = symbols.map((symbol) => ({
		file_id: fileId,
		name: symbol.name,
		kind: symbol.kind,
		line_start: symbol.lineStart,
		line_end: symbol.lineEnd,
		signature: symbol.signature,
		documentation: symbol.documentation,
		metadata: {
			column_start: symbol.columnStart,
			column_end: symbol.columnEnd,
			is_exported: symbol.isExported,
			is_async: symbol.isAsync,
			access_modifier: symbol.accessModifier,
		},
	}));

	const { error, count } = await client.from("symbols").upsert(records, {
		onConflict: "file_id,name,line_start",
	});

	if (error) {
		throw new Error(`Failed to store symbols: ${error.message}`);
	}

	return count ?? symbols.length;
}

/**
 * Store references extracted from AST into database.
 *
 * References are associated with their source file via source_file_id foreign key.
 * Upsert strategy handles re-indexing by updating existing references.
 *
 * @param client - Supabase client instance
 * @param references - Array of extracted references
 * @param fileId - UUID of the source file
 * @returns Number of references stored
 */
export async function storeReferences(
	client: SupabaseClient,
	references: Reference[],
	fileId: string,
): Promise<number> {
	if (references.length === 0) {
		return 0;
	}

	const records = references.map((ref) => ({
		source_file_id: fileId,
		target_symbol_id: null, // Deferred to symbol resolution phase
		target_file_path: null, // Deferred to symbol resolution phase
		line_number: ref.lineNumber,
		reference_type: ref.referenceType,
		metadata: {
			target_name: ref.targetName,
			column_number: ref.columnNumber,
			...ref.metadata,
		},
	}));

	// Delete existing references for this file before inserting new ones
	// This ensures clean re-indexing without conflict errors from the unique index
	await client.from("references").delete().eq("source_file_id", fileId);

	// Insert new references
	const { error, count } = await client.from("references").insert(records);

	if (error) {
		throw new Error(`Failed to store references: ${error.message}`);
	}

	return count ?? references.length;
}

/**
 * Search indexed files by content term.
 *
 * @param client - Supabase client instance
 * @param term - Search term to match in file content
 * @param userId - User UUID for RLS context
 * @param options - Search options (repositoryId filter, limit)
 * @returns Array of matching indexed files
 */
export async function searchFiles(
	client: SupabaseClient,
	term: string,
	userId: string,
	options: SearchOptions = {},
): Promise<IndexedFile[]> {
	const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

	let query = client
		.from("indexed_files")
		.select("id, repository_id, path, content, metadata, indexed_at")
		.textSearch("content", term, { type: "plain", config: "english" })
		.order("indexed_at", { ascending: false })
		.limit(limit);

	if (options.repositoryId) {
		query = query.eq("repository_id", options.repositoryId);
	}

	const { data, error } = await query;

	if (error) {
		throw new Error(`Failed to search files: ${error.message}`);
	}

	return (data ?? []).map((row) => ({
		id: row.id,
		projectRoot: row.repository_id, // Keep compatibility with existing API
		path: row.path,
		content: row.content,
		dependencies:
			(row.metadata as { dependencies?: string[] })?.dependencies ?? [],
		indexedAt: new Date(row.indexed_at),
	}));
}

/**
 * List recently indexed files.
 *
 * @param client - Supabase client instance
 * @param limit - Maximum number of files to return
 * @param userId - User UUID for RLS context
 * @returns Array of recently indexed files
 */
export async function listRecentFiles(
	client: SupabaseClient,
	limit: number,
	userId: string,
): Promise<IndexedFile[]> {
	const { data, error } = await client
		.from("indexed_files")
		.select("id, repository_id, path, content, metadata, indexed_at")
		.order("indexed_at", { ascending: false })
		.limit(limit);

	if (error) {
		throw new Error(`Failed to list recent files: ${error.message}`);
	}

	return (data ?? []).map((row) => ({
		id: row.id,
		projectRoot: row.repository_id, // Keep compatibility with existing API
		path: row.path,
		content: row.content,
		dependencies:
			(row.metadata as { dependencies?: string[] })?.dependencies ?? [],
		indexedAt: new Date(row.indexed_at),
	}));
}

/**
 * Ensure repository exists in database, create if not.
 * Returns repository UUID.
 *
 * @param client - Supabase client instance
 * @param userId - User UUID for RLS context
 * @param request - Index request with repository details
 * @returns Repository UUID
 */
export async function ensureRepository(
	client: SupabaseClient,
	userId: string,
	request: IndexRequest,
): Promise<string> {
	const fullName = request.repository;
	const gitUrl = request.localPath
		? request.localPath
		: `${process.env.KOTA_GIT_BASE_URL ?? "https://github.com"}/${fullName}.git`;

	// Check if repository exists
	const { data: existing } = await client
		.from("repositories")
		.select("id")
		.eq("user_id", userId)
		.eq("full_name", fullName)
		.maybeSingle();

	if (existing) {
		return existing.id;
	}

	// Create new repository
	const { data: newRepo, error } = await client
		.from("repositories")
		.insert({
			user_id: userId,
			full_name: fullName,
			git_url: gitUrl,
			default_branch: request.ref ?? "main",
		})
		.select("id")
		.single();

	if (error) {
		throw new Error(`Failed to create repository: ${error.message}`);
	}

	return newRepo.id;
}

/**
 * Run the indexing workflow for a repository.
 * This is the async background task that performs the actual indexing.
 *
 * @param client - Supabase client instance
 * @param request - Index request details
 * @param runId - Index job UUID
 * @param userId - User UUID for RLS context
 * @param repositoryId - Repository UUID
 */
export async function runIndexingWorkflow(
	client: SupabaseClient,
	request: IndexRequest,
	runId: string,
	userId: string,
	repositoryId: string,
): Promise<void> {
	const { existsSync } = await import("node:fs");
	const { prepareRepository } = await import("@indexer/repos");
	const { discoverSources, parseSourceFile } = await import("@indexer/parsers");
	const { parseFile, isSupportedForAST } = await import("@indexer/ast-parser");
	const { extractSymbols } = await import("@indexer/symbol-extractor");
	const { extractReferences } = await import("@indexer/reference-extractor");

	const repo = await prepareRepository(request);

	if (!existsSync(repo.localPath)) {
		console.warn(`Indexing skipped: path ${repo.localPath} does not exist.`);
		await updateIndexRunStatus(client, runId, "skipped");
		return;
	}

	const sources = await discoverSources(repo.localPath);
	const records = (
		await Promise.all(
			sources.map((source) => parseSourceFile(source, repo.localPath)),
		)
	).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	await saveIndexedFiles(client, records, userId, repositoryId);

	// Extract and store symbols and references for each file
	const extractionStats = await Promise.all(
		records.map(async (file) => {
			if (!isSupportedForAST(file.path)) return { symbols: 0, references: 0 };

			const ast = parseFile(file.path, file.content);
			if (!ast) return { symbols: 0, references: 0 };

			const symbols = extractSymbols(ast, file.path);
			const references = extractReferences(ast, file.path);

			// Get the file_id from database
			const { data: fileRecord } = await client
				.from("indexed_files")
				.select("id")
				.eq("repository_id", repositoryId)
				.eq("path", file.path)
				.single();

			if (!fileRecord) {
				console.warn(`Could not find file record for ${file.path}`);
				return { symbols: 0, references: 0 };
			}

			const symbolCount = await storeSymbols(client, symbols, fileRecord.id);
			const referenceCount = await storeReferences(
				client,
				references,
				fileRecord.id,
			);

			return { symbols: symbolCount, references: referenceCount };
		}),
	);

	const totalSymbols = extractionStats.reduce(
		(sum, stat) => sum + stat.symbols,
		0,
	);
	const totalReferences = extractionStats.reduce(
		(sum, stat) => sum + stat.references,
		0,
	);

	await updateIndexRunStatus(client, runId, "completed", undefined, {
		files_indexed: records.length,
		symbols_extracted: totalSymbols,
		references_extracted: totalReferences,
	});
}

/**
 * Detect programming language from file path.
 * Helper function for metadata enrichment.
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
