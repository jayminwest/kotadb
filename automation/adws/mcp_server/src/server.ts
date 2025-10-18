/**
 * ADW MCP Server implementation using @modelcontextprotocol/sdk
 *
 * This server exposes ADW orchestration primitives as MCP tools for agent access.
 * Complements the code search MCP server (app/src/mcp/) for workflow automation.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Workflow tools
import {
  ADW_GET_STATE_TOOL,
  ADW_LIST_WORKFLOWS_TOOL,
  ADW_RUN_PHASE_TOOL,
  executeGetState,
  executeListWorkflows,
  executeRunPhase,
} from "./tools/workflow.js";

// Git tools
import {
  GIT_COMMIT_TOOL,
  GIT_CREATE_WORKTREE_TOOL,
  GIT_CLEANUP_WORKTREE_TOOL,
  executeGitCommit,
  executeCreateWorktree,
  executeCleanupWorktree,
} from "./tools/git.js";

// Validation tools
import {
  BUN_VALIDATE_TOOL,
  BUN_VALIDATE_MIGRATIONS_TOOL,
  executeBunValidate,
  executeBunValidateMigrations,
} from "./tools/validation.js";

/**
 * Create and configure ADW MCP server instance with tool registrations
 */
export function createAdwMcpServer(): Server {
  const server = new Server(
    {
      name: "kotadb-adw",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Workflow orchestration
        ADW_GET_STATE_TOOL,
        ADW_LIST_WORKFLOWS_TOOL,
        ADW_RUN_PHASE_TOOL,
        // Git operations
        GIT_COMMIT_TOOL,
        GIT_CREATE_WORKTREE_TOOL,
        GIT_CLEANUP_WORKTREE_TOOL,
        // Validation
        BUN_VALIDATE_TOOL,
        BUN_VALIDATE_MIGRATIONS_TOOL,
        // TODO: Implement adw_execute_command tool in follow-up PR
        // Requirements:
        // - Parse slash command syntax (e.g., "/classify_issue 145")
        // - Load ADW context if adw_id provided
        // - Execute command with proper permissions
        // - Return structured result with stdout/stderr
        // See: docs/specs/feature-145-adw-mcp-server-orchestration.md:262-263
      ],
    };
  });

  // Register tools/call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params;

    let result: unknown;

    switch (name) {
      // Workflow tools
      case "adw_get_state":
        result = await executeGetState(toolArgs);
        break;
      case "adw_list_workflows":
        result = await executeListWorkflows(toolArgs);
        break;
      case "adw_run_phase":
        result = await executeRunPhase(toolArgs);
        break;

      // Git tools
      case "git_commit":
        result = await executeGitCommit(toolArgs);
        break;
      case "git_create_worktree":
        result = await executeCreateWorktree(toolArgs);
        break;
      case "git_cleanup_worktree":
        result = await executeCleanupWorktree(toolArgs);
        break;

      // Validation tools
      case "bun_validate":
        result = await executeBunValidate(toolArgs);
        break;
      case "bun_validate_migrations":
        result = await executeBunValidateMigrations(toolArgs);
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
export function createAdwMcpTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
    enableJsonResponse: true, // JSON mode (not SSE)
  });
}
