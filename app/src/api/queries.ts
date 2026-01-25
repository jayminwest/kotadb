import type { Reference } from "@indexer/reference-extractor";
import type { Symbol as ExtractedSymbol, SymbolKind } from "@indexer/symbol-extractor";
import { createLogger } from "@logging/logger.js";
import type { IndexRequest, IndexedFile } from "@shared/types";
import { detectLanguage } from "@shared/language-utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getInstallationForRepository } from "../github/installation-lookup";
import { Sentry } from "../instrument.js";
import { isLocalMode } from "@config/environment.js";
import { getGlobalDatabase } from "@db/sqlite/index.js";
import {
	saveIndexedFilesLocal,
	storeSymbolsLocal,
	storeReferencesLocal,
	searchFilesLocal,
	listRecentFilesLocal,
	resolveFilePathLocal,
	storeDependenciesLocal,
	queryDependentsLocalWrapped,
	queryDependenciesLocalWrapped,
	ensureRepositoryLocal,
	updateRepositoryLastIndexedLocal
} from "./queries-local.js";

const logger = createLogger({ module: "api-queries" });

export interface SearchOptions {
	repositoryId?: string;
	projectId?: string;
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
		dependencies_extracted?: number;
		circular_dependencies_detected?: number;
	},
): Promise<void> {
	const updateData: {
		status: string;
		completed_at?: string;
		error_message?: string;
		stats?: Record<string, unknown>;
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
		updateData.stats = stats;
	}

	const { error } = await client.from("index_jobs").update(updateData).eq("id", id);

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

	// Local mode: Use SQLite
	if (isLocalMode()) {
		const db = getGlobalDatabase();
		return saveIndexedFilesLocal(db, files, repositoryId);
	}

	// Cloud mode: existing Supabase logic
	if (!client) {
		throw new Error("Supabase client required in cloud mode");
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

	// Local mode: Use SQLite
	if (isLocalMode()) {
		const db = getGlobalDatabase();
		return storeSymbolsLocal(db, symbols, fileId);
	}

	// Cloud mode: existing Supabase logic
	if (!client) {
		throw new Error("Supabase client required in cloud mode");
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

	// Local mode: Use SQLite
	if (isLocalMode()) {
		const db = getGlobalDatabase();
		return storeReferencesLocal(db, references, fileId);
	}

	// Cloud mode: existing Supabase logic
	if (!client) {
		throw new Error("Supabase client required in cloud mode");
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

	// Deduplicate records within this batch to prevent duplicate key errors
	// Use all fields that should uniquely identify a reference
	// Note: We use delete-then-insert, so exact MD5 match isn't needed
	const uniqueRecords = Array.from(
		new Map(
			records.map((r) => {
				// Create deduplication key using all identifying fields
				// Include metadata values to distinguish between similar references
				const metadataStr = r.metadata ? JSON.stringify(r.metadata) : "{}";
				const dedupKey = `${r.source_file_id}|${r.line_number}|${r.reference_type}|${r.target_file_path || ""}|${r.target_symbol_id || ""}|${metadataStr}`;
				return [dedupKey, r];
			}),
		).values(),
	);

	// Delete existing references for this file before inserting new ones
	// This ensures clean re-indexing without conflict errors from the unique index
	const { error: deleteError } = await client
		.from("references")
		.delete()
		.eq("source_file_id", fileId);

	if (deleteError) {
		throw new Error(`Failed to delete existing references: ${deleteError.message}`);
	}

	// Insert new references
	const { error, count } = await client.from("references").insert(uniqueRecords);

	if (error) {
		throw new Error(`Failed to store references: ${error.message}`);
	}

	return count ?? references.length;
}

/**
 * Store dependency graph edges into database.
 *
 * Dependency edges represent file→file (imports) and symbol→symbol (calls)
 * relationships extracted from the codebase. Stored in the `dependency_graph`
 * table for impact analysis and circular dependency detection.
 *
 * Uses delete-then-insert strategy to handle re-indexing cleanly.
 *
 * @param client - Supabase client instance
 * @param dependencies - Array of dependency edges
 * @param repositoryId - Repository UUID
 * @returns Number of dependencies stored
 */
export async function storeDependencies(
	client: SupabaseClient,
	dependencies: Array<{
		repositoryId: string;
		fromFileId: string | null;
		toFileId: string | null;
		fromSymbolId: string | null;
		toSymbolId: string | null;
		dependencyType: "file_import" | "symbol_usage";
		metadata: Record<string, unknown>;
	}>,
	repositoryId: string,
): Promise<number> {
	if (dependencies.length === 0) {
		return 0;
	}

	// Local mode: Use SQLite
	if (isLocalMode()) {
		const db = getGlobalDatabase();
		return storeDependenciesLocal(db, dependencies);
	}

	// Cloud mode: existing Supabase logic
	if (!client) {
		throw new Error("Supabase client required in cloud mode");
	}


	const records = dependencies.map((dep) => ({
		repository_id: dep.repositoryId,
		from_file_id: dep.fromFileId,
		to_file_id: dep.toFileId,
		from_symbol_id: dep.fromSymbolId,
		to_symbol_id: dep.toSymbolId,
		dependency_type: dep.dependencyType,
		metadata: dep.metadata,
	}));

	// Delete existing dependency graph for this repository before inserting new ones
	// This ensures clean re-indexing without conflict errors
	await client.from("dependency_graph").delete().eq("repository_id", repositoryId);

	// Insert new dependency edges
	const { error, count } = await client.from("dependency_graph").insert(records);

	if (error) {
		throw new Error(`Failed to store dependencies: ${error.message}`);
	}

	return count ?? dependencies.length;
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
	client: SupabaseClient | null,
	term: string,
	userId: string,
	options: SearchOptions = {},
): Promise<IndexedFile[]> {
	const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

	// Local mode: Use SQLite FTS5
	if (isLocalMode()) {
		const db = getGlobalDatabase();
		return searchFilesLocal(db, term, options.repositoryId, limit);
	}

	// Cloud mode: existing Supabase logic
	if (!client) {
		throw new Error("Supabase client required in cloud mode");
	}

	// If project filter is specified, get repository IDs for that project
	let repositoryIds: string[] | undefined;
	if (options.projectId) {
		const { data: projectRepos, error: projectError } = await client
			.from("project_repositories")
			.select("repository_id")
			.eq("project_id", options.projectId);

		if (projectError) {
			throw new Error(`Failed to fetch project repositories: ${projectError.message}`);
		}

		repositoryIds = projectRepos?.map((pr) => pr.repository_id) ?? [];

		// If project has no repositories, return empty results
		if (repositoryIds.length === 0) {
			return [];
		}
	}

	let query = client
		.from("indexed_files")
		.select("id, repository_id, path, content, metadata, indexed_at")
		.textSearch("content", term, { type: "plain", config: "english" })
		.order("indexed_at", { ascending: false })
		.limit(limit);

	// Apply repository filter (single repo or project's repos)
	if (options.repositoryId) {
		query = query.eq("repository_id", options.repositoryId);
	} else if (repositoryIds) {
		query = query.in("repository_id", repositoryIds);
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
		dependencies: (row.metadata as { dependencies?: string[] })?.dependencies ?? [],
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
	client: SupabaseClient | null,
	limit: number,
	userId: string,
): Promise<IndexedFile[]> {
	// Local mode: Use SQLite
	if (isLocalMode()) {
		const db = getGlobalDatabase();
		return listRecentFilesLocal(db, limit);
	}

	// Cloud mode: existing Supabase logic
	if (!client) {
		throw new Error("Supabase client required in cloud mode");
	}

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
		dependencies: (row.metadata as { dependencies?: string[] })?.dependencies ?? [],
		indexedAt: new Date(row.indexed_at),
	}));
}

/**
 * Populate installation_id for a repository by querying GitHub App installations
 * @param client - Supabase client instance
 * @param repositoryId - Repository UUID
 * @param fullName - Repository full name (owner/repo)
 */
async function populateInstallationId(
	client: SupabaseClient,
	repositoryId: string,
	fullName: string,
): Promise<void> {
	try {
		// Parse owner and repo from full_name
		const [owner, repo] = fullName.split("/");
		if (!owner || !repo) {
			logger.warn("Invalid repository full_name format", {
				fullName,
				repositoryId,
			});
			return;
		}

		// Log before lookup
		logger.info("Starting installation_id lookup", {
			fullName,
			repositoryId,
		});

		// Query GitHub App installations to find installation_id
		const installationId = await getInstallationForRepository(owner, repo);

		// Log result of lookup
		logger.info("Installation lookup completed", {
			fullName,
			installationId: installationId ?? null,
			found: installationId !== null,
		});

		if (installationId !== null) {
			// Update repository with installation_id
			const { error } = await client
				.from("repositories")
				.update({ installation_id: installationId })
				.eq("id", repositoryId);

			if (error) {
				logger.error("Failed to update repository with installation_id", new Error(error.message), {
					repositoryId,
					installationId,
					fullName,
				});
				Sentry.captureException(new Error(error.message));
			} else {
				logger.info("Repository updated with installation_id", {
					fullName,
					installationId,
					repositoryId,
				});
			}
		} else {
			logger.info("No installation found, will attempt unauthenticated clone", {
				fullName,
				repositoryId,
			});
		}
	} catch (error) {
		// Log error but don't throw - allow repository creation to succeed
		const err = error instanceof Error ? error : new Error(String(error));
		logger.error("Error populating installation_id", err, {
			fullName,
			repositoryId,
		});
		Sentry.captureException(err);
	}
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
		.select("id, installation_id")
		.eq("user_id", userId)
		.eq("full_name", fullName)
		.maybeSingle();

	if (existing) {
		// For existing repositories, attempt to populate installation_id if NULL
		if (existing.installation_id === null && !request.localPath) {
			await populateInstallationId(client, existing.id, fullName);
		}
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

	// Attempt to populate installation_id for new repository (skip for local paths)
	if (!request.localPath) {
		await populateInstallationId(client, newRepo.id, fullName);
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
	const { extractDependencies } = await import("@indexer/dependency-extractor");
	const { detectCircularDependencies } = await import("@indexer/circular-detector");

	// Fetch repository metadata to get installation_id for GitHub App authentication (Issue #430)
	const { data: repoData, error: repoError } = await client
		.from("repositories")
		.select("installation_id")
		.eq("id", repositoryId)
		.single();

	if (repoError) {
		throw new Error(`Failed to fetch repository metadata: ${repoError.message}`);
	}

	const installationId = repoData?.installation_id ?? undefined;

	if (installationId !== undefined) {
		logger.info("Using installation_id for repository authentication", {
			installationId,
			repositoryId,
			runId,
		});
	}

	const repo = await prepareRepository(request, installationId);

	if (!existsSync(repo.localPath)) {
		logger.warn("Indexing skipped: repository path does not exist", {
			localPath: repo.localPath,
			repositoryId,
			runId,
		});
		await updateIndexRunStatus(client, runId, "skipped");
		return;
	}

	const sources = await discoverSources(repo.localPath);
	const records = (
		await Promise.all(sources.map((source) => parseSourceFile(source, repo.localPath)))
	).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	await saveIndexedFiles(client, records, userId, repositoryId);

	// Extract and store symbols and references for each file
	// Collect all symbols and references for dependency graph extraction
	const allSymbolsWithFileId: Array<any> = [];
	const allReferencesWithFileId: Array<any> = [];
	const filesWithId: IndexedFile[] = [];

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
				logger.warn("Could not find file record after indexing", {
					filePath: file.path,
					repositoryId,
					runId,
				});
				return { symbols: 0, references: 0 };
			}

			// Store file with id for dependency extraction
			filesWithId.push({ ...file, id: fileRecord.id, repository_id: repositoryId });

			// Attach file_id to symbols and references for dependency extraction
			const symbolsWithFileId = symbols.map((s) => ({ ...s, id: null, file_id: fileRecord.id }));
			const referencesWithFileId = references.map((r) => ({
				...r,
				file_id: fileRecord.id,
			}));

			const symbolCount = await storeSymbols(client, symbols, fileRecord.id);
			const referenceCount = await storeReferences(client, references, fileRecord.id);

			// Collect for dependency extraction (after storing to get IDs)
			// Re-fetch stored symbols with their database IDs
			const { data: storedSymbols } = await client
				.from("symbols")
				.select("id, file_id, name, kind, line_start, line_end, signature, documentation, metadata")
				.eq("file_id", fileRecord.id);

			if (storedSymbols) {
				allSymbolsWithFileId.push(
					...storedSymbols.map((s) => ({
						id: s.id,
						file_id: s.file_id,
						name: s.name,
						kind: s.kind as SymbolKind,
						lineStart: s.line_start,
						lineEnd: s.line_end,
						columnStart: s.metadata?.column_start || 0,
						columnEnd: s.metadata?.column_end || 0,
						signature: s.signature,
						documentation: s.documentation,
						isExported: s.metadata?.is_exported || false,
					})),
				);
			}

			allReferencesWithFileId.push(...referencesWithFileId);

			return { symbols: symbolCount, references: referenceCount };
		}),
	);

	const totalSymbols = extractionStats.reduce((sum, stat) => sum + stat.symbols, 0);
	const totalReferences = extractionStats.reduce((sum, stat) => sum + stat.references, 0);

	// Extract dependency graph from collected symbols and references
	logger.info("Extracting dependency graph", {
		fileCount: filesWithId.length,
		repositoryId,
		runId,
	});
	const dependencies = extractDependencies(
		filesWithId,
		allSymbolsWithFileId,
		allReferencesWithFileId,
		repositoryId,
	);

	// Store dependency edges
	const dependencyCount = await storeDependencies(client, dependencies, repositoryId);

	// Detect circular dependencies and log warnings
	const filePathById = new Map(filesWithId.map((f) => [f.id!, f.path]));
	const symbolNameById = new Map(allSymbolsWithFileId.map((s) => [s.id, s.name]));

	const circularChains = detectCircularDependencies(dependencies, filePathById, symbolNameById);

	if (circularChains.length > 0) {
		logger.warn("Circular dependency chains detected", {
			chainCount: circularChains.length,
			repositoryId,
			runId,
			chains: circularChains.map((c) => ({
				type: c.type,
				description: c.description,
			})),
		});
	}

	await updateIndexRunStatus(client, runId, "completed", undefined, {
		files_indexed: records.length,
		symbols_extracted: totalSymbols,
		references_extracted: totalReferences,
		dependencies_extracted: dependencyCount,
		circular_dependencies_detected: circularChains.length,
	});
}

