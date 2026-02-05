/**
 * Multi-phase workflow orchestration
 * Bypasses /do command and approval gates for headless execution
 */
import { join } from "node:path";
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
import { handlePRCreation, commitExpertiseChanges, type IssueType } from "./pr.ts";
import { clearWorkflowContext, getWorkflowContext } from "./context.ts";
import { curateContext, type CuratedContext } from "./curator.ts";
import { autoRecordSuccess, autoRecordFailure } from "./auto-record.ts";
import { withRetry } from "./retry.ts";
import { writeCheckpoint, clearCheckpoint } from "./checkpoint.ts";

/**
 * GitHub issue data fetched via gh CLI
 */
interface GitHubIssue {
  title: string;
  body: string;
  labels: Array<{ name: string }>;
  state: string;
}

export interface OrchestrationResult {
  domain: string;
  specPath: string | null;
  filesModified: string[];
  improveStatus: "success" | "failed" | "skipped";
  prUrl: string | null;
}

export interface OrchestrationOptions {
  issueNumber: number;
  projectRoot: string;
  mainProjectRoot: string;
  branchName: string | null;
  logger: WorkflowLogger;
  reporter: ConsoleReporter;
  dryRun: boolean;
  verbose: boolean;
  workflowId: string | null;
  resumeFromPhase?: string;
  checkpointData?: {
    domain: string;
    specPath: string | null;
    filesModified: string[];
    completedPhases: string[];
  };
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
      env: { KOTADB_PATH: string };
    };
  };
}

/** Ordered list of workflow phases for resume logic */
const PHASE_ORDER = ["analysis", "plan", "build", "improve"] as const;

/**
 * Check whether a phase should be skipped based on completed phases
 */
function shouldSkipPhase(phase: string, completedPhases: string[]): boolean {
  return completedPhases.includes(phase);
}

/**
 * Log retry stats for a phase when retries occurred
 */
