/**
 * Indexing worker for processing repository indexing jobs.
 *
 * Implements a 7-step pipeline:
 * 1. Clone/fetch repository to temporary directory
 * 2. Discover source files in project
 * 3. Parse files and extract content
 * 4. Extract symbols via AST parsing
 * 5. Extract cross-file references
 * 6. Build dependency graph
 * 7. Store indexed data atomically
 *
 * The worker is registered with pg-boss and processes jobs from the "index-repo" queue.
 * Includes automatic retry for transient failures, temp directory cleanup, and job status tracking.
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";
import type PgBoss from "pg-boss";
import { getServiceClient } from "@db/client";
import { updateJobStatus } from "@queue/job-tracker";
import type { IndexRepoJobPayload } from "@queue/types";
import { WORKER_TEAM_SIZE, QUEUE_NAMES } from "@queue/config";
import { prepareRepository } from "@indexer/repos";
import { discoverSources, parseSourceFile } from "@indexer/parsers";
import { parseFile, isSupportedForAST } from "@indexer/ast-parser";
import { extractSymbols } from "@indexer/symbol-extractor";
import {
	storeIndexedData,
	type FileData,
	type SymbolData,
	type ReferenceData,
	type DependencyGraphEntry,
} from "@indexer/storage";

/**
 * Start the indexing worker pool
 *
 * Registers workers with pg-boss to process "index-repo" jobs.
 * Configures team size (3 workers) and concurrency (1 job per worker).
 *
 * @param queue - pg-boss instance
 */
export async function startIndexWorker(queue: PgBoss): Promise<void> {
	console.log(
		`[${new Date().toISOString()}] Starting index-repo workers (team_size=${WORKER_TEAM_SIZE})`,
	);

	// Register multiple workers by calling work() multiple times
	// pg-boss work() handler receives array of jobs (batch processing)
	for (let i = 0; i < WORKER_TEAM_SIZE; i++) {
		await queue.work(
			QUEUE_NAMES.INDEX_REPO,
			async (jobs: PgBoss.Job<IndexRepoJobPayload>[]) => {
				// Process jobs sequentially (pg-boss batch mode)
				for (const job of jobs) {
					await processIndexJob(job.data);
				}
			},
		);
	}

	console.log(
		`[${new Date().toISOString()}] Index-repo workers registered successfully`,
	);
}

/**
 * Process a single indexing job
 *
 * Implements the full 7-step pipeline with error handling and cleanup guarantees.
 *
 * @param payload - Job payload with indexJobId, repositoryId, commitSha
 * @throws Error for transient failures (triggers retry)
 * @throws Error for permanent failures (terminal after retries)
 */
