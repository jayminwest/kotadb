/**
 * MCP tool definitions and execution adapters
 *
 * Local-only v2.0.0: Simplified for SQLite-only operation
 * Cloud-only tools (projects, get_index_job_status) have been removed.
 */

import {
	listRecentFiles,
	queryDependencies,
	queryDependents,
	resolveFilePath,
	runIndexingWorkflow,
	searchFiles,
} from "@api/queries";
import { getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { buildSnippet } from "@indexer/extractors";
import { createLogger } from "@logging/logger.js";
import type { ChangeImpactRequest, ImplementationSpec, IndexRequest } from "@shared/types";
import { Sentry } from "../instrument.js";
import { analyzeChangeImpact } from "./impact-analysis";
import { invalidParams } from "./jsonrpc";
import { validateImplementationSpec } from "./spec-validation";
import { resolveRepositoryIdentifierWithError } from "./repository-resolver";

const logger = createLogger({ module: "mcp-tools" });

/**
 * MCP Tool Definition
 */
export interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
	};
}

/**
 * Tool: search_code
 */
export const SEARCH_CODE_TOOL: ToolDefinition = {
	name: "search_code",
	description:
		"Search indexed code files for a specific term. Returns matching files with context snippets.",
	inputSchema: {
		type: "object",
		properties: {
			term: {
				type: "string",
				description: "The search term to find in code files",
			},
			repository: {
				type: "string",
				description: "Optional: Filter results to a specific repository ID",
			},
			limit: {
				type: "number",
				description: "Optional: Maximum number of results (default: 20, max: 100)",
			},
		},
		required: ["term"],
	},
};

/**
 * Tool: index_repository
 */
export const INDEX_REPOSITORY_TOOL: ToolDefinition = {
	name: "index_repository",
	description:
		"Index a git repository by cloning/updating it and extracting code files. Performs synchronous indexing and returns immediately with status 'completed' and full indexing stats.",
	inputSchema: {
		type: "object",
		properties: {
			repository: {
				type: "string",
				description: "Repository identifier (e.g., 'owner/repo' or full git URL)",
			},
			ref: {
				type: "string",
				description: "Optional: Git ref/branch to checkout (default: main/master)",
			},
			localPath: {
				type: "string",
				description: "Optional: Use a local directory instead of cloning from git",
			},
		},
		required: ["repository"],
	},
};

/**
 * Tool: list_recent_files
 */
export const LIST_RECENT_FILES_TOOL: ToolDefinition = {
	name: "list_recent_files",
	description:
		"List recently indexed files, ordered by indexing timestamp. Useful for seeing what code is available.",
	inputSchema: {
		type: "object",
		properties: {
			limit: {
				type: "number",
				description: "Optional: Maximum number of files to return (default: 10)",
			},
			repository: {
				type: "string",
				description: "Optional: Filter results to a specific repository ID",
			},
		},
	},
};

/**
 * Tool: search_dependencies
 */
export const SEARCH_DEPENDENCIES_TOOL: ToolDefinition = {
	name: "search_dependencies",
	description:
		"Search the dependency graph to find files that depend on (dependents) or are depended on by (dependencies) a target file. Useful for impact analysis before refactoring, test scope discovery, and circular dependency detection.",
	inputSchema: {
		type: "object",
		properties: {
			file_path: {
				type: "string",
				description: "Relative file path within the repository (e.g., 'src/auth/context.ts')",
			},
			direction: {
				type: "string",
				enum: ["dependents", "dependencies", "both"],
				description:
					"Search direction: 'dependents' (files that import this file), 'dependencies' (files this file imports), or 'both' (default: 'both')",
			},
			depth: {
				type: "number",
				description:
					"Recursion depth for traversal (1-5, default: 1). Higher values find indirect relationships.",
			},
			include_tests: {
				type: "boolean",
				description:
					"Include test files in results (default: true). Set to false to filter out files with 'test' or 'spec' in path.",
			},
			reference_types: {
				type: "array",
				items: {
					type: "string",
					enum: ["import", "re_export", "export_all", "dynamic_import"],
				},
				description:
					"Filter by reference types (default: ['import', 're_export', 'export_all']). Add 'dynamic_import' to include lazy-loaded dependencies.",
			},
			repository: {
				type: "string",
				description: "Repository ID to search within. Required for multi-repository workspaces.",
			},
		},
		required: ["file_path"],
	},
};

