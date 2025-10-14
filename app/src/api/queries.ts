import type { IndexRequest, IndexedFile } from "@shared/index";
import type { SupabaseClient } from "@supabase/supabase-js";

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
 */
export async function updateIndexRunStatus(
	client: SupabaseClient,
	id: string,
	status: string,
	errorMessage?: string,
): Promise<void> {
	const updateData: {
		status: string;
		completed_at?: string;
		error_message?: string;
	} = {
		status,
	};

	if (status === "completed" || status === "failed") {
		updateData.completed_at = new Date().toISOString();
	}

	if (errorMessage) {
		updateData.error_message = errorMessage;
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
	await updateIndexRunStatus(client, runId, "completed");
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
