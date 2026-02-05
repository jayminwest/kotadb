/**
 * CLI entry point for KotaDB automation
 *
 * Environment loading: Loads .env from project root before any other imports
 */
import { join, dirname } from "node:path";
import { readFileSync, existsSync } from "node:fs";

// Load .env from project root (one level up from automation/)
const projectRoot = dirname(dirname(import.meta.dir));
const envPath = join(projectRoot, ".env");

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=");
      if (key && value !== undefined && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// Validate required environment variables
if (!process.env.ANTHROPIC_API_KEY) {
  process.stderr.write(
    "Error: ANTHROPIC_API_KEY not set. Add it to .env in project root.\n"
  );
  process.exit(1);
}

import { runWorkflow } from "./workflow.ts";
import {
  recordMetrics,
  getRecentMetrics,
  closeMetricsDb,
  type WorkflowMetrics,
} from "./metrics.ts";
import { postIssueComment } from "./github.ts";
import { 
  createWorktree, 
  formatWorktreeTimestamp,
  type WorktreeInfo 
} from "./worktree.ts";
import { readLatestCheckpoint } from "./checkpoint.ts";
import {
  runBatch,
  discoverIssuesByLabel,
  formatBatchSummary,
  type BatchOptions,
} from "./batch.ts";

function parseIssueNumber(arg: string): number | null {
  // Support #123 or 123 format
  const match = arg.match(/^#?(\d+)$/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

function printUsage(): void {
  process.stdout.write(`
KotaDB Automation

Usage:
  bun run src/index.ts <issue> [options]
  bun run src/index.ts --batch <issues...> [options]
  bun run src/index.ts --batch-label <label> [options]
  bun run src/index.ts --resume <issue> [options]
  bun run src/index.ts --status
  bun run src/index.ts --metrics

Arguments:
  <issue>                GitHub issue number (#123 or 123)

Single-Issue Options:
  --dry-run              Preview workflow without executing changes
  --no-comment           Skip posting GitHub comment
  --verbose, -v          Enable detailed action-level logging
  --accumulate-context   Enable context accumulation for inter-phase handoffs

Batch Options:
  --batch <issues...>    Run multiple issues concurrently (#123 #124 or 123 124)
  --batch-label <label>  Discover and run all open issues with the given label
  --concurrency <n>      Max parallel issues (default: 3, used with --batch/--batch-label)

Resume Options:
  --resume <issue>       Resume a previously failed issue from its latest checkpoint

Status & Metrics:
  --status               Display run manifest (recent batch/run status)
  --metrics              Display recent workflow metrics
  --help                 Show this help message

Examples:
  bun run src/index.ts #123
  bun run src/index.ts 123 --dry-run --verbose
  bun run src/index.ts --batch 123 124 125 --concurrency 2
  bun run src/index.ts --batch-label auto:implement
  bun run src/index.ts --resume 123
  bun run src/index.ts --status
  bun run src/index.ts --metrics
`);
}

function printMetrics(): void {
  const metrics = getRecentMetrics(10);

  if (metrics.length === 0) {
    process.stdout.write("No workflow metrics recorded yet.\n");
    return;
  }

  process.stdout.write("\nRecent Workflow Metrics:\n");
  process.stdout.write("-".repeat(80) + "\n");

  for (const m of metrics) {
    const status = m.success ? "SUCCESS" : "FAILURE";
    const duration = (m.duration_ms / 1000).toFixed(1);
    const cost = m.total_cost_usd.toFixed(4);
    const pr = m.pr_url ?? "N/A";

    process.stdout.write(
      `Issue #${m.issue_number} | ${status} | ${duration}s | $${cost} | ${pr}\n`
    );
  }

  process.stdout.write("-".repeat(80) + "\n");
}

async function printStatus(): Promise<void> {
  try {
    const { readManifest, formatManifestTable } = await import("./manifest.ts");
    const entries = readManifest(projectRoot);
    if (entries.length === 0) {
      process.stdout.write("No run manifest found.\n");
      return;
    }
    process.stdout.write(formatManifestTable(entries));
  } catch {
    process.stderr.write("Warning: manifest module not available yet.\n");
  }
}
/**
 * Extract a string value following a flag in args
 */
function getFlagValue(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  const val = args[idx + 1];
  if (!val || val.startsWith("--")) return null;
  return val;
}

/**
 * Extract a numeric value following a flag in args
 */
function getFlagNumericValue(args: string[], flag: string): number | null {
  const val = getFlagValue(args, flag);
  if (val === null) return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

/**
 * Collect all issue numbers after --batch flag until next flag or end
 */
function collectBatchIssues(args: string[]): number[] {
  const batchIdx = args.indexOf("--batch");
  if (batchIdx === -1) return [];

  const issues: number[] = [];
  for (let i = batchIdx + 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) break;
    const num = parseIssueNumber(arg);
    if (num !== null) {
      issues.push(num);
    }
  }
  return issues;
}

async function handleBatch(args: string[]): Promise<number> {
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose") || args.includes("-v");
  const accumulateContext = args.includes("--accumulate-context");
  const skipComment = args.includes("--no-comment");
  const concurrency = getFlagNumericValue(args, "--concurrency") ?? 3;

  let issues: number[] = [];

  if (args.includes("--batch-label")) {
    const label = getFlagValue(args, "--batch-label");
    if (!label) {
      process.stderr.write("Error: --batch-label requires a label value\n");
      return 1;
    }
    process.stdout.write(`Discovering issues with label "${label}"...\n`);
    issues = await discoverIssuesByLabel(label);
    if (issues.length === 0) {
      process.stdout.write(`No open issues found with label "${label}"\n`);
      return 0;
    }
    process.stdout.write(`Found ${issues.length} issues: ${issues.map(n => `#${n}`).join(", ")}\n`);
  } else {
    issues = collectBatchIssues(args);
    if (issues.length === 0) {
      process.stderr.write("Error: --batch requires at least one issue number\n");
      return 1;
    }
  }

  const options: BatchOptions = {
    concurrency,
    failFast: false,
    dryRun,
    verbose,
    accumulateContext,
    skipComment,
  };

  const result = await runBatch(issues, options, projectRoot);

  // Print summary
  process.stdout.write(formatBatchSummary(result));

  // Record individual metrics
  for (const r of result.results) {
    const metrics: WorkflowMetrics = {
      issue_number: r.issueNumber,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      success: r.success,
      duration_ms: r.durationMs,
      input_tokens: 0,
      output_tokens: 0,
      total_cost_usd: r.costUsd,
      pr_url: r.prUrl ?? null,
      error_message: r.error ?? null,
      session_id: null,
    };
    recordMetrics(metrics);
  }

  closeMetricsDb();
  return result.failureCount > 0 ? 1 : 0;
}

async function handleResume(args: string[]): Promise<number> {
  const resumeArg = getFlagValue(args, "--resume");
  if (!resumeArg) {
    process.stderr.write("Error: --resume requires an issue number\n");
    return 1;
  }

  const issueNumber = parseIssueNumber(resumeArg);
  if (issueNumber === null) {
    process.stderr.write(`Error: Invalid issue number: ${resumeArg}\n`);
    return 1;
  }

  const checkpoint = readLatestCheckpoint(issueNumber);
  if (!checkpoint) {
    process.stderr.write(
      `No checkpoint found for issue #${issueNumber}. Starting fresh.\n`
    );
  } else {
    process.stdout.write(
      `Resuming issue #${issueNumber} from checkpoint\n`
    );
    process.stdout.write(
      `  Domain: ${checkpoint.domain}\n`
    );
    process.stdout.write(
      `  Completed phases: ${checkpoint.completedPhases.join(", ") || "none"}\n`
    );
    if (checkpoint.worktreePath) {
      process.stdout.write(
        `  Worktree: ${checkpoint.worktreePath}\n`
      );
    }
  }

  // Determine next phase from checkpoint
  const phaseOrder = ["analysis", "plan", "build", "improve", "pr"];
  let resumeFromPhase: string | undefined;
  if (checkpoint) {
    const lastCompleted = checkpoint.completedPhases[checkpoint.completedPhases.length - 1];
    if (lastCompleted) {
      const lastIdx = phaseOrder.indexOf(lastCompleted);
      if (lastIdx >= 0 && lastIdx + 1 < phaseOrder.length) {
        resumeFromPhase = phaseOrder[lastIdx + 1];
      }
    }
  }

  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose") || args.includes("-v");
  const accumulateContext = args.includes("--accumulate-context");
  const skipComment = args.includes("--no-comment");

  // Use worktree from checkpoint if available, otherwise create new
  let worktreeInfo: WorktreeInfo | null = null;
  if (checkpoint?.worktreePath && existsSync(checkpoint.worktreePath)) {
    worktreeInfo = {
      path: checkpoint.worktreePath,
      branch: checkpoint.branchName ?? `automation/${issueNumber}-resumed`,
      created: false,
    };
  } else if (!dryRun) {
    try {
      const timestamp = formatWorktreeTimestamp(new Date());
      worktreeInfo = await createWorktree({
        issueNumber,
        projectRoot,
        baseBranch: "develop",
        timestamp,
      });
    } catch (error) {
      process.stderr.write(`Failed to create worktree: ${error}\n`);
    }
  }

  process.stdout.write(
    `Starting workflow for issue #${issueNumber}${resumeFromPhase ? ` (resuming from ${resumeFromPhase})` : ""}${dryRun ? " (dry run)" : ""}\n`
  );

  const startedAt = new Date().toISOString();
  const startTime = performance.now();

  try {
    const result = await runWorkflow({
      issueNumber,
      dryRun,
      verbose,
      accumulateContext,
      workingDirectory: worktreeInfo?.path ?? projectRoot,
      mainProjectRoot: projectRoot,
      branchName: worktreeInfo?.branch,
      resumeFromPhase,
      checkpointData: checkpoint ? {
        domain: checkpoint.domain,
        specPath: checkpoint.specPath,
        filesModified: checkpoint.filesModified,
        completedPhases: checkpoint.completedPhases,
      } : undefined,
    });

    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);

    const metrics: WorkflowMetrics = {
      issue_number: issueNumber,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: result.success,
      duration_ms: durationMs,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      total_cost_usd: result.totalCostUsd,
      pr_url: result.prUrl,
      error_message: result.errorMessage,
      session_id: result.sessionId,
    };

    recordMetrics(metrics);

    // Post GitHub comment unless skipped or dry run
    if (!skipComment && !dryRun) {
      try {
        await postIssueComment({
          issueNumber,
          success: result.success,
          durationMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalCostUsd: result.totalCostUsd,
          prUrl: result.prUrl,
          errorMessage: result.errorMessage,
          sessionId: result.sessionId,
        });
        process.stdout.write("Posted comment to GitHub issue\n");
      } catch (commentError) {
        process.stderr.write(
          `Warning: Failed to post GitHub comment: ${commentError}\n`
        );
      }
    }

    process.stdout.write("\n--- Workflow Summary ---\n");
    process.stdout.write(`Status: ${result.success ? "SUCCESS" : "FAILURE"}\n`);
    process.stdout.write(`Duration: ${(durationMs / 1000).toFixed(1)}s\n`);
    process.stdout.write(`Cost: $${result.totalCostUsd.toFixed(4)}\n`);
    if (result.prUrl) {
      process.stdout.write(`PR: ${result.prUrl}\n`);
    }

    closeMetricsDb();
    return result.success ? 0 : 1;
  } catch (error) {
    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);
    const errorMessage = error instanceof Error ? error.message : String(error);

    const metrics: WorkflowMetrics = {
      issue_number: issueNumber,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: false,
      duration_ms: durationMs,
      input_tokens: 0,
      output_tokens: 0,
      total_cost_usd: 0,
      pr_url: null,
      error_message: errorMessage,
      session_id: null,
    };

    recordMetrics(metrics);
    process.stderr.write(`Workflow failed: ${errorMessage}\n`);
    closeMetricsDb();
    return 1;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return 0;
  }

  if (args.includes("--metrics")) {
    printMetrics();
    closeMetricsDb();
    return 0;
  }

  if (args.includes("--status")) {
    await printStatus();
    return 0;
  }

  // Batch modes
  if (args.includes("--batch") || args.includes("--batch-label")) {
    return handleBatch(args);
  }

  // Resume mode
  if (args.includes("--resume")) {
    return handleResume(args);
  }

  // --- Existing single-issue flow (unchanged) ---

  // Find issue number in args
  let issueNumber: number | null = null;
  for (const arg of args) {
    if (!arg.startsWith("--") && !arg.startsWith("-")) {
      issueNumber = parseIssueNumber(arg);
      if (issueNumber !== null) break;
    }
  }

  if (issueNumber === null) {
    process.stderr.write("Error: Issue number required\n");
    printUsage();
    return 1;
  }

  const dryRun = args.includes("--dry-run");
  const skipComment = args.includes("--no-comment");
  const verbose = args.includes("--verbose") || args.includes("-v");
  const accumulateContext = args.includes("--accumulate-context");

  // Create worktree info (but don't create actual worktree in dry-run)
  const timestamp = formatWorktreeTimestamp(new Date());
  let worktreeInfo: WorktreeInfo | null = null;
  
  if (!dryRun) {
    try {
      worktreeInfo = await createWorktree({
        issueNumber,
        projectRoot,
        baseBranch: "develop",
        timestamp
      });
    } catch (error) {
      process.stderr.write(`Failed to create worktree: ${error}\n`);
      process.stderr.write(`Falling back to current directory\n`);
      // Continue with projectRoot (current behavior)
      worktreeInfo = null;
    }
  }

  process.stdout.write(
    `Starting workflow for issue #${issueNumber}${dryRun ? " (dry run)" : ""}${verbose ? " (verbose)" : ""}${accumulateContext ? " (context accumulation)" : ""}\n`
  );

  if (worktreeInfo) {
    process.stdout.write(`Worktree: ${worktreeInfo.path}\n`);
    process.stdout.write(`Branch: ${worktreeInfo.branch}\n`);
  }

  const startedAt = new Date().toISOString();
  const startTime = performance.now();

  try {
    // Pass worktree path to workflow, but use main repo for logs
    const result = await runWorkflow({
      issueNumber,
      dryRun,
      verbose,
      accumulateContext,
      workingDirectory: worktreeInfo?.path ?? projectRoot,
      mainProjectRoot: projectRoot,  // Always use main repo for logs
      branchName: worktreeInfo?.branch
    });
    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);

    // Record metrics
    const metrics: WorkflowMetrics = {
      issue_number: issueNumber,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: result.success,
      duration_ms: durationMs,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      total_cost_usd: result.totalCostUsd,
      pr_url: result.prUrl,
      error_message: result.errorMessage,
      session_id: result.sessionId,
    };

    recordMetrics(metrics);

    // Post GitHub comment unless skipped or dry run
    if (!skipComment && !dryRun) {
      try {
        await postIssueComment({
          issueNumber,
          success: result.success,
          durationMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalCostUsd: result.totalCostUsd,
          prUrl: result.prUrl,
          errorMessage: result.errorMessage,
          sessionId: result.sessionId,
        });
        process.stdout.write("Posted comment to GitHub issue\n");
      } catch (commentError) {
        process.stderr.write(
          `Warning: Failed to post GitHub comment: ${commentError}\n`
        );
      }
    }

    // Print summary
    process.stdout.write("\n--- Workflow Summary ---\n");
    process.stdout.write(`Status: ${result.success ? "SUCCESS" : "FAILURE"}\n`);
    process.stdout.write(`Duration: ${(durationMs / 1000).toFixed(1)}s\n`);
    process.stdout.write(`Tokens: ${result.inputTokens} in / ${result.outputTokens} out\n`);
    process.stdout.write(`Cost: $${result.totalCostUsd.toFixed(4)}\n`);

    if (result.prUrl) {
      process.stdout.write(`PR: ${result.prUrl}\n`);
    }

    if (result.logDir) {
      process.stdout.write(`Logs: ${result.logDir}\n`);
    }

    if (result.errorMessage) {
      process.stderr.write(`Error: ${result.errorMessage}\n`);
    }

    // Keep worktree on success (will be cleaned after PR merge)
    if (worktreeInfo && result.success) {
      process.stdout.write(
        `Worktree preserved at ${worktreeInfo.path} (will be removed after PR merge)\n`
      );
    }
    
    // Keep worktree on failure for debugging
    if (worktreeInfo && !result.success) {
      process.stderr.write(
        `Worktree preserved at ${worktreeInfo.path} for debugging\n`
      );
      process.stderr.write(
        `To clean up: git worktree remove ${worktreeInfo.path}\n`
      );
    }

    closeMetricsDb();
    return result.success ? 0 : 1;
  } catch (error) {
    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record failure metrics
    const metrics: WorkflowMetrics = {
      issue_number: issueNumber,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: false,
      duration_ms: durationMs,
      input_tokens: 0,
      output_tokens: 0,
      total_cost_usd: 0,
      pr_url: null,
      error_message: errorMessage,
      session_id: null,
    };

    recordMetrics(metrics);

    process.stderr.write(`Workflow failed: ${errorMessage}\n`);
    
    // Preserve worktree on exception for debugging
    if (worktreeInfo) {
      process.stderr.write(
        `Worktree preserved at ${worktreeInfo.path} for debugging\n`
      );
    }

    closeMetricsDb();
    return 1;
  }
}

main().then((exitCode) => {
  process.exit(exitCode);
});