/**
 * Tool: analyze_change_impact
 */
export const ANALYZE_CHANGE_IMPACT_TOOL: ToolDefinition = {
	name: "analyze_change_impact",
	description:
		"Analyze the impact of proposed code changes by examining dependency graphs, test scope, and potential conflicts. Returns comprehensive analysis including affected files, test recommendations, architectural warnings, and risk assessment. Useful for planning implementations and avoiding breaking changes.",
	inputSchema: {
		type: "object",
		properties: {
			files_to_modify: {
				type: "array",
				items: { type: "string" },
				description: "List of files to be modified (relative paths)",
			},
			files_to_create: {
				type: "array",
				items: { type: "string" },
				description: "List of files to be created (relative paths)",
			},
			files_to_delete: {
				type: "array",
				items: { type: "string" },
				description: "List of files to be deleted (relative paths)",
			},
			change_type: {
				type: "string",
				enum: ["feature", "refactor", "fix", "chore"],
				description: "Type of change being made",
			},
			description: {
				type: "string",
				description: "Brief description of the proposed change",
			},
			breaking_changes: {
				type: "boolean",
				description: "Whether this change includes breaking changes (default: false)",
			},
			repository: {
				type: "string",
				description: "Repository ID to analyze (optional, uses first repository if not specified)",
			},
		},
		required: ["change_type", "description"],
	},
};

/**
 * Tool: validate_implementation_spec
 */
export const VALIDATE_IMPLEMENTATION_SPEC_TOOL: ToolDefinition = {
	name: "validate_implementation_spec",
	description:
		"Validate an implementation specification against KotaDB conventions and repository state. Checks for file conflicts, naming conventions, path alias usage, test coverage, and dependency compatibility. Returns validation errors, warnings, and approval conditions checklist.",
	inputSchema: {
		type: "object",
		properties: {
			feature_name: {
				type: "string",
				description: "Name of the feature or change",
			},
			files_to_create: {
				type: "array",
				items: {
					type: "object",
					properties: {
						path: { type: "string" },
						purpose: { type: "string" },
						estimated_lines: { type: "number" },
					},
					required: ["path", "purpose"],
				},
				description: "Files to create with their purposes",
			},
			files_to_modify: {
				type: "array",
				items: {
					type: "object",
					properties: {
						path: { type: "string" },
						purpose: { type: "string" },
						estimated_lines: { type: "number" },
					},
					required: ["path", "purpose"],
				},
				description: "Files to modify with their purposes",
			},
			migrations: {
				type: "array",
				items: {
					type: "object",
					properties: {
						filename: { type: "string" },
						description: { type: "string" },
						tables_affected: {
							type: "array",
							items: { type: "string" },
						},
					},
					required: ["filename", "description"],
				},
				description: "Database migrations to add",
			},
			dependencies_to_add: {
				type: "array",
				items: {
					type: "object",
					properties: {
						name: { type: "string" },
						version: { type: "string" },
						dev: { type: "boolean" },
					},
					required: ["name"],
				},
				description: "npm dependencies to add",
			},
			breaking_changes: {
				type: "boolean",
				description: "Whether this includes breaking changes (default: false)",
			},
			repository: {
				type: "string",
				description: "Repository ID (optional, uses first repository if not specified)",
			},
		},
		required: ["feature_name"],
	},
};

/**
 * Tool: kota_sync_export
 */
export const SYNC_EXPORT_TOOL: ToolDefinition = {
	name: "kota_sync_export",
	description:
		"Export local SQLite database to JSONL files for git sync. Uses hash-based change detection to skip unchanged tables. Exports to .kotadb/export/ by default.",
	inputSchema: {
		type: "object",
		properties: {
			force: {
				type: "boolean",
				description: "Force export even if tables unchanged (default: false)",
			},
			export_dir: {
				type: "string",
				description: "Optional: Custom export directory path",
			},
		},
	},
};

