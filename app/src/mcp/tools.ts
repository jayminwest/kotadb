/**
 * MCP tool definitions and execution adapters
 */

import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";
import {
	ensureRepository,
	listRecentFiles,
	recordIndexRun,
	runIndexingWorkflow,
	searchFiles,
	updateIndexRunStatus,
	resolveFilePath,
	queryDependents,
	queryDependencies,
	type DependencyResult,
} from "@api/queries";
import { buildSnippet } from "@indexer/extractors";
import type {
	IndexRequest,
	ChangeImpactRequest,
	ImplementationSpec,
} from "@shared/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidParams } from "./jsonrpc";
import { analyzeChangeImpact } from "./impact-analysis";
import { validateImplementationSpec } from "./spec-validation";

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
			project: {
				type: "string",
				description: "Optional: Filter results to a specific project (by name or UUID)",
			},
			repository: {
				type: "string",
				description: "Optional: Filter results to a specific repository ID",
			},
			limit: {
				type: "number",
				description:
					"Optional: Maximum number of results (default: 20, max: 100)",
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
		"Index a git repository by cloning/updating it and extracting code files. Returns a run ID to track progress.",
	inputSchema: {
		type: "object",
		properties: {
			repository: {
				type: "string",
				description:
					"Repository identifier (e.g., 'owner/repo' or full git URL)",
			},
			ref: {
				type: "string",
				description:
					"Optional: Git ref/branch to checkout (default: main/master)",
			},
			localPath: {
				type: "string",
				description:
					"Optional: Use a local directory instead of cloning from git",
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
				description:
					"Optional: Maximum number of files to return (default: 10)",
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
				description:
					"Relative file path within the repository (e.g., 'src/auth/context.ts')",
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
			repository: {
				type: "string",
				description:
					"Repository ID to search within. Required for multi-repository workspaces.",
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
	];
}

/**
 * Type guards for tool parameters
 */
function isSearchParams(
	params: unknown,
): params is { term: string; project?: string; repository?: string; limit?: number } {
	if (typeof params !== "object" || params === null) return false;
	const p = params as Record<string, unknown>;
	if (typeof p.term !== "string") return false;
	if (p.project !== undefined && typeof p.project !== "string")
		return false;
	if (p.repository !== undefined && typeof p.repository !== "string")
		return false;
	if (p.limit !== undefined && typeof p.limit !== "number") return false;
	return true;
}

function isIndexParams(
	params: unknown,
): params is { repository: string; ref?: string; localPath?: string } {
	if (typeof params !== "object" || params === null) return false;
	const p = params as Record<string, unknown>;
	if (typeof p.repository !== "string") return false;
	if (p.ref !== undefined && typeof p.ref !== "string") return false;
	if (p.localPath !== undefined && typeof p.localPath !== "string")
		return false;
	return true;
}

function isListRecentParams(
	params: unknown,
): params is { limit?: number } | undefined {
	if (params === undefined) return true;
	if (typeof params !== "object" || params === null) return false;
	const p = params as Record<string, unknown>;
	if (p.limit !== undefined && typeof p.limit !== "number") return false;
	return true;
}

/**
 * Execute search_code tool
 */
export async function executeSearchCode(
	supabase: SupabaseClient,
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
	if (p.project !== undefined && typeof p.project !== "string") {
		throw new Error("Parameter 'project' must be a string");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}
	if (p.limit !== undefined && typeof p.limit !== "number") {
		throw new Error("Parameter 'limit' must be a number");
	}

	const validatedParams = p as {
		term: string;
		project?: string;
		repository?: string;
		limit?: number;
	};

	// Resolve project to project ID if provided
	let projectId: string | undefined;
	if (validatedParams.project) {
		// Try to parse as UUID first
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (uuidRegex.test(validatedParams.project)) {
			// Direct UUID lookup
			const { data: project, error } = await supabase
				.from("projects")
				.select("id")
				.eq("id", validatedParams.project)
				.eq("user_id", userId)
				.maybeSingle();

			if (error) {
				logger.error("Failed to fetch project by UUID", {
					error: error.message,
					project: validatedParams.project,
					user_id: userId,
				});
				throw new Error(`Failed to fetch project: ${error.message}`);
			}

			if (!project) {
				throw new Error(`Project not found: ${validatedParams.project}`);
			}

			projectId = project.id;
		} else {
			// Lookup by name (case-insensitive)
			const { data: project, error } = await supabase
				.from("projects")
				.select("id")
				.eq("user_id", userId)
				.ilike("name", validatedParams.project)
				.maybeSingle();

			if (error) {
				logger.error("Failed to fetch project by name", {
					error: error.message,
					project: validatedParams.project,
					user_id: userId,
				});
				throw new Error(`Failed to fetch project: ${error.message}`);
			}

			if (!project) {
				throw new Error(`Project not found: ${validatedParams.project}`);
			}

			projectId = project.id;
		}
	}

	const results = await searchFiles(supabase, validatedParams.term, userId, {
		projectId,
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
	supabase: SupabaseClient,
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

	// Ensure repository exists in database
	const repositoryId = await ensureRepository(supabase, userId, indexRequest);
	const runId = await recordIndexRun(
		supabase,
		indexRequest,
		userId,
		repositoryId,
	);

	// Queue async indexing workflow
	queueMicrotask(() =>
		runIndexingWorkflow(
			supabase,
			indexRequest,
			runId,
			userId,
			repositoryId,
		).catch((error) => {
			logger.error("Indexing workflow failed", error instanceof Error ? error : new Error(String(error)), {
				run_id: runId,
				user_id: userId,
				repository_id: repositoryId,
			});
			Sentry.captureException(error, {
				tags: { run_id: runId, user_id: userId, repository_id: repositoryId },
			});
			updateIndexRunStatus(supabase, runId, "failed", error.message).catch(
				(err) => {
					logger.error("Failed to update index run status", err instanceof Error ? err : new Error(String(err)), {
						run_id: runId,
					});
					Sentry.captureException(err, {
						tags: { run_id: runId },
					});
				},
			);
		}),
	);

	return {
		runId,
		status: "pending",
		message: "Indexing queued successfully",
	};
}

/**
 * Execute list_recent_files tool
 */
export async function executeListRecentFiles(
	supabase: SupabaseClient,
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	if (!isListRecentParams(params)) {
		throw invalidParams(
			requestId,
			"Invalid parameters for list_recent_files tool",
		);
	}

	const limit =
		params && typeof params === "object" && "limit" in params
			? (params.limit as number)
			: 10;
	const files = await listRecentFiles(supabase, limit, userId);

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
	supabase: SupabaseClient,
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
		throw new Error(
			"Parameter 'direction' must be one of: dependents, dependencies, both",
		);
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

	const validatedParams = {
		file_path: p.file_path as string,
		direction: (p.direction as string | undefined) ?? "both",
		depth: (p.depth as number | undefined) ?? 1,
		include_tests: (p.include_tests as boolean | undefined) ?? true,
		repository: p.repository as string | undefined,
	};

	// Resolve repository ID (use first repository if not specified)
	let repositoryId: string;
	if (validatedParams.repository) {
		repositoryId = validatedParams.repository;
	} else {
		const { data: repos } = await supabase
			.from("repositories")
			.select("id")
			.eq("user_id", userId)
			.limit(1)
			.single();

		if (!repos) {
			return {
				file_path: validatedParams.file_path,
				message:
					"No repositories found. Please index a repository first using index_repository tool.",
				dependents: { direct: [], indirect: {}, cycles: [] },
				dependencies: { direct: [], indirect: {}, cycles: [] },
			};
		}

		repositoryId = repos.id;
	}

	// Resolve file path to file ID
	const fileId = await resolveFilePath(
		supabase,
		validatedParams.file_path,
		repositoryId,
		userId,
	);

	if (!fileId) {
		return {
			file_path: validatedParams.file_path,
			message: `File not found: ${validatedParams.file_path}. Make sure the repository is indexed.`,
			dependents: { direct: [], indirect: {}, cycles: [] },
			dependencies: { direct: [], indirect: {}, cycles: [] },
		};
	}

	// Query dependents and/or dependencies based on direction
	let dependents: DependencyResult | null = null;
	let dependencies: DependencyResult | null = null;

	if (
		validatedParams.direction === "dependents" ||
		validatedParams.direction === "both"
	) {
		dependents = await queryDependents(
			supabase,
			fileId,
			validatedParams.depth,
			validatedParams.include_tests,
			userId,
		);
	}

	if (
		validatedParams.direction === "dependencies" ||
		validatedParams.direction === "both"
	) {
		dependencies = await queryDependencies(
			supabase,
			fileId,
			validatedParams.depth,
			userId,
		);
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
				Object.values(dependents.indirect).reduce(
					(sum, arr) => sum + arr.length,
					0,
				),
		};
	}

	if (dependencies) {
		result.dependencies = {
			direct: dependencies.direct,
			indirect: dependencies.indirect,
			cycles: dependencies.cycles,
			count:
				dependencies.direct.length +
				Object.values(dependencies.indirect).reduce(
					(sum, arr) => sum + arr.length,
					0,
				),
		};
	}

	return result;
}

/**
 * Execute analyze_change_impact tool
 */
export async function executeAnalyzeChangeImpact(
	supabase: SupabaseClient,
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
		throw new Error(
			"Parameter 'change_type' must be one of: feature, refactor, fix, chore",
		);
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
	if (
		p.breaking_changes !== undefined &&
		typeof p.breaking_changes !== "boolean"
	) {
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

	const result = await analyzeChangeImpact(
		supabase,
		validatedParams,
		userId,
	);

	return result;
}

/**
 * Execute validate_implementation_spec tool
 */
export async function executeValidateImplementationSpec(
	supabase: SupabaseClient,
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
	if (
		p.dependencies_to_add !== undefined &&
		!Array.isArray(p.dependencies_to_add)
	) {
		throw new Error("Parameter 'dependencies_to_add' must be an array");
	}
	if (
		p.breaking_changes !== undefined &&
		typeof p.breaking_changes !== "boolean"
	) {
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

	const result = await validateImplementationSpec(
		supabase,
		validatedParams,
		userId,
	);

	return result;
}

/**
 * Main tool call dispatcher
 */
export async function handleToolCall(
	supabase: SupabaseClient,
	toolName: string,
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	switch (toolName) {
		case "search_code":
			return await executeSearchCode(supabase, params, requestId, userId);
		case "index_repository":
			return await executeIndexRepository(supabase, params, requestId, userId);
		case "list_recent_files":
			return await executeListRecentFiles(supabase, params, requestId, userId);
		case "search_dependencies":
			return await executeSearchDependencies(
				supabase,
				params,
				requestId,
				userId,
			);
		case "analyze_change_impact":
			return await executeAnalyzeChangeImpact(
				supabase,
				params,
				requestId,
				userId,
			);
		case "validate_implementation_spec":
			return await executeValidateImplementationSpec(
				supabase,
				params,
				requestId,
				userId,
			);
		default:
			throw invalidParams(requestId, `Unknown tool: ${toolName}`);
	}
}
