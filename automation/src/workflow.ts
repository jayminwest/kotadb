/**
 * Claude Agent SDK integration for workflow execution
 */
import { dirname } from "node:path";
import { WorkflowLogger } from "./logger.ts";
import { ConsoleReporter } from "./reporter.ts";
import { orchestrateWorkflow, type OrchestrationOptions } from "./orchestrator.ts";
import { generateWorkflowId } from "./context.ts";

export interface WorkflowResult {
  success: boolean;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  prUrl: string | null;
  errorMessage: string | null;
  logDir: string | null;
}

export interface WorkflowOptions {
  issueNumber: number;
  dryRun?: boolean;
  verbose?: boolean;
  /** Enable context accumulation for inter-phase handoffs */
  accumulateContext?: boolean;
  /** Working directory for SDK execution (worktree path or main repo) */
  workingDirectory?: string;
  /** Main project root for centralized logging (always the main repo root) */
  mainProjectRoot?: string;
  branchName?: string;
  /** Phase to resume from (skip earlier phases using checkpoint data) */
  resumeFromPhase?: string;
  /** Checkpoint data for resume (domain, specPath, filesModified from previous run) */
  checkpointData?: {
    domain: string;
    specPath: string | null;
    filesModified: string[];
    completedPhases: string[];
  };
}

function getProjectRoot(): string {
  // automation/src/workflow.ts -> automation -> project root
  return dirname(dirname(import.meta.dir));
}

export async function runWorkflow(opts: WorkflowOptions): Promise<WorkflowResult> {
  const {
    issueNumber,
    dryRun = false,
    verbose = false,
    accumulateContext = false,
    workingDirectory,
    mainProjectRoot,
    branchName,
    resumeFromPhase,
    checkpointData
  } = opts;

  const defaultProjectRoot = getProjectRoot();
  // Use workingDirectory for SDK execution (may be worktree)
  const executionRoot = workingDirectory ?? defaultProjectRoot;
  // Use mainProjectRoot for logging (always main repo, not worktree)
  const logRoot = mainProjectRoot ?? defaultProjectRoot;

  const logger = new WorkflowLogger({ 
    issueNumber, 
    dryRun, 
    projectRoot: logRoot  // Logs always go to main repo
  });
  const reporter = new ConsoleReporter({ verbose, issueNumber });
  
  const result: WorkflowResult = {
    success: false,
    sessionId: null,
    inputTokens: 0,
    outputTokens: 0,
    totalCostUsd: 0,
    prUrl: null,
    errorMessage: null,
    logDir: null,
  };

  // Generate workflow ID if context accumulation enabled
  const workflowId = accumulateContext ? generateWorkflowId(issueNumber) : null;

  const startTime = performance.now();

  try {
    logger.initialize();
    reporter.startWorkflow(dryRun);
    logger.logEvent("WORKFLOW_START", { 
      issue_number: issueNumber, 
      dry_run: dryRun, 
      verbose,
      accumulate_context: accumulateContext,
      workflow_id: workflowId,
      resume_from_phase: resumeFromPhase ?? null
    });

    if (resumeFromPhase) {
      process.stderr.write(
        `[workflow] Resuming from phase: ${resumeFromPhase}\n`
      );
      if (checkpointData) {
        process.stderr.write(
          `[workflow] Checkpoint: domain=${checkpointData.domain}, ` +
          `completed=[${checkpointData.completedPhases.join(",")}]\n`
        );
      }
    }

    // Build orchestration options
    // Resume fields (resumeFromPhase, checkpointData) are passed as extra
    // properties — the orchestrator will accept them once checkpoint integration
    // is merged. For now they are stored on WorkflowOptions for the CLI to pass.
    const orchOpts: OrchestrationOptions & {
      resumeFromPhase?: string;
      checkpointData?: WorkflowOptions["checkpointData"];
    } = {
      issueNumber,
      projectRoot: executionRoot,
      mainProjectRoot: logRoot,
      branchName: branchName ?? null,
      logger,
      reporter,
      dryRun,
      verbose,
      workflowId,
      resumeFromPhase,
      checkpointData
    };

    // Use orchestrator with reporter integration
    const orchResult = await orchestrateWorkflow(orchOpts as OrchestrationOptions);

    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);

    // Extract metrics from logger
    const { inputTokens, outputTokens, totalCostUsd, sessionId } = logger.getMetrics();
    
    result.success = true;
    result.sessionId = sessionId;
    result.inputTokens = inputTokens;
    result.outputTokens = outputTokens;
    result.totalCostUsd = totalCostUsd;
    result.prUrl = orchResult.prUrl;
    result.logDir = logger.getLogDir();
    
    logger.logEvent("WORKFLOW_COMPLETE", {
      success: true,
      duration_ms: durationMs,
      domain: orchResult.domain,
      files_modified: orchResult.filesModified.length,
      pr_url: orchResult.prUrl
    });
    
    // Finalize agent output with summary
    logger.finalizeAgentOutput({
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalCostUsd: totalCostUsd,
      durationMs
    });
    
    // Report workflow completion
    reporter.completeWorkflow({
      success: true,
      durationMs,
      inputTokens,
      outputTokens,
      totalCostUsd,
      filesModified: orchResult.filesModified,
      specPath: orchResult.specPath
    });
    
  } catch (error) {
    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);
    const { inputTokens, outputTokens, totalCostUsd } = logger.getMetrics();
    
    result.success = false;
    result.errorMessage = error instanceof Error ? error.message : String(error);
    logger.logError("workflow_execution", error instanceof Error ? error : new Error(String(error)));
    result.logDir = logger.getLogDir();
    
    // Finalize agent output even on error
    logger.finalizeAgentOutput({
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalCostUsd: totalCostUsd,
      durationMs
    });
    
    // Report error to console
    reporter.logError("Workflow failed", error instanceof Error ? error : undefined);
    reporter.completeWorkflow({
      success: false,
      durationMs,
      inputTokens,
      outputTokens,
      totalCostUsd,
      filesModified: [],
      specPath: null,
      errorMessage: result.errorMessage
    });
  }

  return result;
}
