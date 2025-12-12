/**
 * Indexing worker for processing repository indexing jobs.
 *
 * Implements a 7-step pipeline with two-pass storage architecture:
 * 1. Clone/fetch repository (reuses data/workspace/ for efficiency)
 * 2. Discover source files in project
 * 3. Parse files and extract content
 * 4. Extract symbols via AST parsing
 * 5. Store files/symbols (Pass 1) and extract references/dependencies (Pass 2)
 * 6. Store references and dependencies (Pass 2)
 * 7. Track job progress and stats
 *
 * Two-Pass Architecture (solves chicken-and-egg problem from issue #369):
 * - Pass 1: Store files and symbols to obtain database IDs
 * - Pass 2: Query stored data with IDs, extract references/dependencies, then store
 *
 * This approach is necessary because reference-extractor.ts and dependency-extractor.ts
 * require IndexedFile[] and ExtractedSymbol[] objects with database `id` fields populated
 * (see dependency-extractor.ts:148, 170, 238, 243). Database IDs are only available
 * after storage via RETURNING clauses, creating a dependency cycle.
 *
 * The worker is registered with pg-boss and processes jobs from the "index-repo" queue.
 * Includes automatic retry for transient failures and job status tracking.
 */

import type PgBoss from "pg-boss";
import { getServiceClient } from "@db/client";
import { updateJobStatus } from "@queue/job-tracker";
import type { IndexRepoJobPayload } from "@queue/types";
import { WORKER_TEAM_SIZE, QUEUE_NAMES, BATCH_SIZE, SYMBOL_QUERY_BATCH_SIZE } from "@queue/config";
import { prepareRepository } from "@indexer/repos";
import { discoverSources, parseSourceFile } from "@indexer/parsers";
import { parseFile, isSupportedForAST } from "@indexer/ast-parser";
import { extractSymbols } from "@indexer/symbol-extractor";
import { extractReferences } from "@indexer/reference-extractor";
import { extractDependencies } from "@indexer/dependency-extractor";
import type { IndexedFile } from "@shared/types/entities";
import type { Symbol as ExtractedSymbol } from "@indexer/symbol-extractor";
import {
	storeIndexedData,
	type FileData,
	type SymbolData,
	type ReferenceData,
	type DependencyGraphEntry,
} from "@indexer/storage";
import { createLogger } from "@logging/logger";
import { createJobContext } from "@logging/context";
import { INDEXER_CONFIG } from "@config/constants";

/**
 * Start the indexing worker pool
 *
 * Registers workers with pg-boss to process "index-repo" jobs.
 * Configures team size (3 workers) and concurrency (1 job per worker).
 *
 * @param queue - pg-boss instance
 */
