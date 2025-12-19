/**
 * MCP Server implementation using @modelcontextprotocol/sdk
 *
 * This module initializes the MCP server with StreamableHTTPServerTransport
 * and registers all available tools. Uses enableJsonResponse: true for
 * simple HTTP transport (no SSE streaming, no npx wrapper needed).
 */

import { createLogger } from "@logging/logger.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Sentry } from "../instrument.js";
import {
	ADD_REPOSITORY_TO_PROJECT_TOOL,
	ANALYZE_CHANGE_IMPACT_TOOL,
	CREATE_PROJECT_TOOL,
	DELETE_PROJECT_TOOL,
	GET_INDEX_JOB_STATUS_TOOL,
	GET_PROJECT_TOOL,
	INDEX_REPOSITORY_TOOL,
	LIST_PROJECTS_TOOL,
	LIST_RECENT_FILES_TOOL,
	REMOVE_REPOSITORY_FROM_PROJECT_TOOL,
	SEARCH_CODE_TOOL,
	SEARCH_DEPENDENCIES_TOOL,
	SYNC_EXPORT_TOOL,
	SYNC_IMPORT_TOOL,
	UPDATE_PROJECT_TOOL,
	VALIDATE_IMPLEMENTATION_SPEC_TOOL,
	executeAddRepositoryToProject,
	executeAnalyzeChangeImpact,
	executeCreateProject,
	executeDeleteProject,
	executeGetIndexJobStatus,
	executeGetProject,
	executeIndexRepository,
	executeListProjects,
	executeListRecentFiles,
	executeRemoveRepositoryFromProject,
	executeSearchCode,
	executeSearchDependencies,
	executeSyncExport,
	executeSyncImport,
	executeUpdateProject,
	executeValidateImplementationSpec,
} from "./tools";

const logger = createLogger({ module: "mcp-server" });


/**
 * MCP Server context passed to tool handlers via closure
 * 
 * In local mode, supabase will be null as queries use SQLite directly
 */
export interface McpServerContext {
	supabase: SupabaseClient | null;
	userId: string;
}

/**
 * Create and configure MCP server instance with tool registrations
 */
export function createMcpServer(context: McpServerContext): Server {
	const server = new Server(
		{
			name: "kotadb",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	// Register tools/list handler
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: [
				SEARCH_CODE_TOOL,
				INDEX_REPOSITORY_TOOL,
				LIST_RECENT_FILES_TOOL,
				SEARCH_DEPENDENCIES_TOOL,
				ANALYZE_CHANGE_IMPACT_TOOL,
				VALIDATE_IMPLEMENTATION_SPEC_TOOL,
				CREATE_PROJECT_TOOL,
				LIST_PROJECTS_TOOL,
				GET_PROJECT_TOOL,
				UPDATE_PROJECT_TOOL,
				DELETE_PROJECT_TOOL,
				ADD_REPOSITORY_TO_PROJECT_TOOL,
				REMOVE_REPOSITORY_FROM_PROJECT_TOOL,
				GET_INDEX_JOB_STATUS_TOOL,
				SYNC_EXPORT_TOOL,
				SYNC_IMPORT_TOOL,
			],
		};
	});

	// Register tools/call handler
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: toolArgs } = request.params;

		logger.info("MCP tool call received", { tool_name: name, user_id: context.userId });

		let result: unknown;

		try {
			switch (name) {
				case "search_code":
					result = await executeSearchCode(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "index_repository":
					result = await executeIndexRepository(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "list_recent_files":
					result = await executeListRecentFiles(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "search_dependencies":
					result = await executeSearchDependencies(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "analyze_change_impact":
					result = await executeAnalyzeChangeImpact(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "validate_implementation_spec":
					result = await executeValidateImplementationSpec(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "create_project":
					result = await executeCreateProject(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "list_projects":
					result = await executeListProjects(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "get_project":
					result = await executeGetProject(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "update_project":
					result = await executeUpdateProject(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "delete_project":
					result = await executeDeleteProject(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "add_repository_to_project":
					result = await executeAddRepositoryToProject(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "remove_repository_from_project":
					result = await executeRemoveRepositoryFromProject(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "get_index_job_status":
					result = await executeGetIndexJobStatus(
						context.supabase,
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "kota_sync_export":
					result = await executeSyncExport(toolArgs, "");
					break;
				case "kota_sync_import":
					result = await executeSyncImport(toolArgs, "");
					break;
				default:
					const error = new Error(`Unknown tool: ${name}`);
					logger.error("Unknown MCP tool requested", error, {
						tool_name: name,
						user_id: context.userId,
					});
					Sentry.captureException(error, {
						tags: { tool_name: name, user_id: context.userId },
					});
					throw error;
			}

			logger.debug("MCP tool call succeeded", { tool_name: name, user_id: context.userId });
		} catch (error) {
			logger.error(
				"MCP tool call failed",
				error instanceof Error ? error : new Error(String(error)),
				{
					tool_name: name,
					user_id: context.userId,
				},
			);
			Sentry.captureException(error, {
				tags: { tool_name: name, user_id: context.userId },
			});
			throw error;
		}

		// SDK expects content blocks in response
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(result, null, 2),
				},
			],
		};
	});

	return server;
}

/**
 * Create StreamableHTTPServerTransport with JSON response mode
 *
 * Key configuration:
 * - sessionIdGenerator: undefined (stateless mode, no session management)
 * - enableJsonResponse: true (pure JSON-RPC, not SSE streaming)
 *
 * This allows clients to connect with simple HTTP config without npx wrapper.
 */
export function createMcpTransport(): StreamableHTTPServerTransport {
	return new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined, // Stateless mode
		enableJsonResponse: true, // JSON mode (not SSE)
	});
}