function logRetryStats(
  logger: WorkflowLogger,
  phase: string,
  retryResult: { attempts: number; totalRetryDelayMs: number }
): void {
  if (retryResult.attempts > 1) {
    logger.logEvent("RETRY_STATS", {
      phase,
      attempts: retryResult.attempts,
      total_retry_delay_ms: retryResult.totalRetryDelayMs
    });
  }
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
  const { 
    issueNumber, 
    projectRoot, 
    mainProjectRoot,
    branchName, 
    logger, 
    reporter, 
    dryRun, 
    verbose, 
    workflowId,
    resumeFromPhase,
    checkpointData
  } = opts;

  // Determine which phases to skip based on resume support
  let completedPhases: string[] = [];
  let resumedDomain = "";
  let resumedSpecPath: string | null = null;
  let resumedFilesModified: string[] = [];

  if (resumeFromPhase && checkpointData) {
    completedPhases = [...checkpointData.completedPhases];
    resumedDomain = checkpointData.domain;
    resumedSpecPath = checkpointData.specPath;
    resumedFilesModified = checkpointData.filesModified;
    logger.logEvent("RESUME_FROM_PHASE", { 
      phase: resumeFromPhase, 
      skipped: completedPhases,
      domain: resumedDomain
    });
  } else if (resumeFromPhase) {
    // Resume requested but no checkpoint data -- skip phases by order
    for (const phase of PHASE_ORDER) {
      if (phase === resumeFromPhase) break;
      completedPhases.push(phase);
    }
    logger.logEvent("RESUME_FROM_PHASE", { phase: resumeFromPhase, skipped: completedPhases });
  }

  const startedAt = new Date().toISOString();

  // Fetch issue title early for PR creation
  const issueData = await fetchIssueContent(issueNumber);
  const issueTitle = issueData.title;

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
        args: ["--bun", "kotadb", "--stdio"],
        env: { KOTADB_PATH: join(mainProjectRoot, ".kotadb", "kota.db") }
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
  let domain: string;
  let requirements: string;
  let issueType: string;

  if (shouldSkipPhase("analysis", completedPhases)) {
    domain = resumedDomain;
    requirements = "";
    issueType = "unknown";
    logger.logEvent("PHASE_SKIP", { phase: "analysis", reason: "resumed" });
  } else {
    reporter.startPhase("analysis");
    logger.logEvent("PHASE_START", { phase: "analysis" });
    const retryResult = await withRetry(
      () => analyzeIssue(issueNumber, sdkOptions, logger)
    );
    logRetryStats(logger, "analysis", retryResult);
    const analysisResult = retryResult.result;
    const parsed = parseAnalysis(analysisResult);
    domain = parsed.domain;
    requirements = parsed.requirements;
    issueType = parsed.issueType;
    logger.logEvent("PHASE_COMPLETE", { phase: "analysis", domain });
    reporter.completePhase("analysis", { domain });

    // Write checkpoint after analysis
    writeCheckpoint({
      issueNumber,
      workflowId,
      completedPhases: ["analysis"],
      domain,
      specPath: null,
      filesModified: [],
      worktreePath: projectRoot,
      branchName,
      createdAt: startedAt,
      updatedAt: new Date().toISOString()
    });

    // CURATION: Post-Analysis
    if (workflowId) {
      try {
        const curatedContext = await curateContext({
          workflowId,
          phase: 'post-analysis',
          domain,
          currentPhaseOutput: analysisResult,
          projectRoot: mainProjectRoot,
          logger,
          reporter
        });
        logger.logEvent("CONTEXT_CURATED", { 
          workflow_id: workflowId, 
          phase: 'post-analysis',
          token_count: curatedContext.tokenCount
        });
      } catch (error) {
        // Non-fatal: log warning and continue
        logger.logError("curation_post_analysis", error instanceof Error ? error : new Error(String(error)));
        reporter.logWarning("Context curation failed (non-fatal)");
      }
    }
  }

  // Phase 2: Plan
  let specPath: string;

  if (shouldSkipPhase("plan", completedPhases)) {
    specPath = resumedSpecPath ?? "";
    logger.logEvent("PHASE_SKIP", { phase: "plan", reason: "resumed" });
  } else {
    reporter.startPhase("plan");
    logger.logEvent("PHASE_START", { phase: "plan", domain });

    // Retrieve curated context from analysis phase
    let planCuratedContext: string | null = null;
    if (workflowId) {
      try {
        const ctx = getWorkflowContext(workflowId, 'analysis');
        if (ctx?.summary) {
          planCuratedContext = ctx.summary.slice(0, 2000);
          logger.logEvent("CONTEXT_INJECTED", { phase: "plan", source: "analysis", length: planCuratedContext.length });
        }
      } catch (error) {
        logger.logError("context_retrieval_plan", error instanceof Error ? error : new Error(String(error)));
        reporter.logWarning("Context retrieval for plan failed (non-fatal)");
      }
    }

    const retryResult = await withRetry(
      () => executePlan(domain, requirements, issueNumber, sdkOptions, logger, dryRun, planCuratedContext)
    );
    logRetryStats(logger, "plan", retryResult);
    specPath = retryResult.result;
    logger.logEvent("PHASE_COMPLETE", { phase: "plan", spec_path: specPath });
    reporter.completePhase("plan", { spec_path: specPath });

    // Write checkpoint after plan
    writeCheckpoint({
      issueNumber,
      workflowId,
      completedPhases: ["analysis", "plan"],
      domain,
      specPath,
      filesModified: [],
      worktreePath: projectRoot,
      branchName,
      createdAt: startedAt,
      updatedAt: new Date().toISOString()
    });

    // CURATION: Post-Plan
    if (workflowId) {
      try {
        const planOutput = `Spec created at: ${specPath}\nDomain: ${domain}\nRequirements: ${requirements}`;
        const curatedContext = await curateContext({
          workflowId,
          phase: 'post-plan',
          domain,
          currentPhaseOutput: planOutput,
          projectRoot: mainProjectRoot,
          logger,
          reporter
        });
        logger.logEvent("CONTEXT_CURATED", { 
          workflow_id: workflowId, 
          phase: 'post-plan',
          token_count: curatedContext.tokenCount
        });
      } catch (error) {
        logger.logError("curation_post_plan", error instanceof Error ? error : new Error(String(error)));
        reporter.logWarning("Context curation failed (non-fatal)");
      }
    }
  }

  // Phase 3: Build
  let filesModified: string[];

  if (shouldSkipPhase("build", completedPhases)) {
    filesModified = resumedFilesModified;
    logger.logEvent("PHASE_SKIP", { phase: "build", reason: "resumed" });
  } else {
    reporter.startPhase("build");
    logger.logEvent("PHASE_START", { phase: "build", domain });

    // Retrieve curated context from plan phase
    let buildCuratedContext: string | null = null;
    if (workflowId) {
      try {
        const ctx = getWorkflowContext(workflowId, 'plan');
        if (ctx?.summary) {
          buildCuratedContext = ctx.summary.slice(0, 2000);
          logger.logEvent("CONTEXT_INJECTED", { phase: "build", source: "plan", length: buildCuratedContext.length });
        }
      } catch (error) {
        logger.logError("context_retrieval_build", error instanceof Error ? error : new Error(String(error)));
        reporter.logWarning("Context retrieval for build failed (non-fatal)");
      }
    }

    const retryResult = await withRetry(
      () => executeBuild(domain, specPath, sdkOptions, logger, dryRun, buildCuratedContext)
    );
    logRetryStats(logger, "build", retryResult);
    filesModified = retryResult.result;
    logger.logEvent("PHASE_COMPLETE", { phase: "build", files_count: filesModified.length });
    reporter.completePhase("build", { files_count: filesModified.length });

    // Write checkpoint after build
    writeCheckpoint({
      issueNumber,
      workflowId,
      completedPhases: ["analysis", "plan", "build"],
      domain,
      specPath,
      filesModified,
      worktreePath: projectRoot,
      branchName,
      createdAt: startedAt,
      updatedAt: new Date().toISOString()
    });

    // CURATION: Post-Build
    if (workflowId) {
      try {
        const buildOutput = `Files modified: ${filesModified.join(', ')}\nDomain: ${domain}`;
        const curatedContext = await curateContext({
          workflowId,
          phase: 'post-build',
          domain,
          currentPhaseOutput: buildOutput,
          projectRoot: mainProjectRoot,
          logger,
          reporter
        });
        logger.logEvent("CONTEXT_CURATED", { 
          workflow_id: workflowId, 
          phase: 'post-build',
          token_count: curatedContext.tokenCount
        });
      } catch (error) {
        logger.logError("curation_post_build", error instanceof Error ? error : new Error(String(error)));
        reporter.logWarning("Context curation failed (non-fatal)");
      }
    }
  }

  // Phase 4: Improve (optional)
  let improveStatus: "success" | "failed" | "skipped" = "success";

  if (shouldSkipPhase("improve", completedPhases)) {
    improveStatus = "skipped";
    logger.logEvent("PHASE_SKIP", { phase: "improve", reason: "resumed" });
  } else {
    reporter.startPhase("improve");
    logger.logEvent("PHASE_START", { phase: "improve", domain });

    // Retrieve curated context from build phase
    let improveCuratedContext: string | null = null;
    if (workflowId) {
      try {
        const ctx = getWorkflowContext(workflowId, 'build');
        if (ctx?.summary) {
          improveCuratedContext = ctx.summary.slice(0, 2000);
          logger.logEvent("CONTEXT_INJECTED", { phase: "improve", source: "build", length: improveCuratedContext.length });
        }
      } catch (error) {
        logger.logError("context_retrieval_improve", error instanceof Error ? error : new Error(String(error)));
        reporter.logWarning("Context retrieval for improve failed (non-fatal)");
      }
    }

    try {
      if (!dryRun) {
        const retryResult = await withRetry(
          () => executeImprove(domain, sdkOptions, logger, improveCuratedContext)
        );
        logRetryStats(logger, "improve", retryResult);
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

    // Write checkpoint after improve
    writeCheckpoint({
      issueNumber,
      workflowId,
      completedPhases: ["analysis", "plan", "build", "improve"],
      domain,
      specPath,
      filesModified,
      worktreePath: projectRoot,
      branchName,
      createdAt: startedAt,
      updatedAt: new Date().toISOString()
    });
  }

  // Auto-record workflow outcome
  if (!dryRun && workflowId) {
    try {
      if (improveStatus === "success") {
        await autoRecordSuccess({
          workflowId,
          issueNumber,
          domain,
          filesModified,
          projectRoot: mainProjectRoot,
          logger,
          reporter
        });
      } else if (improveStatus === "failed") {
        await autoRecordFailure({
          workflowId,
          issueNumber,
          domain,
          error: "Improve phase failed",
          projectRoot: mainProjectRoot,
          logger,
          reporter
        });
      }
    } catch (error) {
      // Non-fatal: log warning and continue
      logger.logError("auto_recording", error instanceof Error ? error : new Error(String(error)));
      reporter.logWarning("Auto-recording failed (non-fatal)");
    }
  }

  // Commit expertise changes from improve phase (before PR)
  if (!dryRun && improveStatus === "success") {
    try {
      const expertiseCommitSha = await commitExpertiseChanges(projectRoot, domain, issueNumber);
      if (expertiseCommitSha) {
        logger.logEvent("EXPERTISE_COMMITTED", { sha: expertiseCommitSha, domain });
        reporter.logKeyAction(`Committed expertise update: ${expertiseCommitSha.substring(0, 7)}`);
      }
    } catch (error) {
      logger.logError("expertise_commit", error instanceof Error ? error : new Error(String(error)));
      reporter.logWarning("Failed to commit expertise changes (non-fatal)");
    }
  }

  // Phase 5: Create PR (after successful build)
  let prUrl: string | null = null;
  if (branchName && filesModified.length > 0) {
    reporter.startPhase("pr");
    logger.logEvent("PHASE_START", { phase: "pr" });
    
    try {
      const prResult = await handlePRCreation({
        worktreePath: projectRoot,
        branchName,
        issueNumber,
        issueType: issueType as IssueType,
        issueTitle,
        domain,
        filesModified,
        dryRun,
        workflowId: workflowId ?? undefined
      });
      
      if (prResult.success && prResult.prUrl) {
        prUrl = prResult.prUrl;
        logger.logEvent("PHASE_COMPLETE", { phase: "pr", pr_url: prUrl });
        reporter.completePhase("pr", { pr_url: prUrl });
      } else if (prResult.success && dryRun) {
        logger.logEvent("PHASE_COMPLETE", { phase: "pr", dry_run: true });
        reporter.completePhase("pr", { status: "skipped" });
      } else {
        logger.logEvent("PHASE_COMPLETE", { phase: "pr", error: prResult.errorMessage });
        reporter.logWarning(`PR creation: ${prResult.errorMessage ?? "unknown error"}`);
        reporter.completePhase("pr", { status: "failed" });
      }
    } catch (error) {
      logger.logError("pr_phase", error instanceof Error ? error : new Error(String(error)));
      reporter.logWarning("PR creation failed (non-fatal)");
      reporter.completePhase("pr", { status: "failed" });
    }
  } else if (!branchName) {
    logger.logEvent("PHASE_SKIP", { phase: "pr", reason: "no branch name" });
  } else {
    logger.logEvent("PHASE_SKIP", { phase: "pr", reason: "no files modified" });
  }


  // Clean up context only on success
  if (workflowId && improveStatus === "success") {
    try {
      const deletedCount = clearWorkflowContext(workflowId);
      logger.logEvent("CONTEXT_CLEANUP", { 
        workflow_id: workflowId, 
        deleted_count: deletedCount 
      });
    } catch (error) {
      // Non-fatal: log warning but continue
      logger.logError("context_cleanup", error instanceof Error ? error : new Error(String(error)));
      reporter.logWarning("Failed to cleanup workflow context (non-fatal)");
    }
  }

  // Clear checkpoint on workflow completion (success or terminal failure)
  clearCheckpoint(issueNumber);

  return {
    domain,
    specPath,
    filesModified,
    improveStatus,
    prUrl
  };
}

/**
 * Fetch GitHub issue content via gh CLI
 */
async function fetchIssueContent(issueNumber: number): Promise<GitHubIssue> {
  const proc = Bun.spawn(
    ["gh", "issue", "view", String(issueNumber), "--json", "title,body,labels,state"],
    {
      stdout: "pipe",
      stderr: "pipe"
    }
  );

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to fetch issue #${issueNumber}: ${stderr}`);
  }

  const issueData = JSON.parse(output);
  
  return {
    title: issueData.title || "",
    body: issueData.body || "(No description provided)",
    labels: Array.isArray(issueData.labels) ? issueData.labels : [],
    state: issueData.state || "UNKNOWN"
  };
}

async function analyzeIssue(
  issueNumber: number,
  options: AutomationSDKOptions,
  logger: WorkflowLogger
): Promise<string> {
  // Fetch actual issue content from GitHub
  logger.logEvent("FETCH_ISSUE", { issue_number: issueNumber });
  
  const issueData = await fetchIssueContent(issueNumber);
  
  logger.logEvent("ISSUE_FETCHED", { 
    issue_number: issueNumber,
    title: issueData.title,
    labels: issueData.labels.map(l => l.name),
    state: issueData.state
  });
  
  const prompt = `
You are analyzing GitHub issue #${issueNumber} for automation orchestration.

## Issue Content

**Title**: ${issueData.title}

**State**: ${issueData.state}

**Labels**: ${issueData.labels.map(l => l.name).join(", ") || "none"}

**Description**:
${issueData.body}

---

TASK: Analyze the ACTUAL issue content above and provide structured analysis with:
1. Issue type (feature/bug/chore/refactor)
2. Expert domain (claude-config/agent-authoring/database/api/testing/indexer/github/automation)
3. Core requirements (bullet points extracted from the issue description)
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
  dryRun: boolean,
  curatedContext?: string | null
): Promise<string> {
  const contextSection = curatedContext
    ? `\n\n## KotaDB Context (from previous phase)\n${curatedContext}`
    : '';

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
${contextSection}`;

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
  dryRun: boolean,
  curatedContext?: string | null
): Promise<string[]> {
  const contextSection = curatedContext
    ? `\n\n## KotaDB Context (from previous phase)\n${curatedContext}`
    : '';

  const prompt = `
You are the ${domain}-build-agent.

PATH_TO_SPEC: ${specPath}

AUTOMATION_MODE: true
${dryRun ? "DRY_RUN: true (validate only, no file writes)" : ""}

Read the specification and implement the changes.
Report absolute file paths for all files modified.
${contextSection}`;

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
  logger: WorkflowLogger,
  curatedContext?: string | null
): Promise<void> {
  const contextSection = curatedContext
    ? `\n\n## KotaDB Context (from previous phase)\n${curatedContext}`
    : '';

  const prompt = `
You are the ${domain}-improve-agent.

AUTOMATION_MODE: true

Review recent ${domain} changes from git history.
Extract learnings and update expertise.yaml with new patterns.
${contextSection}`;

  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options })) {
    messages.push(message);
    logger.addMessage(message);
  }
}
