/**
 * MCP Server implementation using @modelcontextprotocol/sdk
 *
 * This module initializes the MCP server with StreamableHTTPServerTransport
 * and registers all available tools. Uses enableJsonResponse: true for
 * simple HTTP transport (no SSE streaming, no npx wrapper needed).
 *
 * Local-only v2.0.0: Simplified for SQLite-only operation
 */

import { createLogger } from "@logging/logger.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Sentry } from "../instrument.js";
import {
	ANALYZE_CHANGE_IMPACT_TOOL,
	INDEX_REPOSITORY_TOOL,
	LIST_RECENT_FILES_TOOL,
	SEARCH_CODE_TOOL,
	SEARCH_DEPENDENCIES_TOOL,
	SYNC_EXPORT_TOOL,
	SYNC_IMPORT_TOOL,
	VALIDATE_IMPLEMENTATION_SPEC_TOOL,
	executeAnalyzeChangeImpact,
	executeIndexRepository,
	executeListRecentFiles,
	executeSearchCode,
	executeSearchDependencies,
	executeSyncExport,
	executeSyncImport,
	executeValidateImplementationSpec,
} from "./tools";

const logger = createLogger({ module: "mcp-server" });

/**
 * MCP Server context passed to tool handlers via closure
 *
 * Local-only: No Supabase, uses SQLite directly via @api/queries
 */
export interface McpServerContext {
	userId: string;
}

/**
 * Create and configure MCP server instance with tool registrations
 *
 * Local-only tools available:
 * - search_code: Search indexed code files
 * - index_repository: Index a local repository
 * - list_recent_files: List recently indexed files
 * - search_dependencies: Query dependency graph
 * - analyze_change_impact: Analyze impact of changes
 * - validate_implementation_spec: Validate implementation specs
 * - kota_sync_export: Export SQLite to JSONL
 * - kota_sync_import: Import JSONL to SQLite
 */
export function createMcpServer(context: McpServerContext): Server {
	const server = new Server(
		{
			name: "kotadb",
			version: "2.0.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	// Register tools/list handler - local-only tools
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: [
				SEARCH_CODE_TOOL,
				INDEX_REPOSITORY_TOOL,
				LIST_RECENT_FILES_TOOL,
				SEARCH_DEPENDENCIES_TOOL,
				ANALYZE_CHANGE_IMPACT_TOOL,
				VALIDATE_IMPLEMENTATION_SPEC_TOOL,
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
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "index_repository":
					result = await executeIndexRepository(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "list_recent_files":
					result = await executeListRecentFiles(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "search_dependencies":
					result = await executeSearchDependencies(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "analyze_change_impact":
					result = await executeAnalyzeChangeImpact(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "validate_implementation_spec":
					result = await executeValidateImplementationSpec(
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