/**
 * Create default organization for a new user.
 *
 * Organizations are required for RLS policies and multi-tenant data isolation.
 * This creates a single-member organization owned by the user.
 *
 * @param client - Supabase client instance
 * @param userId - User UUID from auth.users table
 * @param userEmail - User email for slug generation (optional)
 * @returns Organization UUID
 */
export async function createDefaultOrganization(
	client: SupabaseClient,
	userId: string,
	userEmail?: string,
): Promise<string> {
	// Generate org slug from user email or use generic slug
	const slug = userEmail ? `${userEmail.split("@")[0]}-org` : `user-${userId.substring(0, 8)}-org`;

	// Insert organization record
	const { data: org, error: orgError } = await client
		.from("organizations")
		.insert({
			owner_id: userId,
			name: slug,
			slug,
		})
		.select("id")
		.single();

	if (orgError) {
		throw new Error(`Failed to create organization: ${orgError.message}`);
	}

	// Insert user_organizations record to link user to org
	const { error: userOrgError } = await client.from("user_organizations").insert({
		user_id: userId,
		org_id: org.id,
		role: "owner",
	});

	if (userOrgError) {
		throw new Error(`Failed to link user to organization: ${userOrgError.message}`);
	}

	return org.id;
}


/**
 * Resolve file path to file UUID.
 * Returns null if file not found in repository.
 *
 * @param client - Supabase client instance
 * @param filePath - Relative file path to resolve
 * @param repositoryId - Repository UUID
 * @param userId - User UUID for RLS context
 * @returns File UUID or null if not found
 */
