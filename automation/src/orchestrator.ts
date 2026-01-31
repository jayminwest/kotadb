/**
 * Multi-phase workflow orchestration
 * Bypasses /do command and approval gates for headless execution
 */
import { 
  query, 
  type SDKMessage, 
  type HookInput, 
  type HookCallback,
  type HookCallbackMatcher,
  type Options
} from "@anthropic-ai/claude-code";
import type { WorkflowLogger } from "./logger.ts";
import { 
  ConsoleReporter,
  summarizeToolInput,
  summarizeToolOutput,
  isKeyAction 
} from "./reporter.ts";
import { 
  parseAnalysis, 
  extractSpecPath, 
  extractFilePaths, 
  extractTextFromMessages 
} from "./parser.ts";

export interface OrchestrationResult {
  domain: string;
  specPath: string | null;
  filesModified: string[];
  improveStatus: "success" | "failed" | "skipped";
}

export interface OrchestrationOptions {
  issueNumber: number;
  projectRoot: string;
  logger: WorkflowLogger;
  reporter: ConsoleReporter;
  dryRun: boolean;
  verbose: boolean;
}

/**
 * SDK options for automated workflow queries
 * Configured for headless execution with kotadb MCP access
 */
interface AutomationSDKOptions extends Options {
  maxTurns: number;
  cwd: string;
  permissionMode: "bypassPermissions";
  mcpServers: {
    kotadb: {
      type: "stdio";
      command: string;
      args: string[];
      env: { KOTADB_CWD: string };
    };
  };
}

/**
 * Create PreToolUse hook for action-level logging
 */
function createPreToolUseHook(
  reporter: ConsoleReporter
): HookCallback {
  return async (input: HookInput) => {
    try {
      if (input.hook_event_name === "PreToolUse") {
        const summary = summarizeToolInput(input.tool_name, input.tool_input);
        reporter.logToolUse(input.tool_name, summary);
      }
    } catch {
      // Non-fatal: continue workflow on hook error
    }
    return {};
  };
}

/**
 * Create PostToolUse hook for action-level logging
 */
function createPostToolUseHook(
  reporter: ConsoleReporter
): HookCallback {
  return async (input: HookInput) => {
    try {
      if (input.hook_event_name === "PostToolUse") {
        const summary = summarizeToolOutput(input.tool_name, input.tool_input);
        
        // Always log key actions (file creation, modification)
        if (isKeyAction(input.tool_name) && summary) {
          reporter.logKeyAction(summary);
        } else if (reporter.isVerbose()) {
          reporter.logToolComplete(input.tool_name, summary);
        }
      }
    } catch {
      // Non-fatal: continue workflow on hook error
    }
    return {};
  };
}

/**
 * Create Notification hook for SDK notifications
 */
function createNotificationHook(reporter: ConsoleReporter): HookCallback {
  return async (input: HookInput) => {
    try {
      if (input.hook_event_name === "Notification") {
        const message = input.message;
        if (message.toLowerCase().includes("error")) {
          reporter.logError(message);
        } else if (message.toLowerCase().includes("warn")) {
          reporter.logWarning(message);
        } else {
          reporter.logProgress(message);
        }
      }
    } catch {
      // Non-fatal: continue workflow on hook error
    }
    return {};
  };
}

/**
 * Multi-phase workflow orchestration
 * Bypasses /do command and approval gates for headless execution
 */
