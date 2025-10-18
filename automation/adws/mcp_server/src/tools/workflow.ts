/**
 * Workflow orchestration tools for ADW MCP server
 */

import { spawn } from "child_process";
import { join } from "path";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type {
  ADWGetStateArgs,
  ADWListWorkflowsArgs,
  ADWRunPhaseArgs,
  WorkflowState,
  WorkflowList,
  ToolResult,
} from "../types.js";
import { getAutomationDir } from "../utils/paths.js";
import { getPythonExecutable } from "../utils/python.js";

/**
 * Tool definition: Get ADW workflow state
 */
export const ADW_GET_STATE_TOOL: Tool = {
  name: "adw_get_state",
  description: "Get the current state of an ADW workflow by its ID",
  inputSchema: {
    type: "object",
    properties: {
      adw_id: {
        type: "string",
        description: "The ADW workflow identifier",
      },
    },
    required: ["adw_id"],
  },
};

/**
 * Tool definition: List ADW workflows
 */
export const ADW_LIST_WORKFLOWS_TOOL: Tool = {
  name: "adw_list_workflows",
  description: "List all ADW workflows or filter by adw_id",
  inputSchema: {
    type: "object",
    properties: {
      adw_id: {
        type: "string",
        description: "Optional ADW ID filter",
      },
    },
  },
};

/**
 * Tool definition: Run ADW phase
 */
export const ADW_RUN_PHASE_TOOL: Tool = {
  name: "adw_run_phase",
  description: "Execute a specific ADW workflow phase (plan, build, test, review)",
  inputSchema: {
    type: "object",
    properties: {
      phase: {
        type: "string",
        enum: ["plan", "build", "test", "review"],
        description: "The phase to execute",
      },
      issue_number: {
        type: "string",
        description: "GitHub issue number",
      },
      adw_id: {
        type: "string",
        description: "Optional ADW ID (will be generated if not provided)",
      },
    },
    required: ["phase", "issue_number"],
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
    const process = spawn(getPythonExecutable(), [
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
 * Execute adw_get_state tool
 */
export async function executeGetState(args: unknown): Promise<WorkflowState> {
  // Type guard
  if (!isADWGetStateArgs(args)) {
    throw new Error("Invalid arguments for adw_get_state");
  }

  const result = await executePythonBridge("get_state", [args.adw_id]);
  return result as WorkflowState;
}

/**
 * Execute adw_list_workflows tool
 */
export async function executeListWorkflows(
  args: unknown
): Promise<WorkflowList> {
  // Type guard
  if (!isADWListWorkflowsArgs(args)) {
    throw new Error("Invalid arguments for adw_list_workflows");
  }

  const bridgeArgs = args.adw_id ? [args.adw_id] : [];
  const result = await executePythonBridge("list_workflows", bridgeArgs);
  return result as WorkflowList;
}

/**
 * Execute adw_run_phase tool
 */
export async function executeRunPhase(args: unknown): Promise<ToolResult> {
  // Type guard
  if (!isADWRunPhaseArgs(args)) {
    throw new Error("Invalid arguments for adw_run_phase");
  }

  const { phase, issue_number, adw_id } = args;

  return new Promise((resolve, reject) => {
    const scriptPath = join(getAutomationDir(), `adws/adw_phases/adw_${phase}.py`);
    const processArgs = [scriptPath, issue_number];
    if (adw_id) {
      processArgs.push(adw_id);
    }

    const process = spawn(getPythonExecutable(), processArgs, {
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
        resolve({
          success: false,
          error: `Phase ${phase} failed: ${stderr}`,
        });
        return;
      }

      resolve({
        success: true,
        message: `Phase ${phase} completed successfully`,
        data: { stdout, stderr },
      });
    });
  });
}

/**
 * Type guards
 */
function isADWGetStateArgs(args: unknown): args is ADWGetStateArgs {
  return (
    typeof args === "object" &&
    args !== null &&
    "adw_id" in args &&
    typeof (args as ADWGetStateArgs).adw_id === "string"
  );
}

function isADWListWorkflowsArgs(args: unknown): args is ADWListWorkflowsArgs {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  if ("adw_id" in args) {
    return typeof (args as ADWListWorkflowsArgs).adw_id === "string";
  }

  return true; // No adw_id is valid
}

function isADWRunPhaseArgs(args: unknown): args is ADWRunPhaseArgs {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const typed = args as ADWRunPhaseArgs;

  if (!("phase" in typed) || !("issue_number" in typed)) {
    return false;
  }

  if (
    typeof typed.phase !== "string" ||
    !["plan", "build", "test", "review"].includes(typed.phase)
  ) {
    return false;
  }

  if (typeof typed.issue_number !== "string") {
    return false;
  }

  if ("adw_id" in typed && typeof typed.adw_id !== "string") {
    return false;
  }

  return true;
}