/**
 * Tool: kota_sync_import
 */
export const SYNC_IMPORT_TOOL: ToolDefinition = {
	name: "kota_sync_import",
	description:
		"Import JSONL files into local SQLite database. Applies deletion manifest first, then imports all tables transactionally. Typically run after git pull to sync remote changes.",
	inputSchema: {
		type: "object",
		properties: {
			import_dir: {
				type: "string",
				description: "Optional: Custom import directory path (default: .kotadb/export)",
			},
		},
	},
};

/**
 * Tool: generate_task_context
 *
 * Generates structured context for hook-based context seeding.
 * Used by PreToolUse and SubagentStart hooks to inject dependency info.
 * Target: <100ms response time
 */
export const GENERATE_TASK_CONTEXT_TOOL: ToolDefinition = {
	name: "generate_task_context",
	description:
		"Generate structured context for a set of files including dependency counts, impacted files, test files, and recent changes. Designed for hook-based context injection with <100ms performance target.",
	inputSchema: {
		type: "object",
		properties: {
			files: {
				type: "array",
				items: { type: "string" },
				description: "List of file paths to analyze (relative to repository root)",
			},
			include_tests: {
				type: "boolean",
				description: "Include test file discovery (default: true)",
			},
			include_symbols: {
				type: "boolean",
				description: "Include symbol information for each file (default: false)",
			},
			max_impacted_files: {
				type: "number",
				description: "Maximum number of impacted files to return (default: 20)",
			},
			repository: {
				type: "string",
				description: "Repository ID or full_name (optional, uses most recent if not specified)",
			},
		},
		required: ["files"],
	},
};

/**
 * Get all available tool definitions
 */
export function getToolDefinitions(): ToolDefinition[] {
	return [
		SEARCH_CODE_TOOL,
		INDEX_REPOSITORY_TOOL,
		LIST_RECENT_FILES_TOOL,
		SEARCH_DEPENDENCIES_TOOL,
		ANALYZE_CHANGE_IMPACT_TOOL,
		VALIDATE_IMPLEMENTATION_SPEC_TOOL,
		SYNC_EXPORT_TOOL,
		SYNC_IMPORT_TOOL,
		GENERATE_TASK_CONTEXT_TOOL,
	];
}

/**
 * Type guard for list_recent_files params
 */
function isListRecentParams(params: unknown): params is { limit?: number; repository?: string } | undefined {
	if (params === undefined) return true;
	if (typeof params !== "object" || params === null) return false;
	const p = params as Record<string, unknown>;
	if (p.limit !== undefined && typeof p.limit !== "number") return false;
	if (p.repository !== undefined && typeof p.repository !== "string") return false;
	return true;
}

/**
 * Execute search_code tool
 */
export async function executeSearchCode(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameter: term
	if (p.term === undefined) {
		throw new Error("Missing required parameter: term");
	}
	if (typeof p.term !== "string") {
		throw new Error("Parameter 'term' must be a string");
	}

	// Validate optional parameters
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}
	if (p.limit !== undefined && typeof p.limit !== "number") {
		throw new Error("Parameter 'limit' must be a number");
	}

	const validatedParams = p as {
		term: string;
		repository?: string;
		limit?: number;
	};

	// Use SQLite via searchFiles
	const results = searchFiles(validatedParams.term, {
		repositoryId: validatedParams.repository,
		limit: validatedParams.limit,
	});

	return {
		results: results.map((row) => ({
			projectRoot: row.projectRoot,
			path: row.path,
			snippet: buildSnippet(row.content, validatedParams.term),
			dependencies: row.dependencies,
			indexedAt: row.indexedAt.toISOString(),
		})),
	};
}

/**
 * Execute index_repository tool
 */
