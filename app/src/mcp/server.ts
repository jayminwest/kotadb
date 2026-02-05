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
	GENERATE_TASK_CONTEXT_TOOL,
	GET_INDEX_STATISTICS_TOOL,
	INDEX_REPOSITORY_TOOL,
	LIST_RECENT_FILES_TOOL,
	SEARCH_TOOL,
	SEARCH_DEPENDENCIES_TOOL,
	SYNC_EXPORT_TOOL,
	SYNC_IMPORT_TOOL,
	VALIDATE_IMPLEMENTATION_SPEC_TOOL,
	// Memory Layer tools
	RECORD_DECISION_TOOL,
	RECORD_FAILURE_TOOL,
	RECORD_INSIGHT_TOOL,
	// Dynamic Expertise tools
	GET_DOMAIN_KEY_FILES_TOOL,
	VALIDATE_EXPERTISE_TOOL,
	SYNC_EXPERTISE_TOOL,
	GET_RECENT_PATTERNS_TOOL,
	// Execute functions
	executeAnalyzeChangeImpact,
	executeGenerateTaskContext,
	executeGetIndexStatistics,
	executeIndexRepository,
	executeListRecentFiles,
	executeSearch,
	executeSearchDependencies,
	executeSyncExport,
	executeSyncImport,
	executeValidateImplementationSpec,
	// Memory Layer execute functions
	executeRecordDecision,
	executeRecordFailure,
	executeRecordInsight,
	// Dynamic Expertise execute functions
	executeGetDomainKeyFiles,
	executeValidateExpertise,
	executeSyncExpertise,
	executeGetRecentPatterns,
	// Tool filtering
	filterToolsByTier,
} from "./tools";

const logger = createLogger({ module: "mcp-server" });

/**
 * Valid toolset tiers for MCP tool selection
 * - default: 8 tools (core + sync)
 * - core: 6 tools
 * - memory: 14 tools (core + sync + memory)
 * - full: 20 tools (all)
 */
export type ToolsetTier = "default" | "core" | "memory" | "full";

/**
 * MCP Server context passed to tool handlers via closure
 *
 * Local-only: No Supabase, uses SQLite directly via @api/queries
 */
export interface McpServerContext {
	userId: string;
	toolset?: ToolsetTier;
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
 * - generate_task_context: Generate context for hook-based seeding
 * - search_decisions: Search past architectural decisions
 * - record_decision: Record a new architectural decision
 * - search_failures: Search failed approaches
 * - record_failure: Record a failed approach
 * - search_patterns: Find codebase patterns
 * - record_insight: Store a session insight
 * - get_domain_key_files: Get most-depended-on files for a domain
 * - validate_expertise: Validate expertise.yaml patterns against indexed code
 * - sync_expertise: Sync patterns from expertise.yaml to patterns table
 * - get_recent_patterns: Get recently observed patterns
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

	// Register tools/list handler - filter by toolset tier
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		const tier = context.toolset || "default";
		const filteredTools = filterToolsByTier(tier);
		
		logger.debug("Listing MCP tools", { 
			tier, 
			tool_count: filteredTools.length 
		});
		
		return {
			tools: filteredTools,
		};
	});
	// Register tools/call handler
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: toolArgs } = request.params;

		logger.info("MCP tool call received", { tool_name: name, user_id: context.userId });

		let result: unknown;

		try {
			switch (name) {
				case "search":
					result = await executeSearch(
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
				case "generate_task_context":
					result = await executeGenerateTaskContext(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				// Memory Layer tools
				case "record_decision":
					result = await executeRecordDecision(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "record_failure":
					result = await executeRecordFailure(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "record_insight":
					result = await executeRecordInsight(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				// Dynamic Expertise tools
				case "get_domain_key_files":
					result = await executeGetDomainKeyFiles(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "validate_expertise":
					result = await executeValidateExpertise(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "sync_expertise":
					result = await executeSyncExpertise(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "get_recent_patterns":
					result = await executeGetRecentPatterns(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
					break;
				case "get_index_statistics":
					result = await executeGetIndexStatistics(
						toolArgs,
						"", // requestId not used
						context.userId,
					);
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