async function processIndexJob(
	payload: IndexRepoJobPayload,
): Promise<void> {
	const { indexJobId, repositoryId, commitSha } = payload;
	const supabase = getServiceClient();
	const startTime = Date.now();

	// Use unique temp directory for this job
	const tempDir = join("/tmp", `kotadb-${indexJobId}`);

	console.log(
		`[${new Date().toISOString()}] Processing index job: job_id=${indexJobId}, repository_id=${repositoryId}, temp_dir=${tempDir}`,
	);

	// Fetch repository metadata for context
	const { data: repo, error: repoError } = await supabase
		.from("repositories")
		.select("slug, ref, user_id")
		.eq("id", repositoryId)
		.single();

	if (repoError || !repo) {
		throw new Error(
			`Repository not found: ${repositoryId} - ${repoError?.message || "unknown error"}`,
		);
	}

	const userId = repo.user_id;

	try {
		// Update job status to 'processing'
		await updateJobStatus(indexJobId, "processing", undefined, userId);

		// STEP 1: Clone/fetch repository to temp directory
		console.log(
			`[${new Date().toISOString()}] [STEP 1/7] Cloning repository: repository_id=${repositoryId}`,
		);

		const repoContext = await prepareRepository({
			repository: repo.slug,
			ref: commitSha || repo.ref,
			localPath: tempDir,
		});

		// STEP 2: Discover source files
		console.log(
			`[${new Date().toISOString()}] [STEP 2/7] Discovering source files: path=${repoContext.localPath}`,
		);

		const filePaths = await discoverSources(repoContext.localPath);
		console.log(
			`[${new Date().toISOString()}] Discovered ${filePaths.length} source files`,
		);

		// STEP 3: Parse files
		console.log(
			`[${new Date().toISOString()}] [STEP 3/7] Parsing source files`,
		);

		const files: FileData[] = [];
		const fileContentMap = new Map<string, string>();

		for (const filePath of filePaths) {
			try {
				const parsed = await parseSourceFile(filePath, repoContext.localPath);
				if (!parsed) continue;

				const sizeBytes = Buffer.byteLength(parsed.content, "utf8");
				const language = getLanguageFromPath(parsed.path);

				files.push({
					path: parsed.path,
					content: parsed.content,
					language,
					size_bytes: sizeBytes,
					metadata: {},
				});

				fileContentMap.set(parsed.path, parsed.content);
			} catch (error) {
				console.warn(
					`[${new Date().toISOString()}] Failed to parse file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
				);
				// Continue processing other files (partial failure tolerance)
			}
		}

		console.log(`[${new Date().toISOString()}] Parsed ${files.length} files successfully`);

		// STEP 4: Extract symbols via AST
		console.log(
			`[${new Date().toISOString()}] [STEP 4/7] Extracting symbols`,
		);

		const symbols: SymbolData[] = [];

		for (const file of files) {
			if (!isSupportedForAST(file.path)) continue;

			try {
				const ast = parseFile(file.path, file.content);
				if (!ast) continue;

				const fileSymbols = extractSymbols(ast, file.path);

				for (const symbol of fileSymbols) {
					symbols.push({
						file_path: file.path,
						name: symbol.name,
						kind: symbol.kind,
						line_start: symbol.lineStart,
						line_end: symbol.lineEnd,
						signature: symbol.signature || undefined,
						documentation: symbol.documentation || undefined,
						metadata: {},
					});
				}
			} catch (error) {
				console.warn(
					`[${new Date().toISOString()}] Failed to extract symbols from ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
				// Continue processing other files
			}
		}

		console.log(
			`[${new Date().toISOString()}] Extracted ${symbols.length} symbols`,
		);

		// STEP 5: Extract cross-file references
		console.log(
			`[${new Date().toISOString()}] [STEP 5/7] Extracting references`,
		);

		// References require post-storage processing with file IDs
		// For MVP, store empty array (deferred to future iteration)
		const references: ReferenceData[] = [];

		console.log(
			`[${new Date().toISOString()}] References deferred (requires post-storage processing)`,
		);

		// STEP 6: Build dependency graph
		console.log(
			`[${new Date().toISOString()}] [STEP 6/7] Building dependency graph`,
		);

		// Dependency graph requires post-storage processing with file/symbol IDs
		// For MVP, store empty array (deferred to future iteration)
		const dependencyGraph: DependencyGraphEntry[] = [];

		console.log(
			`[${new Date().toISOString()}] Dependency graph deferred (requires post-storage processing)`,
		);

		// STEP 7: Store indexed data atomically
		console.log(
			`[${new Date().toISOString()}] [STEP 7/7] Storing indexed data`,
		);

		const stats = await storeIndexedData(
			supabase,
			repositoryId,
			files,
			symbols,
			references,
			dependencyGraph,
		);

		const duration = Date.now() - startTime;

		console.log(
			`[${new Date().toISOString()}] Successfully indexed repository: ` +
				`job_id=${indexJobId}, repository_id=${repositoryId}, ` +
				`duration=${duration}ms, files=${stats.files_indexed}, ` +
				`symbols=${stats.symbols_extracted}, references=${stats.references_found}, ` +
				`dependencies=${stats.dependencies_extracted}`,
		);

		// Update job status to 'completed' with stats
		await updateJobStatus(indexJobId, "completed", {
			stats: {
				files_indexed: stats.files_indexed,
				symbols_extracted: stats.symbols_extracted,
				references_found: stats.references_found,
				dependencies_extracted: stats.dependencies_extracted,
			},
		}, userId);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		console.error(
			`[${new Date().toISOString()}] Index job failed: job_id=${indexJobId}, ` +
				`repository_id=${repositoryId}, error=${errorMessage}`,
		);

		// Update job status to 'failed' with error message
		await updateJobStatus(indexJobId, "failed", {
			error: errorMessage,
		}, userId);

		// Re-throw error for pg-boss retry logic
		throw error;
	} finally {
		// CLEANUP: Remove temp directory (guaranteed execution)
		try {
			await rm(tempDir, { recursive: true, force: true });
			console.log(
				`[${new Date().toISOString()}] Cleaned up temp directory: ${tempDir}`,
			);
		} catch (cleanupError) {
			console.error(
				`[${new Date().toISOString()}] Failed to clean up temp directory ${tempDir}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
			);
			// Don't throw cleanup errors (non-critical)
		}
	}
}

/**
 * Infer programming language from file extension
 *
 * @param filePath - Relative file path
 * @returns Language identifier (typescript, javascript, json)
 */
function getLanguageFromPath(filePath: string): string {
	const ext = filePath.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "ts":
		case "tsx":
			return "typescript";
		case "js":
		case "jsx":
		case "cjs":
		case "mjs":
			return "javascript";
		case "json":
			return "json";
		default:
			return "unknown";
	}
}