export async function orchestrateWorkflow(
  opts: OrchestrationOptions
): Promise<OrchestrationResult> {
  const { issueNumber, projectRoot, logger, reporter, dryRun, verbose } = opts;

  // Build hooks configuration
  const hooks: Partial<Record<string, HookCallbackMatcher[]>> = {
    PreToolUse: [
      {
        hooks: [createPreToolUseHook(reporter)]
      }
    ],
    PostToolUse: [
      {
        hooks: [createPostToolUseHook(reporter)]
      }
    ],
    Notification: [
      {
        hooks: [createNotificationHook(reporter)]
      }
    ]
  };

  // SDK options with settingSources: [] to bypass .claude/settings.json
  const sdkOptions: AutomationSDKOptions = {
    maxTurns: 100,
    cwd: projectRoot,
    permissionMode: "bypassPermissions",
    mcpServers: {
      kotadb: {
        type: "stdio",
        command: "bunx",
        args: ["--bun", "kotadb"],
        env: { KOTADB_CWD: projectRoot }
      }
    },
    // Suppress default stderr dots
    stderr: (data: string) => {
      if (verbose) {
        logger.logEvent("SDK_STDERR", { data });
      }
      // Suppress console output (SDK dots)
    },
    // Action-level logging via hooks
    hooks
  };

  // Phase 1: Analyze Issue
  reporter.startPhase("analysis");
  logger.logEvent("PHASE_START", { phase: "analysis" });
  const analysisResult = await analyzeIssue(issueNumber, sdkOptions, logger);
  const { domain, requirements } = parseAnalysis(analysisResult);
  logger.logEvent("PHASE_COMPLETE", { phase: "analysis", domain });
  reporter.completePhase("analysis", { domain });

  // Phase 2: Plan
  reporter.startPhase("plan");
  logger.logEvent("PHASE_START", { phase: "plan", domain });
  const specPath = await executePlan(domain, requirements, issueNumber, sdkOptions, logger, dryRun);
  logger.logEvent("PHASE_COMPLETE", { phase: "plan", spec_path: specPath });
  reporter.completePhase("plan", { spec_path: specPath });

  // Phase 3: Build
  reporter.startPhase("build");
  logger.logEvent("PHASE_START", { phase: "build", domain });
  const filesModified = await executeBuild(domain, specPath, sdkOptions, logger, dryRun);
  logger.logEvent("PHASE_COMPLETE", { phase: "build", files_count: filesModified.length });
  reporter.completePhase("build", { files_count: filesModified.length });

  // Phase 4: Improve (optional)
  reporter.startPhase("improve");
  logger.logEvent("PHASE_START", { phase: "improve", domain });
  let improveStatus: "success" | "failed" | "skipped" = "success";
  try {
    if (!dryRun) {
      await executeImprove(domain, sdkOptions, logger);
    } else {
      improveStatus = "skipped";
    }
  } catch (error) {
    logger.logError("improve_phase", error instanceof Error ? error : new Error(String(error)));
    reporter.logError("Improve phase failed", error instanceof Error ? error : undefined);
    improveStatus = "failed";
  }
  logger.logEvent("PHASE_COMPLETE", { phase: "improve", status: improveStatus });
  reporter.completePhase("improve", { status: improveStatus });

  return {
    domain,
    specPath,
    filesModified,
    improveStatus
  };
}

async function analyzeIssue(
  issueNumber: number,
  options: AutomationSDKOptions,
  logger: WorkflowLogger
): Promise<string> {
  const prompt = `
You are analyzing GitHub issue #${issueNumber} for automation orchestration.

TASK: Provide structured analysis with:
1. Issue type (feature/bug/chore/refactor)
2. Expert domain (claude-config/agent-authoring/database/api/testing/indexer/github/automation)
3. Core requirements (bullet points)
4. Recommended approach

FORMAT:
## Issue Analysis
**Type**: <type>
**Domain**: <domain>
**Requirements**:
- <requirement 1>
- <requirement 2>
- ...

**Approach**: <recommended strategy>

Use github-question-agent expertise to analyze the issue.
`;

  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options })) {
    messages.push(message);
    logger.addMessage(message);
  }

  return extractTextFromMessages(messages);
}

async function executePlan(
  domain: string,
  requirements: string,
  issueNumber: number,
  options: AutomationSDKOptions,
  logger: WorkflowLogger,
  dryRun: boolean
): Promise<string> {
  const prompt = `
You are the ${domain}-plan-agent.

USER_PROMPT: ${requirements}

AUTOMATION_MODE: true
HUMAN_IN_LOOP: false
${dryRun ? "DRY_RUN: true" : ""}

Create a detailed specification following ${domain} domain standards.
Save spec to: docs/specs/${domain}/<descriptive-slug>-spec.md

The spec should address GitHub issue #${issueNumber}.

Return the absolute spec path when complete.
`;

  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options })) {
    messages.push(message);
    logger.addMessage(message);
  }

  const output = extractTextFromMessages(messages);
  return extractSpecPath(output);
}

async function executeBuild(
  domain: string,
  specPath: string,
  options: AutomationSDKOptions,
  logger: WorkflowLogger,
  dryRun: boolean
): Promise<string[]> {
  const prompt = `
You are the ${domain}-build-agent.

PATH_TO_SPEC: ${specPath}

AUTOMATION_MODE: true
${dryRun ? "DRY_RUN: true (validate only, no file writes)" : ""}

Read the specification and implement the changes.
Report absolute file paths for all files modified.
`;

  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options })) {
    messages.push(message);
    logger.addMessage(message);
  }

  const output = extractTextFromMessages(messages);
  return extractFilePaths(output);
}

async function executeImprove(
  domain: string,
  options: AutomationSDKOptions,
  logger: WorkflowLogger
): Promise<void> {
  const prompt = `
You are the ${domain}-improve-agent.

AUTOMATION_MODE: true

Review recent ${domain} changes from git history.
Extract learnings and update expertise.yaml with new patterns.
`;

  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options })) {
    messages.push(message);
    logger.addMessage(message);
  }
}