export async function executeIndexRepository(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameter: repository
	if (p.repository === undefined) {
		throw new Error("Missing required parameter: repository");
	}
	if (typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	// Validate optional parameters
	if (p.ref !== undefined && typeof p.ref !== "string") {
		throw new Error("Parameter 'ref' must be a string");
	}
	if (p.localPath !== undefined && typeof p.localPath !== "string") {
		throw new Error("Parameter 'localPath' must be a string");
	}

	const validatedParams = p as {
		repository: string;
		ref?: string;
		localPath?: string;
	};

	const indexRequest: IndexRequest = {
		repository: validatedParams.repository,
		ref: validatedParams.ref ?? "main", // Default to 'main' if not provided
		localPath: validatedParams.localPath,
	};

	// LOCAL MODE: Synchronous indexing to SQLite
	logger.info("Starting local mode indexing", {
		repository: indexRequest.repository,
		localPath: indexRequest.localPath,
	});

	try {
		const result = await runIndexingWorkflow(indexRequest);

		return {
			runId: result.repositoryId, // Add runId for API compatibility
			repositoryId: result.repositoryId,
			status: "completed",
			message: "Indexing completed successfully",
			stats: {
				files_indexed: result.filesIndexed,
				symbols_extracted: result.symbolsExtracted,
				references_extracted: result.referencesExtracted,
				},
		};
	} catch (error) {
		Sentry.captureException(error, {
			tags: { mode: "local", repository: indexRequest.repository },
		});
		throw error;
	}
}

/**
 * Execute list_recent_files tool
 */
export async function executeListRecentFiles(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	if (!isListRecentParams(params)) {
		throw invalidParams(requestId, "Invalid parameters for list_recent_files tool");
	}

	const limit =
		params && typeof params === "object" && "limit" in params ? (params.limit as number) : 10;
	
	const repository =
		params && typeof params === "object" && "repository" in params 
			? (params.repository as string | undefined) 
			: undefined;

	// Use SQLite via listRecentFiles with optional repository filter
	const files = listRecentFiles(limit, repository);

	return {
		results: files.map((file) => ({
			projectRoot: file.projectRoot,
			path: file.path,
			dependencies: file.dependencies,
			indexedAt: file.indexedAt.toISOString(),
		})),
	};
}

/**
 * Execute search_dependencies tool
 */
export async function executeSearchDependencies(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameter: file_path
	if (p.file_path === undefined) {
		throw new Error("Missing required parameter: file_path");
	}
	if (typeof p.file_path !== "string") {
		throw new Error("Parameter 'file_path' must be a string");
	}

	// Validate optional parameters
	if (
		p.direction !== undefined &&
		typeof p.direction === "string" &&
		!["dependents", "dependencies", "both"].includes(p.direction)
	) {
		throw new Error("Parameter 'direction' must be one of: dependents, dependencies, both");
	}

	if (p.depth !== undefined) {
		if (typeof p.depth !== "number") {
			throw new Error("Parameter 'depth' must be a number");
		}
		if (p.depth < 1 || p.depth > 5) {
			throw new Error("Parameter 'depth' must be between 1 and 5");
		}
	}

	if (p.include_tests !== undefined && typeof p.include_tests !== "boolean") {
		throw new Error("Parameter 'include_tests' must be a boolean");
	}

	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	// Validate reference_types parameter
	if (p.reference_types !== undefined) {
		if (!Array.isArray(p.reference_types)) {
			throw new Error("Parameter 'reference_types' must be an array");
		}
		const validTypes = ["import", "re_export", "export_all", "dynamic_import"];
		for (const t of p.reference_types) {
			if (typeof t !== "string" || !validTypes.includes(t)) {
				throw new Error(`Invalid reference type: ${t}. Must be one of: ${validTypes.join(", ")}`);
			}
		}
	}

	const validatedParams = {
		file_path: p.file_path as string,
		direction: (p.direction as string | undefined) ?? "both",
		depth: (p.depth as number | undefined) ?? 1,
		include_tests: (p.include_tests as boolean | undefined) ?? true,
		reference_types: (p.reference_types as string[] | undefined) ?? ["import", "re_export", "export_all"],
		repository: p.repository as string | undefined,
	};


	// Resolve repository ID (supports UUID or full_name)
	const repoResult = resolveRepositoryIdentifierWithError(validatedParams.repository);
	if ("error" in repoResult) {
		return {
			file_path: validatedParams.file_path,
			message: repoResult.error,
			dependents: { direct: [], indirect: {}, cycles: [] },
			dependencies: { direct: [], indirect: {}, cycles: [] },
		};
	}
	const repositoryId = repoResult.id;

	// Resolve file path to file ID
	const fileId = resolveFilePath(validatedParams.file_path, repositoryId);

	if (!fileId) {
		return {
			file_path: validatedParams.file_path,
			message:
				"File not found: " + validatedParams.file_path + ". Make sure the repository is indexed.",
			dependents: { direct: [], indirect: {}, cycles: [] },
			dependencies: { direct: [], indirect: {}, cycles: [] },
		};
	}

	// Query dependents and/or dependencies based on direction
	let dependents: {
		direct: string[];
		indirect: Record<string, string[]>;
		cycles: string[][];
	} | null = null;
	let dependencies: {
		direct: string[];
		indirect: Record<string, string[]>;
		cycles: string[][];
	} | null = null;

	if (validatedParams.direction === "dependents" || validatedParams.direction === "both") {
		dependents = queryDependents(fileId, validatedParams.depth, validatedParams.include_tests, validatedParams.reference_types);
	}

	if (validatedParams.direction === "dependencies" || validatedParams.direction === "both") {
		dependencies = queryDependencies(fileId, validatedParams.depth, validatedParams.reference_types);
	}

	// Build response
	const result: Record<string, unknown> = {
		file_path: validatedParams.file_path,
		direction: validatedParams.direction,
		depth: validatedParams.depth,
	};

	if (dependents) {
		result.dependents = {
			direct: dependents.direct,
			indirect: dependents.indirect,
			cycles: dependents.cycles,
			count:
				dependents.direct.length +
				Object.values(dependents.indirect).reduce((sum, arr) => sum + arr.length, 0),
		};
	}

	if (dependencies) {
		result.dependencies = {
			direct: dependencies.direct,
			indirect: dependencies.indirect,
			cycles: dependencies.cycles,
			count:
				dependencies.direct.length +
				Object.values(dependencies.indirect).reduce((sum, arr) => sum + arr.length, 0),
		};
	}

	// Query unresolved imports for this file
	const db = getGlobalDatabase();
	const unresolvedRows = db.query<{ source: string }>(
		`SELECT DISTINCT json_extract(metadata, '$.importSource') as source
		 FROM indexed_references
		 WHERE file_id = ? AND target_file_path IS NULL AND json_extract(metadata, '$.importSource') IS NOT NULL`,
		[fileId],
	);
	result.unresolved_imports = unresolvedRows.map((r) => r.source);

	return result;
}

/**
 * Execute analyze_change_impact tool
 */
export async function executeAnalyzeChangeImpact(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameters
	if (p.change_type === undefined) {
		throw new Error("Missing required parameter: change_type");
	}
	if (typeof p.change_type !== "string") {
		throw new Error("Parameter 'change_type' must be a string");
	}
	if (!["feature", "refactor", "fix", "chore"].includes(p.change_type)) {
		throw new Error("Parameter 'change_type' must be one of: feature, refactor, fix, chore");
	}

	if (p.description === undefined) {
		throw new Error("Missing required parameter: description");
	}
	if (typeof p.description !== "string") {
		throw new Error("Parameter 'description' must be a string");
	}

	// Validate optional parameters
	if (p.files_to_modify !== undefined && !Array.isArray(p.files_to_modify)) {
		throw new Error("Parameter 'files_to_modify' must be an array");
	}
	if (p.files_to_create !== undefined && !Array.isArray(p.files_to_create)) {
		throw new Error("Parameter 'files_to_create' must be an array");
	}
	if (p.files_to_delete !== undefined && !Array.isArray(p.files_to_delete)) {
		throw new Error("Parameter 'files_to_delete' must be an array");
	}
	if (p.breaking_changes !== undefined && typeof p.breaking_changes !== "boolean") {
		throw new Error("Parameter 'breaking_changes' must be a boolean");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const validatedParams: ChangeImpactRequest = {
		files_to_modify: p.files_to_modify as string[] | undefined,
		files_to_create: p.files_to_create as string[] | undefined,
		files_to_delete: p.files_to_delete as string[] | undefined,
		change_type: p.change_type as "feature" | "refactor" | "fix" | "chore",
		description: p.description as string,
		breaking_changes: p.breaking_changes as boolean | undefined,
		repository: p.repository as string | undefined,
	};

	const result = await analyzeChangeImpact(validatedParams, userId);

	return result;
}

/**
 * Execute validate_implementation_spec tool
 */
export async function executeValidateImplementationSpec(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameters
	if (p.feature_name === undefined) {
		throw new Error("Missing required parameter: feature_name");
	}
	if (typeof p.feature_name !== "string") {
		throw new Error("Parameter 'feature_name' must be a string");
	}

	// Validate optional parameters
	if (p.files_to_create !== undefined && !Array.isArray(p.files_to_create)) {
		throw new Error("Parameter 'files_to_create' must be an array");
	}
	if (p.files_to_modify !== undefined && !Array.isArray(p.files_to_modify)) {
		throw new Error("Parameter 'files_to_modify' must be an array");
	}
	if (p.migrations !== undefined && !Array.isArray(p.migrations)) {
		throw new Error("Parameter 'migrations' must be an array");
	}
	if (p.dependencies_to_add !== undefined && !Array.isArray(p.dependencies_to_add)) {
		throw new Error("Parameter 'dependencies_to_add' must be an array");
	}
	if (p.breaking_changes !== undefined && typeof p.breaking_changes !== "boolean") {
		throw new Error("Parameter 'breaking_changes' must be a boolean");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const validatedParams: ImplementationSpec = {
		feature_name: p.feature_name as string,
		files_to_create: p.files_to_create as any,
		files_to_modify: p.files_to_modify as any,
		migrations: p.migrations as any,
		dependencies_to_add: p.dependencies_to_add as any,
		breaking_changes: p.breaking_changes as boolean | undefined,
		repository: p.repository as string | undefined,
	};

	const result = await validateImplementationSpec(validatedParams, userId);

	return result;
}

/**
 * Execute kota_sync_export tool
 */
export async function executeSyncExport(
	params: unknown,
	_requestId: string | number,
): Promise<unknown> {
	// Validate params
	if (params !== undefined && (typeof params !== "object" || params === null)) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown> | undefined;
	const force = p?.force === true;
	const exportDir = typeof p?.export_dir === "string" ? p.export_dir : undefined;

	const { getClient } = await import("@db/client.js");
	const { createExporter } = await import("@db/sqlite/jsonl-exporter.js");

	const db = getClient() as KotaDatabase;
	const exporter = createExporter(db, exportDir);

	// Force export or use normal flow with change detection
	const result = await exporter.exportNow();

	return {
		success: true,
		tables_exported: result.tablesExported,
		tables_skipped: result.tablesSkipped,
		total_rows: result.totalRows,
		duration_ms: result.durationMs,
		export_dir: exportDir || ".kotadb/export (project-local)",
	};
}

/**
 * Execute kota_sync_import tool
 */
export async function executeSyncImport(
	params: unknown,
	_requestId: string | number,
): Promise<unknown> {
	// Validate params
	if (params !== undefined && (typeof params !== "object" || params === null)) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown> | undefined;
	const importDir = typeof p?.import_dir === "string" ? p.import_dir : undefined;

	const { getClient } = await import("@db/client.js");
	const { importFromJSONL } = await import("@db/sqlite/jsonl-importer.js");
	const { getDefaultExportDir } = await import("@db/sqlite/jsonl-exporter.js");

	const db = getClient() as KotaDatabase;
	const dir = importDir || getDefaultExportDir();

	const result = await importFromJSONL(db, dir);

	if (result.errors.length > 0) {
		return {
			success: false,
			tables_imported: result.tablesImported,
			rows_imported: result.totalRowsImported,
			errors: result.errors,
			duration_ms: result.durationMs,
		};
	}

	return {
		success: true,
		tables_imported: result.tablesImported,
		rows_imported: result.totalRowsImported,
		duration_ms: result.durationMs,
		import_dir: dir,
	};
}


/**
 * Execute generate_task_context tool
 *
 * Generates structured context for hook-based context seeding.
 * Performance target: <100ms
 */
export async function executeGenerateTaskContext(
	params: unknown,
	_requestId: string | number,
	userId: string,
): Promise<unknown> {
	const startTime = performance.now();

	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameter: files
	if (p.files === undefined) {
		throw new Error("Missing required parameter: files");
	}
	if (!Array.isArray(p.files)) {
		throw new Error("Parameter 'files' must be an array");
	}
	for (const file of p.files) {
		if (typeof file !== "string") {
			throw new Error("Each file in 'files' must be a string");
		}
	}

	// Validate optional parameters
	if (p.include_tests !== undefined && typeof p.include_tests !== "boolean") {
		throw new Error("Parameter 'include_tests' must be a boolean");
	}
	if (p.include_symbols !== undefined && typeof p.include_symbols !== "boolean") {
		throw new Error("Parameter 'include_symbols' must be a boolean");
	}
	if (p.max_impacted_files !== undefined && typeof p.max_impacted_files !== "number") {
		throw new Error("Parameter 'max_impacted_files' must be a number");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const validatedParams = {
		files: p.files as string[],
		include_tests: (p.include_tests as boolean | undefined) ?? true,
		include_symbols: (p.include_symbols as boolean | undefined) ?? false,
		max_impacted_files: Math.min(Math.max((p.max_impacted_files as number | undefined) ?? 20, 1), 50),
		repository: p.repository as string | undefined,
	};

	// Resolve repository ID
	const repoResult = resolveRepositoryIdentifierWithError(validatedParams.repository);
	if ("error" in repoResult) {
		return {
			targetFiles: [],
			impactedFiles: [],
			testFiles: [],
			recentChanges: [],
			indexStale: true,
			staleReason: repoResult.error,
			durationMs: Math.round(performance.now() - startTime),
		};
	}
	const repositoryId = repoResult.id;

	const db = getGlobalDatabase();

	// Check index freshness
	const lastIndexed = db.queryOne<{ last_indexed_at: string | null }>(
		"SELECT last_indexed_at FROM repositories WHERE id = ?",
		[repositoryId],
	);
	const indexStale = !lastIndexed?.last_indexed_at;

	// Process each target file
	interface TargetFileInfo {
		path: string;
		dependentCount: number;
		symbols: Array<{ name: string; kind: string; line: number }>;
	}
	const targetFiles: TargetFileInfo[] = [];
	const allImpactedFiles = new Set<string>();
	const allTestFiles = new Set<string>();

	for (const filePath of validatedParams.files) {
		// Resolve file ID
		const fileId = resolveFilePath(filePath, repositoryId);

		if (!fileId) {
			// File not indexed yet - add with zero dependents
			targetFiles.push({
				path: filePath,
				dependentCount: 0,
				symbols: [],
			});
			continue;
		}

		// Query dependents (depth 1 for performance)
		const dependents = queryDependents(fileId, 1, validatedParams.include_tests);
		
		// Add target file info
		const fileInfo: TargetFileInfo = {
			path: filePath,
			dependentCount: dependents.direct.length,
			symbols: [],
		};

		// Optionally include symbols
		if (validatedParams.include_symbols) {
			const symbols = db.query<{ name: string; kind: string; line_start: number }>(
				`SELECT name, kind, line_start 
				 FROM indexed_symbols 
				 WHERE file_id = ? 
				 ORDER BY line_start 
				 LIMIT 20`,
				[fileId],
			);
			fileInfo.symbols = symbols.map((s) => ({
				name: s.name,
				kind: s.kind,
				line: s.line_start,
			}));
		}

		targetFiles.push(fileInfo);

		// Collect impacted files (direct dependents only for speed)
		for (const dep of dependents.direct) {
			if (allImpactedFiles.size < validatedParams.max_impacted_files) {
				allImpactedFiles.add(dep);
			}
		}

		// Discover test files for this file
		if (validatedParams.include_tests) {
			const testPatterns = generateTestFilePatterns(filePath);
			for (const pattern of testPatterns) {
				const testFileId = resolveFilePath(pattern, repositoryId);
				if (testFileId) {
					allTestFiles.add(pattern);
				}
			}
		}
	}

	// Query recent changes (files modified in last 7 days based on indexed_at)
	const recentChanges = db.query<{ path: string; indexed_at: string }>(
		`SELECT path, indexed_at 
		 FROM indexed_files 
		 WHERE repository_id = ? 
		 AND indexed_at > datetime('now', '-7 days')
		 ORDER BY indexed_at DESC 
		 LIMIT 10`,
		[repositoryId],
	);

	const durationMs = Math.round(performance.now() - startTime);

	logger.debug("generate_task_context completed", {
		user_id: userId,
		files_requested: validatedParams.files.length,
		impacted_count: allImpactedFiles.size,
		test_count: allTestFiles.size,
		duration_ms: durationMs,
	});

	return {
		targetFiles,
		impactedFiles: Array.from(allImpactedFiles),
		testFiles: Array.from(allTestFiles),
		recentChanges: recentChanges.map((r) => ({
			path: r.path,
			indexedAt: r.indexed_at,
		})),
		indexStale,
		staleReason: indexStale ? "Repository has not been indexed" : undefined,
		durationMs,
	};
}

/**
 * Generate potential test file patterns for a source file
 */
function generateTestFilePatterns(sourcePath: string): string[] {
	const patterns: string[] = [];
	const withoutExt = sourcePath.replace(/\.(ts|tsx|js|jsx)$/, "");
	
	// Common test file naming conventions
	patterns.push(withoutExt + ".test.ts");
	patterns.push(withoutExt + ".spec.ts");
	patterns.push(withoutExt + ".test.tsx");
	patterns.push(withoutExt + ".spec.tsx");
	
	// Tests in __tests__ or tests directory
	const fileName = sourcePath.split("/").pop();
	if (fileName) {
		const fileNameWithoutExt = fileName.replace(/\.(ts|tsx|js|jsx)$/, "");
		const dirPath = sourcePath.substring(0, sourcePath.lastIndexOf("/"));
		patterns.push(dirPath + "/__tests__/" + fileNameWithoutExt + ".test.ts");
		patterns.push("tests/" + sourcePath.replace(/\.(ts|tsx)$/, ".test.ts"));
	}
	
	return patterns;
}

/**
 * Main tool call dispatcher
 */
export async function handleToolCall(
	toolName: string,
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	switch (toolName) {
		case "search_code":
			return await executeSearchCode(params, requestId, userId);
		case "index_repository":
			return await executeIndexRepository(params, requestId, userId);
		case "list_recent_files":
			return await executeListRecentFiles(params, requestId, userId);
		case "search_dependencies":
			return await executeSearchDependencies(params, requestId, userId);
		case "analyze_change_impact":
			return await executeAnalyzeChangeImpact(params, requestId, userId);
		case "validate_implementation_spec":
			return await executeValidateImplementationSpec(params, requestId, userId);
		case "kota_sync_export":
			return await executeSyncExport(params, requestId);
		case "kota_sync_import":
			return await executeSyncImport(params, requestId);
		case "generate_task_context":
			return await executeGenerateTaskContext(params, requestId, userId);
		default:
			throw invalidParams(requestId, "Unknown tool: " + toolName);
	}
}
