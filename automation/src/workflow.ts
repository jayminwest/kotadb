/**
 * Claude Agent SDK integration for workflow execution
 */
import { dirname } from "node:path";
import { WorkflowLogger } from "./logger.ts";
import { ConsoleReporter } from "./reporter.ts";
import { orchestrateWorkflow } from "./orchestrator.ts";

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

function getProjectRoot(): string {
  // automation/src/workflow.ts -> automation -> project root
  return dirname(dirname(import.meta.dir));
}

export async function runWorkflow(
  issueNumber: number,
  dryRun = false,
  verbose = false,
  workingDirectory?: string  // Optional worktree path
): Promise<WorkflowResult> {
  const projectRoot = workingDirectory ?? getProjectRoot();  // Use worktree if provided
  const logger = new WorkflowLogger({ 
    issueNumber, 
    dryRun, 
    projectRoot  // Logger will write to worktree location
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

  const startTime = performance.now();

  try {
    logger.initialize();
    reporter.startWorkflow(dryRun);
    logger.logEvent("WORKFLOW_START", { issue_number: issueNumber, dry_run: dryRun, verbose });

    // Use orchestrator with reporter integration
    const orchResult = await orchestrateWorkflow({
      issueNumber,
      projectRoot,
      logger,
      reporter,
      dryRun,
      verbose
    });

    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);

    // Extract metrics from logger
    const { inputTokens, outputTokens, totalCostUsd, sessionId } = logger.getMetrics();
    
    result.success = true;
    result.sessionId = sessionId;
    result.inputTokens = inputTokens;
    result.outputTokens = outputTokens;
    result.totalCostUsd = totalCostUsd;
    result.logDir = logger.getLogDir();
    
    logger.logEvent("WORKFLOW_COMPLETE", {
      success: true,
      duration_ms: durationMs,
      domain: orchResult.domain,
      files_modified: orchResult.filesModified.length
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