export async function resolveFilePath(
	client: SupabaseClient | null,
	filePath: string,
	repositoryId: string,
	userId: string,
): Promise<string | null> {
	// Local mode: Use SQLite
	if (isLocalMode()) {
		const db = getGlobalDatabase();
		return resolveFilePathLocal(db, filePath, repositoryId);
	}

	// Cloud mode: existing Supabase logic
	if (!client) {
		throw new Error("Supabase client required in cloud mode");
	}

	const { data, error } = await client
		.from("indexed_files")
		.select("id")
		.eq("repository_id", repositoryId)
		.eq("path", filePath)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to resolve file path: ${error.message}`);
	}

	return data?.id ?? null;
}

export interface DependencyResult {
	direct: string[];
	indirect: Record<string, string[]>;
	cycles: string[][];
}

/**
 * Index job status response structure.
 * Matches the database schema for index_jobs table.
 */
export interface IndexJobStatus {
	id: string;
	repository_id: string;
	ref: string | null;
	status: "pending" | "running" | "completed" | "failed" | "skipped";
	started_at: string | null;
	completed_at: string | null;
	error_message: string | null;
	stats: {
		files_indexed?: number;
		symbols_extracted?: number;
		references_extracted?: number;
		dependencies_extracted?: number;
		circular_dependencies_detected?: number;
	} | null;
	retry_count: number | null;
	created_at: string;
}

/**
 * Query the status of an index job by its ID.
 * RLS is enforced via the Supabase client context.
 *
 * @param client - Supabase client instance
 * @param jobId - Index job UUID
 * @returns Index job status or null if not found
 */
// TODO(Phase 2B): index_jobs table is cloud-only, no local implementation needed
// See: https://github.com/kotadb/kotadb/issues/539
export async function getIndexJobStatus(
	client: SupabaseClient,
	jobId: string,
): Promise<IndexJobStatus | null> {
	const { data, error } = await client
		.from("index_jobs")
		.select(
			"id, repository_id, ref, status, started_at, completed_at, error_message, stats, retry_count, created_at",
		)
		.eq("id", jobId)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to fetch job status: ${error.message}`);
	}

	return data as IndexJobStatus | null;
}

