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
} from "@api/queries";
import { buildSnippet } from "@indexer/extractors";
import type { IndexRequest } from "@shared/index";
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
 * Get all available tool definitions
 */
export function getToolDefinitions(): ToolDefinition[] {
	return [SEARCH_CODE_TOOL, INDEX_REPOSITORY_TOOL, LIST_RECENT_FILES_TOOL];
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
	if (!isSearchParams(params)) {
		throw invalidParams(requestId, "Invalid parameters for search_code tool");
	}

	const results = await searchFiles(supabase, params.term, userId, {
		repositoryId: params.repository,
		limit: params.limit,
	});

	return {
		results: results.map((row) => ({
			projectRoot: row.projectRoot,
			path: row.path,
			snippet: buildSnippet(row.content, params.term),
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
	if (!isIndexParams(params)) {
		throw invalidParams(
			requestId,
			"Invalid parameters for index_repository tool",
		);
	}

	const indexRequest: IndexRequest = {
		repository: params.repository,
		ref: params.ref,
		localPath: params.localPath,
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
			console.error("Indexing workflow failed", error);
			updateIndexRunStatus(supabase, runId, "failed", error.message).catch(
				console.error,
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
		default:
			throw invalidParams(requestId, `Unknown tool: ${toolName}`);
	}
}
