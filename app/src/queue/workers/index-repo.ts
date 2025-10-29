/**
 * Indexing worker for processing repository indexing jobs.
 *
 * Implements a 7-step pipeline:
 * 1. Clone/fetch repository (reuses data/workspace/ for efficiency)
 * 2. Discover source files in project
 * 3. Parse files and extract content
 * 4. Extract symbols via AST parsing
 * 5. Extract cross-file references (deferred - requires database IDs)
 * 6. Build dependency graph (deferred - requires database IDs)
 * 7. Store indexed data atomically
 *
 * The worker is registered with pg-boss and processes jobs from the "index-repo" queue.
 * Includes automatic retry for transient failures and job status tracking.
 */

import type PgBoss from "pg-boss";
import { getServiceClient } from "@db/client";
import { updateJobStatus } from "@queue/job-tracker";
import type { IndexRepoJobPayload } from "@queue/types";
import { WORKER_TEAM_SIZE, QUEUE_NAMES, BATCH_SIZE } from "@queue/config";
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
	process.stdout.write(
		`[${new Date().toISOString()}] Starting index-repo workers (team_size=${WORKER_TEAM_SIZE})\n`,
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

	process.stdout.write(
		`[${new Date().toISOString()}] Index-repo workers registered successfully\n`,
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

	process.stdout.write(
		`[${new Date().toISOString()}] Processing index job: job_id=${indexJobId}, repository_id=${repositoryId}\n`,
	);

	// Fetch repository metadata for context
	const { data: repo, error: repoError } = await supabase
		.from("repositories")
		.select("full_name, git_url, default_branch, user_id")
		.eq("id", repositoryId)
		.single();

	if (repoError || !repo) {
		throw new Error(
			`Repository not found: ${repositoryId} - ${repoError?.message || "unknown error"}`,
		);
	}

	const userId = repo.user_id;
	// Use git_url if available, otherwise use full_name (for GitHub repos or local paths)
	const repositoryIdentifier = repo.git_url || repo.full_name;

	try {
		// Update job status to 'processing'
		await updateJobStatus(indexJobId, "processing", undefined, userId);

		// STEP 1: Clone/fetch repository
		process.stdout.write(
			`[${new Date().toISOString()}] [STEP 1/7] Cloning repository: repository_id=${repositoryId}\n`,
		);

		// Check if repository identifier is a local path (for testing or local repositories)
		const isLocalPath = repositoryIdentifier.startsWith("/") || repositoryIdentifier.startsWith(".");
		const repoContext = await prepareRepository(
			isLocalPath
				? {
						repository: repositoryIdentifier,
						ref: commitSha || repo.default_branch || "main",
						localPath: repositoryIdentifier,
					}
				: {
						repository: repositoryIdentifier,
						ref: commitSha || repo.default_branch || "main",
					},
		);

		// STEP 2: Discover source files
		process.stdout.write(
			`[${new Date().toISOString()}] [STEP 2/7] Discovering source files: path=${repoContext.localPath}\n`,
		);

		const filePaths = await discoverSources(repoContext.localPath);
		process.stdout.write(
			`[${new Date().toISOString()}] Discovered ${filePaths.length} source files\n`,
		);

		// STEP 3: Parse files
		process.stdout.write(
			`[${new Date().toISOString()}] [STEP 3/7] Parsing source files\n`,
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
				process.stderr.write(
					`[${new Date().toISOString()}] Failed to parse file ${filePath}: ${error instanceof Error ? error.message : String(error)}\n`,
				);
				// Continue processing other files (partial failure tolerance)
			}
		}

		process.stdout.write(`[${new Date().toISOString()}] Parsed ${files.length} files successfully\n`);

		// STEP 4: Extract symbols via AST
		process.stdout.write(
			`[${new Date().toISOString()}] [STEP 4/7] Extracting symbols\n`,
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
				process.stderr.write(
					`[${new Date().toISOString()}] Failed to extract symbols from ${file.path}: ${error instanceof Error ? error.message : String(error)}\n`,
				);
				// Continue processing other files
			}
		}

		process.stdout.write(
			`[${new Date().toISOString()}] Extracted ${symbols.length} symbols\n`,
		);

		// STEP 5: Extract cross-file references
		process.stdout.write(
			`[${new Date().toISOString()}] [STEP 5/7] Extracting references\n`,
		);

		// ARCHITECTURAL NOTE: Reference extraction requires post-storage processing
		// The reference-extractor.ts module expects IndexedFile[] with database IDs
		// already populated (see dependency-extractor.ts:148 for file_id checks).
		// This creates a chicken-and-egg problem: we need to store files first to get IDs,
		// but the storage function expects references as input.
		//
		// Solution options:
		// 1. Two-phase storage: Store files/symbols first, then extract+store references
		// 2. Refactor extractors to work without database IDs (use file paths as keys)
		// 3. Post-processing job that runs after initial indexing completes
		//
		// For MVP, we store empty arrays and defer to follow-up issue #XXX
		const references: ReferenceData[] = [];

		process.stdout.write(
			`[${new Date().toISOString()}] References deferred (requires database IDs - see issue #XXX)\n`,
		);

		// STEP 6: Build dependency graph
		process.stdout.write(
			`[${new Date().toISOString()}] [STEP 6/7] Building dependency graph\n`,
		);

		// ARCHITECTURAL NOTE: Dependency graph extraction has same limitation as references
		// The dependency-extractor.ts:extractDependencies() expects files with id field populated
		// and symbols with file_id attached (see lines 170, 238, 243).
		// This must be solved alongside reference extraction in follow-up work.
		const dependencyGraph: DependencyGraphEntry[] = [];

		process.stdout.write(
			`[${new Date().toISOString()}] Dependency graph deferred (requires database IDs - see issue #XXX)\n`,
		);

		// STEP 7: Store indexed data in batches
		process.stdout.write(
			`[${new Date().toISOString()}] [STEP 7/7] Storing indexed data (batch_size=${BATCH_SIZE})\n`,
		);

		// Chunk files for batch processing
		const chunks: FileData[][] = [];
		for (let i = 0; i < files.length; i += BATCH_SIZE) {
			chunks.push(files.slice(i, i + BATCH_SIZE));
		}

		process.stdout.write(
			`[${new Date().toISOString()}] Processing ${files.length} files in ${chunks.length} chunks\n`,
		);

		// Accumulate stats across all chunks
		let totalFilesIndexed = 0;
		let totalSymbolsExtracted = 0;
		let totalReferencesFound = 0;
		let totalDependenciesExtracted = 0;

		// Process each chunk sequentially
		for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
			const chunk = chunks[chunkIndex];
			if (!chunk) continue; // Skip if chunk is undefined

			const skipDelete = chunkIndex > 0; // Skip DELETE phase for chunks after first

			// Extract file paths in this chunk for filtering
			const chunkFilePaths = new Set(chunk.map((f) => f.path));

			// Filter symbols for this chunk (symbols reference file_path)
			const chunkSymbols = symbols.filter((s) =>
				chunkFilePaths.has(s.file_path),
			);

			// Filter references for this chunk (references have source_file_path)
			const chunkReferences = references.filter((r) =>
				chunkFilePaths.has(r.source_file_path),
			);

			// Filter dependencies for this chunk (dependencies have from_file_path)
			const chunkDependencies = dependencyGraph.filter((d) =>
				d.from_file_path && chunkFilePaths.has(d.from_file_path),
			);

			process.stdout.write(
				`[${new Date().toISOString()}] [STEP 7/${chunks.length}] Processing chunk ${chunkIndex + 1}: ` +
					`files=${chunk.length}, symbols=${chunkSymbols.length}, ` +
					`references=${chunkReferences.length}, dependencies=${chunkDependencies.length}, ` +
					`skip_delete=${skipDelete}\n`,
			);

			// Store chunk atomically
			const chunkStats = await storeIndexedData(
				supabase,
				repositoryId,
				chunk,
				chunkSymbols,
				chunkReferences,
				chunkDependencies,
				skipDelete,
			);

			// Accumulate stats
			totalFilesIndexed += chunkStats.files_indexed;
			totalSymbolsExtracted += chunkStats.symbols_extracted;
			totalReferencesFound += chunkStats.references_found;
			totalDependenciesExtracted += chunkStats.dependencies_extracted;

			// Update job progress after each chunk
			await updateJobStatus(
				indexJobId,
				"processing",
				{
					stats: {
						files_indexed: totalFilesIndexed,
						symbols_extracted: totalSymbolsExtracted,
						references_found: totalReferencesFound,
						dependencies_extracted: totalDependenciesExtracted,
						chunks_completed: chunkIndex + 1,
						current_chunk: chunkIndex + 1,
					},
				},
				userId,
			);

			process.stdout.write(
				`[${new Date().toISOString()}] Chunk ${chunkIndex + 1}/${chunks.length} completed: ` +
					`files=${chunkStats.files_indexed}, symbols=${chunkStats.symbols_extracted}\n`,
			);
		}

		const duration = Date.now() - startTime;

		process.stdout.write(
			`[${new Date().toISOString()}] Successfully indexed repository: ` +
				`job_id=${indexJobId}, repository_id=${repositoryId}, ` +
				`duration=${duration}ms, files=${totalFilesIndexed}, ` +
				`symbols=${totalSymbolsExtracted}, references=${totalReferencesFound}, ` +
				`dependencies=${totalDependenciesExtracted}, chunks=${chunks.length}\n`,
		);

		// Update job status to 'completed' with final stats
		await updateJobStatus(indexJobId, "completed", {
			stats: {
				files_indexed: totalFilesIndexed,
				symbols_extracted: totalSymbolsExtracted,
				references_found: totalReferencesFound,
				dependencies_extracted: totalDependenciesExtracted,
				chunks_completed: chunks.length,
			},
		}, userId);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		process.stderr.write(
			`[${new Date().toISOString()}] Index job failed: job_id=${indexJobId}, ` +
				`repository_id=${repositoryId}, error=${errorMessage}\n`,
		);

		// Update job status to 'failed' with error message
		await updateJobStatus(indexJobId, "failed", {
			error: errorMessage,
		}, userId);

		// Re-throw error for pg-boss retry logic
		throw error;
	}
	// Note: Repository cleanup is not needed - prepareRepository() clones to
	// data/workspace/{repo-name} which is reused across indexing jobs for efficiency
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