/**
 * Query files that depend on the given file (reverse lookup).
 * Finds files that import or reference the target file.
 *
 * @param client - Supabase client instance
 * @param fileId - Target file UUID
 * @param depth - Recursion depth (1-5)
 * @param includeTests - Whether to include test files
 * @param userId - User UUID for RLS context
 * @returns Dependency result with direct/indirect relationships and cycles
 */
export async function queryDependents(
	client: SupabaseClient | null,
	fileId: string,
	depth: number,
	includeTests: boolean,
	userId: string,
): Promise<DependencyResult> {
	// Local mode: Use SQLite
	if (isLocalMode()) {
		const db = getGlobalDatabase();
		return queryDependentsLocalWrapped(db, fileId, depth, includeTests);
	}

	// Cloud mode: existing Supabase logic
	if (!client) {
		throw new Error("Supabase client required in cloud mode");
	}
	
	// TypeScript needs this for closure type narrowing
	const supabaseClient = client;

	const visited = new Set<string>();
	const direct: string[] = [];
	const indirect: Record<string, string[]> = {};
	const cycles: string[][] = [];

	async function traverse(
		currentFileId: string,
		currentDepth: number,
		path: string[],
	): Promise<void> {
		if (currentDepth > depth) return;

		// Build query for files that depend on currentFileId
		const { data, error } = await supabaseClient
			.from("dependency_graph")
			.select("from_file_id, indexed_files!dependency_graph_from_file_id_fkey(id, path)")
			.eq("to_file_id", currentFileId)
			.eq("dependency_type", "file_import");

		if (error) {
			throw new Error(`Failed to query dependents: ${error.message}`);
		}

		for (const row of data ?? []) {
			const fileRecord = row.indexed_files as
				| { id: string; path: string }
				| { id: string; path: string }[]
				| null;
			if (!fileRecord) continue;

			const file = Array.isArray(fileRecord) ? fileRecord[0] : fileRecord;
			if (!file) continue;

			// Filter test files if requested
			if (!includeTests && (file.path.includes("test") || file.path.includes("spec"))) {
				continue;
			}

			// Detect cycle
			if (path.includes(file.path)) {
				cycles.push([...path, file.path]);
				continue;
			}

			// Track dependencies by depth
			if (currentDepth === 1) {
				if (!direct.includes(file.path)) {
					direct.push(file.path);
				}
			} else {
				const parentPath = path[path.length - 1] ?? "root";
				if (!indirect[parentPath]) {
					indirect[parentPath] = [];
				}
				if (!indirect[parentPath].includes(file.path)) {
					indirect[parentPath].push(file.path);
				}
			}

			// Recurse if not visited and within depth limit
			if (!visited.has(file.id) && currentDepth < depth) {
				visited.add(file.id);
				await traverse(file.id, currentDepth + 1, [...path, file.path]);
			}
		}
	}

	// Get the path of the starting file for cycle detection
	const { data: startFile } = await client
		.from("indexed_files")
		.select("path")
		.eq("id", fileId)
		.single();

	if (startFile) {
		visited.add(fileId);
		await traverse(fileId, 1, [startFile.path]);
	}

	return { direct, indirect, cycles };
}

