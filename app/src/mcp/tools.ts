/**
 * MCP tool definitions and execution adapters
 */

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
import type { IndexRequest } from "@shared/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidParams } from "./jsonrpc";

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
 * Get all available tool definitions
 */
export function getToolDefinitions(): ToolDefinition[] {
	return [
		SEARCH_CODE_TOOL,
		INDEX_REPOSITORY_TOOL,
		LIST_RECENT_FILES_TOOL,
		SEARCH_DEPENDENCIES_TOOL,
	];
}

/**
 * Type guards for tool parameters
 */
function isSearchParams(
	params: unknown,
): params is { term: string; repository?: string; limit?: number } {
	if (typeof params !== "object" || params === null) return false;
	const p = params as Record<string, unknown>;
	if (typeof p.term !== "string") return false;
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

	const results = await searchFiles(supabase, validatedParams.term, userId, {
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
			process.stderr.write(`Indexing workflow failed: ${JSON.stringify(error)}\n`);
			updateIndexRunStatus(supabase, runId, "failed", error.message).catch(
				(err) => process.stderr.write(`Failed to update index run status: ${JSON.stringify(err)}\n`),
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
		default:
			throw invalidParams(requestId, `Unknown tool: ${toolName}`);
	}
}
