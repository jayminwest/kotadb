/**
 * MCP tool definitions and execution adapters
 */

import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import type { IndexRequest } from "@shared/index";
import { buildSnippet } from "@indexer/extractors";
import { discoverSources, parseSourceFile } from "@indexer/parsers";
import { prepareRepository } from "@indexer/repos";
import {
	listRecentFiles,
	recordIndexRun,
	saveIndexedFiles,
	searchFiles,
	updateIndexRunStatus,
} from "@api/queries";
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
			project: {
				type: "string",
				description:
					"Optional: Filter results to a specific project root path",
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
				description: "Optional: Git ref/branch to checkout (default: main/master)",
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
				description: "Optional: Maximum number of files to return (default: 10)",
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
): params is { term: string; project?: string; limit?: number } {
	if (typeof params !== "object" || params === null) return false;
	const p = params as Record<string, unknown>;
	if (typeof p.term !== "string") return false;
	if (p.project !== undefined && typeof p.project !== "string") return false;
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
export function executeSearchCode(db: Database, params: unknown): unknown {
	if (!isSearchParams(params)) {
		throw invalidParams(0, "Invalid parameters for search_code tool");
	}

	const results = searchFiles(db, params.term, {
		projectRoot: params.project,
		limit: params.limit,
	}).map((row) => ({
		projectRoot: row.projectRoot,
		path: row.path,
		snippet: buildSnippet(row.content, params.term),
		dependencies: row.dependencies,
		indexedAt: row.indexedAt.toISOString(),
	}));

	return { results };
}

/**
 * Execute index_repository tool
 */
export function executeIndexRepository(db: Database, params: unknown): unknown {
	if (!isIndexParams(params)) {
		throw invalidParams(0, "Invalid parameters for index_repository tool");
	}

	const indexRequest: IndexRequest = {
		repository: params.repository,
		ref: params.ref,
		localPath: params.localPath,
	};

	const runId = recordIndexRun(db, indexRequest);

	// Queue async indexing workflow
	queueMicrotask(() =>
		runIndexingWorkflow(db, indexRequest, runId).catch((error) => {
			console.error("Indexing workflow failed", error);
			updateIndexRunStatus(db, runId, "failed");
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
export function executeListRecentFiles(
	db: Database,
	params: unknown,
): unknown {
	if (!isListRecentParams(params)) {
		throw invalidParams(0, "Invalid parameters for list_recent_files tool");
	}

	const limit =
		params && typeof params === "object" && "limit" in params
			? (params.limit as number)
			: 10;
	const files = listRecentFiles(db, limit);

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
 * Async indexing workflow (reused from routes.ts)
 */
async function runIndexingWorkflow(
	db: Database,
	request: IndexRequest,
	runId: number,
): Promise<void> {
	const repo = await prepareRepository(request);

	if (!existsSync(repo.localPath)) {
		console.warn(`Indexing skipped: path ${repo.localPath} does not exist.`);
		updateIndexRunStatus(db, runId, "skipped");
		return;
	}

	const sources = await discoverSources(repo.localPath);
	const records = (
		await Promise.all(
			sources.map((source) => parseSourceFile(source, repo.localPath)),
		)
	).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	saveIndexedFiles(db, records);
	updateIndexRunStatus(db, runId, "completed");
}

/**
 * Main tool call dispatcher
 */
export function handleToolCall(
	db: Database,
	toolName: string,
	params: unknown,
): unknown {
	switch (toolName) {
		case "search_code":
			return executeSearchCode(db, params);
		case "index_repository":
			return executeIndexRepository(db, params);
		case "list_recent_files":
			return executeListRecentFiles(db, params);
		default:
			throw invalidParams(0, `Unknown tool: ${toolName}`);
	}
}