/**
 * Query files that the given file depends on (forward lookup).
 * Finds files that are imported or referenced by the source file.
 *
 * @param client - Supabase client instance
 * @param fileId - Source file UUID
 * @param depth - Recursion depth (1-5)
 * @param userId - User UUID for RLS context
 * @returns Dependency result with direct/indirect relationships and cycles
 */
export async function queryDependencies(
	client: SupabaseClient | null,
	fileId: string,
	depth: number,
	userId: string,
): Promise<DependencyResult> {
	// Local mode: Use SQLite
	if (isLocalMode()) {
		const db = getGlobalDatabase();
		return queryDependenciesLocalWrapped(db, fileId, depth);
	}

	// Cloud mode: existing Supabase logic
	if (!client) {
		throw new Error("Supabase client required in cloud mode");
	}
	
	// TypeScript needs this for closure type narrowing
	const supabaseClient = client;

	const visited = new Set<string>();
	const direct: string[] = [];
	const indirect: Record<string, string[]> = {};
	const cycles: string[][] = [];

	async function traverse(
		currentFileId: string,
		currentDepth: number,
		path: string[],
	): Promise<void> {
		if (currentDepth > depth) return;

		// Build query for files that currentFileId depends on
		const { data, error } = await supabaseClient
			.from("dependency_graph")
			.select("to_file_id, indexed_files!dependency_graph_to_file_id_fkey(id, path)")
			.eq("from_file_id", currentFileId)
			.eq("dependency_type", "file_import");

		if (error) {
			throw new Error(`Failed to query dependencies: ${error.message}`);
		}

		for (const row of data ?? []) {
			const fileRecord = row.indexed_files as
				| { id: string; path: string }
				| { id: string; path: string }[]
				| null;
			if (!fileRecord) continue;

			const file = Array.isArray(fileRecord) ? fileRecord[0] : fileRecord;
			if (!file) continue;

			// Detect cycle
			if (path.includes(file.path)) {
				cycles.push([...path, file.path]);
				continue;
			}

			// Track dependencies by depth
			if (currentDepth === 1) {
				if (!direct.includes(file.path)) {
					direct.push(file.path);
				}
			} else {
				const parentPath = path[path.length - 1] ?? "root";
				if (!indirect[parentPath]) {
					indirect[parentPath] = [];
				}
				if (!indirect[parentPath].includes(file.path)) {
					indirect[parentPath].push(file.path);
				}
			}

			// Recurse if not visited and within depth limit
			if (!visited.has(file.id) && currentDepth < depth) {
				visited.add(file.id);
				await traverse(file.id, currentDepth + 1, [...path, file.path]);
			}
		}
	}

	// Get the path of the starting file for cycle detection
	const { data: startFile } = await client
		.from("indexed_files")
		.select("path")
		.eq("id", fileId)
		.single();

	if (startFile) {
		visited.add(fileId);
		await traverse(fileId, 1, [startFile.path]);
	}

	return { direct, indirect, cycles };
}

