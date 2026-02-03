#!/usr/bin/env bun
/**
 * KotaDB CLI Entry Point
 *
 * Provides command-line interface for running the KotaDB MCP server.
 * Designed for use with `npx kotadb` or `bunx kotadb`.
 *
 * Usage:
 *   kotadb              Start the MCP server (default port 3000)
 *   kotadb --stdio      Start in stdio mode (for Claude Code integration)
 *   kotadb --port 4000  Start on custom port
 *   kotadb --version    Show version
 *   kotadb --help       Show help
 *   kotadb deps         Query dependency information for a file
 */

import { createExpressApp } from "@api/routes";
import { getEnvironmentConfig } from "@config/environment";
import { createLogger } from "@logging/logger";
import { createMcpServer, type McpServerContext } from "@mcp/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CliOptions {
  port: number;
  help: boolean;
  version: boolean;
  stdio: boolean;
}

function getVersion(): string {
  try {
    const packageJsonPath = join(__dirname, "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version || "unknown";
  } catch {
    return "unknown";
  }
}

function printHelp(): void {
  const version = getVersion();
  process.stdout.write(`
kotadb v${version} - Local code intelligence for CLI agents

USAGE:
  kotadb [OPTIONS]
  kotadb deps [OPTIONS]

COMMANDS:
  deps              Query dependency information for a file
                    Options:
                      --file, -f <path>     Target file to analyze (required)
                      --format json|text    Output format (default: text)
                      --depth, -d <n>       Dependency traversal depth 1-5 (default: 1)
                      --include-tests       Include test files in output
                      --repository, -r <id> Repository ID or full_name

OPTIONS:
  --stdio           Use stdio transport (for Claude Code integration)
  --port <number>   Port to listen on (default: 3000, env: PORT)
  --version, -v     Show version number
  --help, -h        Show this help message

ENVIRONMENT VARIABLES:
  PORT              Server port (default: 3000, HTTP mode only)
  KOTA_DB_PATH      SQLite database path (default: ~/.kotadb/kotadb.sqlite)
  KOTA_ALLOWED_ORIGINS  Comma-separated allowed CORS origins
  LOG_LEVEL         Logging level: debug, info, warn, error (default: info)

EXAMPLES:
  kotadb --stdio                              Start in stdio mode (for Claude Code)
  kotadb                                      Start HTTP server on port 3000
  kotadb --port 4000                          Start HTTP server on port 4000
  kotadb deps --file src/db/client.ts         Query deps for a file (text)
  kotadb deps --file src/db/client.ts --format json   Query deps (JSON)
  kotadb deps -f src/api/routes.ts -d 2       Query deps with depth 2

MCP CONFIGURATION (stdio mode - RECOMMENDED):
  Add to your .mcp.json or Claude Code settings:

  {
    "mcpServers": {
      "kotadb": {
        "command": "bunx",
        "args": ["kotadb@next", "--stdio"]
      }
    }
  }

MCP CONFIGURATION (HTTP mode - legacy):
  Add to your .mcp.json or Claude Code settings:

  {
    "mcpServers": {
      "kotadb": {
        "type": "http",
        "url": "http://localhost:3000/mcp",
        "headers": {
          "Accept": "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-06-18"
        }
      }
    }
  }

DOCUMENTATION:
  https://github.com/jayminwest/kotadb

`);
}

function printVersion(): void {
  const version = getVersion();
  process.stdout.write(`kotadb v${version}\n`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    port: Number(process.env.PORT ?? 3000),
    help: false,
    version: false,
    stdio: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--stdio") {
      options.stdio = true;
    } else if (arg === "--port") {
      const portStr = args[++i];
      if (!portStr || Number.isNaN(Number(portStr))) {
        process.stderr.write("Error: --port requires a valid number\n");
        process.exit(1);
      }
      options.port = Number(portStr);
    } else if (arg.startsWith("--port=")) {
      const portStr = arg.split("=")[1];
      if (portStr === undefined || Number.isNaN(Number(portStr))) {
        process.stderr.write("Error: --port requires a valid number\n");
        process.exit(1);
      }
      options.port = Number(portStr);
    } else if (arg.startsWith("-") && arg !== "-") {
      process.stderr.write(`Unknown option: ${arg}\n`);
      process.stderr.write("Use --help for usage information\n");
      process.exit(1);
    }
  }

  return options;
}

async function runStdioMode(): Promise<void> {
  // Redirect logger to stderr in stdio mode
  // This is CRITICAL - stdout is reserved for JSON-RPC protocol
  const logger = createLogger({
    module: "mcp-stdio",
    forceStderr: true,
  });

  logger.info("KotaDB MCP server starting in stdio mode", {
    version: getVersion(),
  });

  // Create MCP server with local-only context
  const context: McpServerContext = {
    userId: "local", // Local-only mode uses fixed user ID
  };
  const server = createMcpServer(context);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  logger.info("KotaDB MCP server connected via stdio");

  // Server lifecycle is managed by the transport
  // Process will stay alive until stdin closes (when Claude Code terminates it)
}

async function main(): Promise<void> {
  // Parse command line arguments (skip first two: bun/node and script path)
  const args = process.argv.slice(2);

  // Check for subcommands first
  const firstArg = args[0];
  if (firstArg === "deps") {
    // Handle deps subcommand
    const { runDepsCommand } = await import("./cli/deps.js");
    runDepsCommand(args.slice(1));
    return;
  }

  const options = parseArgs(args);

  // Handle --version
  if (options.version) {
    printVersion();
    process.exit(0);
  }

  // Handle --help
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Handle stdio mode
  if (options.stdio) {
    await runStdioMode();
    return; // runStdioMode() keeps process alive
  }

  // Start server in HTTP mode
  const logger = createLogger();
  const envConfig = getEnvironmentConfig();

  logger.info("KotaDB starting", {
    version: getVersion(),
    mode: envConfig.mode,
    port: options.port,
    localDbPath: envConfig.localDbPath,
  });

  const app = createExpressApp();

  const server = app.listen(options.port, () => {
    logger.info("KotaDB server started", {
      port: options.port,
      mcp_endpoint: `http://localhost:${options.port}/mcp`,
      health_endpoint: `http://localhost:${options.port}/health`,
    });

    // Print user-friendly startup message
    process.stdout.write(`\n`);
    process.stdout.write(`KotaDB v${getVersion()} running\n`);
    process.stdout.write(`\n`);
    process.stdout.write(`  MCP Endpoint:    http://localhost:${options.port}/mcp\n`);
    process.stdout.write(`  Health Check:    http://localhost:${options.port}/health\n`);
    process.stdout.write(`  Database:        ${envConfig.localDbPath}\n`);
    process.stdout.write(`\n`);
    process.stdout.write(`Press Ctrl+C to stop\n`);
    process.stdout.write(`\n`);
  });

  // Graceful shutdown handlers
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Global error handlers
  process.on("unhandledRejection", (reason: unknown) => {
    logger.error("Unhandled promise rejection", reason instanceof Error ? reason : undefined);
  });

  process.on("uncaughtException", (error: Error) => {
    logger.error("Uncaught exception", error);
    process.exit(1);
  });
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error.message}\n`);
  process.exit(1);
});