export async function startIndexWorker(queue: PgBoss): Promise<void> {
	const logger = createLogger();
	logger.info("Starting index-repo workers", { team_size: WORKER_TEAM_SIZE });

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

	logger.info("Index-repo workers registered successfully");
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

	// Create job-scoped logger
	const logger = createLogger(createJobContext(indexJobId, repositoryId));
	logger.info("Processing index job", { repository_id: repositoryId });

	// Fetch repository metadata for context (including installation_id for GitHub App auth - Issue #337)
	const { data: repo, error: repoError } = await supabase
		.from("repositories")
		.select("full_name, git_url, default_branch, user_id, installation_id")
		.eq("id", repositoryId)
		.single();

	if (repoError || !repo) {
		throw new Error(
			`Repository not found: ${repositoryId} - ${repoError?.message || "unknown error"}`,
		);
	}

	const userId = repo.user_id;
	const installationId = repo.installation_id;
	// Use git_url if available, otherwise use full_name (for GitHub repos or local paths)
	const repositoryIdentifier = repo.git_url || repo.full_name;

	if (installationId !== null) {
		logger.info("Using GitHub App installation for repository authentication", {
			installation_id: installationId,
		});
	} else {
		logger.info("No installation_id found, using public clone", {
			full_name: repo.full_name,
		});
	}

	try {
		// Update job status to 'processing'
		await updateJobStatus(indexJobId, "processing", undefined, userId);

		// STEP 1: Clone/fetch repository
		logger.info("[STEP 1/7] Cloning repository");

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
			installationId ?? undefined, // Pass installation_id for GitHub App authentication (Issue #337)
		);

		// STEP 2: Discover source files
		logger.info("[STEP 2/7] Discovering source files", { path: repoContext.localPath });

		const filePaths = await discoverSources(repoContext.localPath);
		logger.info("Discovered source files", { count: filePaths.length });

		// STEP 3: Parse files
		logger.info("[STEP 3/7] Parsing source files");

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
				logger.warn("Failed to parse file", {
					file_path: filePath,
					error: error instanceof Error ? error.message : String(error),
				});
				// Continue processing other files (partial failure tolerance)
			}
		}

		logger.info("Parsed files successfully", { count: files.length });

		// STEP 4: Extract symbols via AST
		logger.info("[STEP 4/7] Extracting symbols");

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
				logger.warn("Failed to extract symbols from file", {
					file_path: file.path,
					error: error instanceof Error ? error.message : String(error),
				});
				// Continue processing other files
			}
		}

		logger.info("Extracted symbols", { count: symbols.length });

		// STEP 5-7: Two-pass storage with reference and dependency extraction
		// Pass 1: Store files/symbols to get database IDs
		// Pass 2: Extract references/dependencies using IDs, then store them
		process.stdout.write(
			`[${new Date().toISOString()}] [STEP 5/7] Two-pass storage: Pass 1 - Storing files and symbols (batch_size=${BATCH_SIZE})\n`,
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

		// PASS 1: Store files and symbols to get database IDs
		for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
			const chunk = chunks[chunkIndex];
			if (!chunk) continue;

			const skipDelete = chunkIndex > 0; // Skip DELETE phase for chunks after first
			const chunkFilePaths = new Set(chunk.map((f) => f.path));
			const chunkSymbols = symbols.filter((s) =>
				chunkFilePaths.has(s.file_path),
			);

			process.stdout.write(
				`[${new Date().toISOString()}] [PASS 1] Chunk ${chunkIndex + 1}/${chunks.length}: ` +
					`storing files=${chunk.length}, symbols=${chunkSymbols.length}\n`,
			);

			// Store files and symbols only (no references or dependencies yet)
			const pass1Stats = await storeIndexedData(
				supabase,
				repositoryId,
				chunk,
				chunkSymbols,
				[], // Empty references for Pass 1
				[], // Empty dependencies for Pass 1
				skipDelete,
			);

			totalFilesIndexed += pass1Stats.files_indexed;
			totalSymbolsExtracted += pass1Stats.symbols_extracted;

			process.stdout.write(
				`[${new Date().toISOString()}] [PASS 1] Chunk ${chunkIndex + 1}/${chunks.length} completed: ` +
					`files=${pass1Stats.files_indexed}, symbols=${pass1Stats.symbols_extracted}\n`,
			);
		}

		process.stdout.write(
			`[${new Date().toISOString()}] [PASS 1] Complete: files=${totalFilesIndexed}, symbols=${totalSymbolsExtracted}\n`,
		);

		// PASS 2: Query stored data with IDs, extract references/dependencies, then store them
		process.stdout.write(
			`[${new Date().toISOString()}] [STEP 6/7] Two-pass storage: Pass 2 - Extracting and storing references and dependencies\n`,
		);

		// Query database to get files with IDs (paginated to avoid Supabase 1000-row limit)
		const FILE_QUERY_BATCH_SIZE = INDEXER_CONFIG.FILE_QUERY_BATCH_SIZE;
		const storedFiles: Array<{ id: string; path: string; content: string; language: string }> = [];
		let fileOffset = 0;

		while (true) {
			const { data: fileBatch, error: filesError } = await supabase
				.from("indexed_files")
				.select("id, path, content, language")
				.eq("repository_id", repositoryId)
				.range(fileOffset, fileOffset + FILE_QUERY_BATCH_SIZE - 1);

			if (filesError) {
				throw new Error(`Failed to query indexed files at offset ${fileOffset}: ${filesError.message}`);
			}

			if (!fileBatch || fileBatch.length === 0) {
				break;
			}

			storedFiles.push(...fileBatch);

			// If we got fewer rows than batch size, we've reached the end
			if (fileBatch.length < FILE_QUERY_BATCH_SIZE) {
				break;
			}

			fileOffset += FILE_QUERY_BATCH_SIZE;
			process.stdout.write(
				`[${new Date().toISOString()}] [PASS 2] Queried ${storedFiles.length} files so far (offset: ${fileOffset})\n`,
			);
		}

		if (storedFiles.length === 0) {
			process.stdout.write(
				`[${new Date().toISOString()}] [PASS 2] No files found in database, skipping Pass 2\n`,
			);
		} else {
			// Query database to get symbols with IDs (batched to prevent URI overflow)
			const allSymbols: any[] = [];
			const totalBatches = Math.ceil(storedFiles.length / SYMBOL_QUERY_BATCH_SIZE);

			for (let i = 0; i < storedFiles.length; i += SYMBOL_QUERY_BATCH_SIZE) {
				const batch = storedFiles.slice(i, i + SYMBOL_QUERY_BATCH_SIZE);
				const batchNumber = Math.floor(i / SYMBOL_QUERY_BATCH_SIZE) + 1;

				process.stdout.write(
					`[${new Date().toISOString()}] [PASS 2] Batch ${batchNumber}/${totalBatches}: querying symbols for ${batch.length} files\n`,
				);

				const { data: batchSymbols, error: symbolsError } = await supabase
					.from("symbols")
					.select("id, file_id, name, kind, line_start, line_end, signature, documentation")
					.in("file_id", batch.map(f => f.id));

				if (symbolsError) {
					throw new Error(`Failed to query symbols for batch ${batchNumber}: ${symbolsError.message}`);
				}

				allSymbols.push(...(batchSymbols || []));
			}

			const storedSymbols = allSymbols;

			// Build IndexedFile[] with populated IDs
			const indexedFiles: IndexedFile[] = storedFiles.map(f => ({
				id: f.id,
				path: f.path,
				content: f.content,
				language: f.language,
				projectRoot: repositoryId, // Alias for repository_id
				dependencies: [], // Not needed for extraction
				indexedAt: new Date(), // Current timestamp
			}));

			// Build ExtractedSymbol[] with populated IDs and file_id
			const extractedSymbols: ExtractedSymbol[] = (storedSymbols || []).map(s => ({
				id: s.id,
				file_id: s.file_id,
				name: s.name,
				kind: s.kind as any, // Type assertion for SymbolKind
				lineStart: s.line_start,
				lineEnd: s.line_end,
				columnStart: 0, // Not stored in database
				columnEnd: 0, // Not stored in database
				signature: s.signature || null,
				documentation: s.documentation || null,
				isExported: false, // Not stored in database
			}));

			process.stdout.write(
				`[${new Date().toISOString()}] [PASS 2] Queried ${indexedFiles.length} files and ${extractedSymbols.length} symbols with IDs\n`,
			);

			// Extract references from AST for each file
			const allReferences: Array<{ filePath: string; fileId: string; references: any[] }> = [];
			for (const file of indexedFiles) {
				if (!isSupportedForAST(file.path)) continue;

				try {
					const ast = parseFile(file.path, file.content);
					if (!ast) continue;

					const refs = extractReferences(ast, file.path);
					if (refs.length > 0) {
						allReferences.push({
							filePath: file.path,
							fileId: file.id!,
							references: refs,
						});
					}
				} catch (error) {
					process.stderr.write(
						`[${new Date().toISOString()}] Failed to extract references from ${file.path}: ${error instanceof Error ? error.message : String(error)}\n`,
					);
				}
			}

			process.stdout.write(
				`[${new Date().toISOString()}] [PASS 2] Extracted references from ${allReferences.length} files\n`,
			);

			// Build ReferenceData array for storage
			const referenceData: ReferenceData[] = [];
			for (const fileRefs of allReferences) {
				for (const ref of fileRefs.references) {
					// Build symbol key for target lookup
					const targetSymbolKey = ref.metadata.importSource
						? undefined
						: `${fileRefs.filePath}::${ref.targetName}::${ref.lineNumber}`;

					referenceData.push({
						source_file_path: fileRefs.filePath,
						target_symbol_key: targetSymbolKey,
						target_file_path: ref.metadata.importSource || fileRefs.filePath,
						line_number: ref.lineNumber,
						reference_type: ref.referenceType,
						metadata: ref.metadata,
					});
				}
			}

			process.stdout.write(
				`[${new Date().toISOString()}] [PASS 2] Built ${referenceData.length} reference records\n`,
			);

			// Extract dependencies from files, symbols, and references
			const dependencyEdges = extractDependencies(
				indexedFiles,
				extractedSymbols,
				allReferences.flatMap(fr =>
					fr.references.map(r => ({
						...r,
						file_id: fr.fileId,
					}))
				),
				repositoryId,
			);

			process.stdout.write(
				`[${new Date().toISOString()}] [PASS 2] Extracted ${dependencyEdges.length} dependency edges\n`,
			);

			// Convert DependencyEdge[] to DependencyGraphEntry[] for storage
			const dependencyData: DependencyGraphEntry[] = dependencyEdges.map(edge => ({
				from_file_path: edge.fromFileId
					? indexedFiles.find(f => f.id === edge.fromFileId)?.path
					: undefined,
				to_file_path: edge.toFileId
					? indexedFiles.find(f => f.id === edge.toFileId)?.path
					: undefined,
				from_symbol_key: edge.fromSymbolId
					? buildSymbolKey(extractedSymbols.find(s => (s as any).id === edge.fromSymbolId))
					: undefined,
				to_symbol_key: edge.toSymbolId
					? buildSymbolKey(extractedSymbols.find(s => (s as any).id === edge.toSymbolId))
					: undefined,
				dependency_type: edge.dependencyType,
				metadata: edge.metadata,
			}));

			process.stdout.write(
				`[${new Date().toISOString()}] [PASS 2] Converted ${dependencyData.length} dependency entries\n`,
			);

			// Store references and dependencies (reuse storeIndexedData with skipDelete=true)
			// Since files and symbols are already stored, we only store references and dependencies
			const pass2Stats = await storeIndexedData(
				supabase,
				repositoryId,
				[], // No files to store in Pass 2
				[], // No symbols to store in Pass 2
				referenceData,
				dependencyData,
				true, // Skip DELETE to preserve Pass 1 data
			);

			totalReferencesFound = pass2Stats.references_found;
			totalDependenciesExtracted = pass2Stats.dependencies_extracted;

			process.stdout.write(
				`[${new Date().toISOString()}] [PASS 2] Complete: references=${totalReferencesFound}, dependencies=${totalDependenciesExtracted}\n`,
			);
		}

		const duration = Date.now() - startTime;

		logger.info("Successfully indexed repository", {
			duration_ms: duration,
			files_indexed: totalFilesIndexed,
			symbols_extracted: totalSymbolsExtracted,
			references_found: totalReferencesFound,
			dependencies_extracted: totalDependenciesExtracted,
			chunks: chunks.length,
		});

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

		logger.error("Index job failed", error instanceof Error ? error : undefined, {
			error_message: errorMessage,
		});

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

/**
 * Build symbol key for dependency graph storage
 *
 * Symbol key format: "file_path::symbol_name::line_start"
 * Used by storage function to map symbol IDs during dependency insertion
 *
 * @param symbol - ExtractedSymbol with file context
 * @returns Symbol key string or undefined if symbol is null
 */
function buildSymbolKey(symbol: ExtractedSymbol | undefined): string | undefined {
	if (!symbol) return undefined;

	// Get file path from file_id lookup (requires IndexedFile context)
	// For now, return undefined as we're using file/symbol IDs directly in edges
	// This function exists for potential future use with path-based keys
	return undefined;
}