/**
 * Run indexing workflow for local mode (synchronous, no queue).
 * 
 * Unlike cloud mode which queues an async job, local mode
 * executes indexing synchronously and stores directly to SQLite.
 * 
 * @param request - Index request with repository details
 * @returns Indexing result with stats
 */
export async function runIndexingWorkflowLocal(
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

	// Determine repository path and full name
	let localPath: string;
	let fullName = request.repository;

	if (request.localPath) {
		localPath = resolve(request.localPath);

		// SECURITY: Prevent path traversal - only allow paths within workspace
		const workspaceRoot = resolve(process.cwd());
		if (!localPath.startsWith(workspaceRoot)) {
			throw new Error(`localPath must be within workspace: ${workspaceRoot}`);
		}
		// For local paths, use the last path segment as repo name if not in owner/repo format
		if (!fullName.includes("/")) {
			fullName = `local/${fullName}`;
		}
	} else {
		// Use prepareRepository for remote cloning
		const repo = await prepareRepository(request);
		localPath = repo.localPath;
	}

	if (!existsSync(localPath)) {
		throw new Error(`Repository path does not exist: ${localPath}`);
	}

	// Ensure repository exists in SQLite
	const gitUrl = request.localPath ? localPath : `https://github.com/${fullName}.git`;
	const repositoryId = ensureRepositoryLocal(db, fullName, gitUrl, request.ref);

	logger.info("Starting local indexing workflow", {
		repositoryId,
		fullName,
		localPath,
	});

	// Discover and parse source files
	const sources = await discoverSources(localPath);
	const records = (
		await Promise.all(sources.map((source) => parseSourceFile(source, localPath)))
	).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	// Save files to SQLite
	const filesIndexed = saveIndexedFilesLocal(db, records, repositoryId);

	// Extract and store symbols, references, and dependencies
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

		// Get the file_id from SQLite
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

		// Store file with id for dependency extraction
		filesWithId.push({ ...file, id: fileRecord.id, repository_id: repositoryId });

		// Store symbols and references
		const symbolCount = storeSymbolsLocal(db, symbols, fileRecord.id);
		const referenceCount = storeReferencesLocal(db, references, fileRecord.id);

		totalSymbols += symbolCount;
		totalReferences += referenceCount;

		// Fetch stored symbols with their database IDs for dependency extraction
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

		// Attach file_id to references for dependency extraction
		for (const ref of references) {
			allReferencesWithFileId.push({ ...ref, file_id: fileRecord.id });
		}
	}

	// Extract and store dependency graph
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

	// Clear existing dependencies for this repository and store new ones
	db.run("DELETE FROM dependency_graph WHERE repository_id = ?", [repositoryId]);
	const dependencyCount = storeDependenciesLocal(db, dependencies);

	// Detect circular dependencies and log warnings
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

	// Update repository last_indexed_at
	updateRepositoryLastIndexedLocal(db, repositoryId);

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
