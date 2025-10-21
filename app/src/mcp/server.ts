/**
 * MCP Server implementation using @modelcontextprotocol/sdk
 *
 * This module initializes the MCP server with StreamableHTTPServerTransport
 * and registers all available tools. Uses enableJsonResponse: true for
 * simple HTTP transport (no SSE streaming, no npx wrapper needed).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
	INDEX_REPOSITORY_TOOL,
	LIST_RECENT_FILES_TOOL,
	SEARCH_CODE_TOOL,
	SEARCH_DEPENDENCIES_TOOL,
	executeIndexRepository,
	executeListRecentFiles,
	executeSearchCode,
	executeSearchDependencies,
} from "./tools";

/**
 * MCP Server context passed to tool handlers via closure
 */
export interface McpServerContext {
	supabase: SupabaseClient;
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
			],
		};
	});

	// Register tools/call handler
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: toolArgs } = request.params;

		let result: unknown;

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
			default:
				throw new Error(`Unknown tool: ${name}`);
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
