/**
 * Validation tools for ADW MCP server
 */

import { spawn } from "child_process";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type {
  BunValidateArgs,
  BunValidateMigrationsArgs,
  ValidationResult,
  MigrationDriftResult,
} from "../types.js";
import { getAutomationDir } from "../utils/paths.js";

/**
 * Tool definition: Bun validate
 */
export const BUN_VALIDATE_TOOL: Tool = {
  name: "bun_validate",
  description: "Run bun validation commands (lint + typecheck)",
  inputSchema: {
    type: "object",
    properties: {
      cwd: {
        type: "string",
        description: "Optional working directory (default: project root)",
      },
    },
  },
};

/**
 * Tool definition: Bun validate migrations
 */
export const BUN_VALIDATE_MIGRATIONS_TOOL: Tool = {
  name: "bun_validate_migrations",
  description: "Detect migration drift between source and Supabase directories",
  inputSchema: {
    type: "object",
    properties: {
      adw_id: {
        type: "string",
        description: "The ADW workflow identifier",
      },
      cwd: {
        type: "string",
        description: "Optional working directory (default: app/)",
      },
    },
    required: ["adw_id"],
  },
};

/**
 * Execute Python bridge command and parse JSON result
 */
async function executePythonBridge(
  command: string,
  args: string[]
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const process = spawn("python3", [
      "-m",
      "adws.adw_modules.mcp_bridge",
      command,
      ...args,
    ], {
      cwd: getAutomationDir(),
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Bridge command failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse bridge output: ${stdout}`));
      }
    });
  });
}

/**
 * Execute bun_validate tool
 */
export async function executeBunValidate(args: unknown): Promise<ValidationResult> {
  if (!isBunValidateArgs(args)) {
    throw new Error("Invalid arguments for bun_validate");
  }

  const bridgeArgs = args.cwd ? [args.cwd] : [];
  const result = await executePythonBridge("validate", bridgeArgs);
  return result as ValidationResult;
}

/**
 * Execute bun_validate_migrations tool
 */
export async function executeBunValidateMigrations(
  args: unknown
): Promise<MigrationDriftResult> {
  if (!isBunValidateMigrationsArgs(args)) {
    throw new Error("Invalid arguments for bun_validate_migrations");
  }

  const bridgeArgs = [args.adw_id];
  if (args.cwd) {
    bridgeArgs.push(args.cwd);
  }

  const result = await executePythonBridge("validate_migrations", bridgeArgs);
  return result as MigrationDriftResult;
}

/**
 * Type guards
 */
function isBunValidateArgs(args: unknown): args is BunValidateArgs {
  if (typeof args !== "object" || args === null) {
    return true; // Empty args object is valid
  }

  const typed = args as BunValidateArgs;

  if ("cwd" in typed && typeof typed.cwd !== "string") {
    return false;
  }

  return true;
}

function isBunValidateMigrationsArgs(
  args: unknown
): args is BunValidateMigrationsArgs {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const typed = args as BunValidateMigrationsArgs;

  if (!("adw_id" in typed) || typeof typed.adw_id !== "string") {
    return false;
  }

  if ("cwd" in typed && typeof typed.cwd !== "string") {
    return false;
  }

  return true;
}
