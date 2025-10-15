/**
 * Git operation tools for ADW MCP server
 */

import { spawn } from "child_process";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type {
  GitCommitArgs,
  GitCreateWorktreeArgs,
  GitCleanupWorktreeArgs,
  GitCommitResult,
  ToolResult,
} from "../types.js";
import { getAutomationDir } from "../utils/paths.js";

/**
 * Tool definition: Git commit
 */
export const GIT_COMMIT_TOOL: Tool = {
  name: "git_commit",
  description: "Create a git commit in the ADW worktree",
  inputSchema: {
    type: "object",
    properties: {
      adw_id: {
        type: "string",
        description: "The ADW workflow identifier",
      },
      message: {
        type: "string",
        description: "Commit message",
      },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Optional list of files to stage (default: stage all)",
      },
    },
    required: ["adw_id", "message"],
  },
};

/**
 * Tool definition: Create worktree
 */
export const GIT_CREATE_WORKTREE_TOOL: Tool = {
  name: "git_create_worktree",
  description: "Create a git worktree for isolated development",
  inputSchema: {
    type: "object",
    properties: {
      worktree_name: {
        type: "string",
        description: "Name for the worktree directory and branch",
      },
      base_branch: {
        type: "string",
        description: "Base branch to branch from",
      },
      base_path: {
        type: "string",
        description: "Base directory for worktrees (default: trees)",
      },
    },
    required: ["worktree_name", "base_branch"],
  },
};

/**
 * Tool definition: Cleanup worktree
 */
export const GIT_CLEANUP_WORKTREE_TOOL: Tool = {
  name: "git_cleanup_worktree",
  description: "Remove a git worktree and optionally delete its branch",
  inputSchema: {
    type: "object",
    properties: {
      worktree_name: {
        type: "string",
        description: "Name of the worktree to remove",
      },
      base_path: {
        type: "string",
        description: "Base directory for worktrees (default: trees)",
      },
      delete_branch: {
        type: "boolean",
        description: "Whether to delete the associated branch (default: true)",
      },
    },
    required: ["worktree_name"],
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
 * Execute git_commit tool
 */
export async function executeGitCommit(args: unknown): Promise<GitCommitResult> {
  if (!isGitCommitArgs(args)) {
    throw new Error("Invalid arguments for git_commit");
  }

  const bridgeArgs = [args.adw_id, args.message];
  if (args.files) {
    bridgeArgs.push(...args.files);
  }

  const result = await executePythonBridge("git_commit", bridgeArgs);
  return result as GitCommitResult;
}

/**
 * Execute git_create_worktree tool
 */
export async function executeCreateWorktree(args: unknown): Promise<ToolResult> {
  if (!isGitCreateWorktreeArgs(args)) {
    throw new Error("Invalid arguments for git_create_worktree");
  }

  const bridgeArgs = [args.worktree_name, args.base_branch];
  if (args.base_path) {
    bridgeArgs.push(args.base_path);
  }

  const result = await executePythonBridge("create_worktree", bridgeArgs);
  return result as ToolResult;
}

/**
 * Execute git_cleanup_worktree tool
 */
export async function executeCleanupWorktree(args: unknown): Promise<ToolResult> {
  if (!isGitCleanupWorktreeArgs(args)) {
    throw new Error("Invalid arguments for git_cleanup_worktree");
  }

  const bridgeArgs = [args.worktree_name];
  if (args.base_path) {
    bridgeArgs.push(args.base_path);
  }
  if (args.delete_branch !== undefined) {
    bridgeArgs.push(args.delete_branch.toString());
  }

  const result = await executePythonBridge("cleanup_worktree", bridgeArgs);
  return result as ToolResult;
}

/**
 * Type guards
 */
function isGitCommitArgs(args: unknown): args is GitCommitArgs {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const typed = args as GitCommitArgs;

  if (!("adw_id" in typed) || typeof typed.adw_id !== "string") {
    return false;
  }

  if (!("message" in typed) || typeof typed.message !== "string") {
    return false;
  }

  if ("files" in typed) {
    if (!Array.isArray(typed.files)) {
      return false;
    }
    for (const file of typed.files) {
      if (typeof file !== "string") {
        return false;
      }
    }
  }

  return true;
}

function isGitCreateWorktreeArgs(args: unknown): args is GitCreateWorktreeArgs {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const typed = args as GitCreateWorktreeArgs;

  if (!("worktree_name" in typed) || typeof typed.worktree_name !== "string") {
    return false;
  }

  if (!("base_branch" in typed) || typeof typed.base_branch !== "string") {
    return false;
  }

  if ("base_path" in typed && typeof typed.base_path !== "string") {
    return false;
  }

  return true;
}

function isGitCleanupWorktreeArgs(args: unknown): args is GitCleanupWorktreeArgs {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const typed = args as GitCleanupWorktreeArgs;

  if (!("worktree_name" in typed) || typeof typed.worktree_name !== "string") {
    return false;
  }

  if ("base_path" in typed && typeof typed.base_path !== "string") {
    return false;
  }

  if ("delete_branch" in typed && typeof typed.delete_branch !== "boolean") {
    return false;
  }

  return true;
}
