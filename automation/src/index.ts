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

Arguments:
  <issue>          GitHub issue number (#123 or 123)

Options:
  --dry-run              Preview workflow without executing changes
  --metrics              Display recent workflow metrics
  --no-comment           Skip posting GitHub comment
  --verbose, -v          Enable detailed action-level logging
  --accumulate-context   Enable context accumulation for inter-phase handoffs
  --help                 Show this help message

Examples:
  bun run src/index.ts #123
  bun run src/index.ts 123 --dry-run
  bun run src/index.ts 123 --verbose
  bun run src/index.ts 123 --accumulate-context
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
